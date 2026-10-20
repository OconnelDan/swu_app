interface CardmarketPriceCatalog {
  version: 1;
  createdAt: string;
  prices: Record<string, [productId: number, lowPrice: number | null]>;
}

export interface CardmarketPrice {
  cardId: string;
  productId: number;
  lowPrice: number | null;
  currency: "EUR";
  updatedAt: string;
  productUrl: string;
}

export interface CardmarketPriceSelection {
  updatedAt: string;
  prices: Map<string, CardmarketPrice>;
}

export interface CardmarketDeckCard {
  cardId: string;
  requiredCount: number;
  missingCount: number;
  copiesMissingFromCollection?: number;
}

export interface CardmarketDeckValue {
  totalCents: number;
  missingCents: number;
  unpricedTotalCopies: number;
  unpricedMissingCopies: number;
  updatedAt: string;
}

const CATALOG_FILE = "data/cardmarket-prices.json";
let catalogPromise: Promise<CardmarketPriceCatalog> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCatalog(value: unknown): CardmarketPriceCatalog {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.createdAt !== "string" ||
    !isRecord(value.prices)
  ) {
    throw new Error("La guía de precios de Cardmarket no tiene el formato esperado.");
  }
  return value as unknown as CardmarketPriceCatalog;
}

function getCatalogUrl(): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}${CATALOG_FILE}`;
}

function loadCatalog(): Promise<CardmarketPriceCatalog> {
  if (!catalogPromise) {
    catalogPromise = fetch(getCatalogUrl(), { cache: "no-cache" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`No se pudo abrir la guía de Cardmarket (HTTP ${response.status}).`);
        }
        return parseCatalog(await response.json());
      })
      .catch((cause) => {
        catalogPromise = null;
        throw cause;
      });
  }
  return catalogPromise;
}

function priceFromCatalog(
  catalog: CardmarketPriceCatalog,
  cardId: string
): CardmarketPrice | undefined {
  const normalizedCardId = cardId.trim().toUpperCase();
  const entry = catalog.prices[normalizedCardId];
  if (!entry) return undefined;

  const [productId, lowPrice] = entry;
  if (
    !Number.isInteger(productId) ||
    productId <= 0 ||
    (lowPrice !== null && (!Number.isFinite(lowPrice) || lowPrice <= 0))
  ) {
    throw new Error(`El precio de ${normalizedCardId} no tiene el formato esperado.`);
  }

  return {
    cardId: normalizedCardId,
    productId,
    lowPrice,
    currency: "EUR",
    updatedAt: catalog.createdAt,
    productUrl: buildCardmarketProductUrl(productId)
  };
}

export function buildCardmarketProductUrl(productId: number): string {
  const url = new URL("https://www.cardmarket.com/StarWarsUnlimited/Products");
  url.searchParams.set("idProduct", String(productId));
  return url.toString();
}

export async function getCardmarketPrice(cardId: string): Promise<CardmarketPrice | undefined> {
  const catalog = await loadCatalog();
  return priceFromCatalog(catalog, cardId);
}

export async function getCardmarketPrices(cardIds: string[]): Promise<CardmarketPriceSelection> {
  const catalog = await loadCatalog();
  const prices = new Map<string, CardmarketPrice>();

  for (const cardId of new Set(cardIds.map((value) => value.trim().toUpperCase()))) {
    const price = priceFromCatalog(catalog, cardId);
    if (price) prices.set(cardId, price);
  }

  return { updatedAt: catalog.createdAt, prices };
}

export function calculateCardmarketDeckValue(
  cards: CardmarketDeckCard[],
  selection: CardmarketPriceSelection
): CardmarketDeckValue {
  let totalCents = 0;
  let missingCents = 0;
  let unpricedTotalCopies = 0;
  let unpricedMissingCopies = 0;

  for (const card of cards) {
    const requiredCount = Math.max(0, Math.trunc(card.requiredCount));
    const missingCount = Math.min(
      requiredCount,
      Math.max(0, Math.trunc(card.copiesMissingFromCollection ?? card.missingCount))
    );
    const unitPrice = selection.prices.get(card.cardId.trim().toUpperCase())?.lowPrice;

    if (unitPrice === null || unitPrice === undefined) {
      unpricedTotalCopies += requiredCount;
      unpricedMissingCopies += missingCount;
      continue;
    }

    const unitCents = Math.round(unitPrice * 100);
    totalCents += unitCents * requiredCount;
    missingCents += unitCents * missingCount;
  }

  return {
    totalCents,
    missingCents,
    unpricedTotalCopies,
    unpricedMissingCopies,
    updatedAt: selection.updatedAt
  };
}

/** Reinicia la caché compartida; se usa para aislar la carga en las pruebas. */
export function resetCardmarketPriceCache(): void {
  catalogPromise = null;
}

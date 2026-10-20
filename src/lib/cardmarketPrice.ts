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

export function buildCardmarketProductUrl(productId: number): string {
  const url = new URL("https://www.cardmarket.com/StarWarsUnlimited/Products");
  url.searchParams.set("idProduct", String(productId));
  return url.toString();
}

export async function getCardmarketPrice(cardId: string): Promise<CardmarketPrice | undefined> {
  const normalizedCardId = cardId.trim().toUpperCase();
  const catalog = await loadCatalog();
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

/** Reinicia la caché compartida; se usa para aislar la carga en las pruebas. */
export function resetCardmarketPriceCache(): void {
  catalogPromise = null;
}

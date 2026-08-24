import { LocalCardCacheProvider } from "./LocalCardCacheProvider";
import { tryGetCardImageUrl } from "@/lib/cardImageUrl";
import { normalizeCardIdString, parseCardId } from "@/lib/normalizeCardId";
import type { CardInfo, CardProvider } from "@/types/card";

type CatalogCardTuple = [
  name: string,
  subtitle: string,
  localizedName: string,
  localizedSubtitle: string,
  type: string,
  rarity: string,
  cost: number | null,
  aspects: string[],
  traits: string[],
  arena: string,
  text: string,
  localizedText: string,
  power: number | null,
  hp: number | null,
  upgradePower: number | null,
  upgradeHp: number | null,
  unique: boolean,
  keywords: string[],
  cardKey: string,
  deckLimit: number
];

interface BundledCardCatalog {
  version: 3;
  sets: string[];
  setNames: Record<string, string>;
  cards: Record<string, CatalogCardTuple>;
  aliases: Record<string, string>;
  images: Record<string, string>;
}

const CATALOG_FILE = "data/swu-card-catalog.json";
let bundledCatalogPromise: Promise<BundledCardCatalog> | null = null;

function getCatalogUrl(): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}${CATALOG_FILE}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCatalog(value: unknown): BundledCardCatalog {
  if (
    !isRecord(value) ||
    value.version !== 3 ||
    !Array.isArray(value.sets) ||
    !isRecord(value.setNames) ||
    !isRecord(value.cards) ||
    !isRecord(value.aliases) ||
    !isRecord(value.images)
  ) {
    throw new Error("El catálogo de cartas incluido no tiene el formato esperado.");
  }
  return value as unknown as BundledCardCatalog;
}

async function loadBundledCatalog(): Promise<BundledCardCatalog> {
  if (!bundledCatalogPromise) {
    bundledCatalogPromise = fetch(getCatalogUrl(), { cache: "no-cache" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`No se ha podido abrir el catálogo incluido (HTTP ${response.status}).`);
        }
        return parseCatalog(await response.json());
      })
      .catch((cause) => {
        bundledCatalogPromise = null;
        throw cause;
      });
  }
  return bundledCatalogPromise;
}

function resolveCatalogCard(
  catalog: BundledCardCatalog,
  requestedCardId: string
): CardInfo | undefined {
  const canonicalCardId = catalog.aliases[requestedCardId] ?? requestedCardId;
  const entry = catalog.cards[canonicalCardId];
  if (!entry) return undefined;

  const [
    name,
    subtitle,
    localizedTitle,
    localizedSubtitle,
    type,
    rarity,
    cost,
    aspects,
    traits,
    arena,
    text,
    localizedText,
    power,
    hp,
    upgradePower,
    upgradeHp,
    unique,
    keywords,
    cardKey,
    deckLimit
  ] = entry;
  const { setCode, cardNumber } = parseCardId(canonicalCardId);
  return {
    cardId: canonicalCardId,
    setCode,
    cardNumber,
    name: subtitle ? `${name}, ${subtitle}` : name,
    localizedName: localizedTitle
      ? localizedSubtitle
        ? `${localizedTitle}, ${localizedSubtitle}`
        : localizedTitle
      : undefined,
    type: type || undefined,
    rarity: rarity || undefined,
    setName: catalog.setNames[setCode],
    cost: cost ?? undefined,
    aspects,
    traits,
    arena: arena || undefined,
    text: text || undefined,
    localizedText: localizedText || undefined,
    power: power ?? undefined,
    hp: hp ?? undefined,
    upgradePower: upgradePower ?? undefined,
    upgradeHp: upgradeHp ?? undefined,
    unique,
    keywords,
    cardKey,
    deckLimit,
    // Si se ha escaneado una variante, se muestra esa impresión concreta,
    // aunque la copia se guarde con el ID de la carta base de la colección.
    imageUrl:
      catalog.images[requestedCardId] ??
      catalog.images[canonicalCardId] ??
      tryGetCardImageUrl(requestedCardId)
  };
}

/**
 * Catálogo de cartas generado a partir de la API oficial de Star Wars:
 * Unlimited. `variantOf` y `validationId` relacionan cada impresión con su
 * carta base sin depender de coincidencias por nombre.
 *
 * El JSON se distribuye junto a la aplicación porque la respuesta GET de la
 * API solo autoriza el origen de la web oficial y los navegadores bloquean su
 * lectura desde GitHub Pages. Mantener el nombre de esta clase evita cambiar
 * todos sus consumidores.
 */
export class SwUnlimitedDbCardProvider implements CardProvider {
  readonly id = "bundled-official-swu-catalog";
  private readonly cache: LocalCardCacheProvider;

  constructor(cache: LocalCardCacheProvider = new LocalCardCacheProvider()) {
    this.cache = cache;
  }

  async getCard(cardId: string): Promise<CardInfo | undefined> {
    const normalized = normalizeCardIdString(cardId);

    try {
      const info = resolveCatalogCard(await loadBundledCatalog(), normalized);
      if (info) {
        if (info.cardId === normalized) await this.cache.putCards([info]);
        return info;
      }
    } catch {
      // Sin conexión, la caché local sigue siendo una última alternativa.
    }

    return this.cache.getCard(normalized);
  }

  async getCards(cardIds: string[]): Promise<Map<string, CardInfo>> {
    const uniqueIds = Array.from(new Set(cardIds.map(normalizeCardIdString)));
    const result = await this.cache.getCards(uniqueIds);

    try {
      const catalog = await loadBundledCatalog();
      const canonicalCardsToCache = new Map<string, CardInfo>();

      // El catálogo empaquetado es la fuente de verdad. Siempre sustituye una
      // entrada antigua de IndexedDB para que una URL corregida llegue por
      // igual a todos los dispositivos y todas las cuentas.
      for (const requestedCardId of uniqueIds) {
        const info = resolveCatalogCard(catalog, requestedCardId);
        if (!info) continue;
        result.set(requestedCardId, info);
        if (info.cardId === requestedCardId) canonicalCardsToCache.set(info.cardId, info);
      }

      if (canonicalCardsToCache.size > 0) {
        await this.cache.putCards([...canonicalCardsToCache.values()]);
      }
    } catch {
      // Los consumidores pueden seguir funcionando únicamente con el código.
    }

    return result;
  }

  /** Devuelve una sola entrada por carta de reglas, lista para búsqueda y construcción de mazos. */
  async getAllCards(): Promise<CardInfo[]> {
    const catalog = await loadBundledCatalog();
    return Object.keys(catalog.cards).map((cardId) => resolveCatalogCard(catalog, cardId)!);
  }
}

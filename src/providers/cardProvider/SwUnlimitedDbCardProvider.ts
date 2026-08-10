import { LocalCardCacheProvider } from "./LocalCardCacheProvider";
import { normalizeCardIdString, parseCardId } from "@/lib/normalizeCardId";
import type { CardInfo, CardProvider } from "@/types/card";

/**
 * Proveedor remoto del catálogo de cartas.
 *
 * IMPORTANTE — aclaración de dominios: el sitio donde el usuario guarda su
 * colección privada es https://sw-unlimited-db.com/, para el que no existe
 * (a fecha de escritura) una API pública documentada. Este proveedor usa,
 * en cambio, la API REST pública y documentada de un sitio distinto,
 * https://www.swu-db.com/ (documentación en https://www.swu-db.com/api),
 * que expone únicamente datos de CATÁLOGO de cartas (nombre, set, número,
 * tipo, rareza, imagen) — nunca la colección privada de nadie. Solo se
 * usan los endpoints públicos documentados; no se envían credenciales.
 *
 * Endpoint usado: GET https://api.swu-db.com/cards/{set}/{number}
 */
const API_BASE = "https://api.swu-db.com";

interface SwuDbCardResponse {
  Set: string;
  Number: string;
  Name: string;
  Subtitle?: string;
  Type: string;
  Rarity: string;
  FrontArt?: string;
}

function mapResponseToCardInfo(raw: SwuDbCardResponse): CardInfo {
  const cardId = normalizeCardIdString(`${raw.Set}_${raw.Number}`);
  const { setCode, cardNumber } = parseCardId(cardId);
  return {
    cardId,
    setCode,
    cardNumber,
    name: raw.Subtitle ? `${raw.Name}, ${raw.Subtitle}` : raw.Name,
    type: raw.Type,
    rarity: raw.Rarity,
    imageUrl: raw.FrontArt
  };
}

export class SwUnlimitedDbCardProvider implements CardProvider {
  readonly id = "swu-db-api";
  private readonly cache: LocalCardCacheProvider;
  private readonly inFlight = new Map<string, Promise<CardInfo | undefined>>();

  constructor(cache: LocalCardCacheProvider = new LocalCardCacheProvider()) {
    this.cache = cache;
  }

  async getCard(cardId: string): Promise<CardInfo | undefined> {
    const normalized = normalizeCardIdString(cardId);

    const cached = await this.cache.getCard(normalized);
    if (cached) return cached;

    const existing = this.inFlight.get(normalized);
    if (existing) return existing;

    const promise = this.fetchAndCache(normalized);
    this.inFlight.set(normalized, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(normalized);
    }
  }

  async getCards(cardIds: string[]): Promise<Map<string, CardInfo>> {
    const uniqueIds = Array.from(new Set(cardIds.map(normalizeCardIdString)));
    const result = new Map<string, CardInfo>();

    const cached = await this.cache.getCards(uniqueIds);
    const missing = uniqueIds.filter((id) => !cached.has(id));
    for (const [id, info] of cached) result.set(id, info);

    // Limita la concurrencia para no saturar el servicio público.
    const CONCURRENCY = 5;
    for (let i = 0; i < missing.length; i += CONCURRENCY) {
      const batch = missing.slice(i, i + CONCURRENCY);
      const fetched = await Promise.all(batch.map((id) => this.fetchAndCache(id)));
      fetched.forEach((info, index) => {
        if (info) result.set(batch[index], info);
      });
    }

    return result;
  }

  private async fetchAndCache(cardId: string): Promise<CardInfo | undefined> {
    try {
      const { setCode, cardNumber } = parseCardId(cardId);
      const url = `${API_BASE}/cards/${setCode.toLowerCase()}/${cardNumber}`;
      const response = await fetch(url);
      if (!response.ok) return undefined;

      const raw = (await response.json()) as SwuDbCardResponse;
      const cardInfo = mapResponseToCardInfo(raw);
      await this.cache.putCards([cardInfo]);
      return cardInfo;
    } catch {
      // Sin conexión o carta no encontrada en el catálogo remoto: la app
      // debe seguir funcionando comparando solo por código (sección 17).
      return undefined;
    }
  }
}

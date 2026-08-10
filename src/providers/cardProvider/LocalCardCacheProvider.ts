import { db } from "@/db/db";
import { normalizeCardIdString } from "@/lib/normalizeCardId";
import type { CardInfo, CardProvider } from "@/types/card";

/**
 * Proveedor de cartas por defecto. Lee de la caché local (IndexedDB).
 * Si una carta no está en caché, se devuelve `undefined` y la app debe
 * seguir funcionando solo con el código (ver sección 17: "Una carta no
 * encontrada en el catálogo remoto debe poder compararse igualmente
 * usando su código").
 */
export class LocalCardCacheProvider implements CardProvider {
  readonly id = "local-cache";

  async getCard(cardId: string): Promise<CardInfo | undefined> {
    const normalized = normalizeCardIdString(cardId);
    return db.cardCache.get(normalized);
  }

  async getCards(cardIds: string[]): Promise<Map<string, CardInfo>> {
    const normalizedIds = cardIds.map(normalizeCardIdString);
    const results = await db.cardCache.bulkGet(normalizedIds);
    const map = new Map<string, CardInfo>();
    results.forEach((card, index) => {
      if (card) map.set(normalizedIds[index], card);
    });
    return map;
  }

  /** Permite a otros proveedores (p.ej. el remoto) rellenar la caché. */
  async putCards(cards: CardInfo[]): Promise<void> {
    await db.cardCache.bulkPut(cards);
  }
}

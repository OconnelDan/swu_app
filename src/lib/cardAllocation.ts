import type { CollectionCard } from "@/types/collection";
import type { CardAllocation, FavoriteDeck } from "@/types/deck";

function toOwnedMap(collection: CollectionCard[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const card of collection) {
    map.set(card.cardId, (map.get(card.cardId) ?? 0) + card.ownedCount);
  }
  return map;
}

/**
 * Reparte las copias de la colección entre los mazos favoritos guardados que las
 * requieren, dando prioridad al mazo favorito creado antes (orden de creación
 * ascendente). Función pura: no accede a IndexedDB ni a red.
 *
 * `excludeFavoriteId` permite recomprobar un favorito sin que se cuente a sí
 * mismo como "usando" sus propias cartas.
 */
export function computeCardAllocations(
  collection: CollectionCard[],
  favorites: FavoriteDeck[],
  excludeFavoriteId?: string
): Map<string, CardAllocation> {
  const ownedMap = toOwnedMap(collection);
  const remaining = new Map(ownedMap);

  const allocations = new Map<string, CardAllocation>();
  for (const [cardId, ownedCount] of ownedMap) {
    allocations.set(cardId, {
      cardId,
      ownedCount,
      allocatedCount: 0,
      freeCount: ownedCount,
      allocations: []
    });
  }

  const orderedFavorites = favorites
    .filter((favorite) => favorite.id !== excludeFavoriteId)
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const favorite of orderedFavorites) {
    for (const card of favorite.normalizedDeck.allRequiredCards) {
      const available = remaining.get(card.cardId) ?? 0;
      if (available <= 0) continue;

      const used = Math.min(available, card.requiredCount);
      if (used <= 0) continue;

      remaining.set(card.cardId, available - used);

      const allocation = allocations.get(card.cardId)!;
      allocation.allocatedCount += used;
      allocation.freeCount = allocation.ownedCount - allocation.allocatedCount;
      allocation.allocations.push({
        favoriteId: favorite.id,
        favoriteName: favorite.name,
        usedCount: used
      });
    }
  }

  return allocations;
}

export type CardLocationStatus = "free" | "used" | "not_owned";

/** Estado de localización de una carta a partir de su reparto entre mazos. */
export function getCardLocationStatus(allocation: CardAllocation | undefined): CardLocationStatus {
  if (!allocation || allocation.ownedCount === 0) return "not_owned";
  return allocation.freeCount > 0 ? "free" : "used";
}

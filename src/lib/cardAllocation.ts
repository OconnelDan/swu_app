import type { CollectionCard } from "@/types/collection";
import type { CardAllocation, FavoriteDeck, NormalizedDeck } from "@/types/deck";

function toOwnedMap(collection: CollectionCard[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const card of collection) {
    map.set(card.cardId, (map.get(card.cardId) ?? 0) + card.ownedCount);
  }
  return map;
}

/**
 * Reparte las copias de la colección exclusivamente entre los mazos montados.
 * Una idea guardada en Favoritos nunca consume copias. Los valores menores de
 * `allocationPriority` se atienden primero; los desempates son deterministas.
 * Función pura: no accede a IndexedDB ni a red.
 *
 * `excludeFavoriteId` permite recomprobar un mazo montado sin que se cuente a
 * sí mismo como "usando" sus propias cartas.
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
    .filter((favorite) => favorite.isMounted && favorite.id !== excludeFavoriteId)
    .slice()
    .sort((a, b) => {
      const priorityA = a.allocationPriority ?? Number.MAX_SAFE_INTEGER;
      const priorityB = b.allocationPriority ?? Number.MAX_SAFE_INTEGER;
      if (priorityA !== priorityB) return priorityA - priorityB;

      const mountedOrder = (a.mountedAt ?? a.createdAt).localeCompare(b.mountedAt ?? b.createdAt);
      return mountedOrder !== 0 ? mountedOrder : a.id.localeCompare(b.id);
    });

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

export interface MountAvailabilitySummary {
  totalRequiredCopies: number;
  freeCopiesAvailable: number;
  copiesInMountedDecks: number;
  copiesMissingFromCollection: number;
  canMountCompleteWithoutMoving: boolean;
}

/** Resume qué ocurrirá si una idea guardada pasa a ser un mazo montado. */
export function summarizeMountAvailability(
  deck: NormalizedDeck,
  allocations: Map<string, CardAllocation>
): MountAvailabilitySummary {
  let totalRequiredCopies = 0;
  let freeCopiesAvailable = 0;
  let copiesInMountedDecks = 0;
  let copiesMissingFromCollection = 0;

  for (const card of deck.allRequiredCards) {
    const allocation = allocations.get(card.cardId);
    const ownedCount = allocation?.ownedCount ?? 0;
    const availableCount = allocation?.freeCount ?? 0;
    const missingFromCollection = Math.max(card.requiredCount - ownedCount, 0);
    const availableForDeck = Math.min(card.requiredCount, availableCount);
    const inMountedDecks = Math.max(
      card.requiredCount - availableForDeck - missingFromCollection,
      0
    );

    totalRequiredCopies += card.requiredCount;
    freeCopiesAvailable += availableForDeck;
    copiesInMountedDecks += inMountedDecks;
    copiesMissingFromCollection += missingFromCollection;
  }

  return {
    totalRequiredCopies,
    freeCopiesAvailable,
    copiesInMountedDecks,
    copiesMissingFromCollection,
    canMountCompleteWithoutMoving: copiesInMountedDecks === 0 && copiesMissingFromCollection === 0
  };
}

export interface MountedDeckAllocationSummary {
  totalRequiredCopies: number;
  assignedCopies: number;
  copiesInOtherMountedDecks: number;
  copiesMissingFromCollection: number;
  totalPendingCopies: number;
  complete: boolean;
}

/** Calcula el estado físico real de un mazo después de repartir las copias. */
export function summarizeMountedDeckAllocation(
  deckRecord: FavoriteDeck,
  allocations: Map<string, CardAllocation>
): MountedDeckAllocationSummary {
  let totalRequiredCopies = 0;
  let assignedCopies = 0;
  let copiesInOtherMountedDecks = 0;
  let copiesMissingFromCollection = 0;

  for (const card of deckRecord.normalizedDeck.allRequiredCards) {
    const allocation = allocations.get(card.cardId);
    const ownedCount = allocation?.ownedCount ?? 0;
    const assignedToDeck =
      allocation?.allocations.find((entry) => entry.favoriteId === deckRecord.id)?.usedCount ?? 0;
    const pending = Math.max(card.requiredCount - assignedToDeck, 0);
    const missingFromCollection = Math.max(card.requiredCount - ownedCount, 0);

    totalRequiredCopies += card.requiredCount;
    assignedCopies += assignedToDeck;
    copiesMissingFromCollection += missingFromCollection;
    copiesInOtherMountedDecks += Math.max(pending - missingFromCollection, 0);
  }

  const totalPendingCopies = totalRequiredCopies - assignedCopies;
  return {
    totalRequiredCopies,
    assignedCopies,
    copiesInOtherMountedDecks,
    copiesMissingFromCollection,
    totalPendingCopies,
    complete: totalPendingCopies === 0
  };
}

import type { CollectionCard } from "@/types/collection";
import type {
  CardAllocation,
  CardAllocationOverrideUpdate,
  CardTransferSelection,
  DeckComparisonResult,
  FavoriteDeck,
  NormalizedDeck
} from "@/types/deck";

function toOwnedMap(collection: CollectionCard[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const card of collection) {
    map.set(card.cardId, (map.get(card.cardId) ?? 0) + card.ownedCount);
  }
  return map;
}

function compareDeckPriority(a: FavoriteDeck, b: FavoriteDeck): number {
  const priorityA = a.allocationPriority ?? Number.MAX_SAFE_INTEGER;
  const priorityB = b.allocationPriority ?? Number.MAX_SAFE_INTEGER;
  if (priorityA !== priorityB) return priorityA - priorityB;

  const mountedOrder = (a.mountedAt ?? a.createdAt).localeCompare(b.mountedAt ?? b.createdAt);
  return mountedOrder !== 0 ? mountedOrder : a.id.localeCompare(b.id);
}

function prefersCard(favorite: FavoriteDeck, cardId: string): boolean {
  return favorite.preferredCardIds?.includes(cardId) ?? false;
}

function manualCardAllocation(favorite: FavoriteDeck, cardId: string): number | undefined {
  const value = favorite.cardAllocationOverrides?.[cardId];
  return Number.isInteger(value) && value !== undefined && value >= 0 ? value : undefined;
}

/** Elimina repartos obsoletos y limita los restantes a la nueva composición. */
export function reconcileCardAllocationOverrides(
  overrides: Record<string, number> | undefined,
  deck: NormalizedDeck
): Record<string, number> {
  if (!overrides) return {};
  const requiredByCard = new Map(
    deck.allRequiredCards.map((card) => [card.cardId, card.requiredCount])
  );
  return Object.fromEntries(
    Object.entries(overrides).flatMap(([cardId, assignedCount]) => {
      const requiredCount = requiredByCard.get(cardId);
      if (requiredCount === undefined || !Number.isInteger(assignedCount) || assignedCount < 0) {
        return [];
      }
      return [[cardId, Math.min(assignedCount, requiredCount)]];
    })
  );
}

/**
 * Reparte las copias de la colección exclusivamente entre los mazos montados.
 * Una idea guardada en Favoritos nunca consume copias. Los valores menores de
 * `allocationPriority` se atienden primero; una preferencia explícita para una
 * carta concreta tiene prioridad sobre ese orden general. Los desempates son
 * deterministas. Función pura: no accede a IndexedDB ni a red.
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
    .sort(compareDeckPriority);

  const requirementsByCard = new Map<string, { favorite: FavoriteDeck; requiredCount: number }[]>();

  for (const favorite of orderedFavorites) {
    for (const card of favorite.normalizedDeck.allRequiredCards) {
      const requirements = requirementsByCard.get(card.cardId) ?? [];
      requirements.push({ favorite, requiredCount: card.requiredCount });
      requirementsByCard.set(card.cardId, requirements);
    }
  }

  for (const [cardId, allocation] of allocations) {
    let available = allocation.ownedCount;
    const requirements = (requirementsByCard.get(cardId) ?? []).slice().sort((a, b) => {
      const preferenceA = prefersCard(a.favorite, cardId);
      const preferenceB = prefersCard(b.favorite, cardId);
      if (preferenceA !== preferenceB) return preferenceA ? -1 : 1;
      return compareDeckPriority(a.favorite, b.favorite);
    });

    const assignedByFavorite = new Map<string, number>();

    // Un reparto elegido manualmente se aplica primero como cantidad mínima.
    // La segunda pasada sigue utilizando cualquier copia que quede libre, de
    // modo que aumentar la colección pueda completar mazos automáticamente.
    for (const { favorite, requiredCount } of requirements
      .slice()
      .sort((a, b) => compareDeckPriority(a.favorite, b.favorite))) {
      const requested = manualCardAllocation(favorite, cardId);
      if (requested === undefined || available <= 0) continue;

      const used = Math.min(available, requiredCount, requested);
      if (used <= 0) continue;

      available -= used;
      assignedByFavorite.set(favorite.id, used);
      allocation.allocatedCount += used;
      allocation.freeCount = allocation.ownedCount - allocation.allocatedCount;
      allocation.allocations.push({
        favoriteId: favorite.id,
        favoriteName: favorite.name,
        usedCount: used
      });
    }

    for (const { favorite, requiredCount } of requirements) {
      if (available <= 0) break;
      const alreadyAssigned = assignedByFavorite.get(favorite.id) ?? 0;
      const used = Math.min(available, Math.max(requiredCount - alreadyAssigned, 0));
      if (used <= 0) continue;

      available -= used;
      assignedByFavorite.set(favorite.id, alreadyAssigned + used);
      allocation.allocatedCount += used;
      allocation.freeCount = allocation.ownedCount - allocation.allocatedCount;
      const existing = allocation.allocations.find((entry) => entry.favoriteId === favorite.id);
      if (existing) existing.usedCount += used;
      else {
        allocation.allocations.push({
          favoriteId: favorite.id,
          favoriteName: favorite.name,
          usedCount: used
        });
      }
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

/**
 * Devuelve una copia del listado donde solo el mazo objetivo conserva la
 * preferencia explícita para `cardId`. No modifica la composición de ningún
 * mazo ni sus JSON originales.
 */
export function applyCardPreference(
  favorites: FavoriteDeck[],
  targetFavoriteId: string,
  cardId: string
): FavoriteDeck[] {
  return favorites.map((favorite) => {
    const withoutCard = (favorite.preferredCardIds ?? []).filter(
      (preferredCardId) => preferredCardId !== cardId
    );
    const preferredCardIds =
      favorite.id === targetFavoriteId ? [...withoutCard, cardId] : withoutCard;

    const current = favorite.preferredCardIds ?? [];
    const unchanged =
      current.length === preferredCardIds.length &&
      current.every((preferredCardId, index) => preferredCardId === preferredCardIds[index]);
    return unchanged ? favorite : { ...favorite, preferredCardIds };
  });
}

/** Adapta un resultado general al reparto físico real de un mazo montado. */
export function buildMountedDeckComparisonResult(
  result: DeckComparisonResult,
  deckRecord: FavoriteDeck,
  allocations: Map<string, CardAllocation>
): DeckComparisonResult {
  const comparisons = result.comparisons.map((comparison) => {
    const allocation = allocations.get(comparison.cardId);
    const ownedCount = allocation?.ownedCount ?? 0;
    const assignedCount =
      allocation?.allocations.find((entry) => entry.favoriteId === deckRecord.id)?.usedCount ?? 0;
    const missingCount = Math.max(comparison.requiredCount - assignedCount, 0);
    const copiesMissingFromCollection = Math.max(comparison.requiredCount - ownedCount, 0);
    const copiesInOtherMountedDecks = Math.max(missingCount - copiesMissingFromCollection, 0);

    return {
      ...comparison,
      ownedCount,
      assignedCount,
      missingCount,
      surplusCount: Math.max(ownedCount - comparison.requiredCount, 0),
      freeCount: allocation?.freeCount ?? 0,
      usedElsewhere: allocation?.allocations.filter((entry) => entry.favoriteId !== deckRecord.id),
      copiesInOtherMountedDecks,
      copiesMissingFromCollection,
      status: missingCount > 0 ? ("missing" as const) : ("complete" as const)
    };
  });
  const missingCards = comparisons.filter((comparison) => comparison.status === "missing");
  const mountedZoneStatus = (
    card: NormalizedDeck["leader"] | NormalizedDeck["base"]
  ): "complete" | "missing" | undefined => {
    if (!card) return undefined;
    const allocation = allocations.get(card.cardId);
    const assignedCount =
      allocation?.allocations.find((entry) => entry.favoriteId === deckRecord.id)?.usedCount ?? 0;
    return assignedCount >= card.requiredCount ? "complete" : "missing";
  };

  return {
    ...result,
    complete: missingCards.length === 0,
    totalOwnedApplicableCopies: comparisons.reduce(
      (total, comparison) => total + (comparison.assignedCount ?? 0),
      0
    ),
    totalMissingCopies: missingCards.reduce(
      (total, comparison) => total + comparison.missingCount,
      0
    ),
    differentMissingCards: missingCards.length,
    leaderStatus: mountedZoneStatus(deckRecord.normalizedDeck.leader),
    baseStatus: mountedZoneStatus(deckRecord.normalizedDeck.base),
    comparisons,
    missingCards
  };
}

export interface CardTransferSource {
  favoriteId: string;
  favoriteName: string;
  availableCount: number;
}

export interface CardTransferPlan {
  cardId: string;
  targetFavoriteId: string;
  targetFavoriteName: string;
  requiredCount: number;
  currentAssignedCount: number;
  assignedAfterMoveCount: number;
  copiesToMove: number;
  copiesStillMissingFromCollection: number;
  sources: CardTransferSource[];
}

/**
 * Describe cuántas copias necesita el mazo objetivo y todos los mazos entre
 * los que el usuario puede escoger el origen. No decide el origen por él.
 */
export function planCardTransfer(
  collection: CollectionCard[],
  favorites: FavoriteDeck[],
  targetFavoriteId: string,
  cardId: string
): CardTransferPlan | undefined {
  const target = favorites.find(
    (favorite) => favorite.id === targetFavoriteId && favorite.isMounted
  );
  const targetCard = target?.normalizedDeck.allRequiredCards.find((card) => card.cardId === cardId);
  if (!target || !targetCard) return undefined;

  const before = computeCardAllocations(collection, favorites).get(cardId);
  const currentAssignedCount =
    before?.allocations.find((entry) => entry.favoriteId === targetFavoriteId)?.usedCount ?? 0;
  const sources = (before?.allocations ?? [])
    .filter((entry) => entry.favoriteId !== targetFavoriteId)
    .map((entry) => ({
      favoriteId: entry.favoriteId,
      favoriteName: entry.favoriteName,
      availableCount: entry.usedCount
    }))
    .filter((entry) => entry.availableCount > 0);
  const copiesToMove = Math.min(
    Math.max(targetCard.requiredCount - currentAssignedCount, 0),
    sources.reduce((total, source) => total + source.availableCount, 0)
  );
  if (copiesToMove <= 0) return undefined;
  const assignedAfterMoveCount = currentAssignedCount + copiesToMove;

  return {
    cardId,
    targetFavoriteId,
    targetFavoriteName: target.name,
    requiredCount: targetCard.requiredCount,
    currentAssignedCount,
    assignedAfterMoveCount,
    copiesToMove,
    copiesStillMissingFromCollection: Math.max(
      targetCard.requiredCount - (before?.ownedCount ?? 0),
      0
    ),
    sources
  };
}

/**
 * Valida la elección del usuario y calcula el reparto final exacto para todos
 * los mazos montados que necesitan la carta. La suma elegida debe cubrir todas
 * las copias transferibles; las copias que realmente no existen permanecen
 * pendientes.
 */
export function buildCardTransferAllocationUpdates(
  collection: CollectionCard[],
  favorites: FavoriteDeck[],
  targetFavoriteId: string,
  cardId: string,
  selections: CardTransferSelection[]
): CardAllocationOverrideUpdate[] {
  const plan = planCardTransfer(collection, favorites, targetFavoriteId, cardId);
  if (!plan) throw new Error("Ya no hay copias asignadas a otros mazos para esta carta.");

  const selectedBySource = new Map<string, number>();
  for (const selection of selections) {
    if (!Number.isInteger(selection.count) || selection.count <= 0) {
      throw new Error("La cantidad elegida debe ser un número entero mayor que cero.");
    }
    if (selectedBySource.has(selection.favoriteId)) {
      throw new Error("No puedes seleccionar dos veces el mismo mazo de origen.");
    }
    const source = plan.sources.find((entry) => entry.favoriteId === selection.favoriteId);
    if (!source) throw new Error("Uno de los mazos de origen ya no tiene esta carta asignada.");
    if (selection.count > source.availableCount) {
      throw new Error(`«${source.favoriteName}» no tiene tantas copias asignadas.`);
    }
    selectedBySource.set(selection.favoriteId, selection.count);
  }

  const selectedCount = [...selectedBySource.values()].reduce((total, count) => total + count, 0);
  if (selectedCount !== plan.copiesToMove) {
    throw new Error(`Debes elegir exactamente ${plan.copiesToMove} copia(s) para reasignar.`);
  }

  const allocation = computeCardAllocations(collection, favorites).get(cardId);
  const currentByFavorite = new Map(
    (allocation?.allocations ?? []).map((entry) => [entry.favoriteId, entry.usedCount])
  );

  return favorites
    .filter(
      (favorite) =>
        favorite.isMounted &&
        favorite.normalizedDeck.allRequiredCards.some(
          (card) => card.cardId === cardId && card.requiredCount > 0
        )
    )
    .slice()
    .sort(compareDeckPriority)
    .map((favorite) => {
      const current = currentByFavorite.get(favorite.id) ?? 0;
      const assignedCount =
        favorite.id === targetFavoriteId
          ? current + selectedCount
          : current - (selectedBySource.get(favorite.id) ?? 0);
      return { favoriteId: favorite.id, assignedCount };
    });
}

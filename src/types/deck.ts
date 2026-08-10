export type DeckZone = "leader" | "base" | "main" | "sideboard";

export interface NormalizedDeckCard {
  cardId: string;
  setCode: string;
  cardNumber: string;
  requiredCount: number;
  zones: DeckZone[];
  zoneCounts: Partial<Record<DeckZone, number>>;
}

export interface NormalizedDeck {
  name: string;
  author?: string;
  leader?: NormalizedDeckCard;
  base?: NormalizedDeckCard;
  mainDeck: NormalizedDeckCard[];
  sideboard: NormalizedDeckCard[];
  allRequiredCards: NormalizedDeckCard[];
  originalJson: unknown;
}

/** Una porción de las copias en colección de una carta, asignada a un mazo favorito. */
export interface CardAllocationEntry {
  favoriteId: string;
  favoriteName: string;
  usedCount: number;
}

/** Reparto de las copias en colección de una carta entre los mazos favoritos guardados. */
export interface CardAllocation {
  cardId: string;
  ownedCount: number;
  allocatedCount: number;
  freeCount: number;
  allocations: CardAllocationEntry[];
}

export interface CardComparison {
  cardId: string;
  cardName?: string;
  imageUrl?: string;
  requiredCount: number;
  ownedCount: number;
  missingCount: number;
  surplusCount: number;
  /** Copias de esta carta no asignadas a ningún mazo favorito (si se calculó el reparto). */
  freeCount?: number;
  /** Mazos favoritos donde ya se están usando copias de esta carta. */
  usedElsewhere?: CardAllocationEntry[];
  zones: DeckZone[];
  zoneCounts: Partial<Record<DeckZone, number>>;
  status: "complete" | "missing";
}

export interface DeckComparisonResult {
  deckName: string;
  complete: boolean;
  totalRequiredCopies: number;
  totalOwnedApplicableCopies: number;
  totalMissingCopies: number;
  differentMissingCards: number;
  mainDeckCount: number;
  sideboardCount: number;
  leaderStatus?: "complete" | "missing";
  baseStatus?: "complete" | "missing";
  comparisons: CardComparison[];
  missingCards: CardComparison[];
  checkedAt: string;
  collectionFingerprint: string;
}

/** Favorito guardado en IndexedDB. */
export interface FavoriteDeck {
  id: string;
  name: string;
  author?: string;
  originalJson: unknown;
  normalizedDeck: NormalizedDeck;
  createdAt: string;
  updatedAt: string;
  lastResult?: DeckComparisonResult;
  lastResultFingerprint?: string;
}

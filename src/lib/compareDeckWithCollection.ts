import type { CollectionCard } from "@/types/collection";
import type { CardInfo } from "@/types/card";
import type {
  CardAllocation,
  CardComparison,
  DeckComparisonResult,
  NormalizedDeck,
  NormalizedDeckCard
} from "@/types/deck";
import { computeCollectionFingerprint } from "./collectionFingerprint";
import { tryGetCardImageUrl } from "./cardImageUrl";

function toOwnedMap(collection: CollectionCard[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const card of collection) {
    map.set(card.cardId, (map.get(card.cardId) ?? 0) + card.ownedCount);
  }
  return map;
}

function toCollectionNameMap(collection: CollectionCard[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const card of collection) {
    if (card.name) map.set(card.cardId, card.name);
  }
  return map;
}

function compareCard(
  card: NormalizedDeckCard,
  ownedMap: Map<string, number>,
  cardInfos?: Map<string, CardInfo>,
  allocations?: Map<string, CardAllocation>,
  collectionNames?: Map<string, string>
): CardComparison {
  const ownedCount = ownedMap.get(card.cardId) ?? 0;
  const missingCount = Math.max(card.requiredCount - ownedCount, 0);
  const surplusCount = Math.max(ownedCount - card.requiredCount, 0);
  const allocation = allocations?.get(card.cardId);
  const cardInfo = cardInfos?.get(card.cardId);
  return {
    cardId: card.cardId,
    cardName: cardInfo?.name ?? collectionNames?.get(card.cardId),
    localizedCardName: cardInfo?.localizedName ?? collectionNames?.get(card.cardId),
    imageUrl: cardInfo?.imageUrl ?? tryGetCardImageUrl(card.cardId),
    requiredCount: card.requiredCount,
    ownedCount,
    missingCount,
    surplusCount,
    freeCount: allocation?.freeCount,
    usedElsewhere: allocation?.allocations,
    zones: card.zones,
    zoneCounts: card.zoneCounts,
    status: missingCount > 0 ? "missing" : "complete"
  };
}

/**
 * Compara un mazo normalizado contra la colección del usuario.
 * Función pura: no accede a IndexedDB ni a red.
 *
 * `cardInfos` permite añadir nombre/imagen a cada fila (opcional).
 * `allocations` (ver `computeCardAllocations`) permite indicar cuántas copias
 * de cada carta ya están comprometidas en otros mazos montados.
 */
export function compareDeckWithCollection(
  deck: NormalizedDeck,
  collection: CollectionCard[],
  cardInfos?: Map<string, CardInfo>,
  allocations?: Map<string, CardAllocation>
): DeckComparisonResult {
  const ownedMap = toOwnedMap(collection);
  const collectionNames = toCollectionNameMap(collection);

  const comparisons = deck.allRequiredCards.map((c) =>
    compareCard(c, ownedMap, cardInfos, allocations, collectionNames)
  );
  const missingCards = comparisons.filter((c) => c.status === "missing");

  const totalRequiredCopies = comparisons.reduce((sum, c) => sum + c.requiredCount, 0);
  const totalMissingCopies = comparisons.reduce((sum, c) => sum + c.missingCount, 0);
  const totalOwnedApplicableCopies = comparisons.reduce(
    (sum, c) => sum + Math.min(c.ownedCount, c.requiredCount),
    0
  );

  const leaderComparison = deck.leader
    ? compareCard(deck.leader, ownedMap, cardInfos, allocations, collectionNames)
    : undefined;
  const baseComparison = deck.base
    ? compareCard(deck.base, ownedMap, cardInfos, allocations, collectionNames)
    : undefined;

  const mainDeckCount = deck.mainDeck.reduce((sum, c) => sum + (c.zoneCounts.main ?? 0), 0);
  const sideboardCount = deck.sideboard.reduce((sum, c) => sum + (c.zoneCounts.sideboard ?? 0), 0);

  return {
    deckName: deck.name,
    complete: missingCards.length === 0,
    totalRequiredCopies,
    totalOwnedApplicableCopies,
    totalMissingCopies,
    differentMissingCards: missingCards.length,
    mainDeckCount,
    sideboardCount,
    leaderStatus: leaderComparison?.status,
    baseStatus: baseComparison?.status,
    comparisons,
    missingCards,
    checkedAt: new Date().toISOString(),
    collectionFingerprint: computeCollectionFingerprint(collection)
  };
}

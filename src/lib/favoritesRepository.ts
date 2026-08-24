import { v4 as uuid } from "@/lib/uuid";
import { db } from "@/db/db";
import type { DeckComparisonResult, FavoriteDeck, NormalizedDeck } from "@/types/deck";

export async function saveFavoriteDeck(
  normalizedDeck: NormalizedDeck,
  result?: DeckComparisonResult
): Promise<FavoriteDeck> {
  const now = new Date().toISOString();
  const favorite: FavoriteDeck = {
    id: uuid(),
    name: normalizedDeck.name,
    author: normalizedDeck.author,
    originalJson: normalizedDeck.originalJson,
    normalizedDeck,
    createdAt: now,
    updatedAt: now,
    lastResult: result,
    lastResultFingerprint: result?.collectionFingerprint,
    isMounted: false,
    preferredCardIds: []
  };
  await db.favoriteDecks.put(favorite);
  return favorite;
}

/** Sustituye la composición sin alterar la identidad ni el estado montado del mazo. */
export async function updateFavoriteDeck(
  favoriteId: string,
  normalizedDeck: NormalizedDeck,
  result?: DeckComparisonResult
): Promise<FavoriteDeck> {
  const favorite = await db.favoriteDecks.get(favoriteId);
  if (!favorite) throw new Error("El mazo ya no existe.");

  const updated: FavoriteDeck = {
    ...favorite,
    name: normalizedDeck.name,
    author: normalizedDeck.author,
    originalJson: normalizedDeck.originalJson,
    normalizedDeck,
    updatedAt: new Date().toISOString(),
    lastResult: result,
    lastResultFingerprint: result?.collectionFingerprint
  };
  await db.favoriteDecks.put(updated);
  return updated;
}

export async function updateFavoriteResult(
  favoriteId: string,
  result: DeckComparisonResult
): Promise<void> {
  await db.favoriteDecks.where("id").equals(favoriteId).modify({
    lastResult: result,
    lastResultFingerprint: result.collectionFingerprint,
    updatedAt: new Date().toISOString()
  });
}

export async function renameFavoriteDeck(favoriteId: string, name: string): Promise<void> {
  await db.favoriteDecks
    .where("id")
    .equals(favoriteId)
    .modify({ name, updatedAt: new Date().toISOString() });
}

export async function deleteFavoriteDeck(favoriteId: string): Promise<void> {
  await db.favoriteDecks.delete(favoriteId);
}

/**
 * Convierte un favorito en mazo montado sin quitar cartas a los mazos que ya
 * estaban montados. La nueva prioridad queda al final del reparto.
 */
export async function mountFavoriteDeck(favoriteId: string): Promise<void> {
  await db.transaction("rw", db.favoriteDecks, async () => {
    const favorite = await db.favoriteDecks.get(favoriteId);
    if (!favorite) throw new Error("El mazo ya no existe.");
    if (favorite.isMounted) return;

    const decks = await db.favoriteDecks.toArray();
    const nextPriority =
      decks.reduce(
        (highest, deck) =>
          deck.isMounted ? Math.max(highest, deck.allocationPriority ?? 0) : highest,
        0
      ) + 1;
    const now = new Date().toISOString();

    await db.favoriteDecks.put({
      ...favorite,
      isMounted: true,
      mountedAt: now,
      allocationPriority: nextPriority,
      preferredCardIds: [],
      updatedAt: now
    });
  });
}

/** Libera las copias reservadas y devuelve el mazo a Favoritos. */
export async function unmountFavoriteDeck(favoriteId: string): Promise<void> {
  await db.transaction("rw", db.favoriteDecks, async () => {
    const favorite = await db.favoriteDecks.get(favoriteId);
    if (!favorite) throw new Error("El mazo ya no existe.");
    if (!favorite.isMounted) return;

    const now = new Date().toISOString();
    await db.favoriteDecks.put({
      ...favorite,
      isMounted: false,
      mountedAt: undefined,
      allocationPriority: undefined,
      preferredCardIds: [],
      updatedAt: now
    });
  });
}

export async function duplicateFavoriteDeck(favoriteId: string): Promise<FavoriteDeck | undefined> {
  const original = await db.favoriteDecks.get(favoriteId);
  if (!original) return undefined;
  const now = new Date().toISOString();
  const copy: FavoriteDeck = {
    ...original,
    id: uuid(),
    name: `${original.name} (copia)`,
    createdAt: now,
    updatedAt: now,
    isMounted: false,
    mountedAt: undefined,
    allocationPriority: undefined,
    preferredCardIds: []
  };
  await db.favoriteDecks.put(copy);
  return copy;
}

/** Da prioridad al mazo objetivo exclusivamente para una carta concreta. */
export async function prioritizeFavoriteDeckCard(
  favoriteId: string,
  cardId: string
): Promise<void> {
  await db.transaction("rw", db.favoriteDecks, async () => {
    const target = await db.favoriteDecks.get(favoriteId);
    if (!target) throw new Error("El mazo ya no existe.");
    if (!target.isMounted) throw new Error("Solo puedes mover cartas a un mazo montado.");
    if (
      !target.normalizedDeck.allRequiredCards.some(
        (card) => card.cardId === cardId && card.requiredCount > 0
      )
    ) {
      throw new Error("La carta no forma parte de este mazo.");
    }

    const now = new Date().toISOString();
    const decks = await db.favoriteDecks.toArray();
    const updates = decks.flatMap((deck) => {
      const withoutCard = (deck.preferredCardIds ?? []).filter(
        (preferredCardId) => preferredCardId !== cardId
      );
      const preferredCardIds = deck.id === favoriteId ? [...withoutCard, cardId] : withoutCard;
      const current = deck.preferredCardIds ?? [];
      const unchanged =
        current.length === preferredCardIds.length &&
        current.every((preferredCardId, index) => preferredCardId === preferredCardIds[index]);

      return unchanged ? [] : [{ ...deck, preferredCardIds, updatedAt: now }];
    });

    if (updates.length > 0) await db.favoriteDecks.bulkPut(updates);
  });
}

export async function listFavoriteDecks(): Promise<FavoriteDeck[]> {
  return db.favoriteDecks.orderBy("updatedAt").reverse().toArray();
}

/** true si la colección ha cambiado desde la última comprobación de este favorito. */
export function isFavoriteOutdated(favorite: FavoriteDeck, currentFingerprint: string): boolean {
  if (!favorite.lastResultFingerprint) return false;
  return favorite.lastResultFingerprint !== currentFingerprint;
}

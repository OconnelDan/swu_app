import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/db";
import {
  deleteFavoriteDeck,
  duplicateFavoriteDeck,
  isFavoriteOutdated,
  listFavoriteDecks,
  renameFavoriteDeck,
  saveFavoriteDeck,
  updateFavoriteResult
} from "@/lib/favoritesRepository";
import { normalizeDeckJson } from "@/lib/normalizeDeckJson";
import { compareDeckWithCollection } from "@/lib/compareDeckWithCollection";

describe("persistencia de favoritos (IndexedDB)", () => {
  beforeEach(async () => {
    await db.favoriteDecks.clear();
  });

  it("caso 10: guarda, lista, renombra, duplica y elimina un favorito", async () => {
    const deck = normalizeDeckJson({ name: "Mi mazo", deck: [{ id: "SOR_001", count: 2 }] });
    const result = compareDeckWithCollection(deck, []);

    const saved = await saveFavoriteDeck(deck, result);
    expect(saved.id).toBeTruthy();

    const all = await listFavoriteDecks();
    expect(all.some((f) => f.id === saved.id)).toBe(true);

    await renameFavoriteDeck(saved.id, "Mazo renombrado");
    const renamed = await db.favoriteDecks.get(saved.id);
    expect(renamed?.name).toBe("Mazo renombrado");

    const duplicated = await duplicateFavoriteDeck(saved.id);
    expect(duplicated?.id).not.toBe(saved.id);
    expect(duplicated?.name).toContain("copia");

    await deleteFavoriteDeck(saved.id);
    const afterDelete = await db.favoriteDecks.get(saved.id);
    expect(afterDelete).toBeUndefined();
  });

  it("actualiza el resultado y la huella de colección de un favorito", async () => {
    const deck = normalizeDeckJson({ name: "Mazo", deck: [{ id: "SOR_001", count: 1 }] });
    const firstResult = compareDeckWithCollection(deck, []);
    const saved = await saveFavoriteDeck(deck, firstResult);

    const secondResult = compareDeckWithCollection(deck, [
      { cardId: "SOR_001", setCode: "SOR", cardNumber: "001", ownedCount: 1 }
    ]);
    await updateFavoriteResult(saved.id, secondResult);

    const updated = await db.favoriteDecks.get(saved.id);
    expect(updated?.lastResult?.complete).toBe(true);
    expect(updated?.lastResultFingerprint).toBe(secondResult.collectionFingerprint);
  });

  it("marca un favorito como desactualizado cuando cambia la huella de colección", () => {
    const favorite = {
      lastResultFingerprint: "abc123"
    } as Parameters<typeof isFavoriteOutdated>[0];
    expect(isFavoriteOutdated(favorite, "abc123")).toBe(false);
    expect(isFavoriteOutdated(favorite, "different")).toBe(true);
  });
});

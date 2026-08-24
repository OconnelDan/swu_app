import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/db";
import {
  deleteFavoriteDeck,
  duplicateFavoriteDeck,
  isFavoriteOutdated,
  listFavoriteDecks,
  mountFavoriteDeck,
  prioritizeFavoriteDeckCard,
  renameFavoriteDeck,
  saveFavoriteDeck,
  unmountFavoriteDeck,
  updateFavoriteDeck,
  updateFavoriteResult
} from "@/lib/favoritesRepository";
import { normalizeDeckJson } from "@/lib/normalizeDeckJson";
import { compareDeckWithCollection } from "@/lib/compareDeckWithCollection";

describe("persistencia de favoritos (IndexedDB)", () => {
  beforeEach(async () => {
    await db.favoriteDecks.clear();
  });

  it("actualiza un borrador conservando su identidad y sin crear duplicados", async () => {
    const deck = normalizeDeckJson({ name: "Borrador", deck: [{ id: "SOR_001", count: 2 }] });
    const saved = await saveFavoriteDeck(deck);
    const updatedDeck = normalizeDeckJson({
      name: "Borrador continuado",
      deck: [{ id: "SOR_002", count: 1 }]
    });

    const updated = await updateFavoriteDeck(saved.id, updatedDeck);

    expect(updated.id).toBe(saved.id);
    expect(updated.createdAt).toBe(saved.createdAt);
    expect(updated.name).toBe("Borrador continuado");
    expect(await listFavoriteDecks()).toHaveLength(1);
  });

  it("caso 10: guarda, lista, renombra, duplica y elimina un favorito", async () => {
    const deck = normalizeDeckJson({ name: "Mi mazo", deck: [{ id: "SOR_001", count: 2 }] });
    const result = compareDeckWithCollection(deck, []);

    const saved = await saveFavoriteDeck(deck, result);
    expect(saved.id).toBeTruthy();
    expect(saved.isMounted).toBe(false);

    const all = await listFavoriteDecks();
    expect(all.some((f) => f.id === saved.id)).toBe(true);

    await renameFavoriteDeck(saved.id, "Mazo renombrado");
    const renamed = await db.favoriteDecks.get(saved.id);
    expect(renamed?.name).toBe("Mazo renombrado");

    const duplicated = await duplicateFavoriteDeck(saved.id);
    expect(duplicated?.id).not.toBe(saved.id);
    expect(duplicated?.name).toContain("copia");
    expect(duplicated?.isMounted).toBe(false);

    await deleteFavoriteDeck(saved.id);
    const afterDelete = await db.favoriteDecks.get(saved.id);
    expect(afterDelete).toBeUndefined();
  });

  it("monta y desmonta un favorito sin borrar su composición", async () => {
    const firstDeck = normalizeDeckJson({
      name: "Primero",
      deck: [{ id: "SOR_001", count: 2 }]
    });
    const secondDeck = normalizeDeckJson({
      name: "Segundo",
      deck: [{ id: "SOR_001", count: 1 }]
    });
    const first = await saveFavoriteDeck(firstDeck);
    const second = await saveFavoriteDeck(secondDeck);

    await mountFavoriteDeck(first.id);
    await mountFavoriteDeck(second.id);

    const mountedFirst = await db.favoriteDecks.get(first.id);
    const mountedSecond = await db.favoriteDecks.get(second.id);
    expect(mountedFirst).toMatchObject({ isMounted: true, allocationPriority: 1 });
    expect(mountedSecond).toMatchObject({ isMounted: true, allocationPriority: 2 });
    expect(mountedFirst?.mountedAt).toBeTruthy();

    await unmountFavoriteDeck(first.id);
    const unmounted = await db.favoriteDecks.get(first.id);
    expect(unmounted).toMatchObject({
      isMounted: false,
      normalizedDeck: first.normalizedDeck
    });
    expect(unmounted?.mountedAt).toBeUndefined();
    expect(unmounted?.allocationPriority).toBeUndefined();
  });

  it("al duplicar un mazo montado la copia vuelve a Favoritos y no reserva cartas", async () => {
    const deck = normalizeDeckJson({
      name: "Montado",
      deck: [{ id: "SOR_001", count: 2 }]
    });
    const saved = await saveFavoriteDeck(deck);
    await mountFavoriteDeck(saved.id);

    const copy = await duplicateFavoriteDeck(saved.id);
    expect(copy).toMatchObject({ isMounted: false });
    expect(copy?.mountedAt).toBeUndefined();
    expect(copy?.allocationPriority).toBeUndefined();
    expect(copy?.preferredCardIds).toEqual([]);
  });

  it("mueve la prioridad de una carta concreta y la elimina al desmontar", async () => {
    const deck = normalizeDeckJson({
      name: "Mazo",
      deck: [
        { id: "SOR_001", count: 2 },
        { id: "LAW_038", count: 1 }
      ]
    });
    const first = await saveFavoriteDeck(deck);
    const target = await saveFavoriteDeck({ ...deck, name: "Objetivo" });
    await mountFavoriteDeck(first.id);
    await mountFavoriteDeck(target.id);

    await prioritizeFavoriteDeckCard(target.id, "SOR_001");

    expect((await db.favoriteDecks.get(first.id))?.preferredCardIds).toEqual([]);
    expect((await db.favoriteDecks.get(target.id))?.preferredCardIds).toEqual(["SOR_001"]);

    await unmountFavoriteDeck(target.id);
    expect((await db.favoriteDecks.get(target.id))?.preferredCardIds).toEqual([]);
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

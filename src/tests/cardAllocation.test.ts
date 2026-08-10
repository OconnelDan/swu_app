import { describe, expect, it } from "vitest";
import { computeCardAllocations, getCardLocationStatus } from "@/lib/cardAllocation";
import { normalizeDeckJson } from "@/lib/normalizeDeckJson";
import type { CollectionCard } from "@/types/collection";
import type { FavoriteDeck } from "@/types/deck";

function makeFavorite(
  id: string,
  name: string,
  createdAt: string,
  cards: { id: string; count: number }[]
): FavoriteDeck {
  const normalizedDeck = normalizeDeckJson({ name, deck: cards });
  return {
    id,
    name,
    originalJson: {},
    normalizedDeck,
    createdAt,
    updatedAt: createdAt
  };
}

describe("computeCardAllocations", () => {
  it("reparte las copias entre mazos favoritos por orden de creación", () => {
    const collection: CollectionCard[] = [
      { cardId: "LAW_038", setCode: "LAW", cardNumber: "038", ownedCount: 3 }
    ];
    const favA = makeFavorite("a", "Mazo A", "2024-01-01T00:00:00.000Z", [{ id: "LAW_038", count: 2 }]);
    const favB = makeFavorite("b", "Mazo B", "2024-01-02T00:00:00.000Z", [{ id: "LAW_038", count: 2 }]);

    const allocations = computeCardAllocations(collection, [favB, favA]);
    const allocation = allocations.get("LAW_038")!;

    expect(allocation.ownedCount).toBe(3);
    expect(allocation.allocatedCount).toBe(3);
    expect(allocation.freeCount).toBe(0);
    expect(allocation.allocations).toEqual([
      { favoriteId: "a", favoriteName: "Mazo A", usedCount: 2 },
      { favoriteId: "b", favoriteName: "Mazo B", usedCount: 1 }
    ]);
    expect(getCardLocationStatus(allocation)).toBe("used");
  });

  it("marca la carta como libre cuando sobran copias", () => {
    const collection: CollectionCard[] = [
      { cardId: "ASH_147", setCode: "ASH", cardNumber: "147", ownedCount: 3 }
    ];
    const favorite = makeFavorite("a", "Mazo A", "2024-01-01T00:00:00.000Z", [{ id: "ASH_147", count: 1 }]);

    const allocations = computeCardAllocations(collection, [favorite]);
    const allocation = allocations.get("ASH_147")!;
    expect(allocation.freeCount).toBe(2);
    expect(getCardLocationStatus(allocation)).toBe("free");
  });

  it("excluye el propio favorito al recomprobarlo", () => {
    const collection: CollectionCard[] = [
      { cardId: "ASH_147", setCode: "ASH", cardNumber: "147", ownedCount: 2 }
    ];
    const favorite = makeFavorite("a", "Mazo A", "2024-01-01T00:00:00.000Z", [{ id: "ASH_147", count: 2 }]);

    const allocations = computeCardAllocations(collection, [favorite], "a");
    const allocation = allocations.get("ASH_147")!;
    expect(allocation.allocatedCount).toBe(0);
    expect(allocation.freeCount).toBe(2);
  });

  it("una carta que no está en la colección se marca como not_owned", () => {
    const allocations = computeCardAllocations([], []);
    expect(getCardLocationStatus(allocations.get("LAW_038"))).toBe("not_owned");
  });
});

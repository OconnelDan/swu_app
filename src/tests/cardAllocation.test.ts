import { describe, expect, it } from "vitest";
import {
  buildMountedDeckComparisonResult,
  buildCardTransferAllocationUpdates,
  computeCardAllocations,
  getCardLocationStatus,
  planCardTransfer,
  summarizeMountAvailability,
  summarizeMountedDeckAllocation
} from "@/lib/cardAllocation";
import { compareDeckWithCollection } from "@/lib/compareDeckWithCollection";
import { normalizeDeckJson } from "@/lib/normalizeDeckJson";
import type { CollectionCard } from "@/types/collection";
import type { FavoriteDeck } from "@/types/deck";

function makeFavorite(
  id: string,
  name: string,
  createdAt: string,
  cards: { id: string; count: number }[],
  allocationPriority = 1,
  isMounted = true,
  preferredCardIds: string[] = [],
  cardAllocationOverrides: Record<string, number> = {}
): FavoriteDeck {
  const normalizedDeck = normalizeDeckJson({ name, deck: cards });
  return {
    id,
    name,
    originalJson: {},
    normalizedDeck,
    createdAt,
    updatedAt: createdAt,
    isMounted,
    mountedAt: isMounted ? createdAt : undefined,
    allocationPriority: isMounted ? allocationPriority : undefined,
    preferredCardIds,
    cardAllocationOverrides
  };
}

describe("computeCardAllocations", () => {
  it("reparte las copias entre mazos favoritos por orden de creación", () => {
    const collection: CollectionCard[] = [
      { cardId: "LAW_038", setCode: "LAW", cardNumber: "038", ownedCount: 3 }
    ];
    const favA = makeFavorite(
      "a",
      "Mazo A",
      "2024-01-01T00:00:00.000Z",
      [{ id: "LAW_038", count: 2 }],
      1
    );
    const favB = makeFavorite(
      "b",
      "Mazo B",
      "2024-01-02T00:00:00.000Z",
      [{ id: "LAW_038", count: 2 }],
      2
    );

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
    const favorite = makeFavorite("a", "Mazo A", "2024-01-01T00:00:00.000Z", [
      { id: "ASH_147", count: 1 }
    ]);

    const allocations = computeCardAllocations(collection, [favorite]);
    const allocation = allocations.get("ASH_147")!;
    expect(allocation.freeCount).toBe(2);
    expect(getCardLocationStatus(allocation)).toBe("free");
  });

  it("un mazo guardado solo como favorito no reserva ninguna copia", () => {
    const collection: CollectionCard[] = [
      { cardId: "ASH_147", setCode: "ASH", cardNumber: "147", ownedCount: 3 }
    ];
    const favorite = makeFavorite(
      "a",
      "Idea sin montar",
      "2024-01-01T00:00:00.000Z",
      [{ id: "ASH_147", count: 3 }],
      1,
      false
    );

    const allocation = computeCardAllocations(collection, [favorite]).get("ASH_147")!;
    expect(allocation.allocatedCount).toBe(0);
    expect(allocation.freeCount).toBe(3);
  });

  it("excluye el propio favorito al recomprobarlo", () => {
    const collection: CollectionCard[] = [
      { cardId: "ASH_147", setCode: "ASH", cardNumber: "147", ownedCount: 2 }
    ];
    const favorite = makeFavorite("a", "Mazo A", "2024-01-01T00:00:00.000Z", [
      { id: "ASH_147", count: 2 }
    ]);

    const allocations = computeCardAllocations(collection, [favorite], "a");
    const allocation = allocations.get("ASH_147")!;
    expect(allocation.allocatedCount).toBe(0);
    expect(allocation.freeCount).toBe(2);
  });

  it("una carta que no está en la colección se marca como not_owned", () => {
    const allocations = computeCardAllocations([], []);
    expect(getCardLocationStatus(allocations.get("LAW_038"))).toBe("not_owned");
  });

  it("resume las copias libres, en otros mazos y no poseídas antes de montar", () => {
    const collection: CollectionCard[] = [
      { cardId: "LAW_038", setCode: "LAW", cardNumber: "038", ownedCount: 3 },
      { cardId: "ASH_147", setCode: "ASH", cardNumber: "147", ownedCount: 1 }
    ];
    const mounted = makeFavorite("a", "Montado", "2024-01-01T00:00:00.000Z", [
      { id: "LAW_038", count: 2 }
    ]);
    const candidate = normalizeDeckJson({
      name: "Candidato",
      deck: [
        { id: "LAW_038", count: 3 },
        { id: "ASH_147", count: 2 }
      ]
    });

    const summary = summarizeMountAvailability(
      candidate,
      computeCardAllocations(collection, [mounted])
    );

    expect(summary).toMatchObject({
      totalRequiredCopies: 5,
      freeCopiesAvailable: 2,
      copiesInMountedDecks: 2,
      copiesMissingFromCollection: 1,
      canMountCompleteWithoutMoving: false
    });
  });

  it("calcula el estado físico de cada mazo montado según su prioridad", () => {
    const collection: CollectionCard[] = [
      { cardId: "LAW_038", setCode: "LAW", cardNumber: "038", ownedCount: 3 }
    ];
    const first = makeFavorite(
      "a",
      "Primero",
      "2024-01-01T00:00:00.000Z",
      [{ id: "LAW_038", count: 2 }],
      1
    );
    const second = makeFavorite(
      "b",
      "Segundo",
      "2024-01-02T00:00:00.000Z",
      [{ id: "LAW_038", count: 2 }],
      2
    );
    const allocations = computeCardAllocations(collection, [second, first]);

    expect(summarizeMountedDeckAllocation(first, allocations)).toMatchObject({
      assignedCopies: 2,
      totalPendingCopies: 0,
      complete: true
    });
    expect(summarizeMountedDeckAllocation(second, allocations)).toMatchObject({
      assignedCopies: 1,
      copiesInOtherMountedDecks: 1,
      copiesMissingFromCollection: 0,
      totalPendingCopies: 1,
      complete: false
    });
  });

  it("da prioridad únicamente a la carta elegida, sin mover las demás cartas", () => {
    const collection: CollectionCard[] = [
      { cardId: "LAW_038", setCode: "LAW", cardNumber: "038", ownedCount: 2 },
      { cardId: "ASH_147", setCode: "ASH", cardNumber: "147", ownedCount: 2 }
    ];
    const first = makeFavorite(
      "a",
      "Mazo A",
      "2024-01-01T00:00:00.000Z",
      [
        { id: "LAW_038", count: 2 },
        { id: "ASH_147", count: 2 }
      ],
      1
    );
    const second = makeFavorite(
      "b",
      "Mazo B",
      "2024-01-02T00:00:00.000Z",
      [
        { id: "LAW_038", count: 2 },
        { id: "ASH_147", count: 2 }
      ],
      2,
      true,
      ["LAW_038"]
    );

    const allocations = computeCardAllocations(collection, [first, second]);

    expect(allocations.get("LAW_038")?.allocations).toEqual([
      { favoriteId: "b", favoriteName: "Mazo B", usedCount: 2 }
    ]);
    expect(allocations.get("ASH_147")?.allocations).toEqual([
      { favoriteId: "a", favoriteName: "Mazo A", usedCount: 2 }
    ]);
  });

  it("prepara el movimiento exacto desde varios mazos para una sola carta", () => {
    const collection: CollectionCard[] = [
      { cardId: "SEC_041", setCode: "SEC", cardNumber: "041", ownedCount: 3 }
    ];
    const first = makeFavorite(
      "a",
      "Mazo A",
      "2024-01-01T00:00:00.000Z",
      [{ id: "SEC_041", count: 2 }],
      1
    );
    const second = makeFavorite(
      "b",
      "Mazo B",
      "2024-01-02T00:00:00.000Z",
      [{ id: "SEC_041", count: 1 }],
      2
    );
    const target = makeFavorite(
      "target",
      "MON verde PRUEBAS SET 8",
      "2024-01-03T00:00:00.000Z",
      [{ id: "SEC_041", count: 3 }],
      3
    );

    const plan = planCardTransfer(collection, [first, second, target], target.id, "SEC_041");

    expect(plan).toMatchObject({
      cardId: "SEC_041",
      currentAssignedCount: 0,
      assignedAfterMoveCount: 3,
      copiesToMove: 3,
      copiesStillMissingFromCollection: 0,
      sources: [
        { favoriteId: "a", favoriteName: "Mazo A", availableCount: 2 },
        { favoriteId: "b", favoriteName: "Mazo B", availableCount: 1 }
      ]
    });
  });

  it("respeta la cantidad elegida de cada mazo de origen", () => {
    const collection: CollectionCard[] = [
      { cardId: "SEC_041", setCode: "SEC", cardNumber: "041", ownedCount: 6 }
    ];
    const first = makeFavorite(
      "a",
      "Mazo A",
      "2024-01-01T00:00:00.000Z",
      [{ id: "SEC_041", count: 3 }],
      1
    );
    const second = makeFavorite(
      "b",
      "Mazo B",
      "2024-01-02T00:00:00.000Z",
      [{ id: "SEC_041", count: 3 }],
      2
    );
    const target = makeFavorite(
      "target",
      "Mazo objetivo",
      "2024-01-03T00:00:00.000Z",
      [{ id: "SEC_041", count: 3 }],
      3
    );

    const updates = buildCardTransferAllocationUpdates(
      collection,
      [first, second, target],
      target.id,
      "SEC_041",
      [
        { favoriteId: first.id, count: 1 },
        { favoriteId: second.id, count: 2 }
      ]
    );
    expect(updates).toEqual([
      { favoriteId: "a", assignedCount: 2 },
      { favoriteId: "b", assignedCount: 1 },
      { favoriteId: "target", assignedCount: 3 }
    ]);

    const withOverrides = [first, second, target].map((favorite) => ({
      ...favorite,
      cardAllocationOverrides: {
        SEC_041: updates.find((entry) => entry.favoriteId === favorite.id)!.assignedCount
      }
    }));
    expect(computeCardAllocations(collection, withOverrides).get("SEC_041")?.allocations).toEqual([
      { favoriteId: "a", favoriteName: "Mazo A", usedCount: 2 },
      { favoriteId: "b", favoriteName: "Mazo B", usedCount: 1 },
      { favoriteId: "target", favoriteName: "Mazo objetivo", usedCount: 3 }
    ]);
  });

  it("rechaza una elección que no cubre todas las copias transferibles", () => {
    const collection: CollectionCard[] = [
      { cardId: "SEC_041", setCode: "SEC", cardNumber: "041", ownedCount: 3 }
    ];
    const source = makeFavorite(
      "a",
      "Mazo A",
      "2024-01-01T00:00:00.000Z",
      [{ id: "SEC_041", count: 3 }],
      1
    );
    const target = makeFavorite(
      "target",
      "Mazo objetivo",
      "2024-01-02T00:00:00.000Z",
      [{ id: "SEC_041", count: 3 }],
      2
    );

    expect(() =>
      buildCardTransferAllocationUpdates(collection, [source, target], target.id, "SEC_041", [
        { favoriteId: source.id, count: 2 }
      ])
    ).toThrow("exactamente 3 copia(s)");
  });

  it("distingue en el resultado las copias en otros mazos de las no poseídas", () => {
    const collection: CollectionCard[] = [
      { cardId: "SEC_041", setCode: "SEC", cardNumber: "041", ownedCount: 2 }
    ];
    const first = makeFavorite(
      "a",
      "Mazo A",
      "2024-01-01T00:00:00.000Z",
      [{ id: "SEC_041", count: 2 }],
      1
    );
    const target = makeFavorite(
      "target",
      "Mazo objetivo",
      "2024-01-02T00:00:00.000Z",
      [{ id: "SEC_041", count: 3 }],
      2
    );
    const baseResult = compareDeckWithCollection(target.normalizedDeck, collection);
    const result = buildMountedDeckComparisonResult(
      baseResult,
      target,
      computeCardAllocations(collection, [first, target])
    );

    expect(result.comparisons[0]).toMatchObject({
      assignedCount: 0,
      missingCount: 3,
      copiesInOtherMountedDecks: 2,
      copiesMissingFromCollection: 1,
      status: "missing"
    });
    expect(result.complete).toBe(false);

    expect(planCardTransfer(collection, [first, target], target.id, "SEC_041")).toMatchObject({
      copiesToMove: 2,
      copiesStillMissingFromCollection: 1,
      sources: [{ favoriteId: "a", favoriteName: "Mazo A", availableCount: 2 }]
    });
  });
});

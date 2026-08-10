import { describe, expect, it } from "vitest";
import { compareDeckWithCollection } from "@/lib/compareDeckWithCollection";
import { normalizeDeckJson } from "@/lib/normalizeDeckJson";
import type { CollectionCard } from "@/types/collection";

describe("compareDeckWithCollection", () => {
  it("caso 3: carta cubierta exactamente (Lepi Lookout LAW_038, necesarias 3, disponibles 3)", () => {
    const deck = normalizeDeckJson({
      deck: [{ id: "LAW_038", count: 3 }]
    });
    const collection: CollectionCard[] = [
      { cardId: "LAW_038", setCode: "LAW", cardNumber: "038", ownedCount: 3 }
    ];
    const result = compareDeckWithCollection(deck, collection);
    const comparison = result.comparisons.find((c) => c.cardId === "LAW_038")!;
    expect(comparison.missingCount).toBe(0);
    expect(comparison.status).toBe("complete");
  });

  it("caso 4: carta parcialmente cubierta (necesarias 3, disponibles 1, faltan 2)", () => {
    const deck = normalizeDeckJson({ deck: [{ id: "ASH_147", count: 3 }] });
    const collection: CollectionCard[] = [
      { cardId: "ASH_147", setCode: "ASH", cardNumber: "147", ownedCount: 1 }
    ];
    const result = compareDeckWithCollection(deck, collection);
    const comparison = result.comparisons[0];
    expect(comparison.requiredCount).toBe(3);
    expect(comparison.ownedCount).toBe(1);
    expect(comparison.missingCount).toBe(2);
    expect(comparison.status).toBe("missing");
  });

  it("caso 5: carta ausente por completo (necesarias 2, disponibles 0, faltan 2)", () => {
    const deck = normalizeDeckJson({ deck: [{ id: "ASH_032", count: 2 }] });
    const result = compareDeckWithCollection(deck, []);
    const comparison = result.comparisons[0];
    expect(comparison.ownedCount).toBe(0);
    expect(comparison.missingCount).toBe(2);
  });

  it("caso 6: carta repetida entre mazo y banquillo suma copias necesarias", () => {
    const deck = normalizeDeckJson({
      deck: [{ id: "LOF_100", count: 2 }],
      sideboard: [{ id: "LOF_100", count: 1 }]
    });
    const required = deck.allRequiredCards.find((c) => c.cardId === "LOF_100")!;
    expect(required.requiredCount).toBe(3);
    expect(required.zoneCounts.main).toBe(2);
    expect(required.zoneCounts.sideboard).toBe(1);

    const result = compareDeckWithCollection(deck, [
      { cardId: "LOF_100", setCode: "LOF", cardNumber: "100", ownedCount: 3 }
    ]);
    expect(result.comparisons[0].requiredCount).toBe(3);
    expect(result.comparisons[0].status).toBe("complete");
  });

  it("caso 8: líder y base se procesan de forma independiente y aparecen en el resumen", () => {
    const deck = normalizeDeckJson({
      leader: { id: "JTL_001", count: 1 },
      base: { id: "SEC_024", count: 1 },
      deck: [{ id: "ASH_188", count: 3 }]
    });

    const result = compareDeckWithCollection(deck, [
      { cardId: "JTL_001", setCode: "JTL", cardNumber: "001", ownedCount: 1 },
      { cardId: "SEC_024", setCode: "SEC", cardNumber: "024", ownedCount: 0 },
      { cardId: "ASH_188", setCode: "ASH", cardNumber: "188", ownedCount: 3 }
    ]);

    expect(result.leaderStatus).toBe("complete");
    expect(result.baseStatus).toBe("missing");
    expect(result.complete).toBe(false);
  });

  it("un mazo completo se marca como complete=true", () => {
    const deck = normalizeDeckJson({
      leader: { id: "JTL_001", count: 1 },
      base: { id: "SEC_024", count: 1 },
      deck: [{ id: "ASH_188", count: 3 }]
    });
    const result = compareDeckWithCollection(deck, [
      { cardId: "JTL_001", setCode: "JTL", cardNumber: "001", ownedCount: 1 },
      { cardId: "SEC_024", setCode: "SEC", cardNumber: "024", ownedCount: 1 },
      { cardId: "ASH_188", setCode: "ASH", cardNumber: "188", ownedCount: 3 }
    ]);
    expect(result.complete).toBe(true);
    expect(result.differentMissingCards).toBe(0);
  });
});

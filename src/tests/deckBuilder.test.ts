import { describe, expect, it } from "vitest";
import { buildDeckJson, validatePremierDeck } from "@/lib/deckBuilder";
import type { CardInfo } from "@/types/card";

function card(cardId: string, overrides: Partial<CardInfo> = {}): CardInfo {
  const [setCode, cardNumber] = cardId.split("_");
  return {
    cardId,
    setCode,
    cardNumber,
    name: cardId,
    type: "Unit",
    deckLimit: 3,
    cardKey: cardId,
    aspects: [],
    ...overrides
  };
}

describe("constructor Premier", () => {
  it("valida líder, base, 50 cartas y un banquillo de hasta 10", () => {
    const cards = new Map<string, CardInfo>([
      ["SOR_001", card("SOR_001", { type: "Leader", aspects: ["Vigilance", "Villainy"] })],
      ["SOR_021", card("SOR_021", { type: "Base", aspects: ["Command"] })]
    ]);
    const mainCounts: Record<string, number> = {};
    for (let index = 30; index < 46; index += 1) {
      const cardId = `SOR_${String(index).padStart(3, "0")}`;
      cards.set(cardId, card(cardId));
      mainCounts[cardId] = 3;
    }
    cards.set("SOR_046", card("SOR_046"));
    mainCounts.SOR_046 = 2;

    const result = validatePremierDeck(
      {
        name: "Mazo válido",
        leaderId: "SOR_001",
        baseId: "SOR_021",
        mainCounts,
        sideboardCounts: {}
      },
      cards
    );

    expect(result).toMatchObject({ valid: true, mainCount: 50, sideboardCount: 0 });
  });

  it("suma las copias de una reimpresión entre mazo y banquillo", () => {
    const cards = new Map<string, CardInfo>([
      ["SOR_100", card("SOR_100", { name: "Open Fire", cardKey: "open-fire" })],
      ["SEC_100", card("SEC_100", { name: "Open Fire", cardKey: "open-fire" })]
    ]);
    const result = validatePremierDeck(
      {
        name: "Prueba",
        leaderId: "SOR_001",
        baseId: "SOR_021",
        mainCounts: { SOR_100: 3 },
        sideboardCounts: { SEC_100: 1 }
      },
      cards
    );

    expect(result.errors).toContain(
      "Open Fire tiene 4 copias entre mazo y banquillo; el máximo es 3."
    );
  });

  it("respeta excepciones oficiales de hasta 15 copias", () => {
    const vulture = card("JTL_256", {
      name: "Swarming Vulture Droid",
      cardKey: "swarming-vulture-droid",
      deckLimit: 15
    });
    const result = validatePremierDeck(
      {
        name: "Droides",
        leaderId: "JTL_006",
        baseId: "SEC_025",
        mainCounts: { JTL_256: 15 },
        sideboardCounts: {}
      },
      new Map([[vulture.cardId, vulture]])
    );

    expect(result.errors.some((message) => message.includes("máximo"))).toBe(false);
  });

  it("avisa de la penalización de aspecto sin tratarla como ilegal", () => {
    const cards = new Map<string, CardInfo>([
      ["SOR_001", card("SOR_001", { type: "Leader", aspects: ["Vigilance", "Villainy"] })],
      ["SOR_021", card("SOR_021", { type: "Base", aspects: ["Command"] })],
      ["SOR_100", card("SOR_100", { aspects: ["Aggression"] })]
    ]);
    const result = validatePremierDeck(
      {
        name: "Fuera de aspecto",
        leaderId: "SOR_001",
        baseId: "SOR_021",
        mainCounts: { SOR_100: 2 },
        sideboardCounts: {}
      },
      cards
    );

    expect(result.aspectPenaltyCopies).toBe(2);
    expect(result.warnings[0]).toContain("+2 recursos");
  });

  it("genera el JSON compatible con el importador actual", () => {
    expect(
      buildDeckJson({
        name: "Mi mazo",
        leaderId: "SOR_001",
        baseId: "SOR_021",
        mainCounts: { SOR_100: 3 },
        sideboardCounts: { SOR_101: 2 }
      })
    ).toEqual({
      metadata: { name: "Mi mazo", format: "Premier", source: "SWU Deck Vault" },
      leader: { id: "SOR_001", count: 1 },
      base: { id: "SOR_021", count: 1 },
      deck: [{ id: "SOR_100", count: 3 }],
      sideboard: [{ id: "SOR_101", count: 2 }]
    });
  });
});

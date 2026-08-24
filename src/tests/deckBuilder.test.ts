import { describe, expect, it } from "vitest";
import { OFFICIAL_NON_PREMIER_SPECIAL_SET_CODES } from "@/generated/officialFormatRules";
import { buildDeckJson, validateDeck, validatePremierDeck } from "@/lib/deckBuilder";
import { buildCardLegalityIndex, getCardLegality } from "@/lib/deckFormats";
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
      ["JTL_001", card("JTL_001", { type: "Leader", aspects: ["Vigilance", "Villainy"] })],
      ["JTL_021", card("JTL_021", { type: "Base", aspects: ["Command"] })]
    ]);
    const mainCounts: Record<string, number> = {};
    for (let index = 30; index < 46; index += 1) {
      const cardId = `JTL_${String(index).padStart(3, "0")}`;
      cards.set(cardId, card(cardId));
      mainCounts[cardId] = 3;
    }
    cards.set("JTL_046", card("JTL_046"));
    mainCounts.JTL_046 = 2;

    const result = validatePremierDeck(
      {
        name: "Mazo válido",
        leaderId: "JTL_001",
        baseId: "JTL_021",
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

  it("aplica Data Vault y Thermal Oscillator al mínimo del formato", () => {
    const cards = new Map<string, CardInfo>([
      ["JTL_001", card("JTL_001", { type: "Leader" })],
      ["JTL_024", card("JTL_024", { type: "Base", cardKey: "4028826022" })],
      ["JTL_025", card("JTL_025", { type: "Base", cardKey: "4301437393" })]
    ]);
    const dataVault = validateDeck(
      {
        name: "Almacén",
        format: "premier",
        leaderId: "JTL_001",
        baseId: "JTL_024",
        mainCounts: {},
        sideboardCounts: {}
      },
      cards
    );
    const oscillator = validateDeck(
      {
        name: "Oscilador",
        format: "premier",
        leaderId: "JTL_001",
        baseId: "JTL_025",
        mainCounts: {},
        sideboardCounts: {}
      },
      cards
    );

    expect(dataVault.minimumMainCount).toBe(60);
    expect(oscillator.minimumMainCount).toBe(45);
  });

  it("valida Twin Suns con dos líderes, 80 cartas, singleton y sin banquillo", () => {
    const cards = new Map<string, CardInfo>([
      ["JTL_001", card("JTL_001", { type: "Leader", aspects: ["Heroism"] })],
      ["SEC_002", card("SEC_002", { type: "Leader", aspects: ["Command"] })],
      ["JTL_021", card("JTL_021", { type: "Base" })]
    ]);
    const mainCounts: Record<string, number> = {};
    for (let index = 30; index < 110; index += 1) {
      const cardId = `SEC_${String(index).padStart(3, "0")}`;
      cards.set(cardId, card(cardId));
      mainCounts[cardId] = 1;
    }

    const result = validateDeck(
      {
        name: "Twin Suns",
        format: "twin-suns",
        leaderIds: ["JTL_001", "SEC_002"],
        baseId: "JTL_021",
        mainCounts,
        sideboardCounts: {}
      },
      cards
    );

    expect(result).toMatchObject({ valid: true, mainCount: 80, sideboardLimit: 0 });
  });

  it("rechaza mezclar Heroísmo y Villanía entre los líderes de Twin Suns", () => {
    const cards = new Map<string, CardInfo>([
      ["JTL_001", card("JTL_001", { type: "Leader", aspects: ["Heroism"] })],
      ["SEC_002", card("SEC_002", { type: "Leader", aspects: ["Villainy"] })],
      ["JTL_021", card("JTL_021", { type: "Base" })]
    ]);
    const result = validateDeck(
      {
        name: "No válido",
        format: "twin-suns",
        leaderIds: ["JTL_001", "SEC_002"],
        baseId: "JTL_021",
        mainCounts: {},
        sideboardCounts: {}
      },
      cards
    );

    expect(result.errors).toContain("los dos líderes no pueden combinar Heroísmo y Villanía.");
  });

  it("mantiene en Twin Suns una excepción oficial de hasta 15 copias", () => {
    const vulture = card("JTL_256", {
      name: "Swarming Vulture Droid",
      cardKey: "2177194044",
      deckLimit: 15
    });
    const cards = new Map<string, CardInfo>([
      ["JTL_001", card("JTL_001", { type: "Leader" })],
      ["SEC_002", card("SEC_002", { type: "Leader" })],
      ["JTL_021", card("JTL_021", { type: "Base" })],
      [vulture.cardId, vulture]
    ]);
    const result = validateDeck(
      {
        name: "Enjambre",
        format: "twin-suns",
        leaderIds: ["JTL_001", "SEC_002"],
        baseId: "JTL_021",
        mainCounts: { JTL_256: 15 },
        sideboardCounts: {}
      },
      cards
    );

    expect(result.errors.some((message) => message.includes("el máximo es"))).toBe(false);
  });

  it("bloquea en Eternal una carta suspendida oficialmente", () => {
    const ig2000 = card("JTL_140", {
      name: "IG-2000, Assassin's Aggressor",
      cardKey: "3722493191"
    });
    const cards = new Map<string, CardInfo>([
      ["JTL_001", card("JTL_001", { type: "Leader" })],
      ["JTL_021", card("JTL_021", { type: "Base" })],
      [ig2000.cardId, ig2000]
    ]);
    const result = validateDeck(
      {
        name: "Suspendida",
        format: "eternal",
        leaderId: "JTL_001",
        baseId: "JTL_021",
        mainCounts: { JTL_140: 1 },
        sideboardCounts: {}
      },
      cards
    );

    expect(result.errors.some((message) => message.includes("está inhabilitada en Eternal"))).toBe(
      true
    );
  });

  it("permite una impresión rotada si comparte identidad con una reimpresión Premier", () => {
    const rotated = card("SOR_100", { cardKey: "same-card" });
    const legalReprint = card("SEC_100", { cardKey: "same-card" });
    const cards = new Map<string, CardInfo>([
      [rotated.cardId, rotated],
      [legalReprint.cardId, legalReprint]
    ]);
    const result = validateDeck(
      {
        name: "Reimpresión",
        format: "premier",
        leaderId: "JTL_001",
        baseId: "JTL_021",
        mainCounts: { SOR_100: 1 },
        sideboardCounts: {}
      },
      cards,
      buildCardLegalityIndex([...cards.values()])
    );

    expect(result.errors.some((message) => message.includes("ha rotado"))).toBe(false);
  });

  it("mantiene IBH fuera de Premier salvo que la carta tenga una reimpresión Premier", () => {
    expect(OFFICIAL_NON_PREMIER_SPECIAL_SET_CODES).toContain("IBH");

    const exclusiveHothCard = card("IBH_001", {
      name: "Carta exclusiva de Hoth",
      cardKey: "ibh-exclusive"
    });
    const reprintedHothCard = card("IBH_002", {
      name: "Carta reimpresa de Hoth",
      cardKey: "ibh-reprint"
    });
    const premierReprint = card("SEC_200", {
      name: "Carta reimpresa de Hoth",
      cardKey: "ibh-reprint"
    });
    const cards = new Map<string, CardInfo>([
      [exclusiveHothCard.cardId, exclusiveHothCard],
      [reprintedHothCard.cardId, reprintedHothCard],
      [premierReprint.cardId, premierReprint]
    ]);
    const index = buildCardLegalityIndex([...cards.values()]);

    expect(getCardLegality(exclusiveHothCard, "premier", index)).toMatchObject({
      legal: false
    });
    expect(getCardLegality(reprintedHothCard, "premier", index)).toEqual({ legal: true });
  });

  it("aplica en Trilogy los límites compartidos entre sus tres mazos", () => {
    const cards = new Map<string, CardInfo>();
    const trilogyDecks = [0, 1, 2].map((index) => {
      const leaderId = `JTL_00${index + 1}`;
      const baseId = `SEC_02${index + 1}`;
      cards.set(leaderId, card(leaderId, { type: "Leader" }));
      cards.set(baseId, card(baseId, { type: "Base" }));
      return {
        name: `Mazo ${index + 1}`,
        leaderIds: [leaderId],
        baseId,
        mainCounts: { JTL_100: 2 },
        sideboardCounts: {}
      };
    });
    cards.set("JTL_100", card("JTL_100"));

    const result = validateDeck(
      {
        name: "Trilogía",
        format: "trilogy",
        trilogyCardPool: "premier",
        mainCounts: {},
        sideboardCounts: {},
        trilogyDecks
      },
      cards
    );

    expect(result.errors).toContain(
      "JTL_100 suma 6 copias entre los tres mazos; el máximo compartido es 3."
    );
  });
});

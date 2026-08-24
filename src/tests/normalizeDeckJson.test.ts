import { describe, expect, it } from "vitest";
import { normalizeDeckJson } from "@/lib/normalizeDeckJson";

describe("normalizeDeckJson", () => {
  it("reconoce el formato estándar con metadata, leader, base, deck y sideboard", () => {
    const deck = normalizeDeckJson({
      metadata: { name: "Asajj Red Roja V3", author: "Oconnel" },
      leader: { id: "JTL_001", count: 1 },
      base: { id: "SEC_024", count: 1 },
      deck: [{ id: "ASH_188", count: 3 }],
      sideboard: [{ id: "SEC_162", count: 2 }]
    });

    expect(deck.name).toBe("Asajj Red Roja V3");
    expect(deck.author).toBe("Oconnel");
    expect(deck.format).toBe("premier");
    expect(deck.leader?.cardId).toBe("JTL_001");
    expect(deck.base?.cardId).toBe("SEC_024");
    expect(deck.mainDeck.map((c) => c.cardId)).toContain("ASH_188");
    expect(deck.sideboard.map((c) => c.cardId)).toContain("SEC_162");
  });

  it("reconoce el formato con name y base_id", () => {
    const deck = normalizeDeckJson({
      name: "STAR WARS DAD Ahsoka Blue",
      base_id: "ASH_020",
      deck_grouped: {
        ASH: [{ id: "ASH_062", count: 3 }],
        LAW: [{ id: "LAW_038", count: 3 }]
      },
      sideboard_grouped: {
        LAW: [{ id: "LAW_149", count: 2 }]
      }
    });

    expect(deck.name).toBe("STAR WARS DAD Ahsoka Blue");
    expect(deck.base?.cardId).toBe("ASH_020");
    expect(deck.mainDeck.map((c) => c.cardId).sort()).toEqual(["ASH_062", "LAW_038"]);
    expect(deck.sideboard.map((c) => c.cardId)).toEqual(["LAW_149"]);
  });

  it("caso 9: deck_grouped y sideboard_grouped se aplanan correctamente", () => {
    const deck = normalizeDeckJson({
      name: "Mazo agrupado",
      deck_grouped: {
        SOR: [{ id: "SOR_001", count: 2 }],
        SHD: [{ id: "SHD_010", count: 1 }]
      },
      sideboard_grouped: {
        SOR: [{ id: "SOR_001", count: 1 }]
      }
    });

    const sor001 = deck.allRequiredCards.find((c) => c.cardId === "SOR_001")!;
    expect(sor001.requiredCount).toBe(3);
    expect(sor001.zones.sort()).toEqual(["main", "sideboard"]);
  });

  it("lanza error con JSON vacío / sin cartas reconocibles", () => {
    expect(() => normalizeDeckJson({})).toThrow();
    expect(() => normalizeDeckJson({ metadata: { name: "Vacío" }, deck: [] })).toThrow();
  });

  it("permite un borrador vacío generado por el constructor", () => {
    const deck = normalizeDeckJson({
      metadata: {
        name: "Borrador inicial",
        format: "Premier",
        source: "SWU Deck Vault"
      },
      deck: [],
      sideboard: []
    });

    expect(deck.name).toBe("Borrador inicial");
    expect(deck.format).toBe("premier");
    expect(deck.mainDeck).toEqual([]);
  });

  it("lanza error si una carta no tiene id", () => {
    expect(() =>
      normalizeDeckJson({ deck: [{ count: 2 } as unknown as { id: string; count: number }] })
    ).toThrow();
  });

  it("lanza error si count es cero o negativo", () => {
    expect(() => normalizeDeckJson({ deck: [{ id: "ASH_001", count: 0 }] })).toThrow();
  });

  it("acepta alias mainDeck, mainboard y cards", () => {
    const deck1 = normalizeDeckJson({ mainDeck: [{ id: "SOR_010", count: 1 }] });
    const deck2 = normalizeDeckJson({ mainboard: [{ id: "SOR_010", count: 1 }] });
    const deck3 = normalizeDeckJson({ cards: [{ id: "SOR_010", count: 1 }] });
    expect(deck1.mainDeck[0].cardId).toBe("SOR_010");
    expect(deck2.mainDeck[0].cardId).toBe("SOR_010");
    expect(deck3.mainDeck[0].cardId).toBe("SOR_010");
  });

  it("normaliza Twin Suns con sus dos líderes", () => {
    const deck = normalizeDeckJson({
      metadata: { name: "Gemelos", format: "Twin Suns" },
      leaders: [
        { id: "SEC_001", count: 1 },
        { id: "SEC_002", count: 1 }
      ],
      base: { id: "SEC_030", count: 1 },
      deck: [{ id: "SEC_040", count: 1 }]
    });

    expect(deck.format).toBe("twin-suns");
    expect(deck.leaders?.map((leader) => leader.cardId)).toEqual(["SEC_001", "SEC_002"]);
    expect(deck.allRequiredCards.map((card) => card.cardId)).toEqual([
      "SEC_001",
      "SEC_002",
      "SEC_030",
      "SEC_040"
    ]);
  });

  it("detecta Twin Suns con secondleader, 80 cartas y sin banquillo", () => {
    const deck = normalizeDeckJson({
      metadata: { name: "Azure Iron Man - Copy", author: "Oconnel" },
      leader: { id: "TWI_017", count: 1 },
      secondleader: { id: "SEC_009", count: 1 },
      base: { id: "SEC_020", count: 1 },
      deck: Array.from({ length: 80 }, (_, index) => ({
        id: `SEC_${String(index + 1).padStart(3, "0")}`,
        count: 1
      })),
      sideboard: []
    });

    expect(deck.format).toBe("twin-suns");
    expect(deck.leaders?.map((leader) => leader.cardId)).toEqual(["TWI_017", "SEC_009"]);
    expect(deck.mainDeck.reduce((total, card) => total + card.requiredCount, 0)).toBe(80);
    expect(deck.sideboard).toEqual([]);
  });

  it.each([
    ["secondLeader", { id: "SEC_009", count: 1 }],
    ["second_leader", { id: "SEC_009", count: 1 }],
    ["secondleader_id", "SEC_009"],
    ["secondLeaderId", "SEC_009"],
    ["second_leader_id", "SEC_009"],
    ["leader2", { id: "SEC_009", count: 1 }],
    ["leader_2", { id: "SEC_009", count: 1 }],
    ["leader2_id", "SEC_009"],
    ["leader_2_id", "SEC_009"]
  ])("acepta la variante %s para el segundo líder", (key, secondLeader) => {
    const deck = normalizeDeckJson({
      leader: { id: "TWI_017", count: 1 },
      [key]: secondLeader,
      base: { id: "SEC_020", count: 1 },
      deck: [{ id: "SEC_081", count: 1 }],
      sideboard: []
    });

    expect(deck.format).toBe("twin-suns");
    expect(deck.leaders?.map((leader) => leader.cardId)).toEqual(["TWI_017", "SEC_009"]);
  });

  it("respeta Eternal cuando el formato está declarado", () => {
    const deck = normalizeDeckJson({
      metadata: { name: "Eternal", format: "Eternal" },
      leader: { id: "SOR_001", count: 1 },
      base: { id: "SHD_020", count: 1 },
      deck: [{ id: "TWI_100", count: 3 }],
      sideboard: [{ id: "SOR_100", count: 2 }]
    });

    expect(deck.format).toBe("eternal");
    expect(deck.leaders?.map((leader) => leader.cardId)).toEqual(["SOR_001"]);
    expect(deck.sideboard[0].cardId).toBe("SOR_100");
  });

  it.each([
    ["Eterno", "eternal"],
    ["Twin Sun", "twin-suns"],
    ["Twin_Suns", "twin-suns"],
    ["Soles gemelos", "twin-suns"]
  ])("reconoce el alias de formato %s", (format, expected) => {
    const deck = normalizeDeckJson({
      format,
      leaders: [
        { id: "SEC_001", count: 1 },
        { id: "SEC_002", count: 1 }
      ],
      base: { id: "SEC_020", count: 1 },
      deck: [{ id: "SEC_100", count: 1 }]
    });

    expect(deck.format).toBe(expected);
  });

  it("mantiene Premier como valor por defecto para la estructura estándar", () => {
    const deck = normalizeDeckJson({
      leader_id: "SEC_001",
      base_id: "SEC_020",
      mainboard: [{ id: "SEC_100", count: 3 }]
    });

    expect(deck.format).toBe("premier");
  });

  it("normaliza Trilogy y agrega las copias de sus tres mazos", () => {
    const deck = normalizeDeckJson({
      metadata: { name: "Equipo", format: "Trilogy", cardPool: "Eternal" },
      trilogyDecks: [
        {
          name: "Uno",
          leader: { id: "SOR_001", count: 1 },
          base: { id: "SOR_020", count: 1 },
          deck: [{ id: "SOR_100", count: 2 }]
        },
        {
          name: "Dos",
          leader: { id: "SHD_001", count: 1 },
          base: { id: "SHD_020", count: 1 },
          deck: [{ id: "SOR_100", count: 1 }]
        },
        {
          name: "Tres",
          leader: { id: "TWI_001", count: 1 },
          base: { id: "TWI_020", count: 1 },
          deck: [{ id: "TWI_100", count: 3 }]
        }
      ]
    });

    expect(deck.format).toBe("trilogy");
    expect(deck.trilogyCardPool).toBe("eternal");
    expect(deck.trilogyDecks).toHaveLength(3);
    expect(deck.allRequiredCards.find((card) => card.cardId === "SOR_100")?.requiredCount).toBe(3);
    expect(deck.sideboard).toEqual([]);
  });

  it("detecta Trilogy por tres submazos aunque no declare format", () => {
    const decks = ["SOR", "SHD", "TWI"].map((setCode, index) => ({
      name: `Mazo ${index + 1}`,
      leader: { id: `${setCode}_001`, count: 1 },
      base: { id: `${setCode}_020`, count: 1 },
      deck: [{ id: `${setCode}_100`, count: 3 }]
    }));
    const deck = normalizeDeckJson({ name: "Equipo inferido", decks });

    expect(deck.format).toBe("trilogy");
    expect(deck.trilogyCardPool).toBe("premier");
    expect(deck.trilogyDecks).toHaveLength(3);
    expect(deck.leaders).toHaveLength(3);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildDeckCardBorderGradient,
  DECK_ASPECT_COLORS,
  getDeckCardBorderColors
} from "@/lib/deckCardBorder";
import { normalizeDeckJson } from "@/lib/normalizeDeckJson";
import type { CardInfo } from "@/types/card";

function card(cardId: string, aspects: string[]): CardInfo {
  const [setCode, cardNumber] = cardId.split("_");
  return { cardId, setCode, cardNumber, aspects };
}

describe("bordes de las tarjetas de mazo", () => {
  it("sitúa los colores del líder a la izquierda y los de la base a la derecha", () => {
    const deck = normalizeDeckJson({
      metadata: { name: "Mando y Vigilancia" },
      leader: { id: "ASH_007", count: 1 },
      base: { id: "ASH_019", count: 1 },
      deck: [{ id: "ASH_100", count: 3 }]
    });
    const cards = new Map([
      ["ASH_007", card("ASH_007", ["Command", "Villainy"])],
      ["ASH_019", card("ASH_019", ["Vigilance"])]
    ]);

    const colors = getDeckCardBorderColors(deck, cards);

    expect(colors).toEqual({
      leader: [DECK_ASPECT_COLORS.Command],
      base: [DECK_ASPECT_COLORS.Vigilance]
    });
    expect(buildDeckCardBorderGradient(colors)).toBe(
      "linear-gradient(115deg, #3ddc84 0%, #3ddc84 46%, #4da6ff 54%, #4da6ff 100%)"
    );
  });

  it("combina todos los aspectos de color de líderes multiaspecto", () => {
    const deck = normalizeDeckJson({
      metadata: { name: "Multiaspecto", format: "Twin Suns" },
      leaders: [
        { id: "ASH_001", count: 1 },
        { id: "ASH_002", count: 1 }
      ],
      base: { id: "ASH_021", count: 1 },
      deck: [{ id: "ASH_100", count: 1 }]
    });
    const cards = new Map([
      ["ASH_001", card("ASH_001", ["Vigilance", "Command", "Heroism"])],
      ["ASH_002", card("ASH_002", ["Aggression", "Cunning", "Villainy"])],
      ["ASH_021", card("ASH_021", ["Command"])]
    ]);

    expect(getDeckCardBorderColors(deck, cards)).toEqual({
      leader: [
        DECK_ASPECT_COLORS.Vigilance,
        DECK_ASPECT_COLORS.Command,
        DECK_ASPECT_COLORS.Aggression,
        DECK_ASPECT_COLORS.Cunning
      ],
      base: [DECK_ASPECT_COLORS.Command]
    });
  });

  it("usa un borde neutro mientras el catálogo todavía no está disponible", () => {
    const deck = normalizeDeckJson({
      metadata: { name: "Sin datos visuales" },
      deck: [{ id: "ASH_100", count: 1 }]
    });

    expect(getDeckCardBorderColors(deck)).toEqual({
      leader: ["#28336a"],
      base: ["#28336a"]
    });
  });
});

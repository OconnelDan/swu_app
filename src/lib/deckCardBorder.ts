import { getDeckBaseIds, getDeckLeaderIds } from "@/lib/deckFormats";
import type { CardInfo } from "@/types/card";
import type { NormalizedDeck } from "@/types/deck";

const PRIMARY_ASPECTS = ["Vigilance", "Command", "Aggression", "Cunning"] as const;
const ALIGNMENT_ASPECTS = ["Heroism", "Villainy"] as const;

export const DECK_ASPECT_COLORS: Record<string, string> = {
  Vigilance: "#4da6ff",
  Command: "#3ddc84",
  Aggression: "#ff4d4f",
  Cunning: "#facc15",
  Heroism: "#e2e8f0",
  Villainy: "#64748b"
};

const FALLBACK_COLOR = "#28336a";

export interface DeckCardBorderColors {
  leader: string[];
  base: string[];
}

type AspectCardMap = ReadonlyMap<string, Pick<CardInfo, "aspects">>;

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function colorsForCards(cardIds: string[], cardsById?: AspectCardMap | null): string[] {
  const aspects = unique(cardIds.flatMap((cardId) => cardsById?.get(cardId)?.aspects ?? []));
  const primary = PRIMARY_ASPECTS.filter((aspect) => aspects.includes(aspect));
  const selected = primary.length
    ? primary
    : ALIGNMENT_ASPECTS.filter((aspect) => aspects.includes(aspect));
  const colors = selected.map((aspect) => DECK_ASPECT_COLORS[aspect]);
  return colors.length ? colors : [FALLBACK_COLOR];
}

export function getDeckCardBorderColors(
  deck: NormalizedDeck,
  cardsById?: AspectCardMap | null
): DeckCardBorderColors {
  return {
    leader: colorsForCards(getDeckLeaderIds(deck), cardsById),
    base: colorsForCards(getDeckBaseIds(deck), cardsById)
  };
}

function colorStops(colors: string[], start: number, end: number): string[] {
  const width = (end - start) / colors.length;
  return colors.flatMap((color, index) => {
    const colorStart = start + width * index;
    const colorEnd = start + width * (index + 1);
    return [`${color} ${colorStart}%`, `${color} ${colorEnd}%`];
  });
}

/**
 * El ángulo hace que el encuentro entre el lado del líder y el de la base sea
 * diagonal en los bordes superior e inferior. Si hay varios aspectos de color
 * o varios líderes, la mitad correspondiente se divide en franjas.
 */
export function buildDeckCardBorderGradient(colors: DeckCardBorderColors): string {
  return `linear-gradient(115deg, ${[
    ...colorStops(colors.leader, 0, 46),
    ...colorStops(colors.base, 54, 100)
  ].join(", ")})`;
}

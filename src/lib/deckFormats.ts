import {
  OFFICIAL_CARD_COPY_LIMITS,
  OFFICIAL_DECK_SIZE_MODIFIERS,
  OFFICIAL_FORMAT_RULES_LAST_UPDATED,
  OFFICIAL_NON_PREMIER_SPECIAL_SET_CODES,
  OFFICIAL_PREMIER_SET_CODES,
  OFFICIAL_ROTATED_CORE_SET_CODES,
  OFFICIAL_SUSPENDED_CARDS,
  OFFICIAL_UNREVIEWED_SPECIAL_SET_CODES
} from "@/generated/officialFormatRules";
import type { CardInfo } from "@/types/card";
import type { DeckFormat, NormalizedDeck, TrilogyCardPool } from "@/types/deck";

export const DECK_FORMAT_LABELS: Record<DeckFormat, string> = {
  premier: "Premier",
  eternal: "Eternal",
  "twin-suns": "Twin Suns",
  trilogy: "Trilogy"
};

export const DECK_FORMAT_DESCRIPTIONS: Record<DeckFormat, string> = {
  premier: "1 líder, 1 base, 50 cartas y banquillo de hasta 10. Usa la rotación vigente.",
  eternal: "1 líder, 1 base, 50 cartas y banquillo de hasta 10. Admite todas las colecciones.",
  "twin-suns":
    "2 líderes diferentes, 1 base y 80 cartas distintas. Sin banquillo y pensado para 3–4 jugadores.",
  trilogy:
    "Un equipo de 3 mazos sin banquillo. Los límites de líderes, bases y copias se comparten entre los tres."
};

export const DECK_FORMATS = ["premier", "eternal", "twin-suns", "trilogy"] as const;

export interface CardLegalityIndex {
  premierCardKeys: ReadonlySet<string>;
  suspendedCardKeys: {
    premier: ReadonlySet<string>;
    eternal: ReadonlySet<string>;
    twinSuns: ReadonlySet<string>;
  };
  suspendedNames: ReadonlyMap<string, string>;
}

export interface CardLegality {
  legal: boolean;
  reason?: string;
}

export interface DeckCardLegality {
  legal: boolean;
  reasons: string[];
  illegalCardIds: string[];
}

function foldFormat(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[ _]+/g, "-");
}

export function parseDeckFormat(value: unknown): DeckFormat {
  if (typeof value !== "string") return "premier";
  const folded = foldFormat(value);
  if (folded === "eternal") return "eternal";
  if (folded === "twin-suns" || folded === "twinsuns") return "twin-suns";
  if (folded === "trilogy") return "trilogy";
  return "premier";
}

export function parseTrilogyCardPool(value: unknown): TrilogyCardPool {
  return typeof value === "string" && foldFormat(value) === "eternal" ? "eternal" : "premier";
}

export function getDeckFormat(deck: Pick<NormalizedDeck, "format">): DeckFormat {
  return parseDeckFormat(deck.format);
}

export function getTrilogyCardPool(deck: Pick<NormalizedDeck, "trilogyCardPool">): TrilogyCardPool {
  return parseTrilogyCardPool(deck.trilogyCardPool);
}

export function getDeckFormatLabel(
  deck: Pick<NormalizedDeck, "format" | "trilogyCardPool">
): string {
  const format = getDeckFormat(deck);
  if (format !== "trilogy") return DECK_FORMAT_LABELS[format];
  const pool = getTrilogyCardPool(deck);
  return `Trilogy · ${DECK_FORMAT_LABELS[pool]}`;
}

export function getDeckLeaderIds(deck: NormalizedDeck): string[] {
  if (getDeckFormat(deck) === "trilogy") {
    return (deck.trilogyDecks ?? []).flatMap((part) =>
      (part.leaders?.length ? part.leaders : part.leader ? [part.leader] : []).map(
        (leader) => leader.cardId
      )
    );
  }
  return (deck.leaders?.length ? deck.leaders : deck.leader ? [deck.leader] : []).map(
    (leader) => leader.cardId
  );
}

export function getDeckBaseIds(deck: NormalizedDeck): string[] {
  if (getDeckFormat(deck) === "trilogy") {
    return (deck.trilogyDecks ?? []).flatMap((part) => (part.base ? [part.base.cardId] : []));
  }
  return deck.base ? [deck.base.cardId] : [];
}

export function getMetadataFormatName(format: DeckFormat): string {
  return DECK_FORMAT_LABELS[format];
}

export function getEffectiveCardPool(
  format: DeckFormat,
  trilogyCardPool: TrilogyCardPool = "premier"
): "premier" | "eternal" | "twinSuns" {
  if (format === "trilogy") return trilogyCardPool;
  if (format === "twin-suns") return "twinSuns";
  return format;
}

export function buildCardLegalityIndex(cards: CardInfo[]): CardLegalityIndex {
  const premierSets = new Set<string>(OFFICIAL_PREMIER_SET_CODES);
  const premierCardKeys = new Set<string>();
  for (const card of cards) {
    if (premierSets.has(card.setCode)) premierCardKeys.add(card.cardKey ?? card.cardId);
  }

  const suspendedNames = new Map<string, string>();
  const toSuspendedSet = (
    entries: readonly { readonly cardKey: string; readonly name: string }[]
  ) => {
    const result = new Set<string>();
    for (const entry of entries) {
      result.add(entry.cardKey);
      suspendedNames.set(entry.cardKey, entry.name);
    }
    return result;
  };

  return {
    premierCardKeys,
    suspendedCardKeys: {
      premier: toSuspendedSet(OFFICIAL_SUSPENDED_CARDS.premier),
      eternal: toSuspendedSet(OFFICIAL_SUSPENDED_CARDS.eternal),
      twinSuns: toSuspendedSet(OFFICIAL_SUSPENDED_CARDS.twinSuns)
    },
    suspendedNames
  };
}

export function getCardLegality(
  card: CardInfo,
  format: DeckFormat,
  index: CardLegalityIndex,
  trilogyCardPool: TrilogyCardPool = "premier"
): CardLegality {
  const pool = getEffectiveCardPool(format, trilogyCardPool);
  const cardKey = card.cardKey ?? card.cardId;
  const suspended = index.suspendedCardKeys[pool];
  if (suspended.has(cardKey)) {
    return {
      legal: false,
      reason: `${index.suspendedNames.get(cardKey) ?? card.localizedName ?? card.name ?? card.cardId} está inhabilitada en ${pool === "twinSuns" ? "Twin Suns" : DECK_FORMAT_LABELS[pool]}.`
    };
  }

  if (pool !== "premier") return { legal: true };
  if (index.premierCardKeys.has(cardKey)) return { legal: true };

  if ((OFFICIAL_ROTATED_CORE_SET_CODES as readonly string[]).includes(card.setCode)) {
    return {
      legal: false,
      reason: `${card.setCode} ha rotado de Premier y esta carta no tiene una reimpresión actualmente legal.`
    };
  }
  if ((OFFICIAL_NON_PREMIER_SPECIAL_SET_CODES as readonly string[]).includes(card.setCode)) {
    return {
      legal: false,
      reason:
        card.setCode === "TS26"
          ? "Esta carta de TS26 es exclusiva de formatos sin rotación y no es legal en Premier."
          : `${card.setCode} no forma parte de la reserva de cartas de Premier.`
    };
  }
  if ((OFFICIAL_UNREVIEWED_SPECIAL_SET_CODES as readonly string[]).includes(card.setCode)) {
    return {
      legal: false,
      reason: `La legalidad Premier de ${card.setCode} está pendiente de revisión oficial.`
    };
  }

  return {
    legal: false,
    reason:
      "Esta identidad de carta no tiene ninguna impresión legal en la rotación Premier vigente."
  };
}

export function validateDeckCardLegality(
  deck: NormalizedDeck,
  cardsById: Map<string, CardInfo>,
  index: CardLegalityIndex
): DeckCardLegality {
  const format = getDeckFormat(deck);
  const trilogyCardPool = getTrilogyCardPool(deck);
  const reasons: string[] = [];
  const illegalCardIds: string[] = [];
  const checkedCardIds = new Set<string>();

  for (const required of deck.allRequiredCards) {
    if (checkedCardIds.has(required.cardId)) continue;
    checkedCardIds.add(required.cardId);
    const card = cardsById.get(required.cardId);
    if (!card) {
      illegalCardIds.push(required.cardId);
      reasons.push(`${required.cardId} no aparece en el catálogo oficial actualizado.`);
      continue;
    }
    const legality = getCardLegality(card, format, index, trilogyCardPool);
    if (legality.legal) continue;
    illegalCardIds.push(required.cardId);
    reasons.push(`${card.localizedName ?? card.name ?? card.cardId}: ${legality.reason}`);
  }

  return { legal: reasons.length === 0, reasons, illegalCardIds };
}

function textDeckSizeModifier(card: CardInfo | undefined): number {
  if (!card) return 0;
  const text = card.text ?? "";
  const increased = /minimum deck size is increased by (\d+) cards?/i.exec(text);
  if (increased) return Number(increased[1]);
  const decreased = /minimum deck size is decreased by (\d+) cards?/i.exec(text);
  return decreased ? -Number(decreased[1]) : 0;
}

export function getDeckSizeModifier(base: CardInfo | undefined): number {
  if (!base) return 0;
  const key = base.cardKey as keyof typeof OFFICIAL_DECK_SIZE_MODIFIERS | undefined;
  return (key ? OFFICIAL_DECK_SIZE_MODIFIERS[key] : undefined) ?? textDeckSizeModifier(base);
}

export function getMinimumMainDeckSize(format: DeckFormat, base?: CardInfo): number {
  const normalMinimum = format === "twin-suns" ? 80 : 50;
  return normalMinimum + getDeckSizeModifier(base);
}

export function getSideboardLimit(format: DeckFormat): number {
  return format === "premier" || format === "eternal" ? 10 : 0;
}

export function getCardCopyLimit(format: DeckFormat, card: CardInfo | undefined): number {
  if (!card) return format === "twin-suns" ? 1 : 3;
  const key = card.cardKey as keyof typeof OFFICIAL_CARD_COPY_LIMITS | undefined;
  const officialException = key ? OFFICIAL_CARD_COPY_LIMITS[key] : undefined;
  if (officialException !== undefined) return officialException;
  if (format === "twin-suns") return 1;
  return card.deckLimit ?? 3;
}

export function formatRulesUpdatedAt(): string {
  return OFFICIAL_FORMAT_RULES_LAST_UPDATED;
}

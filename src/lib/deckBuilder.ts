import {
  buildCardLegalityIndex,
  getCardCopyLimit,
  getCardLegality,
  getDeckFormat,
  getMetadataFormatName,
  getMinimumMainDeckSize,
  getSideboardLimit,
  getTrilogyCardPool,
  type CardLegalityIndex
} from "@/lib/deckFormats";
import type { CardInfo } from "@/types/card";
import type { DeckFormat, NormalizedDeck, NormalizedDeckPart, TrilogyCardPool } from "@/types/deck";

export interface DeckBuilderSubdeckComposition {
  name?: string;
  leaderId?: string;
  leaderIds?: string[];
  baseId?: string;
  mainCounts: Record<string, number>;
  sideboardCounts: Record<string, number>;
}

export interface DeckBuilderComposition extends DeckBuilderSubdeckComposition {
  name: string;
  format?: DeckFormat;
  trilogyCardPool?: TrilogyCardPool;
  trilogyDecks?: DeckBuilderSubdeckComposition[];
}

export interface DeckValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  mainCount: number;
  sideboardCount: number;
  minimumMainCount: number;
  sideboardLimit: number;
  aspectPenaltyCopies: number;
  illegalCardIds: string[];
}

export type PremierDeckValidation = DeckValidation;

function totalCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((total, count) => total + Math.max(count, 0), 0);
}

function getCopyLimitKey(card: CardInfo | undefined, cardId: string): string {
  return card?.cardKey ?? card?.name?.trim().toLocaleLowerCase("en") ?? cardId;
}

function countAspects(aspects: string[] | undefined): Map<string, number> {
  const counts = new Map<string, number>();
  for (const aspect of aspects ?? []) counts.set(aspect, (counts.get(aspect) ?? 0) + 1);
  return counts;
}

/**
 * Twin Suns comprueba Heroísmo/Villanía únicamente en las caras que empiezan
 * boca arriba. El catálogo aplana las dos caras de Chancellor Palpatine en una
 * sola lista de aspectos, aunque su cara inicial es siempre Heroísmo.
 *
 * Se usa cardKey para que la regla también cubra futuras reimpresiones de la
 * misma carta; el cardId queda como respaldo para catálogos antiguos.
 */
const TWIN_SUNS_STARTING_ALIGNMENT_BY_CARD_KEY: Readonly<Record<string, "Heroism" | "Villainy">> = {
  "0026166404": "Heroism"
};

function getTwinSunsStartingAlignment(card: CardInfo | undefined): "Heroism" | "Villainy" | undefined {
  if (!card) return undefined;

  const specialStartingAlignment =
    (card.cardKey ? TWIN_SUNS_STARTING_ALIGNMENT_BY_CARD_KEY[card.cardKey] : undefined) ??
    (card.cardId === "TWI_017" ? "Heroism" : undefined);
  if (specialStartingAlignment) return specialStartingAlignment;

  if (card.aspects?.includes("Heroism")) return "Heroism";
  if (card.aspects?.includes("Villainy")) return "Villainy";
  return undefined;
}

function missingAspectIcons(card: CardInfo, available: Map<string, number>): number {
  const needed = countAspects(card.aspects);
  let missing = 0;
  for (const [aspect, count] of needed) {
    missing += Math.max(count - (available.get(aspect) ?? 0), 0);
  }
  return missing;
}

function compositionLeaderIds(composition: DeckBuilderSubdeckComposition): string[] {
  if (composition.leaderIds) return composition.leaderIds.filter(Boolean);
  return composition.leaderId ? [composition.leaderId] : [];
}

function displayName(card: CardInfo | undefined, cardId: string): string {
  return card?.localizedName ?? card?.name ?? cardId;
}

function validateCardTypes(
  counts: Record<string, number>,
  zone: "mazo" | "banquillo",
  cardsById: Map<string, CardInfo>,
  errors: string[],
  prefix: string
): void {
  for (const [cardId, count] of Object.entries(counts)) {
    if (count <= 0) continue;
    const card = cardsById.get(cardId);
    if (!card) {
      errors.push(`${prefix}${cardId} no aparece en el catálogo oficial.`);
    } else if (card.type && !["Unit", "Event", "Upgrade"].includes(card.type)) {
      errors.push(`${prefix}${displayName(card, cardId)} no puede ir en el ${zone}.`);
    }
  }
}

interface SingleValidationOptions {
  format: DeckFormat;
  trilogyCardPool: TrilogyCardPool;
  prefix?: string;
  validateCopyLimits?: boolean;
}

function validateSingleDeck(
  composition: DeckBuilderSubdeckComposition,
  cardsById: Map<string, CardInfo>,
  legalityIndex: CardLegalityIndex,
  options: SingleValidationOptions
): DeckValidation {
  const prefix = options.prefix ? `${options.prefix}: ` : "";
  const errors: string[] = [];
  const warnings: string[] = [];
  const illegalCardIds: string[] = [];
  const leaders = compositionLeaderIds(composition);
  const expectedLeaders = options.format === "twin-suns" ? 2 : 1;
  const mainCount = totalCounts(composition.mainCounts);
  const sideboardCount = totalCounts(composition.sideboardCounts);
  const base = composition.baseId ? cardsById.get(composition.baseId) : undefined;
  const minimumMainCount = getMinimumMainDeckSize(options.format, base);
  const sideboardLimit = getSideboardLimit(options.format);

  if (leaders.length !== expectedLeaders) {
    errors.push(
      `${prefix}selecciona exactamente ${expectedLeaders} ${expectedLeaders === 1 ? "líder" : "líderes diferentes"}.`
    );
  }
  if (new Set(leaders).size !== leaders.length) {
    errors.push(`${prefix}los líderes deben ser diferentes.`);
  }
  if (!composition.baseId) errors.push(`${prefix}selecciona exactamente una base.`);
  if (mainCount < minimumMainCount) {
    errors.push(
      `${prefix}el mazo principal necesita ${minimumMainCount - mainCount} carta(s) más.`
    );
  }
  if (sideboardCount > sideboardLimit) {
    errors.push(
      sideboardLimit === 0
        ? `${prefix}este formato no admite banquillo.`
        : `${prefix}el banquillo supera el máximo de ${sideboardLimit} cartas por ${sideboardCount - sideboardLimit}.`
    );
  }

  if (options.format === "twin-suns") {
    const startingAlignments = leaders.map((leaderId) =>
      getTwinSunsStartingAlignment(cardsById.get(leaderId))
    );
    if (startingAlignments.includes("Heroism") && startingAlignments.includes("Villainy")) {
      errors.push(`${prefix}los dos líderes no pueden combinar Heroísmo y Villanía.`);
    }
  }

  validateCardTypes(composition.mainCounts, "mazo", cardsById, errors, prefix);
  validateCardTypes(composition.sideboardCounts, "banquillo", cardsById, errors, prefix);

  const selectedCardIds = [
    ...leaders,
    ...(composition.baseId ? [composition.baseId] : []),
    ...Object.entries(composition.mainCounts)
      .filter(([, count]) => count > 0)
      .map(([cardId]) => cardId),
    ...Object.entries(composition.sideboardCounts)
      .filter(([, count]) => count > 0)
      .map(([cardId]) => cardId)
  ];
  for (const cardId of new Set(selectedCardIds)) {
    const card = cardsById.get(cardId);
    if (!card) continue;
    const legality = getCardLegality(card, options.format, legalityIndex, options.trilogyCardPool);
    if (!legality.legal) {
      illegalCardIds.push(cardId);
      errors.push(`${prefix}${displayName(card, cardId)}: ${legality.reason}`);
    }
  }

  if (options.validateCopyLimits !== false) {
    const copiesByKey = new Map<string, { count: number; card?: CardInfo; cardId: string }>();
    for (const counts of [composition.mainCounts, composition.sideboardCounts]) {
      for (const [cardId, count] of Object.entries(counts)) {
        if (count <= 0) continue;
        const card = cardsById.get(cardId);
        const key = getCopyLimitKey(card, cardId);
        const current = copiesByKey.get(key);
        copiesByKey.set(key, {
          count: (current?.count ?? 0) + count,
          card: current?.card ?? card,
          cardId: current?.cardId ?? cardId
        });
      }
    }
    for (const entry of copiesByKey.values()) {
      const limit = getCardCopyLimit(options.format, entry.card);
      if (entry.count > limit) {
        errors.push(
          `${prefix}${displayName(entry.card, entry.cardId)} tiene ${entry.count} copias${sideboardLimit > 0 ? " entre mazo y banquillo" : ""}; el máximo es ${limit}.`
        );
      }
    }
  }

  const availableAspects = countAspects([
    ...leaders.flatMap((leaderId) => cardsById.get(leaderId)?.aspects ?? []),
    ...(base?.aspects ?? [])
  ]);
  let aspectPenaltyCopies = 0;
  let aspectPenaltyIcons = 0;
  for (const counts of [composition.mainCounts, composition.sideboardCounts]) {
    for (const [cardId, count] of Object.entries(counts)) {
      if (count <= 0) continue;
      const card = cardsById.get(cardId);
      if (!card) continue;
      const missingIcons = missingAspectIcons(card, availableAspects);
      if (missingIcons > 0) {
        aspectPenaltyCopies += count;
        aspectPenaltyIcons += missingIcons * count;
      }
    }
  }
  if (aspectPenaltyCopies > 0) {
    warnings.push(
      `${prefix}${aspectPenaltyCopies} copia(s) tienen penalización de aspecto; faltan ${aspectPenaltyIcons} icono(s), con +2 recursos por cada icono ausente al jugar la carta.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    mainCount,
    sideboardCount,
    minimumMainCount,
    sideboardLimit,
    aspectPenaltyCopies,
    illegalCardIds
  };
}

function uniqueMessages(messages: string[]): string[] {
  return [...new Set(messages)];
}

export function validateDeck(
  composition: DeckBuilderComposition,
  cardsById: Map<string, CardInfo>,
  legalityIndex: CardLegalityIndex = buildCardLegalityIndex([...cardsById.values()])
): DeckValidation {
  const format = composition.format ?? "premier";
  const trilogyCardPool = composition.trilogyCardPool ?? "premier";
  if (format !== "trilogy") {
    const result = validateSingleDeck(composition, cardsById, legalityIndex, {
      format,
      trilogyCardPool
    });
    if (!composition.name.trim()) result.errors.unshift("Escribe un nombre para el mazo.");
    result.valid = result.errors.length === 0;
    return result;
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const illegalCardIds: string[] = [];
  if (!composition.name.trim()) errors.push("Escribe un nombre para el conjunto Trilogy.");
  if ((composition.trilogyDecks?.length ?? 0) !== 3) {
    errors.push("Trilogy necesita exactamente tres mazos.");
  }

  const results = (composition.trilogyDecks ?? []).map((deck, index) =>
    validateSingleDeck(deck, cardsById, legalityIndex, {
      format: "trilogy",
      trilogyCardPool,
      prefix: `Mazo ${index + 1}`,
      validateCopyLimits: false
    })
  );
  for (const result of results) {
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    illegalCardIds.push(...result.illegalCardIds);
  }

  const leadersAndBases = new Map<string, { count: number; card?: CardInfo; cardId: string }>();
  const regularCopies = new Map<string, { count: number; card?: CardInfo; cardId: string }>();
  for (const deck of composition.trilogyDecks ?? []) {
    for (const cardId of [...compositionLeaderIds(deck), ...(deck.baseId ? [deck.baseId] : [])]) {
      const card = cardsById.get(cardId);
      const key = getCopyLimitKey(card, cardId);
      const current = leadersAndBases.get(key);
      leadersAndBases.set(key, {
        count: (current?.count ?? 0) + 1,
        card: current?.card ?? card,
        cardId: current?.cardId ?? cardId
      });
    }
    for (const [cardId, count] of Object.entries(deck.mainCounts)) {
      if (count <= 0) continue;
      const card = cardsById.get(cardId);
      const key = getCopyLimitKey(card, cardId);
      const current = regularCopies.get(key);
      regularCopies.set(key, {
        count: (current?.count ?? 0) + count,
        card: current?.card ?? card,
        cardId: current?.cardId ?? cardId
      });
    }
  }
  for (const entry of leadersAndBases.values()) {
    if (entry.count > 1) {
      errors.push(
        `${displayName(entry.card, entry.cardId)} aparece ${entry.count} veces como líder o base; Trilogy solo permite una copia entre los tres mazos.`
      );
    }
  }
  for (const entry of regularCopies.values()) {
    const limit = getCardCopyLimit("trilogy", entry.card);
    if (entry.count > limit) {
      errors.push(
        `${displayName(entry.card, entry.cardId)} suma ${entry.count} copias entre los tres mazos; el máximo compartido es ${limit}.`
      );
    }
  }

  const mainCount = results.reduce((total, result) => total + result.mainCount, 0);
  return {
    valid: errors.length === 0,
    errors: uniqueMessages(errors),
    warnings: uniqueMessages(warnings),
    mainCount,
    sideboardCount: 0,
    minimumMainCount: results.reduce((total, result) => total + result.minimumMainCount, 0),
    sideboardLimit: 0,
    aspectPenaltyCopies: results.reduce((total, result) => total + result.aspectPenaltyCopies, 0),
    illegalCardIds: [...new Set(illegalCardIds)]
  };
}

/** Compatibilidad con los consumidores y pruebas anteriores. */
export function validatePremierDeck(
  composition: DeckBuilderComposition,
  cardsById: Map<string, CardInfo>
): PremierDeckValidation {
  return validateDeck({ ...composition, format: "premier" }, cardsById);
}

function entries(counts: Record<string, number>) {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, count]) => ({ id, count }));
}

function buildDeckPartJson(
  composition: DeckBuilderSubdeckComposition,
  format: DeckFormat,
  fallbackName?: string
) {
  const leaderIds = compositionLeaderIds(composition);
  const part: Record<string, unknown> = {};
  if (fallbackName) part.name = composition.name?.trim() || fallbackName;
  if (format === "twin-suns") {
    part.leaders = leaderIds.map((id) => ({ id, count: 1 }));
  } else if (leaderIds[0]) {
    part.leader = { id: leaderIds[0], count: 1 };
  }
  if (composition.baseId) part.base = { id: composition.baseId, count: 1 };
  part.deck = entries(composition.mainCounts);
  if (getSideboardLimit(format) > 0) part.sideboard = entries(composition.sideboardCounts);
  return part;
}

export function buildDeckJson(composition: DeckBuilderComposition): unknown {
  const format = composition.format ?? "premier";
  const metadata: Record<string, string> = {
    name: composition.name.trim(),
    format: getMetadataFormatName(format),
    source: "SWU Deck Vault"
  };
  if (format === "trilogy") {
    metadata.cardPool = getMetadataFormatName(composition.trilogyCardPool ?? "premier");
    return {
      metadata,
      trilogyDecks: (composition.trilogyDecks ?? []).map((deck, index) =>
        buildDeckPartJson(deck, "trilogy", `Mazo ${index + 1}`)
      )
    };
  }
  return { metadata, ...buildDeckPartJson(composition, format) };
}

function countsFromPart(
  part: NormalizedDeckPart,
  zone: "main" | "sideboard"
): Record<string, number> {
  const cards = zone === "main" ? part.mainDeck : part.sideboard;
  return Object.fromEntries(
    cards
      .map((card) => [card.cardId, card.zoneCounts[zone] ?? 0] as const)
      .filter(([, count]) => count > 0)
  );
}

function compositionFromPart(part: NormalizedDeckPart): DeckBuilderSubdeckComposition {
  return {
    name: part.name,
    leaderIds: (part.leaders?.length ? part.leaders : part.leader ? [part.leader] : []).map(
      (leader) => leader.cardId
    ),
    baseId: part.base?.cardId,
    mainCounts: countsFromPart(part, "main"),
    sideboardCounts: countsFromPart(part, "sideboard")
  };
}

export function compositionFromNormalizedDeck(deck: NormalizedDeck): DeckBuilderComposition {
  const format = getDeckFormat(deck);
  const part = compositionFromPart(deck);
  return {
    ...part,
    name: deck.name,
    format,
    trilogyCardPool: getTrilogyCardPool(deck),
    trilogyDecks:
      format === "trilogy" ? (deck.trilogyDecks ?? []).map(compositionFromPart) : undefined
  };
}

export function validateNormalizedDeck(
  deck: NormalizedDeck,
  cardsById: Map<string, CardInfo>,
  legalityIndex: CardLegalityIndex = buildCardLegalityIndex([...cardsById.values()])
): DeckValidation {
  return validateDeck(compositionFromNormalizedDeck(deck), cardsById, legalityIndex);
}

export function isPremierDeckStructurallyReady(deck: NormalizedDeck): boolean {
  const mainCount = deck.mainDeck.reduce((total, card) => total + (card.zoneCounts.main ?? 0), 0);
  const sideboardCount = deck.sideboard.reduce(
    (total, card) => total + (card.zoneCounts.sideboard ?? 0),
    0
  );
  return Boolean(deck.leader && deck.base && mainCount >= 50 && sideboardCount <= 10);
}

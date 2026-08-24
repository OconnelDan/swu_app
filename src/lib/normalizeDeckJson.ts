import { parseDeckFormat, parseTrilogyCardPool } from "@/lib/deckFormats";
import { normalizeCardIdString } from "@/lib/normalizeCardId";
import { rawDeckJsonSchema, type CardEntry, type RawDeckPart } from "@/schemas/deckSchema";
import type {
  DeckZone,
  NormalizedDeck,
  NormalizedDeckCard,
  NormalizedDeckPart
} from "@/types/deck";

interface Accumulator {
  setCode: string;
  cardNumber: string;
  requiredCount: number;
  zones: Set<DeckZone>;
  zoneCounts: Partial<Record<DeckZone, number>>;
}

function addToAccumulator(
  map: Map<string, Accumulator>,
  rawId: string,
  count: number,
  zone: DeckZone
): void {
  if (!rawId) throw new Error("Se encontró una carta sin 'id' en el mazo.");
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error(`La carta "${rawId}" tiene un 'count' inválido (${count}).`);
  }

  const cardId = normalizeCardIdString(rawId);
  const [setCode, cardNumber] = cardId.split("_");
  const existing = map.get(cardId);
  if (existing) {
    existing.requiredCount += count;
    existing.zones.add(zone);
    existing.zoneCounts[zone] = (existing.zoneCounts[zone] ?? 0) + count;
    return;
  }

  map.set(cardId, {
    setCode,
    cardNumber,
    requiredCount: count,
    zones: new Set([zone]),
    zoneCounts: { [zone]: count }
  });
}

function entriesFromGrouped(grouped: Record<string, CardEntry[]> | undefined): CardEntry[] {
  return grouped ? Object.values(grouped).flat() : [];
}

function resolveRef(
  ref: CardEntry | string | undefined,
  fallbackId?: string
): CardEntry | undefined {
  if (ref === undefined) return fallbackId ? { id: fallbackId, count: 1 } : undefined;
  return typeof ref === "string" ? { id: ref, count: 1 } : ref;
}

function normalizeReference(ref: CardEntry, zone: "leader" | "base"): NormalizedDeckCard {
  const cardId = normalizeCardIdString(ref.id);
  const [setCode, cardNumber] = cardId.split("_");
  return {
    cardId,
    setCode,
    cardNumber,
    requiredCount: ref.count,
    zones: [zone],
    zoneCounts: { [zone]: ref.count }
  };
}

function buildCard(cardId: string, accumulator: Accumulator): NormalizedDeckCard {
  return {
    cardId,
    setCode: accumulator.setCode,
    cardNumber: accumulator.cardNumber,
    requiredCount: accumulator.requiredCount,
    zones: [...accumulator.zones],
    zoneCounts: accumulator.zoneCounts
  };
}

function mergeRequiredCards(cards: NormalizedDeckCard[]): NormalizedDeckCard[] {
  const merged = new Map<string, Accumulator>();
  for (const card of cards) {
    for (const zone of card.zones) {
      const count = card.zoneCounts[zone] ?? 0;
      if (count > 0) addToAccumulator(merged, card.cardId, count, zone);
    }
  }
  return [...merged.entries()].map(([cardId, accumulator]) => buildCard(cardId, accumulator));
}

function normalizeDeckPart(raw: RawDeckPart, fallbackName: string): NormalizedDeckPart {
  const mainEntries: CardEntry[] = [
    ...(raw.deck ?? []),
    ...(raw.mainDeck ?? []),
    ...(raw.mainboard ?? []),
    ...(raw.cards ?? []),
    ...entriesFromGrouped(raw.deck_grouped)
  ];
  const sideboardEntries: CardEntry[] = [
    ...(raw.sideboard ?? []),
    ...entriesFromGrouped(raw.sideboard_grouped)
  ];
  const leaderRefs = (raw.leaders ?? [])
    .map((reference) => resolveRef(reference))
    .filter((reference): reference is CardEntry => Boolean(reference));
  if (leaderRefs.length === 0) {
    const leader = resolveRef(raw.leader, raw.leader_id);
    if (leader) leaderRefs.push(leader);
  }
  const baseRef = resolveRef(raw.base, raw.base_id);

  const accumulator = new Map<string, Accumulator>();
  for (const entry of mainEntries) addToAccumulator(accumulator, entry.id, entry.count, "main");
  for (const entry of sideboardEntries) {
    addToAccumulator(accumulator, entry.id, entry.count, "sideboard");
  }

  const cards = [...accumulator.entries()].map(([cardId, value]) => buildCard(cardId, value));
  const leaders = leaderRefs.map((reference) => normalizeReference(reference, "leader"));
  const base = baseRef ? normalizeReference(baseRef, "base") : undefined;
  const allRequiredCards = mergeRequiredCards([...leaders, ...(base ? [base] : []), ...cards]);

  return {
    name: raw.name?.trim() || fallbackName,
    leader: leaders[0],
    leaders,
    base,
    mainDeck: cards.filter((card) => card.zones.includes("main")),
    sideboard: cards.filter((card) => card.zones.includes("sideboard")),
    allRequiredCards
  };
}

/**
 * Transforma JSON de SWUDB, del importador histórico o del constructor propio
 * al modelo común. Los JSON antiguos no declaraban formato y se migran de
 * forma lógica a Premier sin modificar sus datos guardados.
 */
export function normalizeDeckJson(input: unknown): NormalizedDeck {
  const parsed = rawDeckJsonSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new Error(
      `El mazo no tiene un formato reconocible: ${firstIssue?.message ?? "estructura inválida"}`
    );
  }
  const raw = parsed.data;
  const name = raw.metadata?.name ?? raw.name ?? "Mazo sin nombre";
  const author = raw.metadata?.author ?? raw.author;
  const format = parseDeckFormat(raw.metadata?.format ?? raw.format);
  const trilogyCardPool = parseTrilogyCardPool(
    raw.metadata?.cardPool ?? raw.metadata?.trilogyCardPool ?? raw.trilogyCardPool
  );

  if (format === "trilogy") {
    const rawDecks = raw.trilogyDecks ?? raw.decks ?? [];
    if (rawDecks.length === 0) {
      throw new Error("El JSON de Trilogy no contiene sus tres mazos.");
    }
    const trilogyDecks = rawDecks.map((deck, index) =>
      normalizeDeckPart(deck, `Mazo ${index + 1}`)
    );
    const allRequiredCards = mergeRequiredCards(
      trilogyDecks.flatMap((deck) => deck.allRequiredCards)
    );
    const leaders = trilogyDecks.flatMap((deck) => deck.leaders ?? []);
    const bases = trilogyDecks.flatMap((deck) => (deck.base ? [deck.base] : []));

    return {
      name,
      author,
      format,
      trilogyCardPool,
      trilogyDecks,
      leader: leaders[0],
      leaders,
      base: bases[0],
      mainDeck: allRequiredCards.filter((card) => card.zones.includes("main")),
      sideboard: [],
      allRequiredCards,
      originalJson: input
    };
  }

  const part = normalizeDeckPart(raw, name);
  if (part.allRequiredCards.length === 0) {
    throw new Error(
      "No se ha reconocido ninguna carta en el JSON (deck, mainDeck, cards, deck_grouped...)."
    );
  }

  return {
    ...part,
    name,
    author,
    format,
    originalJson: input
  };
}

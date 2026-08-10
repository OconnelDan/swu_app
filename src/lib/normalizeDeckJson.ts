import { normalizeCardIdString } from "./normalizeCardId";
import { rawDeckJsonSchema, type CardEntry } from "@/schemas/deckSchema";
import type { DeckZone, NormalizedDeck, NormalizedDeckCard } from "@/types/deck";

/** Acumulador intermedio: cardId -> datos agregados antes de construir NormalizedDeckCard */
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
  if (!rawId) {
    throw new Error("Se encontró una carta sin 'id' en el mazo.");
  }
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
  } else {
    map.set(cardId, {
      setCode,
      cardNumber,
      requiredCount: count,
      zones: new Set([zone]),
      zoneCounts: { [zone]: count }
    });
  }
}

function entriesFromGrouped(grouped: Record<string, CardEntry[]> | undefined): CardEntry[] {
  if (!grouped) return [];
  return Object.values(grouped).flat();
}

function resolveLeaderOrBase(
  ref: CardEntry | string | undefined,
  fallbackId: string | undefined
): { id: string; count: number } | undefined {
  if (ref === undefined) {
    if (fallbackId) return { id: fallbackId, count: 1 };
    return undefined;
  }
  if (typeof ref === "string") return { id: ref, count: 1 };
  return { id: ref.id, count: ref.count };
}

/**
 * Transforma cualquiera de los formatos de mazo admitidos (ver especificación
 * sección 5) al modelo interno común NormalizedDeck.
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

  const leaderRef = resolveLeaderOrBase(raw.leader, raw.leader_id);
  const baseRef = resolveLeaderOrBase(raw.base, raw.base_id);

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

  if (
    mainEntries.length === 0 &&
    sideboardEntries.length === 0 &&
    !leaderRef &&
    !baseRef
  ) {
    throw new Error(
      "No se ha reconocido ninguna carta en el JSON (deck, mainDeck, cards, deck_grouped...)."
    );
  }

  const accumulator = new Map<string, Accumulator>();
  for (const entry of mainEntries) addToAccumulator(accumulator, entry.id, entry.count, "main");
  for (const entry of sideboardEntries)
    addToAccumulator(accumulator, entry.id, entry.count, "sideboard");

  const buildCard = (cardId: string, acc: Accumulator): NormalizedDeckCard => ({
    cardId,
    setCode: acc.setCode,
    cardNumber: acc.cardNumber,
    requiredCount: acc.requiredCount,
    zones: Array.from(acc.zones),
    zoneCounts: acc.zoneCounts
  });

  const mainDeck: NormalizedDeckCard[] = [];
  const sideboard: NormalizedDeckCard[] = [];
  for (const [cardId, acc] of accumulator) {
    const card = buildCard(cardId, acc);
    if (acc.zones.has("main")) mainDeck.push(card);
    if (acc.zones.has("sideboard") && !acc.zones.has("main")) sideboard.push(card);
    else if (acc.zones.has("sideboard") && acc.zones.has("main")) {
      // Ya está en mainDeck con el total sumado; sideboard también lo listamos
      // para reflejar que aparece en ambas zonas (sección 7).
      sideboard.push(card);
    }
  }

  let leader: NormalizedDeckCard | undefined;
  if (leaderRef) {
    const cardId = normalizeCardIdString(leaderRef.id);
    const [setCode, cardNumber] = cardId.split("_");
    leader = {
      cardId,
      setCode,
      cardNumber,
      requiredCount: leaderRef.count,
      zones: ["leader"],
      zoneCounts: { leader: leaderRef.count }
    };
  }

  let base: NormalizedDeckCard | undefined;
  if (baseRef) {
    const cardId = normalizeCardIdString(baseRef.id);
    const [setCode, cardNumber] = cardId.split("_");
    base = {
      cardId,
      setCode,
      cardNumber,
      requiredCount: baseRef.count,
      zones: ["base"],
      zoneCounts: { base: baseRef.count }
    };
  }

  const allRequiredCards: NormalizedDeckCard[] = [
    ...(leader ? [leader] : []),
    ...(base ? [base] : []),
    ...Array.from(accumulator.entries()).map(([cardId, acc]) => buildCard(cardId, acc))
  ];

  return {
    name,
    author,
    leader,
    base,
    mainDeck,
    sideboard,
    allRequiredCards,
    originalJson: input
  };
}

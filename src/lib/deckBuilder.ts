import type { CardInfo } from "@/types/card";
import type { NormalizedDeck } from "@/types/deck";

export interface DeckBuilderComposition {
  name: string;
  leaderId?: string;
  baseId?: string;
  mainCounts: Record<string, number>;
  sideboardCounts: Record<string, number>;
}

export interface PremierDeckValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  mainCount: number;
  sideboardCount: number;
  aspectPenaltyCopies: number;
}

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

function missingAspectIcons(card: CardInfo, available: Map<string, number>): number {
  const needed = countAspects(card.aspects);
  let missing = 0;
  for (const [aspect, count] of needed) {
    missing += Math.max(count - (available.get(aspect) ?? 0), 0);
  }
  return missing;
}

export function validatePremierDeck(
  composition: DeckBuilderComposition,
  cardsById: Map<string, CardInfo>
): PremierDeckValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const mainCount = totalCounts(composition.mainCounts);
  const sideboardCount = totalCounts(composition.sideboardCounts);

  if (!composition.name.trim()) errors.push("Escribe un nombre para el mazo.");
  if (!composition.leaderId) errors.push("Selecciona exactamente un líder.");
  if (!composition.baseId) errors.push("Selecciona exactamente una base.");
  if (mainCount < 50) errors.push(`El mazo principal necesita ${50 - mainCount} carta(s) más.`);
  if (sideboardCount > 10) {
    errors.push(`El banquillo supera el máximo de 10 cartas por ${sideboardCount - 10}.`);
  }

  const copiesByKey = new Map<string, { count: number; card?: CardInfo; cardId: string }>();
  for (const [zone, counts] of [
    ["mazo", composition.mainCounts],
    ["banquillo", composition.sideboardCounts]
  ] as const) {
    for (const [cardId, count] of Object.entries(counts)) {
      if (count <= 0) continue;
      const card = cardsById.get(cardId);
      if (card?.type && !["Unit", "Event", "Upgrade"].includes(card.type)) {
        errors.push(`${card.localizedName ?? card.name ?? cardId} no puede ir en el ${zone}.`);
      }
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
    const limit = entry.card?.deckLimit ?? 3;
    if (entry.count <= limit) continue;
    errors.push(
      `${entry.card?.localizedName ?? entry.card?.name ?? entry.cardId} tiene ${entry.count} copias entre mazo y banquillo; el máximo es ${limit}.`
    );
  }

  const leader = composition.leaderId ? cardsById.get(composition.leaderId) : undefined;
  const base = composition.baseId ? cardsById.get(composition.baseId) : undefined;
  const availableAspects = countAspects([...(leader?.aspects ?? []), ...(base?.aspects ?? [])]);
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
      `${aspectPenaltyCopies} copia(s) tienen penalización de aspecto; en total faltan ${aspectPenaltyIcons} icono(s), con +2 recursos por cada icono ausente al jugar la carta.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    mainCount,
    sideboardCount,
    aspectPenaltyCopies
  };
}

export function buildDeckJson(composition: DeckBuilderComposition): unknown {
  const entries = (counts: Record<string, number>) =>
    Object.entries(counts)
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, count]) => ({ id, count }));

  return {
    metadata: {
      name: composition.name.trim(),
      format: "Premier",
      source: "SWU Deck Vault"
    },
    leader: composition.leaderId ? { id: composition.leaderId, count: 1 } : undefined,
    base: composition.baseId ? { id: composition.baseId, count: 1 } : undefined,
    deck: entries(composition.mainCounts),
    sideboard: entries(composition.sideboardCounts)
  };
}

export function isPremierDeckStructurallyReady(deck: NormalizedDeck): boolean {
  const mainCount = deck.mainDeck.reduce((total, card) => total + (card.zoneCounts.main ?? 0), 0);
  const sideboardCount = deck.sideboard.reduce(
    (total, card) => total + (card.zoneCounts.sideboard ?? 0),
    0
  );
  return Boolean(deck.leader && deck.base && mainCount >= 50 && sideboardCount <= 10);
}

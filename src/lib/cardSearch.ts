import { parseCardId } from "./normalizeCardId";

export interface SearchableCard {
  cardId: string;
  name?: string;
}

/** Unifica mayúsculas, minúsculas y acentos para búsquedas por nombre. */
function foldSearchText(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
}

function compactCardCode(value: string): string {
  return foldSearchText(value).replace(/[^a-z0-9]/g, "");
}

/**
 * Genera formas equivalentes de un código. Por ejemplo, ASH_001 también se
 * puede encontrar escribiendo "ASH 001", "ASH-001", "ASH001" o "ASH_1".
 */
function buildCardIdAliases(cardId: string): Set<string> {
  const aliases = new Set<string>();
  const foldedId = foldSearchText(cardId);

  aliases.add(foldedId);
  aliases.add(compactCardCode(cardId));

  try {
    const { setCode, cardNumber } = parseCardId(cardId);
    const set = setCode.toLowerCase();
    const number = cardNumber.toLowerCase();
    const tokenMatch = /^([a-z]+)0*(\d+)$/.exec(number);

    const shortNumber = /^\d+$/.test(number)
      ? String(Number(number))
      : tokenMatch
        ? `${tokenMatch[1]}${Number(tokenMatch[2])}`
        : number;

    for (const separator of ["_", "-", " ", ""]) {
      aliases.add(`${set}${separator}${number}`);
      aliases.add(`${set}${separator}${shortNumber}`);
    }
  } catch {
    // Un ID desconocido continúa siendo buscable por su texto literal.
    // La validación del ID no debe poder bloquear la pantalla.
  }

  return aliases;
}

function getMatchScore(card: SearchableCard, query: string): number | undefined {
  const foldedQuery = foldSearchText(query);

  if (!foldedQuery) return undefined;

  const compactQuery = compactCardCode(query);
  const aliases = buildCardIdAliases(card.cardId);

  if (aliases.has(foldedQuery) || (compactQuery && aliases.has(compactQuery))) {
    return 0;
  }

  const foldedId = foldSearchText(card.cardId);
  const compactId = compactCardCode(card.cardId);

  if (
    foldedId.startsWith(foldedQuery) ||
    (compactQuery && compactId.startsWith(compactQuery))
  ) {
    return 1;
  }

  if (
    foldedId.includes(foldedQuery) ||
    (compactQuery && compactId.includes(compactQuery))
  ) {
    return 2;
  }

  const foldedName = foldSearchText(card.name ?? "");

  if (foldedName.startsWith(foldedQuery)) return 3;
  if (foldedName.includes(foldedQuery)) return 4;

  return undefined;
}

/** Busca, prioriza coincidencias exactas de código y limita los resultados. */
export function searchCards<T extends SearchableCard>(
  cards: T[],
  query: string,
  limit = 30
): T[] {
  return cards
    .map((card, index) => ({
      card,
      index,
      score: getMatchScore(card, query)
    }))
    .filter(
      (entry): entry is { card: T; index: number; score: number } =>
        entry.score !== undefined
    )
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map(({ card }) => card);
}

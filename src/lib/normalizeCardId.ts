const KNOWN_SETS = new Set([
  "SOR",
  "SHD",
  "TWI",
  "JTL",
  "LOF",
  "SEC",
  "LAW",
  "ASH",
  "IBH",
  "HMW",
  "TS26"
]);

export function isKnownSet(setCode: string): boolean {
  return KNOWN_SETS.has(setCode.toUpperCase());
}

/**
 * Normaliza el número de carta.
 *
 * - Cartas normales: 1 -> "001", 38 -> "038", 101 -> "101".
 * - Tokens: T1 -> "T01", T02 -> "T02".
 */
export function normalizeCardNumber(number: string | number): string {
  const asString = String(number).trim().toUpperCase();
  if (/^\d{1,4}$/.test(asString)) return asString.padStart(3, "0");

  const tokenMatch = /^([A-Z]{1,3})(\d{1,4})$/.exec(asString);
  if (tokenMatch) {
    const [, prefix, digits] = tokenMatch;
    return `${prefix}${digits.padStart(2, "0")}`;
  }

  throw new Error(`Número de carta inválido: "${number}"`);
}

export function normalizeSetCode(set: string): string {
  const setCode = set.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(setCode)) {
    throw new Error(`Colección/set inválido: "${set}"`);
  }
  return setCode;
}

/**
 * Construye el identificador canónico SET_NUMERO.
 * normalizeCardId("law", 38) === "LAW_038"
 */
export function normalizeCardId(set: string, number: string | number): string {
  const setCode = normalizeSetCode(set);
  const cardNumber = normalizeCardNumber(number);
  return `${setCode}_${cardNumber}`;
}

/** Descompone un cardId canónico ("LAW_038") en sus partes. */
export function parseCardId(cardId: string): { setCode: string; cardNumber: string } {
  const trimmed = cardId.trim();

  // Los sets promocionales pueden incluir cifras (p. ej. TS26_028) y las
  // fichas/token usan números como T01. Sin separador conservamos el formato
  // histórico solo para sets de letras y números de carta puramente numéricos,
  // porque una cadena como TS26028 sería ambigua entre set y número.
  const match =
    /^([A-Za-z][A-Za-z0-9]{1,9})_([A-Za-z]{0,3}\d{1,4})$/.exec(trimmed) ??
    /^([A-Za-z]{2,5})(\d{1,4})$/.exec(trimmed);

  if (!match) {
    throw new Error(`ID de carta con formato incorrecto: "${cardId}"`);
  }

  const [, set, number] = match;

  return {
    setCode: normalizeSetCode(set),
    cardNumber: normalizeCardNumber(number)
  };
}

/** Acepta un id ya con guion bajo o variantes sin él y lo normaliza igual. */
export function normalizeCardIdString(rawId: string): string {
  const { setCode, cardNumber } = parseCardId(rawId);
  return `${setCode}_${cardNumber}`;
}

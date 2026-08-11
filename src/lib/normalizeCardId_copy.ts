const KNOWN_SETS = new Set([
  "SOR",
  "SHD",
  "TWI",
  "JTL",
  "LOF",
  "SEC",
  "LAW",
  "ASH"
]);

export function isKnownSet(setCode: string): boolean {
  return KNOWN_SETS.has(setCode.toUpperCase());
}

/** Normaliza el número de carta a 3 dígitos: 1 -> "001", 38 -> "038", 101 -> "101" */
export function normalizeCardNumber(number: string | number): string {
  const asString = String(number).trim();
  const digitsOnly = asString.replace(/\D/g, "");
  if (digitsOnly === "") {
    throw new Error(`Número de carta inválido: "${number}"`);
  }
  return digitsOnly.padStart(3, "0");
}

export function normalizeSetCode(set: string): string {
  return set.trim().toUpperCase();
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
  const match = /^([A-Za-z]{2,5})_?(\d{1,4})$/.exec(cardId.trim());
  if (!match) {
    throw new Error(`ID de carta con formato incorrecto: "${cardId}"`);
  }
  const [, set, number] = match;
  return { setCode: normalizeSetCode(set), cardNumber: normalizeCardNumber(number) };
}

/** Acepta un id ya con guion bajo o variantes sin él y lo normaliza igual. */
export function normalizeCardIdString(rawId: string): string {
  const { setCode, cardNumber } = parseCardId(rawId);
  return `${setCode}_${cardNumber}`;
}

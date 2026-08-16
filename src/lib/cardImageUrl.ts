import { parseCardId } from "./normalizeCardId";

const UNPADDED_IMAGE_NUMBER_SETS = new Set(["IBH", "TS26"]);
const TWO_DIGIT_IMAGE_NUMBER_SETS = new Set(["SHDP", "TWIP", "JTLP", "LOFP", "SECP", "LAWP"]);
const IMAGE_SET_CODE_ALIASES: Readonly<Record<string, string>> = {
  SORP: "SOROP",
  SHDP: "SHDOP",
  TWIP: "TWIOP",
  JTLP: "JTLOP",
  LOFP: "LOFOP",
  SECP: "SECOP",
  LAWP: "LAWOP",
  ASHP: "ASHOP"
};

/**
 * Construye una URL de respaldo de la imagen a partir de su cardId.
 *
 * El catálogo incluido ya proporciona la imagen del CDN oficial. Este patrón
 * antiguo de swu-db se conserva únicamente para copias de seguridad o IDs que
 * todavía no estén presentes en el catálogo empaquetado.
 */
export function getCardImageUrl(cardId: string): string {
  const { setCode, cardNumber } = parseCardId(cardId);
  const imageSetCode = IMAGE_SET_CODE_ALIASES[setCode] ?? setCode;
  const unpaddedNumber = cardNumber.replace(/^0+(?=\d)/, "");
  const imageNumber = UNPADDED_IMAGE_NUMBER_SETS.has(setCode)
    ? unpaddedNumber
    : TWO_DIGIT_IMAGE_NUMBER_SETS.has(setCode)
      ? unpaddedNumber.padStart(2, "0")
      : cardNumber;
  return `https://cdn.swu-db.com/images/cards/${imageSetCode}/${imageNumber}.png`;
}

/**
 * Variante segura para los límites de la interfaz.
 *
 * Una colección antigua, una copia de seguridad o un proveedor remoto podría
 * contener algún identificador todavía desconocido. En ese caso se omite la
 * miniatura, pero nunca se interrumpe el renderizado de la pantalla.
 */
export function tryGetCardImageUrl(cardId: string): string | undefined {
  try {
    return getCardImageUrl(cardId);
  } catch {
    return undefined;
  }
}

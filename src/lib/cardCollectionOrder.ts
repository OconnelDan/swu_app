import type { CardInfo } from "@/types/card";

/**
 * Orden cronológico de las colecciones que pueden aparecer como carta canónica
 * en el catálogo empaquetado. Los códigos desconocidos se colocan después,
 * ordenados alfabéticamente, para que una colección futura no rompa la vista.
 */
export const CARD_COLLECTION_ORDER = [
  "SOR",
  "SHD",
  "TWI",
  "JTL",
  "LOF",
  "IBH",
  "SEC",
  "LAW",
  "TS26",
  "C26",
  "ASH"
] as const;

const collectionIndex = new Map<string, number>(
  CARD_COLLECTION_ORDER.map((setCode, index) => [setCode, index])
);

function compareCardNumbers(left: string, right: string): number {
  return left.localeCompare(right, "es", { numeric: true, sensitivity: "base" });
}

export function compareSetCodesByRelease(left: string, right: string): number {
  const leftIndex = collectionIndex.get(left.toUpperCase()) ?? Number.MAX_SAFE_INTEGER;
  const rightIndex = collectionIndex.get(right.toUpperCase()) ?? Number.MAX_SAFE_INTEGER;
  return leftIndex - rightIndex || left.localeCompare(right, "es", { sensitivity: "base" });
}

export function compareCardsByCollection(
  left: Pick<CardInfo, "setCode" | "cardNumber">,
  right: Pick<CardInfo, "setCode" | "cardNumber">
): number {
  return (
    compareSetCodesByRelease(left.setCode, right.setCode) ||
    compareCardNumbers(left.cardNumber, right.cardNumber)
  );
}

export function cardIdParts(cardId: string): { setCode: string; cardNumber: string } {
  const separator = cardId.lastIndexOf("_");
  if (separator < 1) return { setCode: cardId, cardNumber: "" };
  return {
    setCode: cardId.slice(0, separator),
    cardNumber: cardId.slice(separator + 1)
  };
}

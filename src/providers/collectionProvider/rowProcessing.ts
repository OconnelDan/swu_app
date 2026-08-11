import { isKnownSet, normalizeCardId } from "@/lib/normalizeCardId";
import { sumVariantColumns } from "@/lib/sumVariantColumns";
import type { CollectionCard, CollectionImportResult, ImportWarning } from "@/types/collection";

export interface RawCollectionRow {
  /** Columna A */
  setCode: unknown;
  /** Columna B */
  cardNumber: unknown;
  /** Columna C (opcional) */
  name?: unknown;
  /** Columnas D:X */
  variantValues: unknown[];
  /** Referencia para mensajes de error (nº de fila, etc.) */
  rowRef: string | number;
}

export interface ProcessRowsOutcome {
  cards: CollectionCard[];
  warnings: ImportWarning[];
  rowsProcessed: number;
  rowsIgnored: number;
  invalidValues: number;
  setsFound: Set<string>;
}

/**
 * Procesa filas crudas (independientemente de si vienen de Excel, CSV o
 * JSON ya tabulado) aplicando las reglas de la sección 4: suma D:X,
 * normalización a 3 dígitos y clave canónica SET_NUMERO.
 */
export function processCollectionRows(rows: RawCollectionRow[]): ProcessRowsOutcome {
  const byCardId = new Map<string, CollectionCard>();
  const seenRowIds = new Set<string>();
  const warnings: ImportWarning[] = [];
  const setsFound = new Set<string>();

  let rowsProcessed = 0;
  let rowsIgnored = 0;
  let invalidValues = 0;

  for (const row of rows) {
    const setRaw = row.setCode;
    const numberRaw = row.cardNumber;

    if (setRaw === undefined || setRaw === null || String(setRaw).trim() === "") {
      rowsIgnored += 1;
      warnings.push({
        type: "empty_row",
        message: `Fila ${row.rowRef}: código de carta "${setRaw}_${numberRaw}" no válido, se ignora.`,
        rowRef: row.rowRef
      });
      continue;
    }
    if (numberRaw === undefined || numberRaw === null || String(numberRaw).trim() === "") {
      rowsIgnored += 1;
      warnings.push({
        type: "empty_row",
        message: `Fila ${row.rowRef}: sin número de carta en la columna B, se ignora.`,
        rowRef: row.rowRef
      });
      continue;
    }

    let cardId: string;
    try {
      cardId = normalizeCardId(String(setRaw), String(numberRaw));
    } catch {
      rowsIgnored += 1;
      warnings.push({
        type: "invalid_number",
        message: `Fila ${row.rowRef}: número de carta "${numberRaw}" no es válido, se ignora.`,
        rowRef: row.rowRef
      });
      continue;
    }

    const setCode = cardId.split("_")[0];
    if (!isKnownSet(setCode)) {
      warnings.push({
        type: "unknown_set",
        message: `Fila ${row.rowRef}: colección "${setCode}" no reconocida, se acepta igualmente.`,
        rowRef: row.rowRef
      });
    }
    setsFound.add(setCode);

    const { total, hasInvalidValues, invalidCells } = sumVariantColumns(row.variantValues);
    if (hasInvalidValues) {
      invalidValues += invalidCells;
      warnings.push({
        type: "invalid_number",
        message: `Fila ${row.rowRef} (${cardId}): hay ${invalidCells} valor(es) no numérico(s) en las variantes, se ignoran en la suma.`,
        rowRef: row.rowRef
      });
    }

    rowsProcessed += 1;

    const rowKey = `${cardId}#${row.rowRef}`;
    if (seenRowIds.has(rowKey)) {
      // Fila exactamente repetida (mismo rowRef) - improbable, pero por seguridad.
      continue;
    }
    seenRowIds.add(rowKey);

    const existing = byCardId.get(cardId);
    if (existing) {
      existing.ownedCount += total;
      warnings.push({
        type: "duplicate_row",
        message: `La carta ${cardId} aparece en varias filas; se han sumado sus copias.`,
        rowRef: row.rowRef
      });
    } else {
      byCardId.set(cardId, {
        cardId,
        setCode,
        cardNumber: cardId.split("_")[1],
        name: row.name ? String(row.name) : undefined,
        ownedCount: total
      });
    }
  }

  return {
    cards: Array.from(byCardId.values()),
    warnings,
    rowsProcessed,
    rowsIgnored,
    invalidValues,
    setsFound
  };
}

export function buildImportResult(
  source: CollectionImportResult["source"],
  outcome: ProcessRowsOutcome,
  extra?: { fileName?: string; sheetName?: string }
): CollectionImportResult {
  return {
    source,
    fileName: extra?.fileName,
    sheetName: extra?.sheetName,
    importedAt: new Date().toISOString(),
    rowsProcessed: outcome.rowsProcessed,
    cardsRecognized: outcome.cards.length,
    rowsIgnored: outcome.rowsIgnored,
    invalidValues: outcome.invalidValues,
    totalCopies: outcome.cards.reduce((sum, c) => sum + c.ownedCount, 0),
    setsFound: Array.from(outcome.setsFound),
    warnings: outcome.warnings,
    cards: outcome.cards
  };
}

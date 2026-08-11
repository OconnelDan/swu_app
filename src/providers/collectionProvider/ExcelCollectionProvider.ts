import * as XLSX from "xlsx";
import type { CollectionImportResult, CollectionProvider } from "@/types/collection";
import { buildImportResult, processCollectionRows, type RawCollectionRow } from "./rowProcessing";

export interface ExcelImportInput {
  file: File | ArrayBuffer;
  fileName?: string;
  /** Si el libro tiene varias hojas y el usuario ya eligió una. */
  sheetName?: string;
}

/**
 * Elige automáticamente la hoja más probable: la que tenga más filas con
 * un patrón "SET, número, ...variantes numéricas" en las primeras columnas.
 */
function pickBestSheet(workbook: XLSX.WorkBook): string {
  let bestSheet = workbook.SheetNames[0];
  let bestScore = -1;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    let score = 0;
    for (const row of rows.slice(0, 50)) {
      const a = row?.[0];
      const b = row?.[1];
      if (
  typeof a === "string" &&
  /^[A-Za-z][A-Za-z0-9]{1,9}$/.test(a.trim())
) {
  if (
    b !== undefined &&
    b !== "" &&
    /^(?:\d{1,4}|[A-Za-z]{1,3}\d{1,4})$/.test(
      String(b).trim()
    )
  ) {
    score += 1;
  }
}
    }
    if (score > bestScore) {
      bestScore = score;
      bestSheet = sheetName;
    }
  }
  return bestSheet;
}

export class ExcelCollectionProvider implements CollectionProvider {
  readonly id = "excel";

  async importFromSource(input: unknown): Promise<CollectionImportResult> {
    const { file, fileName, sheetName } = input as ExcelImportInput;

    const buffer = file instanceof File ? await file.arrayBuffer() : file;
    const workbook = XLSX.read(buffer, { type: "array" });

    if (workbook.SheetNames.length === 0) {
      throw new Error("El archivo Excel no contiene hojas.");
    }

    const chosenSheetName = sheetName ?? pickBestSheet(workbook);
    const sheet = workbook.Sheets[chosenSheetName];
    if (!sheet) {
      throw new Error(`No se encontró la hoja "${chosenSheetName}".`);
    }

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    if (matrix.length === 0) {
      throw new Error("La hoja seleccionada está vacía.");
    }

    // Detecta si la primera fila es cabecera (columna A no parece un código de set)
    const firstRow = matrix[0];
    const looksLikeHeader =
      typeof firstRow?.[0] === "string" &&
      !/^[A-Za-z][A-Za-z0-9]{1,9}$/.test(
        String(firstRow[0]).trim()
      );
    const dataRows = looksLikeHeader ? matrix.slice(1) : matrix;

    if (dataRows.length === 0) {
      throw new Error("No se han encontrado filas de datos reconocibles en el Excel.");
    }

    const rawRows: RawCollectionRow[] = dataRows.map((row, index) => ({
      setCode: row[0],
      cardNumber: row[1],
      name: row[2],
      variantValues: row.slice(3),
      rowRef: (looksLikeHeader ? index + 2 : index + 1)
    }));

    const outcome = processCollectionRows(rawRows);

    if (outcome.cards.length === 0) {
      throw new Error(
        "No se han reconocido columnas válidas (set, número, variantes) en el Excel."
      );
    }

    return buildImportResult("excel", outcome, { fileName, sheetName: chosenSheetName });
  }

  /** Utilidad expuesta para la UI: lista los nombres de hoja de un archivo. */
  static async listSheetNames(file: File): Promise<string[]> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    return workbook.SheetNames;
  }
}

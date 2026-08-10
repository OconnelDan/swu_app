import type { CollectionImportResult, CollectionProvider } from "@/types/collection";
import { buildImportResult, processCollectionRows, type RawCollectionRow } from "./rowProcessing";

export interface CsvImportInput {
  text: string;
  fileName?: string;
  delimiter?: string;
}

function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/)[0] ?? "";
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const semicolonCount = (firstLine.match(/;/g) ?? []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

/** Parser CSV simple con soporte de comillas dobles. */
function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export class CsvCollectionProvider implements CollectionProvider {
  readonly id = "csv";

  async importFromSource(input: unknown): Promise<CollectionImportResult> {
    const { text, fileName, delimiter } = input as CsvImportInput;

    if (!text || !text.trim()) {
      throw new Error("El archivo CSV está vacío.");
    }

    const finalDelimiter = delimiter ?? detectDelimiter(text);
    const matrix = parseCsv(text, finalDelimiter);

    if (matrix.length === 0) {
      throw new Error("No se han encontrado filas en el CSV.");
    }

    const firstRow = matrix[0];
    const looksLikeHeader = !/^[A-Za-z]{2,5}$/.test((firstRow[0] ?? "").trim());
    const dataRows = looksLikeHeader ? matrix.slice(1) : matrix;

    const rawRows: RawCollectionRow[] = dataRows.map((row, index) => ({
      setCode: row[0],
      cardNumber: row[1],
      name: row[2],
      variantValues: row.slice(3),
      rowRef: looksLikeHeader ? index + 2 : index + 1
    }));

    const outcome = processCollectionRows(rawRows);

    if (outcome.cards.length === 0) {
      throw new Error("No se han reconocido columnas válidas (set, número, variantes) en el CSV.");
    }

    return buildImportResult("csv", outcome, { fileName });
  }
}

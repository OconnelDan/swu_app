import type { CollectionImportResult, CollectionProvider } from "@/types/collection";
import { buildImportResult, processCollectionRows, type RawCollectionRow } from "./rowProcessing";

export interface JsonImportInput {
  text: string;
  fileName?: string;
}

/**
 * Acepta dos formas de JSON de colección:
 * 1) Array de filas crudas tipo Excel: [{ set, number, name, variants: [...] }, ...]
 *    (también admite "col" en vez de "set" y "number" en vez de "number")
 * 2) Array ya agregado: [{ cardId: "LAW_038", ownedCount: 3, name?: "..." }, ...]
 */
export class JsonCollectionProvider implements CollectionProvider {
  readonly id = "json";

  async importFromSource(input: unknown): Promise<CollectionImportResult> {
    const { text, fileName } = input as JsonImportInput;

    if (!text || !text.trim()) {
      throw new Error("El JSON de colección está vacío.");
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("El JSON de colección no tiene un formato válido.");
    }

    if (!Array.isArray(data)) {
      throw new Error("El JSON de colección debe ser un array de cartas.");
    }
    if (data.length === 0) {
      throw new Error("El JSON de colección no contiene ninguna fila.");
    }

    const isAggregated = data.every(
      (row) =>
        row &&
        typeof row === "object" &&
        "cardId" in (row as Record<string, unknown>) &&
        ("ownedCount" in (row as Record<string, unknown>) || "count" in (row as Record<string, unknown>))
    );

    const rawRows: RawCollectionRow[] = isAggregated
      ? (data as Record<string, unknown>[]).map((row, index) => {
          const cardId = String(row.cardId ?? "");
          const [set, number] = cardId.includes("_") ? cardId.split("_") : [cardId, ""];
          const count = Number(row.ownedCount ?? row.count ?? 0);
          return {
            setCode: set,
            cardNumber: number,
            name: row.name,
            variantValues: [count],
            rowRef: index + 1
          };
        })
      : (data as Record<string, unknown>[]).map((row, index) => ({
          setCode: row.set ?? row.setCode ?? row.col,
          cardNumber: row.number ?? row.cardNumber ?? row.num,
          name: row.name,
          variantValues: Array.isArray(row.variants)
            ? (row.variants as unknown[])
            : Object.entries(row)
                .filter(([key]) => !["set", "setCode", "col", "number", "cardNumber", "num", "name"].includes(key))
                .map(([, value]) => value),
          rowRef: index + 1
        }));

    const outcome = processCollectionRows(rawRows);

    if (outcome.cards.length === 0) {
      throw new Error("No se han reconocido cartas válidas en el JSON de colección.");
    }

    return buildImportResult("json", outcome, { fileName });
  }
}

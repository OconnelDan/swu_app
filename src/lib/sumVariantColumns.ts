export interface SumVariantsResult {
  total: number;
  hasInvalidValues: boolean;
  invalidCells: number;
}

/**
 * Suma todos los valores numéricos de las columnas D:X (variantes: normal,
 * foil, hyperspace, showcase, promo, prestige, etc). Cualquier celda vacía
 * o no numérica se ignora mediante warning; no rompe la suma.
 */
export function sumVariantColumns(values: unknown[]): SumVariantsResult {
  let total = 0;
  let invalidCells = 0;

  for (const raw of values) {
    if (raw === null || raw === undefined || raw === "") continue;

    const num = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
    if (Number.isFinite(num)) {
      total += Math.max(0, Math.trunc(num));
    } else {
      invalidCells += 1;
    }
  }

  return { total, hasInvalidValues: invalidCells > 0, invalidCells };
}

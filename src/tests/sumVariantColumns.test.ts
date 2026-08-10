import { describe, expect, it } from "vitest";
import { sumVariantColumns } from "@/lib/sumVariantColumns";

describe("sumVariantColumns", () => {
  it("suma valores numéricos de un array de variantes", () => {
    expect(sumVariantColumns([1, 0, 1, 0, 0, 1]).total).toBe(3);
  });

  it("ignora celdas vacías o no numéricas y las marca como inválidas", () => {
    const result = sumVariantColumns([1, "", "x", 2, undefined, null]);
    expect(result.total).toBe(3);
    expect(result.hasInvalidValues).toBe(true);
    expect(result.invalidCells).toBe(1);
  });

  it("devuelve 0 cuando no hay variantes", () => {
    expect(sumVariantColumns([]).total).toBe(0);
  });

  it("trata valores negativos como 0 (no restan copias)", () => {
    expect(sumVariantColumns([2, -1, 1]).total).toBe(3);
  });
});

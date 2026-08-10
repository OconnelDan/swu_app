import { describe, expect, it } from "vitest";
import { normalizeCardId, normalizeCardNumber, parseCardId } from "@/lib/normalizeCardId";

describe("normalizeCardId", () => {
  it("normaliza set en minúsculas y número corto a 3 dígitos", () => {
    expect(normalizeCardId("law", 38)).toBe("LAW_038");
  });

  it("mantiene números de 3 dígitos igual", () => {
    expect(normalizeCardId("SEC", 179)).toBe("SEC_179");
    expect(normalizeCardId("ASH", "248")).toBe("ASH_248");
  });

  it("rellena con ceros números de un dígito", () => {
    expect(normalizeCardId("JTL", 1)).toBe("JTL_001");
  });

  it("lanza error con un número no numérico", () => {
    expect(() => normalizeCardNumber("abc")).toThrow();
  });

  it("parseCardId descompone un id canónico", () => {
    expect(parseCardId("LAW_038")).toEqual({ setCode: "LAW", cardNumber: "038" });
  });

  it("parseCardId lanza error con formato incorrecto", () => {
    expect(() => parseCardId("???")).toThrow();
  });
});

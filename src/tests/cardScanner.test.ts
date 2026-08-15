import { describe, expect, it } from "vitest";
import { parseCardCodeFromOcr } from "@/lib/cardScanner";

describe("lector del código impreso de una carta", () => {
  it("reconoce ASH_132 en la fotografía de Queen Soruna", () => {
    const rawText = "%a. ARIO MURTI 0] © LFL © FFG ASHEN [f} 132/264\nk 4";

    expect(parseCardCodeFromOcr(rawText)).toMatchObject({
      cardId: "ASH_132",
      setCode: "ASH",
      cardNumber: "132",
      printedTotal: 264
    });
  });

  it("corrige confusiones habituales entre letras y cifras", () => {
    expect(parseCardCodeFromOcr("© FFG LAW · EN O38/264")).toMatchObject({
      cardId: "LAW_038",
      cardNumber: "038"
    });
  });

  it("usa el set más próximo al número de carta", () => {
    expect(parseCardCodeFromOcr("ASH texto anterior · SEC EN 041/262")).toMatchObject({
      cardId: "SEC_041",
      setCode: "SEC"
    });
  });

  it("acepta sets promocionales con cifras", () => {
    expect(parseCardCodeFromOcr("© FFG TS26 EN 28/100")).toMatchObject({
      cardId: "TS26_028",
      cardNumber: "028"
    });
  });

  it("no inventa una carta si falta el set o la fracción impresa", () => {
    expect(parseCardCodeFromOcr("QUEEN SORUNA 132")).toBeUndefined();
    expect(parseCardCodeFromOcr("XYZ EN 132/264")).toBeUndefined();
  });
});

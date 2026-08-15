import { describe, expect, it } from "vitest";
import {
  analyzeCardFrameQuality,
  calculateFrameMovement,
  parseCardCodeFromOcr
} from "@/lib/cardScanner";

function buildFrame(
  width: number,
  height: number,
  getValue: (x: number, y: number) => number
): Pick<ImageData, "data" | "width" | "height"> {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = getValue(x, y);
      const index = (y * width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  return { data, width, height };
}

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

describe("calidad del vídeo en directo", () => {
  it("distingue falta de luz, reflejos y falta de contraste", () => {
    expect(analyzeCardFrameQuality(buildFrame(32, 48, () => 15)).issue).toBe("too-dark");
    expect(analyzeCardFrameQuality(buildFrame(32, 48, () => 245)).issue).toBe("too-bright");
    expect(analyzeCardFrameQuality(buildFrame(32, 48, () => 125)).issue).toBe("low-contrast");
  });

  it("detecta un pie de carta desenfocado aunque tenga contraste", () => {
    const quality = analyzeCardFrameQuality(
      buildFrame(48, 64, (x) => 60 + Math.round((x / 47) * 120))
    );

    expect(quality.contrast).toBeGreaterThan(20);
    expect(quality.issue).toBe("blurry");
  });

  it("acepta una imagen nítida y genera una firma para medir movimiento", () => {
    const first = analyzeCardFrameQuality(
      buildFrame(48, 64, (x, y) => ((Math.floor(x / 3) + Math.floor(y / 3)) % 2 ? 220 : 30))
    );
    const same = new Uint8Array(first.signature);
    const moved = new Uint8Array(first.signature.map((value) => 255 - value));

    expect(first.issue).toBeUndefined();
    expect(first.sharpness).toBeGreaterThan(90);
    expect(calculateFrameMovement(first.signature, same)).toBe(0);
    expect(calculateFrameMovement(first.signature, moved)).toBeGreaterThan(20);
  });
});

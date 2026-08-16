import { describe, expect, it } from "vitest";
import {
  analyzeCardFrameQuality,
  calculateFrameMovement,
  parseCardCodeFromOcr,
  parseCardCodeFromOcrResults
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

  it("reconoce una impresión Hyperspace sin total impreso", () => {
    expect(parseCardCodeFromOcr("© LFL © FFG LAW-ES © SN")).toMatchObject({
      cardId: "LAW_511",
      setCode: "LAW",
      cardNumber: "511",
      printedTotal: undefined
    });
  });

  it("reconoce una impresión foil moderna sin total impreso", () => {
    expect(parseCardCodeFromOcr("JAKUB REBELKA © LFL © FFG SEC-ES © 748")).toMatchObject({
      cardId: "SEC_748",
      setCode: "SEC",
      cardNumber: "748"
    });
  });

  it("reconoce el código promocional ASHP impreso en la carta", () => {
    expect(parseCardCodeFromOcr("© LFL © FFG ASHP-ES © 16")).toMatchObject({
      cardId: "ASHP_016",
      setCode: "ASHP",
      cardNumber: "016"
    });
  });

  it.each([
    ["© LFL © FFG SOR-EN © 007/20", "SORP_007"],
    ["© LFL © FFG SHD-EN © 10/20", "SHDP_010"],
    ["© LFL © FFG TWI-EN © 04/20", "TWIP_004"]
  ])("distingue las primeras promos por el total /20: %s", (rawText, cardId) => {
    expect(parseCardCodeFromOcr(rawText)).toMatchObject({ cardId, printedTotal: 20 });
  });

  it.each([
    ["© LFL © FFG JTLP-EN © 16", "JTLP_016"],
    ["© LFL © FFG LOFP-EN © 8", "LOFP_008"],
    ["© LFL © FFG SECP-EN © 4", "SECP_004"],
    ["© LFL © FFG LAWP-EN © 20", "LAWP_020"],
    ["© LFL © FFG ASHP-EN © 16", "ASHP_016"]
  ])("reconoce las promos modernas por su código terminado en P: %s", (rawText, cardId) => {
    expect(parseCardCodeFromOcr(rawText)).toMatchObject({ cardId });
  });

  it.each([
    ["© LFL © FFG P25-ES © 97", "P25_097"],
    ["© LFL © FFG P26-EN © 239", "P26_239"],
    ["© LFL © FFG C24-EN © 3", "C24_003"],
    ["© LFL © FFG J25-EN © 19", "J25_019"],
    ["© LFL © FFG MV26-EN © 2", "MV26_002"]
  ])("reconoce otras nomenclaturas promocionales oficiales: %s", (rawText, cardId) => {
    expect(parseCardCodeFromOcr(rawText)).toMatchObject({ cardId });
  });

  it("acepta el sufijo F de las foil de los primeros sets", () => {
    expect(parseCardCodeFromOcr("© FFG SOR-ES 182F/252")).toMatchObject({
      cardId: "SOR_182",
      printedTotal: 252
    });
  });

  it("combina de forma segura el set y el número leídos en pases distintos", () => {
    expect(parseCardCodeFromOcrResults(["© FFG SEC-ES © 148", "reflejo 748"])).toMatchObject({
      cardId: "SEC_748"
    });
    expect(parseCardCodeFromOcrResults(["© FFG SEC-ES © 148", "reflejo 748 749"])).toBeUndefined();
  });

  it("no inventa una carta si falta el set o el formato impreso es inseguro", () => {
    expect(parseCardCodeFromOcr("QUEEN SORUNA 132")).toBeUndefined();
    expect(parseCardCodeFromOcr("XYZ EN 132/264")).toBeUndefined();
    expect(parseCardCodeFromOcr("© FFG SEC-ES © 148")).toBeUndefined();
    expect(parseCardCodeFromOcr("© FFG SHD-ES © 10/28")).toBeUndefined();
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

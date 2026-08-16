import { describe, expect, it } from "vitest";
import { getCardImageUrl } from "@/lib/cardImageUrl";

describe("URL de imágenes del catálogo", () => {
  it("mantiene el número de tres cifras en los sets principales", () => {
    expect(getCardImageUrl("SEC_262")).toBe("https://cdn.swu-db.com/images/cards/SEC/262.png");
  });

  it("usa el número sin ceros iniciales en los sets cuyo CDN lo requiere", () => {
    expect(getCardImageUrl("IBH_082")).toBe("https://cdn.swu-db.com/images/cards/IBH/82.png");
    expect(getCardImageUrl("TS26_028")).toBe("https://cdn.swu-db.com/images/cards/TS26/28.png");
  });

  it("traduce el código promocional impreso ASHP al código ASHOP del CDN", () => {
    expect(getCardImageUrl("ASHP_016")).toBe("https://cdn.swu-db.com/images/cards/ASHOP/016.png");
  });

  it.each([
    ["SORP_007", "SOROP/007.png"],
    ["SHDP_010", "SHDOP/10.png"],
    ["TWIP_004", "TWIOP/04.png"],
    ["JTLP_016", "JTLOP/16.png"],
    ["LOFP_008", "LOFOP/08.png"],
    ["SECP_004", "SECOP/04.png"],
    ["LAWP_020", "LAWOP/20.png"]
  ])("genera la ruta CDN correcta para %s", (cardId, path) => {
    expect(getCardImageUrl(cardId)).toBe(`https://cdn.swu-db.com/images/cards/${path}`);
  });
});

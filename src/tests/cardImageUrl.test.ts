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
});

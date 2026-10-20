import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCardmarketProductUrl,
  getCardmarketPrice,
  resetCardmarketPriceCache
} from "@/lib/cardmarketPrice";

function mockCatalogFetch(value: unknown) {
  const mockedFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue(value)
  });
  vi.stubGlobal("fetch", mockedFetch);
  return mockedFetch;
}

afterEach(() => {
  resetCardmarketPriceCache();
  vi.unstubAllGlobals();
});

describe("guía local de precios de Cardmarket", () => {
  it("devuelve el precio mínimo y el enlace estable del producto", async () => {
    const fetchMock = mockCatalogFetch({
      version: 1,
      createdAt: "2026-10-20T02:45:11+0200",
      prices: { ASH_109: [896088, 0.02] }
    });

    await expect(getCardmarketPrice("ash_109")).resolves.toEqual({
      cardId: "ASH_109",
      productId: 896088,
      lowPrice: 0.02,
      currency: "EUR",
      updatedAt: "2026-10-20T02:45:11+0200",
      productUrl: "https://www.cardmarket.com/StarWarsUnlimited/Products?idProduct=896088"
    });
    expect(fetchMock).toHaveBeenCalledWith("/data/cardmarket-prices.json", {
      cache: "no-cache"
    });
  });

  it("comparte una sola descarga entre varias cartas", async () => {
    const fetchMock = mockCatalogFetch({
      version: 1,
      createdAt: "2026-10-20T02:45:11+0200",
      prices: {
        ASH_109: [896088, 0.02],
        SEC_101: [853880, 0.25]
      }
    });

    await Promise.all([getCardmarketPrice("ASH_109"), getCardmarketPrice("SEC_101")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("conserva el enlace cuando Cardmarket todavía no publica precio", async () => {
    mockCatalogFetch({
      version: 1,
      createdAt: "2026-10-20T02:45:11+0200",
      prices: { HMW_001: [918001, null] }
    });

    await expect(getCardmarketPrice("HMW_001")).resolves.toMatchObject({
      productId: 918001,
      lowPrice: null
    });
  });

  it("genera el redirect oficial usando únicamente el idProduct", () => {
    expect(buildCardmarketProductUrl(896058)).toBe(
      "https://www.cardmarket.com/StarWarsUnlimited/Products?idProduct=896058"
    );
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCardmarketProductUrl,
  calculateCardmarketDeckValue,
  getCardmarketPrice,
  getCardmarketPrices,
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

  it("carga en bloque las cartas solicitadas y normaliza sus códigos", async () => {
    const fetchMock = mockCatalogFetch({
      version: 1,
      createdAt: "2026-10-20T02:45:11+0200",
      prices: {
        ASH_109: [896088, 0.02],
        SEC_101: [853880, 0.25]
      }
    });

    const selection = await getCardmarketPrices(["ash_109", "SEC_101", "ASH_109"]);

    expect(selection.updatedAt).toBe("2026-10-20T02:45:11+0200");
    expect([...selection.prices]).toHaveLength(2);
    expect(selection.prices.get("ASH_109")?.lowPrice).toBe(0.02);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("calcula el valor completo y solo cobra como faltantes las copias no poseídas", () => {
    const selection = {
      updatedAt: "2026-10-20T02:45:11+0200",
      prices: new Map([
        [
          "ASH_109",
          {
            cardId: "ASH_109",
            productId: 896088,
            lowPrice: 2,
            currency: "EUR" as const,
            updatedAt: "2026-10-20T02:45:11+0200",
            productUrl: buildCardmarketProductUrl(896088)
          }
        ],
        [
          "SEC_101",
          {
            cardId: "SEC_101",
            productId: 853880,
            lowPrice: 0.25,
            currency: "EUR" as const,
            updatedAt: "2026-10-20T02:45:11+0200",
            productUrl: buildCardmarketProductUrl(853880)
          }
        ]
      ])
    };

    expect(
      calculateCardmarketDeckValue(
        [
          {
            cardId: "ASH_109",
            requiredCount: 3,
            missingCount: 2,
            copiesMissingFromCollection: 1
          },
          { cardId: "SEC_101", requiredCount: 2, missingCount: 1 }
        ],
        selection
      )
    ).toEqual({
      totalCents: 650,
      missingCents: 225,
      unpricedTotalCopies: 0,
      unpricedMissingCopies: 0,
      updatedAt: "2026-10-20T02:45:11+0200"
    });
  });

  it("señala las copias que todavía no tienen precio sin inventar su valor", () => {
    const selection = {
      updatedAt: "2026-10-20T02:45:11+0200",
      prices: new Map()
    };

    expect(
      calculateCardmarketDeckValue(
        [{ cardId: "HMW_001", requiredCount: 3, missingCount: 2 }],
        selection
      )
    ).toMatchObject({
      totalCents: 0,
      missingCents: 0,
      unpricedTotalCopies: 3,
      unpricedMissingCopies: 2
    });
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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/db";
import { OFFICIAL_SET_CODES } from "@/generated/officialCardCatalogMeta";
import { SwUnlimitedDbCardProvider } from "@/providers/cardProvider/SwUnlimitedDbCardProvider";

const catalogJson = readFileSync(
  resolve(process.cwd(), "public/data/swu-card-catalog.json"),
  "utf8"
);
const catalog = JSON.parse(catalogJson) as {
  version: number;
  source: string;
  sets: string[];
  cards: Record<string, unknown>;
  aliases: Record<string, string>;
  images: Record<string, string>;
};

describe("catálogo de cartas incluido", () => {
  const fetchMock = vi.fn();

  it.each([
    ["SORP", 20],
    ["SHDP", 20],
    ["TWIP", 20],
    ["JTLP", 40],
    ["LOFP", 40],
    ["SECP", 40],
    ["LAWP", 40],
    ["ASHP", 40]
  ])("incluye las %s promos disponibles", (setCode, expectedCount) => {
    const promoAliases = Object.keys(catalog.aliases).filter((id) => id.startsWith(`${setCode}_`));

    expect(promoAliases).toHaveLength(expectedCount);
  });

  it("se genera desde la API oficial e incluye todas sus nomenclaturas publicadas", () => {
    expect(catalog).toMatchObject({
      version: 2,
      source: "https://admin.starwarsunlimited.com/api/card-list?locale=en"
    });
    expect(catalog.sets).toEqual(
      expect.arrayContaining(["C24", "C25", "C26", "G25", "GG", "J24", "J25", "MV26", "P25", "P26"])
    );
    expect(catalog.sets).toEqual([...OFFICIAL_SET_CODES]);
    expect(catalog.aliases).toMatchObject({
      P25_097: "JTL_020",
      P26_239: "ASH_243",
      C24_003: "SOR_135",
      J25_019: "SEC_209"
    });
  });

  it("incluye una URL oficial válida para cada carta base y cada impresión", () => {
    const expectedImageIds = new Set([
      ...Object.keys(catalog.cards),
      ...Object.keys(catalog.aliases)
    ]);
    const missingImageIds = [...expectedImageIds].filter((cardId) => !catalog.images[cardId]);
    const validOfficialUrls = Object.values(catalog.images).every((imageUrl) => {
      const parsedUrl = new URL(imageUrl);
      return parsedUrl.protocol === "https:" && parsedUrl.hostname === "cdn.starwarsunlimited.com";
    });

    expect(missingImageIds).toEqual([]);
    expect(Object.keys(catalog.images)).toHaveLength(expectedImageIds.size);
    expect(validOfficialUrls).toBe(true);
  });

  beforeAll(() => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(catalogJson, {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  beforeEach(async () => {
    await db.cardCache.clear();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("confirma SEC_262 sin consultar la API remota desde el navegador", async () => {
    const provider = new SwUnlimitedDbCardProvider();

    await expect(provider.getCard("SEC_262")).resolves.toMatchObject({
      cardId: "SEC_262",
      setCode: "SEC",
      cardNumber: "262",
      name: "Ando Commission",
      type: "Unit",
      rarity: "Common"
    });

    expect(fetchMock).toHaveBeenCalledWith("/data/swu-card-catalog.json", {
      cache: "no-cache"
    });
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("api.swu-db.com"));
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("admin.starwarsunlimited.com")
    );
  });

  it("convierte una impresión variante en el ID base que utiliza la colección", async () => {
    const provider = new SwUnlimitedDbCardProvider();

    await expect(provider.getCard("SEC_526")).resolves.toMatchObject({
      cardId: "SEC_262",
      name: "Ando Commission",
      imageUrl: expect.stringMatching(/^https:\/\/cdn\.starwarsunlimited\.com\//)
    });
  });

  it.each(["IBH_015", "IBH_021", "IBH_022", "IBH_023"])(
    "conserva la doble barra publicada por el CDN oficial para %s",
    async (cardId) => {
      const provider = new SwUnlimitedDbCardProvider();
      const info = await provider.getCard(cardId);

      expect(catalog.images[cardId]).toMatch(/^https:\/\/cdn\.starwarsunlimited\.com\/\/card_/);
      expect(info?.imageUrl).toBe(catalog.images[cardId]);
    }
  );

  it("sustituye una URL antigua guardada en IndexedDB por la del catálogo actual", async () => {
    await db.cardCache.put({
      cardId: "IBH_022",
      setCode: "IBH",
      cardNumber: "022",
      name: "GR-75 Medium Transport",
      imageUrl:
        "https://cdn.starwarsunlimited.com/card_I01010022_EN_GR_75_Medium_Transport_a828aba5c6.png"
    });

    const provider = new SwUnlimitedDbCardProvider();

    await expect(provider.getCard("IBH_022")).resolves.toMatchObject({
      cardId: "IBH_022",
      imageUrl: catalog.images.IBH_022
    });
  });

  it.each([
    ["SORP_007", "SOR_226", "Admiral Motti, Brazen and Scornful"],
    ["SHDP_010", "SHD_039", "Calculated Lethality"],
    ["TWIP_004", "TWI_240", "332nd Stalwart"],
    ["JTLP_016", "JTL_197", "Anakin Skywalker, I'll Try Spinning"],
    ["LOFP_008", "LOF_129", "Acolyte of the Beyond"],
    ["SECP_004", "SEC_070", "Armor of Fortune"],
    ["LAWP_020", "LAW_247", "Backed by the Hutts"],
    ["ASHP_016", "ASH_189", "Emperor's Messenger"]
  ])(
    "convierte la promo %s en su carta base y conserva su arte",
    async (requestedCardId, canonicalCardId, name) => {
      const provider = new SwUnlimitedDbCardProvider();

      await expect(provider.getCard(requestedCardId)).resolves.toMatchObject({
        cardId: canonicalCardId,
        name,
        imageUrl: expect.stringMatching(/^https:\/\/cdn\.starwarsunlimited\.com\//)
      });
      expect(catalog.images[requestedCardId]).toMatch(/^https:\/\/cdn\.starwarsunlimited\.com\//);
    }
  );
});

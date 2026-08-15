import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/db";
import { SwUnlimitedDbCardProvider } from "@/providers/cardProvider/SwUnlimitedDbCardProvider";

const catalogJson = readFileSync(
  resolve(process.cwd(), "public/data/swu-card-catalog.json"),
  "utf8"
);

describe("catálogo de cartas incluido", () => {
  const fetchMock = vi.fn();

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
      cache: "force-cache"
    });
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("api.swu-db.com"));
  });

  it("convierte una impresión variante en el ID base que utiliza la colección", async () => {
    const provider = new SwUnlimitedDbCardProvider();

    await expect(provider.getCard("SEC_526")).resolves.toMatchObject({
      cardId: "SEC_262",
      name: "Ando Commission",
      imageUrl: "https://cdn.swu-db.com/images/cards/SEC/526.png"
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  buildCloudCollectionRows,
  buildCloudCollectionWriteRows,
  buildCloudFavoriteDeckRows,
  buildRemoteImportResult,
  parseCloudCollectionRows,
  parseCloudFavoriteDeckRows
} from "@/lib/cloudSyncData";
import { normalizeDeckJson } from "@/lib/normalizeDeckJson";
import type { CollectionCard } from "@/types/collection";
import type { FavoriteDeck } from "@/types/deck";

function favorite(
  id: string,
  name: string,
  createdAt: string,
  deck: { id: string; count: number }[]
): FavoriteDeck {
  const normalizedDeck = normalizeDeckJson({ name, deck });
  return {
    id,
    name,
    originalJson: normalizedDeck.originalJson,
    normalizedDeck,
    createdAt,
    updatedAt: createdAt
  };
}

describe("datos para sincronización en la nube", () => {
  const collection: CollectionCard[] = [
    {
      cardId: "SOR_001",
      setCode: "SOR",
      cardNumber: "001",
      name: "Carta uno",
      ownedCount: 3
    },
    {
      cardId: "LAW_038",
      setCode: "LAW",
      cardNumber: "038",
      ownedCount: 2
    }
  ];

  const favoriteDecks = [
    favorite("11111111-1111-4111-8111-111111111111", "Primero", "2026-08-10T10:00:00.000Z", [
      { id: "SOR_001", count: 2 },
      { id: "LAW_038", count: 1 }
    ]),
    favorite("22222222-2222-4222-8222-222222222222", "Segundo", "2026-08-10T11:00:00.000Z", [
      { id: "SOR_001", count: 2 }
    ])
  ];

  it("guarda copias totales y libres descontando las usadas en favoritos", () => {
    const rows = buildCloudCollectionRows(collection, favoriteDecks);

    expect(rows.find((row) => row.card_id === "SOR_001")).toMatchObject({
      owned_count: 3,
      free_count: 0
    });
    expect(rows.find((row) => row.card_id === "LAW_038")).toMatchObject({
      owned_count: 2,
      free_count: 1
    });
  });

  it("no acepta desde el navegador un número de copias libres al reemplazar la colección", () => {
    expect(buildCloudCollectionWriteRows(collection)).toEqual([
      {
        card_id: "SOR_001",
        set_code: "SOR",
        card_number: "001",
        name: "Carta uno",
        owned_count: 3
      },
      {
        card_id: "LAW_038",
        set_code: "LAW",
        card_number: "038",
        name: null,
        owned_count: 2
      }
    ]);
  });

  it("convierte colección y favoritos de ida y vuelta sin perder sus campos", () => {
    const collectionRows = buildCloudCollectionRows(collection, favoriteDecks);
    const deckRows = buildCloudFavoriteDeckRows(favoriteDecks);

    expect(parseCloudCollectionRows(collectionRows)).toEqual(collection);
    expect(parseCloudFavoriteDeckRows(deckRows)).toEqual(favoriteDecks);
  });

  it("acepta las fechas con desplazamiento horario que devuelve PostgreSQL", () => {
    const [row] = buildCloudFavoriteDeckRows(favoriteDecks);
    const parsed = parseCloudFavoriteDeckRows([
      {
        ...row,
        created_at: "2026-08-10T12:00:00+02:00",
        updated_at: "2026-08-10T12:00:00+02:00"
      }
    ]);

    expect(parsed[0].createdAt).toBe("2026-08-10T10:00:00.000Z");
  });

  it("crea un registro de importación válido al recuperar la nube", () => {
    const result = buildRemoteImportResult(collection, "2026-08-11T08:00:00.000Z");

    expect(result.source).toBe("remote");
    expect(result.cardsRecognized).toBe(2);
    expect(result.totalCopies).toBe(5);
    expect(result.setsFound).toEqual(["LAW", "SOR"]);
  });

  it("rechaza una copia libre mayor que las copias poseídas", () => {
    expect(() =>
      parseCloudCollectionRows([
        {
          card_id: "SOR_001",
          set_code: "SOR",
          card_number: "001",
          name: null,
          owned_count: 1,
          free_count: 2
        }
      ])
    ).toThrow();
  });
});

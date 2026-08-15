import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudCollectionRow } from "@/lib/cloudSyncData";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  range: vi.fn(),
  rpc: vi.fn()
}));

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    rpc: mocks.rpc
  }
}));

import {
  addCloudCollectionCard,
  loadCloudDataSnapshot,
  mountCloudFavoriteDeck,
  prioritizeCloudFavoriteDeckCard,
  unmountCloudFavoriteDeck
} from "@/lib/cloudSyncRepository";

function buildLargeCollection(): CloudCollectionRow[] {
  return Array.from({ length: 2_255 }, (_, index) => {
    const setCode = index < 2_000 ? `S${String(Math.floor(index / 250)).padStart(2, "0")}` : "SEC";
    const cardNumber = String(index < 2_000 ? (index % 250) + 1 : index - 1_999).padStart(3, "0");

    return {
      card_id: `${setCode}_${cardNumber}`,
      set_code: setCode,
      card_number: cardNumber,
      name: null,
      owned_count: 1,
      free_count: 1
    };
  });
}

function configureSupabase(collectionRows: CloudCollectionRow[]) {
  const collectionQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    range: mocks.range
  };
  collectionQuery.select.mockReturnValue(collectionQuery);
  collectionQuery.eq.mockReturnValue(collectionQuery);
  collectionQuery.order.mockReturnValue(collectionQuery);

  const decksQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn()
  };
  decksQuery.select.mockReturnValue(decksQuery);
  decksQuery.eq.mockReturnValue(decksQuery);
  decksQuery.order.mockResolvedValue({ data: [], error: null });

  const stateQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn()
  };
  stateQuery.select.mockReturnValue(stateQuery);
  stateQuery.eq.mockReturnValue(stateQuery);
  stateQuery.maybeSingle.mockResolvedValue({ data: null, error: null });

  mocks.range.mockImplementation(async (from: number, to: number) => ({
    data: collectionRows.slice(from, to + 1),
    error: null
  }));
  mocks.from.mockImplementation((table: string) => {
    if (table === "collection_cards") return collectionQuery;
    if (table === "favorite_decks") return decksQuery;
    if (table === "user_sync_state") return stateQuery;
    throw new Error(`Tabla inesperada en la prueba: ${table}`);
  });
}

describe("repositorio de datos de cuenta", () => {
  beforeEach(() => {
    mocks.getUser.mockReset().mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null
    });
    mocks.from.mockReset();
    mocks.range.mockReset();
    mocks.rpc.mockReset();
  });

  it("recupera una colección de más de 2.000 cartas sin truncar las cartas SEC", async () => {
    const collectionRows = buildLargeCollection();
    configureSupabase(collectionRows);

    const snapshot = await loadCloudDataSnapshot();

    expect(snapshot.collection).toHaveLength(2_255);
    expect(snapshot.collection[2_254]).toMatchObject({
      cardId: "SEC_255",
      setCode: "SEC",
      cardNumber: "255",
      ownedCount: 1
    });
    expect(mocks.range.mock.calls).toEqual([
      [0, 999],
      [1_000, 1_999],
      [2_000, 2_999]
    ]);
  });

  it("monta, prioriza una carta y desmonta mediante funciones atómicas", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: "2026-08-14T10:00:00.000Z", error: null })
      .mockResolvedValueOnce({ data: "2026-08-14T10:00:30.000Z", error: null })
      .mockResolvedValueOnce({ data: "2026-08-14T10:01:00.000Z", error: null });

    await expect(mountCloudFavoriteDeck("11111111-1111-4111-8111-111111111111")).resolves.toBe(
      "2026-08-14T10:00:00.000Z"
    );
    await expect(
      prioritizeCloudFavoriteDeckCard("11111111-1111-4111-8111-111111111111", "SEC_041")
    ).resolves.toBe("2026-08-14T10:00:30.000Z");

    await expect(unmountCloudFavoriteDeck("11111111-1111-4111-8111-111111111111")).resolves.toBe(
      "2026-08-14T10:01:00.000Z"
    );

    expect(mocks.rpc.mock.calls).toEqual([
      ["mount_my_favorite_deck", { p_id: "11111111-1111-4111-8111-111111111111" }],
      [
        "prioritize_my_mounted_deck_card",
        { p_id: "11111111-1111-4111-8111-111111111111", p_card_id: "SEC_041" }
      ],
      ["unmount_my_favorite_deck", { p_id: "11111111-1111-4111-8111-111111111111" }]
    ]);
  });

  it("añade copias a una carta mediante la función atómica de Supabase", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 4, error: null });

    await expect(
      addCloudCollectionCard(
        {
          cardId: "ASH_132",
          setCode: "ASH",
          cardNumber: "132",
          name: "Queen Soruna, Willing to Fight"
        },
        2
      )
    ).resolves.toBe(4);

    expect(mocks.rpc).toHaveBeenCalledWith("add_my_collection_card", {
      p_card_id: "ASH_132",
      p_set_code: "ASH",
      p_card_number: "132",
      p_name: "Queen Soruna, Willing to Fight",
      p_quantity: 2
    });
  });
});

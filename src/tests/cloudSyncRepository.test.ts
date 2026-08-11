import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudCollectionRow } from "@/lib/cloudSyncData";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  range: vi.fn()
}));

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    rpc: vi.fn()
  }
}));

import { loadCloudDataSnapshot } from "@/lib/cloudSyncRepository";

function buildLargeCollection(): CloudCollectionRow[] {
  return Array.from({ length: 2_255 }, (_, index) => {
    const setCode = index < 2_000 ? `S${String(Math.floor(index / 250)).padStart(2, "0")}` : "SEC";
    const cardNumber = String(index < 2_000 ? (index % 250) + 1 : index - 1_999).padStart(
      3,
      "0"
    );

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
});

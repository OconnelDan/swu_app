import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/db";
import type { CloudDataSnapshot } from "@/lib/cloudSyncRepository";
import { normalizeDeckJson } from "@/lib/normalizeDeckJson";
import type { CollectionCard, CollectionImportResult } from "@/types/collection";

const mocks = vi.hoisted(() => ({
  auth: {
    session: null as { user: { id: string } } | null,
    loading: false
  },
  loadCloudDataSnapshot: vi.fn(),
  replaceCloudCollection: vi.fn(),
  upsertCloudFavoriteDeck: vi.fn(),
  deleteCloudFavoriteDeck: vi.fn(),
  mountCloudFavoriteDeck: vi.fn(),
  prioritizeCloudFavoriteDeckCard: vi.fn(),
  unmountCloudFavoriteDeck: vi.fn()
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mocks.auth
}));

vi.mock("@/lib/cloudSyncRepository", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/cloudSyncRepository")>();
  return {
    ...original,
    loadCloudDataSnapshot: mocks.loadCloudDataSnapshot,
    replaceCloudCollection: mocks.replaceCloudCollection,
    upsertCloudFavoriteDeck: mocks.upsertCloudFavoriteDeck,
    deleteCloudFavoriteDeck: mocks.deleteCloudFavoriteDeck,
    mountCloudFavoriteDeck: mocks.mountCloudFavoriteDeck,
    prioritizeCloudFavoriteDeckCard: mocks.prioritizeCloudFavoriteDeckCard,
    unmountCloudFavoriteDeck: mocks.unmountCloudFavoriteDeck
  };
});

import { useDataSource } from "@/contexts/DataSourceContext";
import { DataSourceProvider } from "@/contexts/DataSourceProvider";

const localCard: CollectionCard = {
  cardId: "SOR_001",
  setCode: "SOR",
  cardNumber: "001",
  name: "Carta local",
  ownedCount: 1
};

const cloudCard: CollectionCard = {
  cardId: "LAW_038",
  setCode: "LAW",
  cardNumber: "038",
  name: "Carta de la cuenta",
  ownedCount: 4
};

function importResult(cards: CollectionCard[]): CollectionImportResult {
  return {
    source: "json",
    importedAt: "2026-08-11T10:00:00.000Z",
    rowsProcessed: cards.length,
    cardsRecognized: cards.length,
    rowsIgnored: 0,
    invalidValues: 0,
    totalCopies: cards.reduce((sum, card) => sum + card.ownedCount, 0),
    setsFound: [...new Set(cards.map((card) => card.setCode))],
    warnings: [],
    cards
  };
}

function snapshot(
  collection: CollectionCard[],
  favoriteDecks: CloudDataSnapshot["favoriteDecks"] = []
): CloudDataSnapshot {
  return {
    userId: "user-1",
    hasCloudData: collection.length > 0 || favoriteDecks.length > 0,
    updatedAt: "2026-08-11T10:00:00.000Z",
    collection,
    favoriteDecks
  };
}

function Probe() {
  const data = useDataSource();

  return (
    <div>
      <p data-testid="mode">{data.mode}</p>
      <p data-testid="cards">
        {data.collection?.cards.map((card) => card.cardId).join(",") ?? "cargando"}
      </p>
      <p data-testid="favorites">{data.favorites?.length ?? "cargando"}</p>
      <p data-testid="mounted">
        {data.favorites?.filter((deck) => deck.isMounted).length ?? "cargando"}
      </p>
      <button
        type="button"
        onClick={() => void data.replaceCollection([cloudCard], importResult([cloudCard]))}
      >
        reemplazar
      </button>
      <button
        type="button"
        onClick={() =>
          void data.saveFavoriteDeck(
            normalizeDeckJson({ name: "Mazo de cuenta", deck: [{ id: "LAW_038", count: 2 }] })
          )
        }
      >
        guardar mazo
      </button>
      <button
        type="button"
        onClick={() => {
          const favoriteId = data.favorites?.[0]?.id;
          if (favoriteId) void data.mountFavoriteDeck(favoriteId);
        }}
      >
        montar mazo
      </button>
      <button
        type="button"
        onClick={() => {
          const favoriteId = data.favorites?.[0]?.id;
          if (favoriteId) void data.unmountFavoriteDeck(favoriteId);
        }}
      >
        desmontar mazo
      </button>
      <button
        type="button"
        onClick={() => {
          const favoriteId = data.favorites?.[0]?.id;
          if (favoriteId) void data.prioritizeFavoriteDeckCard(favoriteId, "LAW_038");
        }}
      >
        mover carta
      </button>
    </div>
  );
}

describe("origen de datos según la sesión", () => {
  beforeEach(async () => {
    mocks.auth.session = null;
    mocks.auth.loading = false;
    mocks.loadCloudDataSnapshot.mockReset();
    mocks.replaceCloudCollection.mockReset().mockResolvedValue("2026-08-11T10:01:00.000Z");
    mocks.upsertCloudFavoriteDeck.mockReset().mockResolvedValue("2026-08-11T10:02:00.000Z");
    mocks.deleteCloudFavoriteDeck.mockReset();
    mocks.mountCloudFavoriteDeck.mockReset().mockResolvedValue("2026-08-11T10:03:00.000Z");
    mocks.prioritizeCloudFavoriteDeckCard.mockReset().mockResolvedValue("2026-08-11T10:03:30.000Z");
    mocks.unmountCloudFavoriteDeck.mockReset().mockResolvedValue("2026-08-11T10:04:00.000Z");
    await db.collectionEntries.clear();
    await db.collectionImports.clear();
    await db.favoriteDecks.clear();
  });

  it("mantiene IndexedDB como única persistencia para un invitado", async () => {
    await db.collectionEntries.put(localCard);

    render(
      <DataSourceProvider>
        <Probe />
      </DataSourceProvider>
    );

    await waitFor(() => expect(screen.getByTestId("cards")).toHaveTextContent("SOR_001"));
    expect(screen.getByTestId("mode")).toHaveTextContent("guest");
    expect(mocks.loadCloudDataSnapshot).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "reemplazar" }));
    await waitFor(() => expect(screen.getByTestId("cards")).toHaveTextContent("LAW_038"));

    expect(await db.collectionEntries.toArray()).toEqual([cloudCard]);
    expect(mocks.replaceCloudCollection).not.toHaveBeenCalled();
  });

  it("con una cuenta usa Supabase aunque IndexedDB contenga otra colección", async () => {
    await db.collectionEntries.put(localCard);
    const collectionRead = vi.spyOn(db.collectionEntries, "toArray");
    const favoritesRead = vi.spyOn(db.favoriteDecks, "orderBy");
    mocks.auth.session = { user: { id: "user-1" } };
    mocks.loadCloudDataSnapshot.mockResolvedValue(snapshot([cloudCard]));

    render(
      <DataSourceProvider>
        <Probe />
      </DataSourceProvider>
    );

    await waitFor(() => expect(screen.getByTestId("cards")).toHaveTextContent("LAW_038"));
    expect(screen.getByTestId("cards")).not.toHaveTextContent("SOR_001");
    expect(screen.getByTestId("mode")).toHaveTextContent("account");
    expect(collectionRead).not.toHaveBeenCalled();
    expect(favoritesRead).not.toHaveBeenCalled();
    collectionRead.mockRestore();
    favoritesRead.mockRestore();
    expect(await db.collectionEntries.get(localCard.cardId)).toEqual(localCard);
  });

  it("recupera la colección de la cuenta en un navegador sin datos locales", async () => {
    mocks.auth.session = { user: { id: "user-1" } };
    mocks.loadCloudDataSnapshot.mockResolvedValue(snapshot([cloudCard]));

    render(
      <DataSourceProvider>
        <Probe />
      </DataSourceProvider>
    );

    await waitFor(() => expect(screen.getByTestId("cards")).toHaveTextContent("LAW_038"));
    expect(await db.collectionEntries.count()).toBe(0);
  });

  it("actualiza colección y mazos directamente en Supabase sin escribirlos en IndexedDB", async () => {
    mocks.auth.session = { user: { id: "user-1" } };
    const deck = normalizeDeckJson({
      name: "Mazo de cuenta",
      deck: [{ id: "LAW_038", count: 2 }]
    });
    const accountFavorite = {
      id: "11111111-1111-4111-8111-111111111111",
      name: deck.name,
      originalJson: deck.originalJson,
      normalizedDeck: deck,
      createdAt: "2026-08-11T10:02:00.000Z",
      updatedAt: "2026-08-11T10:02:00.000Z",
      isMounted: false
    };

    mocks.loadCloudDataSnapshot
      .mockResolvedValueOnce(snapshot([]))
      .mockResolvedValueOnce(snapshot([cloudCard]))
      .mockResolvedValueOnce(snapshot([cloudCard], [accountFavorite]));

    render(
      <DataSourceProvider>
        <Probe />
      </DataSourceProvider>
    );

    await waitFor(() => expect(screen.getByTestId("cards")).toHaveTextContent(""));
    fireEvent.click(screen.getByRole("button", { name: "reemplazar" }));
    await waitFor(() => expect(mocks.replaceCloudCollection).toHaveBeenCalledWith([cloudCard]));
    await waitFor(() => expect(screen.getByTestId("cards")).toHaveTextContent("LAW_038"));

    fireEvent.click(screen.getByRole("button", { name: "guardar mazo" }));
    await waitFor(() => expect(mocks.upsertCloudFavoriteDeck).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("favorites")).toHaveTextContent("1"));

    expect(await db.collectionEntries.count()).toBe(0);
    expect(await db.favoriteDecks.count()).toBe(0);
  });

  it("monta y desmonta el mazo de una cuenta sin utilizar IndexedDB", async () => {
    mocks.auth.session = { user: { id: "user-1" } };
    const deck = normalizeDeckJson({
      name: "Mazo de cuenta",
      deck: [{ id: "LAW_038", count: 2 }]
    });
    const favorite = {
      id: "11111111-1111-4111-8111-111111111111",
      name: deck.name,
      originalJson: deck.originalJson,
      normalizedDeck: deck,
      createdAt: "2026-08-11T10:02:00.000Z",
      updatedAt: "2026-08-11T10:02:00.000Z",
      isMounted: false
    };
    const mounted = {
      ...favorite,
      isMounted: true,
      mountedAt: "2026-08-11T10:03:00.000Z",
      allocationPriority: 1
    };
    const prioritized = {
      ...mounted,
      preferredCardIds: ["LAW_038"]
    };

    mocks.loadCloudDataSnapshot
      .mockResolvedValueOnce(snapshot([cloudCard], [favorite]))
      .mockResolvedValueOnce(snapshot([cloudCard], [mounted]))
      .mockResolvedValueOnce(snapshot([cloudCard], [prioritized]))
      .mockResolvedValueOnce(snapshot([cloudCard], [favorite]));

    render(
      <DataSourceProvider>
        <Probe />
      </DataSourceProvider>
    );

    await waitFor(() => expect(screen.getByTestId("favorites")).toHaveTextContent("1"));
    fireEvent.click(screen.getByRole("button", { name: "montar mazo" }));
    await waitFor(() => expect(mocks.mountCloudFavoriteDeck).toHaveBeenCalledWith(favorite.id));
    await waitFor(() => expect(screen.getByTestId("mounted")).toHaveTextContent("1"));

    fireEvent.click(screen.getByRole("button", { name: "mover carta" }));
    await waitFor(() =>
      expect(mocks.prioritizeCloudFavoriteDeckCard).toHaveBeenCalledWith(favorite.id, "LAW_038")
    );

    fireEvent.click(screen.getByRole("button", { name: "desmontar mazo" }));
    await waitFor(() => expect(mocks.unmountCloudFavoriteDeck).toHaveBeenCalledWith(favorite.id));
    await waitFor(() => expect(screen.getByTestId("mounted")).toHaveTextContent("0"));
    expect(await db.favoriteDecks.count()).toBe(0);
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataSourceContext, type DataSourceValue } from "@/contexts/DataSourceContext";
import { compareDeckWithCollection } from "@/lib/compareDeckWithCollection";
import { normalizeDeckJson } from "@/lib/normalizeDeckJson";
import { FavoritesPage } from "@/pages/FavoritesPage";
import { MountedDecksPage } from "@/pages/MountedDecksPage";
import { ResultPage } from "@/pages/ResultPage";
import type { CollectionCard } from "@/types/collection";
import type { FavoriteDeck } from "@/types/deck";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ session: null, loading: false })
}));

function savedDeck(
  id: string,
  name: string,
  requiredCount: number,
  isMounted: boolean,
  allocationPriority?: number
): FavoriteDeck {
  const normalizedDeck = normalizeDeckJson({
    name,
    deck: [{ id: "SOR_001", count: requiredCount }]
  });
  return {
    id,
    name,
    originalJson: normalizedDeck.originalJson,
    normalizedDeck,
    createdAt: "2026-08-14T10:00:00.000Z",
    updatedAt: "2026-08-14T10:00:00.000Z",
    isMounted,
    mountedAt: isMounted ? "2026-08-14T10:00:00.000Z" : undefined,
    allocationPriority: isMounted ? allocationPriority : undefined
  };
}

function dataSource(
  favorites: FavoriteDeck[],
  collectionCards: CollectionCard[],
  overrides: Partial<DataSourceValue> = {}
): DataSourceValue {
  return {
    mode: "guest",
    collection: {
      cards: collectionCards,
      differentCards: collectionCards.length,
      totalCopies: collectionCards.reduce((total, card) => total + card.ownedCount, 0),
      fingerprint: "collection-fingerprint",
      isEmpty: collectionCards.length === 0
    },
    favorites,
    accountUpdatedAt: null,
    hasAccountData: false,
    error: null,
    refreshing: false,
    refresh: vi.fn(),
    replaceCollection: vi.fn(),
    addCollectionCard: vi.fn(),
    saveFavoriteDeck: vi.fn(),
    updateFavoriteResult: vi.fn(),
    renameFavoriteDeck: vi.fn(),
    deleteFavoriteDeck: vi.fn(),
    duplicateFavoriteDeck: vi.fn(),
    mountFavoriteDeck: vi.fn(),
    unmountFavoriteDeck: vi.fn(),
    prioritizeFavoriteDeckCard: vi.fn(),
    ...overrides
  };
}

const collection: CollectionCard[] = [
  {
    cardId: "SOR_001",
    setCode: "SOR",
    cardNumber: "001",
    ownedCount: 2
  }
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Favoritos y mazos montados", () => {
  it("un favorito no consume cartas y puede montarse de forma explícita", async () => {
    const idea = savedDeck("idea", "Idea para probar", 2, false);
    const alreadyMounted = savedDeck("mounted", "Mazo físico", 1, true, 1);
    const mountFavoriteDeck = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <DataSourceContext.Provider
        value={dataSource([idea, alreadyMounted], collection, { mountFavoriteDeck })}
      >
        <MemoryRouter initialEntries={["/favoritos"]}>
          <Routes>
            <Route path="/favoritos" element={<FavoritesPage onOpenResult={vi.fn()} />} />
            <Route path="/montados" element={<p>Página de montados</p>} />
          </Routes>
        </MemoryRouter>
      </DataSourceContext.Provider>
    );

    expect(screen.getByText("Idea para probar")).toBeInTheDocument();
    expect(screen.queryByText("Mazo físico")).not.toBeInTheDocument();
    expect(screen.getByText(/No reservan ninguna carta/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Favoritos (1)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Montados (1)" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Montar mazo" }));

    await waitFor(() => expect(mountFavoriteDeck).toHaveBeenCalledWith("idea"));
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("No se quitarán cartas automáticamente a otros mazos")
    );
    expect(await screen.findByText("Página de montados")).toBeInTheDocument();
  });

  it("muestra el reparto físico y permite desmontar sin borrar el mazo", async () => {
    const first = savedDeck("first", "Primero", 2, true, 1);
    const second = savedDeck("second", "Segundo", 2, true, 2);
    const unmountFavoriteDeck = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <DataSourceContext.Provider
        value={dataSource([first, second], collection, { unmountFavoriteDeck })}
      >
        <MemoryRouter>
          <MountedDecksPage onOpenResult={vi.fn()} />
        </MemoryRouter>
      </DataSourceContext.Provider>
    );

    expect(screen.getByText("Primero")).toBeInTheDocument();
    expect(screen.getByText("Segundo")).toBeInTheDocument();
    expect(screen.getByText("Montado completo")).toBeInTheDocument();
    expect(screen.getByText("Montado incompleto")).toBeInTheDocument();
    expect(screen.getByText("0/2")).toBeInTheDocument();

    const unmountButtons = screen.getAllByRole("button", { name: "Desmontar mazo" });
    fireEvent.click(unmountButtons[1]);

    await waitFor(() => expect(unmountFavoriteDeck).toHaveBeenCalledWith("second"));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("volverá a Favoritos"));
  });

  it("permite montar el favorito sin salir de su pantalla de resultado", async () => {
    const idea = savedDeck("idea", "Idea abierta", 2, false);
    const alreadyMounted = savedDeck("mounted", "Mazo físico", 1, true, 1);
    const mountFavoriteDeck = vi.fn().mockResolvedValue(undefined);
    const result = compareDeckWithCollection(idea.normalizedDeck, collection);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    });

    render(
      <DataSourceContext.Provider
        value={dataSource([idea, alreadyMounted], collection, { mountFavoriteDeck })}
      >
        <MemoryRouter>
          <ResultPage deck={idea.normalizedDeck} result={result} favoriteId={idea.id} />
        </MemoryRouter>
      </DataSourceContext.Provider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Montar mazo" }));

    await waitFor(() => expect(mountFavoriteDeck).toHaveBeenCalledWith("idea"));
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("1 copia(s) están en otros mazos montados")
    );
    expect(screen.getByRole("button", { name: "Mazo montado" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("ya está en Mazos montados");
  });

  it("muestra un botón en la carta trasladable y confirma sus mazos de origen", async () => {
    const transferCollection: CollectionCard[] = [{ ...collection[0], ownedCount: 3 }];
    const first = savedDeck("first", "Mazo A", 2, true, 1);
    const second = savedDeck("second", "Mazo B", 1, true, 2);
    const target = savedDeck("target", "Mazo objetivo", 3, true, 3);
    const prioritizeFavoriteDeckCard = vi.fn().mockResolvedValue(undefined);
    const result = compareDeckWithCollection(target.normalizedDeck, transferCollection);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    });

    render(
      <DataSourceContext.Provider
        value={dataSource([first, second, target], transferCollection, {
          prioritizeFavoriteDeckCard
        })}
      >
        <MemoryRouter>
          <ResultPage deck={target.normalizedDeck} result={result} favoriteId={target.id} />
        </MemoryRouter>
      </DataSourceContext.Provider>
    );

    expect(screen.getAllByText("Faltan 3").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Mover cartas a este mazo" })[0]);

    await waitFor(() =>
      expect(prioritizeFavoriteDeckCard).toHaveBeenCalledWith("target", "SOR_001")
    );
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("2× SOR_001 desde «Mazo A»")
    );
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("1× SOR_001 desde «Mazo B»")
    );
  });
});

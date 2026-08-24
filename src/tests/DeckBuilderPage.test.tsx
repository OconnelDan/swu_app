import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataSourceContext, type DataSourceValue } from "@/contexts/DataSourceContext";
import { DeckBuilderPage } from "@/pages/DeckBuilderPage";
import { SwUnlimitedDbCardProvider } from "@/providers/cardProvider/SwUnlimitedDbCardProvider";
import type { CardInfo } from "@/types/card";

const catalogCards: CardInfo[] = [
  {
    cardId: "SOR_100",
    setCode: "SOR",
    cardNumber: "100",
    name: "Carta antigua",
    type: "Unit",
    cardKey: "old-card"
  },
  {
    cardId: "SEC_100",
    setCode: "SEC",
    cardNumber: "100",
    name: "Carta vigente",
    type: "Unit",
    cardKey: "current-card"
  }
];

function dataSource(): DataSourceValue {
  return {
    mode: "guest",
    collection: {
      cards: [],
      differentCards: 0,
      totalCopies: 0,
      fingerprint: "empty",
      isEmpty: true
    },
    favorites: [],
    accountUpdatedAt: null,
    hasAccountData: false,
    error: null,
    refreshing: false,
    refresh: vi.fn(),
    replaceCollection: vi.fn(),
    addCollectionCard: vi.fn(),
    removeCollectionCard: vi.fn(),
    saveFavoriteDeck: vi.fn(),
    updateFavoriteResult: vi.fn(),
    renameFavoriteDeck: vi.fn(),
    deleteFavoriteDeck: vi.fn(),
    duplicateFavoriteDeck: vi.fn(),
    mountFavoriteDeck: vi.fn(),
    unmountFavoriteDeck: vi.fn(),
    prioritizeFavoriteDeckCard: vi.fn()
  };
}

function renderBuilder() {
  render(
    <DataSourceContext.Provider value={dataSource()}>
      <MemoryRouter>
        <DeckBuilderPage />
      </MemoryRouter>
    </DataSourceContext.Provider>
  );
}

beforeEach(() => {
  vi.spyOn(SwUnlimitedDbCardProvider.prototype, "getAllCards").mockResolvedValue(catalogCards);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("constructor por formatos", () => {
  it("pide el formato primero y adapta Twin Suns a dos líderes y 80 cartas", async () => {
    renderBuilder();

    expect(screen.getByText("Elige el formato del nuevo mazo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Premier/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Eternal/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Twin Suns/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Trilogy/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Twin Suns/ }));

    expect(await screen.findByText("Crear mazo · Twin Suns")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1. Líderes 0/2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3. Cartas 0/80" })).toBeInTheDocument();
    expect(screen.queryByText("Banquillo")).not.toBeInTheDocument();
  });

  it("permite elegir la reserva Eternal de Trilogy y crea sus tres mazos", async () => {
    renderBuilder();

    fireEvent.click(screen.getByRole("button", { name: /Trilogy/ }));
    expect(screen.getByText("¿Qué reserva de cartas usará Trilogy?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Trilogy · Eternal/ }));

    expect(await screen.findByText("Crear mazo · Trilogy · Eternal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mazo 1 · 0/50" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mazo 2 · 0/50" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mazo 3 · 0/50" })).toBeInTheDocument();
  });

  it("muestra una carta rotada en Premier, explica el motivo y la desactiva", async () => {
    renderBuilder();

    fireEvent.click(screen.getByRole("button", { name: /Premier/ }));
    expect(await screen.findByText("Crear mazo · Premier")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "3. Cartas 0/50" }));

    expect(screen.getByText("Carta antigua")).toBeInTheDocument();
    expect(screen.getByText(/SOR ha rotado de Premier/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Añadir Carta antigua al mazo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Añadir Carta vigente al mazo" })).toBeEnabled();
  });
});

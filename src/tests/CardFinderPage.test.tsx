import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataSourceContext, type DataSourceValue } from "@/contexts/DataSourceContext";
import { CardFinderPage } from "@/pages/CardFinderPage";
import { SwUnlimitedDbCardProvider } from "@/providers/cardProvider/SwUnlimitedDbCardProvider";
import type { CardInfo } from "@/types/card";

vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({
    settings: { theme: "dark", showImages: true, cardProvider: "local" },
    loaded: true,
    updateSetting: vi.fn()
  })
}));

const card: CardInfo = {
  cardId: "SEC_101",
  setCode: "SEC",
  cardNumber: "101",
  name: "Detailed Rebel Unit",
  localizedName: "Unidad rebelde detallada",
  type: "Unit",
  rarity: "Uncommon",
  imageUrl: "https://example.invalid/sec-101.png",
  setName: "Secretos del poder",
  cost: 2,
  aspects: ["Vigilance", "Heroism"],
  traits: ["Rebel"],
  arena: "Ground",
  localizedText: "Centinela. Cuando se juegue: cura 1 de daño de una unidad.",
  power: 2,
  hp: 4,
  keywords: ["Sentinel"]
};

function dataSource(
  removeCollectionCard: DataSourceValue["removeCollectionCard"]
): DataSourceValue {
  return {
    mode: "guest",
    collection: {
      cards: [{ cardId: card.cardId, setCode: "SEC", cardNumber: "101", ownedCount: 2 }],
      differentCards: 1,
      totalCopies: 2,
      fingerprint: "finder-test",
      isEmpty: false
    },
    favorites: [],
    accountUpdatedAt: null,
    hasAccountData: false,
    error: null,
    refreshing: false,
    refresh: vi.fn(),
    replaceCollection: vi.fn(),
    addCollectionCard: vi.fn(),
    removeCollectionCard,
    saveFavoriteDeck: vi.fn(),
    updateFavoriteDeck: vi.fn(),
    updateFavoriteResult: vi.fn(),
    renameFavoriteDeck: vi.fn(),
    deleteFavoriteDeck: vi.fn(),
    duplicateFavoriteDeck: vi.fn(),
    mountFavoriteDeck: vi.fn(),
    unmountFavoriteDeck: vi.fn(),
    prioritizeFavoriteDeckCard: vi.fn()
  };
}

beforeEach(() => {
  vi.spyOn(SwUnlimitedDbCardProvider.prototype, "getAllCards").mockResolvedValue([card]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ficha de carta en Buscar", () => {
  it("muestra los datos traducidos y conserva el control para restar una copia", async () => {
    const removeCollectionCard = vi.fn().mockResolvedValue(1);
    render(
      <DataSourceContext.Provider value={dataSource(removeCollectionCard)}>
        <CardFinderPage />
      </DataSourceContext.Provider>
    );

    fireEvent.change(await screen.findByRole("textbox", { name: "Buscar carta" }), {
      target: { value: "Unidad rebelde" }
    });
    fireEvent.click(await screen.findByRole("button", { name: /SEC_101/i }));

    const dialog = screen.getByRole("dialog", { name: "Unidad rebelde detallada" });
    expect(within(dialog).getByText("Detailed Rebel Unit")).toBeInTheDocument();
    expect(within(dialog).getByText(/Cuando se juegue: cura 1 de daño/i)).toBeInTheDocument();
    expect(within(dialog).getByText("Vigilancia, Heroísmo")).toBeInTheDocument();
    expect(within(dialog).getByText("Centinela")).toBeInTheDocument();
    expect(within(dialog).getByText("Secretos del poder")).toBeInTheDocument();
    const ownedSummary = within(dialog).getByText("Tienes").closest("div");
    expect(ownedSummary).not.toBeNull();
    expect(within(ownedSummary!).getByText("2")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Restar una copia" }));
    await waitFor(() => expect(removeCollectionCard).toHaveBeenCalledWith("SEC_101", 1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Ahora tienes 1");
  });
});

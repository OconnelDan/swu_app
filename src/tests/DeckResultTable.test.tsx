import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeckResultTable } from "@/components/DeckResultTable";
import { buildDeckDisplayRows } from "@/lib/deckResultOrder";
import { SwUnlimitedDbCardProvider } from "@/providers/cardProvider/SwUnlimitedDbCardProvider";
import type { CardInfo } from "@/types/card";
import type { CardComparison } from "@/types/deck";

vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({
    settings: { theme: "dark", showImages: true, cardProvider: "local" },
    loaded: true,
    updateSetting: vi.fn()
  })
}));

const cardmarketPriceMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cardmarketPrice", () => ({
  getCardmarketPrice: cardmarketPriceMock
}));

beforeEach(() => {
  cardmarketPriceMock.mockResolvedValue({
    cardId: "SEC_101",
    productId: 853880,
    lowPrice: 0.25,
    currency: "EUR",
    updatedAt: "2026-10-20T02:45:11+0200",
    productUrl: "https://www.cardmarket.com/StarWarsUnlimited/Products?idProduct=853880"
  });
});

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

const comparison: CardComparison = {
  cardId: card.cardId,
  cardName: card.localizedName,
  imageUrl: card.imageUrl,
  requiredCount: 3,
  ownedCount: 2,
  missingCount: 1,
  surplusCount: 0,
  zones: ["main"],
  zoneCounts: { main: 3 },
  status: "missing"
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ficha de carta en el resultado de comprobar un mazo", () => {
  it("muestra el precio y el enlace de Cardmarket para las cartas faltantes", async () => {
    render(<DeckResultTable comparisons={[comparison]} showAll={false} />);

    const links = await screen.findAllByRole("link", {
      name: /Desde 0,25\s*€ en Cardmarket para SEC_101/i
    });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute(
      "href",
      "https://www.cardmarket.com/StarWarsUnlimited/Products?idProduct=853880"
    );
    expect(links[0]).toHaveAttribute("target", "_blank");
  });

  it("sustituye el zoom temporal por el modal informativo sin controles de colección", async () => {
    vi.spyOn(SwUnlimitedDbCardProvider.prototype, "getCard").mockResolvedValue(card);
    render(<DeckResultTable comparisons={[comparison]} showAll />);

    const detailButtons = screen.getAllByRole("button", {
      name: "Ver información de Unidad rebelde detallada"
    });
    expect(detailButtons).toHaveLength(2);

    // El segundo botón corresponde a la tarjeta usada en la vista móvil.
    fireEvent.click(detailButtons[1]);

    const dialog = await screen.findByRole("dialog", { name: "Unidad rebelde detallada" });
    await waitFor(() =>
      expect(within(dialog).getByText("Detailed Rebel Unit")).toBeInTheDocument()
    );
    expect(within(dialog).getByText(/Cuando se juegue: cura 1 de daño/i)).toBeInTheDocument();
    expect(within(dialog).getByText("Vigilancia, Heroísmo")).toBeInTheDocument();
    expect(within(dialog).getByText("Centinela")).toBeInTheDocument();
    expect(within(dialog).getByText("Secretos del poder")).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Restar una copia" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cerrar vista ampliada de la carta" })
    ).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar detalles de la carta" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ordena el mazo principal por coste y deja el banquillo al final", () => {
    const rows: CardComparison[] = [
      { ...comparison, cardId: "SOR_004", cardName: "Coste cuatro", cost: 4 },
      { ...comparison, cardId: "SOR_001", cardName: "Coste uno", cost: 1 },
      {
        ...comparison,
        cardId: "SOR_102",
        cardName: "Banquillo dos",
        cost: 2,
        zones: ["sideboard"],
        zoneCounts: { sideboard: 3 }
      },
      {
        ...comparison,
        cardId: "SOR_100",
        cardName: "Banquillo cero",
        cost: 0,
        zones: ["sideboard"],
        zoneCounts: { sideboard: 3 }
      }
    ];

    expect(buildDeckDisplayRows(rows).map((row) => row.rowKey)).toEqual([
      "SOR_001:main",
      "SOR_004:main",
      "SOR_100:sideboard",
      "SOR_102:sideboard"
    ]);
  });

  it("separa una carta compartida entre mazo principal y banquillo", () => {
    const rows = buildDeckDisplayRows([
      {
        ...comparison,
        requiredCount: 3,
        ownedCount: 2,
        assignedCount: 2,
        zones: ["main", "sideboard"],
        zoneCounts: { main: 2, sideboard: 1 }
      }
    ]);

    expect(rows).toMatchObject([
      { displayZone: "main", requiredCount: 2, assignedCount: 2, missingCount: 0 },
      { displayZone: "sideboard", requiredCount: 1, assignedCount: 0, missingCount: 1 }
    ]);
  });
});

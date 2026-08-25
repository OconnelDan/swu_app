import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeckResultTable } from "@/components/DeckResultTable";
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
});

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataSourceContext, type DataSourceValue } from "@/contexts/DataSourceContext";
import { CardFinderPage } from "@/pages/CardFinderPage";
import { SwUnlimitedDbCardProvider } from "@/providers/cardProvider/SwUnlimitedDbCardProvider";
import type { CardInfo } from "@/types/card";
import type { CollectionCard } from "@/types/collection";

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

const commandGroundUnit: CardInfo = {
  cardId: "JTL_110",
  setCode: "JTL",
  cardNumber: "110",
  name: "Command Ground Sentinel",
  localizedName: "Centinela terrestre de Mando",
  type: "Unit",
  rarity: "Common",
  imageUrl: "https://example.invalid/jtl-110.png",
  setName: "Salto al hiperespacio",
  cost: 3,
  aspects: ["Command"],
  traits: ["Rebel"],
  arena: "Ground",
  localizedText: "Centinela.",
  keywords: ["Sentinel"]
};

const commandSpaceUnit: CardInfo = {
  cardId: "ASH_117",
  setCode: "ASH",
  cardNumber: "117",
  name: "Command Space Unit",
  localizedName: "Unidad espacial de Mando",
  type: "Unit",
  rarity: "Legendary",
  imageUrl: "https://example.invalid/ash-117.png",
  setName: "Cenizas del Imperio",
  cost: 4,
  aspects: ["Command"],
  traits: ["Vehicle"],
  arena: "Space"
};

const colorlessEvent: CardInfo = {
  cardId: "SOR_245",
  setCode: "SOR",
  cardNumber: "245",
  name: "Colorless Event",
  localizedName: "Evento incoloro",
  type: "Event",
  rarity: "Special",
  imageUrl: "https://example.invalid/sor-245.png",
  setName: "La chispa de una rebelión",
  cost: 0,
  aspects: [],
  localizedText: "Cuando se juegue: roba una carta."
};

const saboteurReminder: CardInfo = {
  cardId: "SHD_123",
  setCode: "SHD",
  cardNumber: "123",
  name: "Saboteur Reminder Unit",
  localizedName: "Unidad con Sabotaje",
  type: "Unit",
  rarity: "Rare",
  imageUrl: "https://example.invalid/shd-123.png",
  setName: "Sombras de la galaxia",
  cost: 2,
  aspects: ["Aggression"],
  traits: ["Rebel"],
  arena: "Ground",
  text: "Saboteur (When this unit attacks, ignore Sentinel and defeat the defender's Shields.)",
  keywords: ["Saboteur"]
};

let catalogCards: CardInfo[] = [card];

function dataSource(
  removeCollectionCard: DataSourceValue["removeCollectionCard"],
  collectionCards: CollectionCard[] = [
    { cardId: card.cardId, setCode: "SEC", cardNumber: "101", ownedCount: 2 }
  ]
): DataSourceValue {
  return {
    mode: "guest",
    collection: {
      cards: collectionCards,
      differentCards: collectionCards.length,
      totalCopies: collectionCards.reduce((total, entry) => total + entry.ownedCount, 0),
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
  catalogCards = [card];
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn()
  });
  vi.spyOn(SwUnlimitedDbCardProvider.prototype, "getAllCards").mockImplementation(() =>
    Promise.resolve(catalogCards)
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Buscar cartas", () => {
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

  it("empieza sin restricciones y aplica los mismos filtros manuales del creador", async () => {
    catalogCards = [card, commandGroundUnit, commandSpaceUnit, colorlessEvent, saboteurReminder];
    const collectionCards: CollectionCard[] = [
      { cardId: card.cardId, setCode: "SEC", cardNumber: "101", ownedCount: 2 },
      {
        cardId: commandGroundUnit.cardId,
        setCode: "JTL",
        cardNumber: "110",
        ownedCount: 1
      }
    ];

    render(
      <DataSourceContext.Provider value={dataSource(vi.fn(), collectionCards)}>
        <CardFinderPage />
      </DataSourceContext.Provider>
    );

    expect(await screen.findByText(/5 resultado\(s\)/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Líder \+ base \(automático\)/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Todos los aspectos" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    fireEvent.click(screen.getByText("Filtros"));
    fireEvent.click(screen.getByRole("button", { name: "Mando" }));
    expect(await screen.findByText(/3 resultado\(s\)/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Incoloras" }));
    expect(await screen.findByText(/2 resultado\(s\)/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Unidades espaciales" }));
    expect(await screen.findByText(/1 resultado\(s\)/i)).toBeInTheDocument();
    expect(screen.getByText("Unidad espacial de Mando")).toBeInTheDocument();
    expect(screen.queryByText("Centinela terrestre de Mando")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ASH" }));
    fireEvent.click(screen.getByRole("button", { name: "Legendaria" }));
    expect(await screen.findByText(/1 resultado\(s\)/i)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Coste máximo" }), {
      target: { value: "3" }
    });
    expect(
      await screen.findByText("No se ha encontrado ninguna carta que coincida con tu búsqueda.")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restablecer filtros" }));
    expect(await screen.findByText(/5 resultado\(s\)/i)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Disponibilidad en la colección" }), {
      target: { value: "owned" }
    });
    expect(await screen.findByText(/2 resultado\(s\)/i)).toBeInTheDocument();
    expect(screen.getByText("Unidad rebelde detallada")).toBeInTheDocument();
    expect(screen.getByText("Centinela terrestre de Mando")).toBeInTheDocument();
  });

  it("combina condiciones con barra, interpreta números como coste y conserva alias de código", async () => {
    catalogCards = [card, commandGroundUnit, saboteurReminder];
    render(
      <DataSourceContext.Provider value={dataSource(vi.fn())}>
        <CardFinderPage />
      </DataSourceContext.Provider>
    );

    const search = await screen.findByRole("textbox", { name: "Buscar carta" });
    fireEvent.change(search, { target: { value: "centinela / rebelde / 2" } });

    expect(await screen.findByText(/1 resultado\(s\)/i)).toBeInTheDocument();
    expect(screen.getByText("Unidad rebelde detallada")).toBeInTheDocument();
    expect(screen.queryByText("Unidad con Sabotaje")).not.toBeInTheDocument();
    expect(screen.queryByText("Centinela terrestre de Mando")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "SEC 101" } });
    expect(await screen.findByText(/1 resultado\(s\)/i)).toBeInTheDocument();
    expect(screen.getByText("Unidad rebelde detallada")).toBeInTheDocument();
  });

  it("pagina todo el catálogo y vuelve a la primera página al cambiar la búsqueda", async () => {
    catalogCards = Array.from({ length: 35 }, (_, index): CardInfo => {
      const number = String(index + 1).padStart(3, "0");
      return {
        cardId: `SOR_${number}`,
        setCode: "SOR",
        cardNumber: number,
        name: `Catalog Card ${number}`,
        localizedName: `Carta de catálogo ${number}`,
        type: "Unit",
        rarity: "Common",
        cost: 1,
        aspects: ["Command"],
        arena: "Ground"
      };
    });

    render(
      <DataSourceContext.Provider value={dataSource(vi.fn(), [])}>
        <CardFinderPage />
      </DataSourceContext.Provider>
    );

    expect(await screen.findByText(/35 resultado\(s\) · mostrando 1–30/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    expect(await screen.findByText(/35 resultado\(s\) · mostrando 31–35/i)).toBeInTheDocument();
    expect(screen.getByText("Página 2 de 2")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Buscar carta" }), {
      target: { value: "Carta de catálogo 035" }
    });
    expect(await screen.findByText(/1 resultado\(s\) · mostrando 1–1/i)).toBeInTheDocument();
    expect(screen.queryByText("Página 2 de 2")).not.toBeInTheDocument();
  });
});

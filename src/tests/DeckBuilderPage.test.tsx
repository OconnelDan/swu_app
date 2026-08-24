import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataSourceContext, type DataSourceValue } from "@/contexts/DataSourceContext";
import { DeckBuilderPage } from "@/pages/DeckBuilderPage";
import { normalizeDeckJson } from "@/lib/normalizeDeckJson";
import { SwUnlimitedDbCardProvider } from "@/providers/cardProvider/SwUnlimitedDbCardProvider";
import type { CardInfo } from "@/types/card";
import type { NormalizedDeck } from "@/types/deck";

const catalogCards: CardInfo[] = [
  {
    cardId: "SEC_001",
    setCode: "SEC",
    cardNumber: "001",
    name: "Líder de filtros",
    type: "Leader",
    aspects: ["Heroism", "Vigilance"],
    cardKey: "filter-leader"
  },
  {
    cardId: "SEC_020",
    setCode: "SEC",
    cardNumber: "020",
    name: "Base de filtros",
    type: "Base",
    aspects: ["Command"],
    cardKey: "filter-base"
  },
  {
    cardId: "JTL_002",
    setCode: "JTL",
    cardNumber: "002",
    name: "Segundo líder de filtros",
    type: "Leader",
    aspects: ["Aggression"],
    cardKey: "second-filter-leader"
  },
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
    arena: "Ground",
    rarity: "Common",
    cardKey: "current-card"
  },
  {
    cardId: "SEC_101",
    setCode: "SEC",
    cardNumber: "101",
    name: "Unidad de vigilancia",
    type: "Unit",
    arena: "Ground",
    rarity: "Common",
    aspects: ["Vigilance"],
    traits: ["Rebel"],
    keywords: ["Sentinel"],
    localizedText: "Centinela. Cuando se juegue: cura 1 de daño de una unidad.",
    cost: 2,
    power: 2,
    hp: 4,
    setName: "Secretos del poder",
    cardKey: "vigilance-unit",
    imageUrl: "https://example.invalid/sec-101.png"
  },
  {
    cardId: "SEC_102",
    setCode: "SEC",
    cardNumber: "102",
    name: "Unidad incolora",
    type: "Unit",
    arena: "Ground",
    rarity: "Common",
    aspects: [],
    cardKey: "colorless-unit"
  },
  {
    cardId: "SEC_103",
    setCode: "SEC",
    cardNumber: "103",
    name: "Unidad agresiva espacial",
    type: "Unit",
    arena: "Space",
    rarity: "Rare",
    aspects: ["Aggression"],
    cardKey: "aggression-space-unit"
  },
  {
    cardId: "SEC_106",
    setCode: "SEC",
    cardNumber: "106",
    name: "Test saboteur",
    localizedName: "Saboteador de prueba",
    type: "Unit",
    arena: "Ground",
    aspects: ["Vigilance"],
    keywords: ["Saboteur"],
    text: "Saboteur (When this unit attacks, ignore Sentinel and defeat the defender's Shields.)",
    localizedText:
      "Sabotaje (Cuando esta unidad ataca, ignora Centinela y derrota los Escudos del defensor.)",
    cardKey: "false-sentinel-reminder"
  },
  {
    cardId: "SEC_107",
    setCode: "SEC",
    cardNumber: "107",
    name: "Sentinel unit",
    localizedName: "Unidad con Centinela",
    type: "Unit",
    arena: "Ground",
    aspects: ["Vigilance"],
    cost: 3,
    traits: ["Rebel"],
    keywords: ["Sentinel"],
    text: "Sentinel (Units in this arena can't attack your non-Sentinel units or your base.)",
    localizedText:
      "Centinela (Las unidades de este campo de batalla no pueden atacar a tus unidades sin Centinela ni a tu base.)",
    cardKey: "sentinel-unit"
  },
  {
    cardId: "SEC_108",
    setCode: "SEC",
    cardNumber: "108",
    name: "Grant Sentinel",
    localizedName: "Concede Centinela",
    type: "Event",
    aspects: ["Command"],
    text: "Give a unit Sentinel for this phase.",
    localizedText: "Dale Centinela a una unidad para esta fase.",
    cardKey: "grant-sentinel"
  },
  {
    cardId: "JTL_104",
    setCode: "JTL",
    cardNumber: "104",
    name: "Evento de mando",
    type: "Event",
    rarity: "Uncommon",
    aspects: ["Command"],
    cardKey: "command-event"
  },
  {
    cardId: "LAW_105",
    setCode: "LAW",
    cardNumber: "105",
    name: "Mejora astuta",
    type: "Upgrade",
    rarity: "Legendary",
    aspects: ["Cunning"],
    cardKey: "cunning-upgrade"
  }
];

function dataSource(overrides: Partial<DataSourceValue> = {}): DataSourceValue {
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
    updateFavoriteDeck: vi.fn(),
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

function renderBuilder(overrides: Partial<DataSourceValue> = {}) {
  render(
    <DataSourceContext.Provider value={dataSource(overrides)}>
      <MemoryRouter>
        <DeckBuilderPage />
      </MemoryRouter>
    </DataSourceContext.Provider>
  );
}

async function choosePremierLeaderAndBase() {
  fireEvent.click(screen.getByRole("button", { name: /Premier/ }));
  expect(await screen.findByText("Crear mazo · Premier")).toBeInTheDocument();
  expect(screen.getByText("Líder de filtros")).toBeInTheDocument();
  fireEvent.click(
    within(screen.getByText("Líder de filtros").closest("li")!).getByRole("button", {
      name: "Elegir"
    })
  );
  expect(screen.getByText("Base de filtros")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Elegir" }));
}

beforeEach(() => {
  vi.spyOn(SwUnlimitedDbCardProvider.prototype, "getAllCards").mockResolvedValue(catalogCards);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("constructor por formatos", () => {
  it("guarda un borrador aunque todavía no alcance el mínimo del formato", async () => {
    const saveFavoriteDeck = vi.fn().mockResolvedValue(undefined);
    renderBuilder({ saveFavoriteDeck });

    fireEvent.click(screen.getByRole("button", { name: /Premier/ }));
    expect(await screen.findByText("Crear mazo · Premier")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar borrador en Favoritos" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Guardar borrador en Favoritos" }));
    await waitFor(() => expect(saveFavoriteDeck).toHaveBeenCalledTimes(1));
    expect(saveFavoriteDeck.mock.calls[0][0]).toMatchObject({
      format: "premier",
      mainDeck: []
    });
  });

  it("recupera un favorito y guarda los cambios sobre el mismo borrador", async () => {
    const normalizedDeck = normalizeDeckJson({
      metadata: { name: "Borrador recuperable", format: "Premier" },
      leader: { id: "SEC_001", count: 1 },
      base: { id: "SEC_020", count: 1 },
      deck: [{ id: "SEC_101", count: 1 }]
    });
    const favorite = {
      id: "draft-id",
      name: normalizedDeck.name,
      originalJson: normalizedDeck.originalJson,
      normalizedDeck,
      createdAt: "2026-08-24T09:00:00.000Z",
      updatedAt: "2026-08-24T09:00:00.000Z",
      isMounted: false
    };
    const updateFavoriteDeck = vi.fn().mockResolvedValue(favorite);

    render(
      <DataSourceContext.Provider value={dataSource({ favorites: [favorite], updateFavoriteDeck })}>
        <MemoryRouter initialEntries={["/mazos/editar/draft-id"]}>
          <Routes>
            <Route path="/mazos/editar/:favoriteId" element={<DeckBuilderPage />} />
          </Routes>
        </MemoryRouter>
      </DataSourceContext.Provider>
    );

    expect(await screen.findByText("Editar mazo · Premier")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Borrador recuperable")).toBeInTheDocument();
    expect(screen.getAllByText("Unidad de vigilancia").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(updateFavoriteDeck).toHaveBeenCalledTimes(1));
    expect(updateFavoriteDeck).toHaveBeenCalledWith(
      "draft-id",
      expect.objectContaining({ name: "Borrador recuperable" }),
      expect.any(Object)
    );
  });

  it("modifica mazo principal y banquillo de un mazo montado y lo mantiene montado", async () => {
    const normalizedDeck = normalizeDeckJson({
      metadata: { name: "Premier montado", format: "Premier" },
      leader: { id: "SEC_001", count: 1 },
      base: { id: "SEC_020", count: 1 },
      deck: [{ id: "SEC_101", count: 1 }],
      sideboard: []
    });
    const mountedFavorite = {
      id: "mounted-id",
      name: normalizedDeck.name,
      originalJson: normalizedDeck.originalJson,
      normalizedDeck,
      createdAt: "2026-08-24T09:00:00.000Z",
      updatedAt: "2026-08-24T09:00:00.000Z",
      isMounted: true,
      mountedAt: "2026-08-24T09:05:00.000Z",
      allocationPriority: 1
    };
    const updateFavoriteDeck = vi.fn().mockResolvedValue(mountedFavorite);

    render(
      <DataSourceContext.Provider
        value={dataSource({ favorites: [mountedFavorite], updateFavoriteDeck })}
      >
        <MemoryRouter initialEntries={["/mazos/editar/mounted-id"]}>
          <Routes>
            <Route path="/mazos/editar/:favoriteId" element={<DeckBuilderPage />} />
            <Route path="/montados" element={<p>Listado de montados</p>} />
          </Routes>
        </MemoryRouter>
      </DataSourceContext.Provider>
    );

    expect(await screen.findByText("Editar mazo · Premier")).toBeInTheDocument();
    expect(screen.getByText(/Seguirá montado al guardar/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restar Unidad de vigilancia del mazo" }));
    fireEvent.click(screen.getByRole("button", { name: "Añadir Unidad incolora al mazo" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Añadir Unidad de vigilancia al banquillo" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(updateFavoriteDeck).toHaveBeenCalledTimes(1));
    const updatedDeck = updateFavoriteDeck.mock.calls[0][1] as NormalizedDeck;
    expect(updatedDeck.mainDeck.map((card) => card.cardId)).toContain("SEC_102");
    expect(updatedDeck.mainDeck.map((card) => card.cardId)).not.toContain("SEC_101");
    expect(updatedDeck.sideboard.map((card) => card.cardId)).toContain("SEC_101");
    expect(await screen.findByText("Listado de montados")).toBeInTheDocument();
  });

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

  it("aplica por defecto los aspectos del líder y la base, más las incoloras", async () => {
    renderBuilder();
    await choosePremierLeaderAndBase();

    expect(screen.getByText("Unidad de vigilancia")).toBeInTheDocument();
    expect(screen.getByText("Evento de mando")).toBeInTheDocument();
    expect(screen.getByText("Unidad incolora")).toBeInTheDocument();
    expect(screen.queryByText("Unidad agresiva espacial")).not.toBeInTheDocument();
    expect(screen.queryByText("Mejora astuta")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Filtros"));
    expect(
      screen.getByText(/Automático: Heroísmo · Vigilancia · Mando \+ incoloras/)
    ).toBeInTheDocument();
  });

  it("abre una ficha persistente sin seleccionar ni añadir la carta", async () => {
    renderBuilder();
    await choosePremierLeaderAndBase();

    fireEvent.click(screen.getByRole("button", { name: "Ver detalles de Unidad de vigilancia" }));

    const dialog = screen.getByRole("dialog", { name: "Unidad de vigilancia" });
    expect(within(dialog).getByText(/Cuando se juegue: cura 1 de daño/i)).toBeInTheDocument();
    expect(within(dialog).getByText("Centinela")).toBeInTheDocument();
    expect(within(dialog).getByText("Secretos del poder")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /Añadir/i })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Añadir Unidad de vigilancia al mazo" })
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "3. Cartas 0/50" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar detalles de la carta" }));
    expect(screen.queryByRole("dialog", { name: "Unidad de vigilancia" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3. Cartas 0/50" })).toBeInTheDocument();
  });

  it("no encuentra keywords mencionadas solo dentro del recordatorio de otra keyword", async () => {
    renderBuilder();
    await choosePremierLeaderAndBase();

    const search = screen.getByRole("textbox", { name: "Buscar en el catálogo" });
    fireEvent.change(search, { target: { value: "Centinela" } });

    expect(screen.getByText("Unidad con Centinela")).toBeInTheDocument();
    expect(screen.getByText("Concede Centinela")).toBeInTheDocument();
    expect(screen.queryByText("Saboteador de prueba")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "Sentinel" } });
    expect(screen.getByText("Unidad con Centinela")).toBeInTheDocument();
    expect(screen.getByText("Concede Centinela")).toBeInTheDocument();
    expect(screen.queryByText("Saboteador de prueba")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "Centinela / rebelde / 3" } });
    expect(screen.getByText("Unidad con Centinela")).toBeInTheDocument();
    expect(screen.queryByText("Concede Centinela")).not.toBeInTheDocument();
    expect(screen.queryByText("Saboteador de prueba")).not.toBeInTheDocument();
  });

  it("sustituye el filtro automático por los aspectos manuales seleccionados", async () => {
    renderBuilder();
    await choosePremierLeaderAndBase();
    fireEvent.click(screen.getByText("Filtros"));

    fireEvent.click(screen.getByRole("button", { name: "Agresividad" }));

    expect(screen.getByText("Unidad agresiva espacial")).toBeInTheDocument();
    expect(screen.getByText("Unidad incolora")).toBeInTheDocument();
    expect(screen.queryByText("Unidad de vigilancia")).not.toBeInTheDocument();
    expect(screen.queryByText("Evento de mando")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Incoloras" }));
    expect(screen.queryByText("Unidad incolora")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mando" }));
    expect(screen.getByText("Unidad agresiva espacial")).toBeInTheDocument();
    expect(screen.getByText("Evento de mando")).toBeInTheDocument();
    expect(screen.queryByText("Unidad de vigilancia")).not.toBeInTheDocument();
  });

  it("combina por defecto los dos líderes y la base de Twin Suns", async () => {
    renderBuilder();
    fireEvent.click(screen.getByRole("button", { name: /Twin Suns/ }));
    expect(await screen.findByText("Crear mazo · Twin Suns")).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByText("Líder de filtros").closest("li")!).getByRole("button", {
        name: "Elegir"
      })
    );
    fireEvent.click(
      within(screen.getByText("Segundo líder de filtros").closest("li")!).getByRole("button", {
        name: "Elegir"
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Elegir" }));

    expect(screen.getByText("Unidad de vigilancia")).toBeInTheDocument();
    expect(screen.getByText("Unidad agresiva espacial")).toBeInTheDocument();
    expect(screen.getByText("Evento de mando")).toBeInTheDocument();
    expect(screen.getByText("Unidad incolora")).toBeInTheDocument();
    expect(screen.queryByText("Mejora astuta")).not.toBeInTheDocument();
  });

  it("permite combinar varias colecciones y separar unidades terrestres y espaciales", async () => {
    renderBuilder();
    fireEvent.click(screen.getByRole("button", { name: /Premier/ }));
    expect(await screen.findByText("Crear mazo · Premier")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "3. Cartas 0/50" }));
    fireEvent.click(screen.getByText("Filtros"));

    fireEvent.click(screen.getByRole("button", { name: "SEC" }));
    expect(screen.getByText("Unidad de vigilancia")).toBeInTheDocument();
    expect(screen.queryByText("Evento de mando")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "JTL" }));
    expect(screen.getByText("Unidad de vigilancia")).toBeInTheDocument();
    expect(screen.getByText("Evento de mando")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Unidades terrestres" }));
    expect(screen.getByText("Unidad de vigilancia")).toBeInTheDocument();
    expect(screen.queryByText("Unidad agresiva espacial")).not.toBeInTheDocument();
    expect(screen.queryByText("Evento de mando")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Eventos" }));
    expect(screen.getByText("Unidad de vigilancia")).toBeInTheDocument();
    expect(screen.getByText("Evento de mando")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Todos los tipos" }));
    fireEvent.click(screen.getByRole("button", { name: "Común" }));
    expect(screen.getByText("Unidad de vigilancia")).toBeInTheDocument();
    expect(screen.queryByText("Evento de mando")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Infrecuente" }));
    expect(screen.getByText("Unidad de vigilancia")).toBeInTheDocument();
    expect(screen.getByText("Evento de mando")).toBeInTheDocument();
  });

  it("permite acceder a todas las cartas cuando hay más de 80 resultados", async () => {
    const paginatedCards: CardInfo[] = Array.from({ length: 81 }, (_, index) => ({
      cardId: `SEC_${String(200 + index).padStart(3, "0")}`,
      setCode: "SEC",
      cardNumber: String(200 + index).padStart(3, "0"),
      name: `Carta paginada ${String(index + 1).padStart(3, "0")}`,
      type: "Unit",
      arena: "Ground",
      aspects: ["Vigilance"],
      cardKey: `paginated-${index + 1}`
    }));
    vi.spyOn(SwUnlimitedDbCardProvider.prototype, "getAllCards").mockResolvedValue([
      ...catalogCards,
      ...paginatedCards
    ]);
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn()
    });

    renderBuilder();
    await choosePremierLeaderAndBase();
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar en el catálogo" }), {
      target: { value: "Carta paginada" }
    });

    expect(screen.getByText("81 resultado(s) · mostrando 1–80")).toBeInTheDocument();
    expect(screen.getByText("Carta paginada 001")).toBeInTheDocument();
    expect(screen.queryByText("Carta paginada 081")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ir a la página 2" }));
    expect(await screen.findByText("81 resultado(s) · mostrando 81–81")).toBeInTheDocument();
    expect(screen.getByText("Carta paginada 081")).toBeInTheDocument();
    expect(screen.queryByText("Carta paginada 001")).not.toBeInTheDocument();
  });
});

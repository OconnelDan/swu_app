import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataSourceContext, type DataSourceValue } from "@/contexts/DataSourceContext";
import { compareDeckWithCollection } from "@/lib/compareDeckWithCollection";
import { normalizeDeckJson } from "@/lib/normalizeDeckJson";
import { saveDeckBuilderDraft } from "@/lib/deckBuilderDraft";
import { FavoritesPage } from "@/pages/FavoritesPage";
import { MountedDecksPage } from "@/pages/MountedDecksPage";
import { ResultPage } from "@/pages/ResultPage";
import type { CollectionCard } from "@/types/collection";
import type { CardInfo } from "@/types/card";
import type { FavoriteDeck } from "@/types/deck";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ session: null, loading: false })
}));

const deckLegalityMock = vi.hoisted(() => ({
  invalidDeckIds: new Set<string>(),
  incompleteDeckIds: new Set<string>(),
  prereleaseDeckIds: new Set<string>(),
  cardsById: new Map<string, CardInfo>()
}));

vi.mock("@/hooks/useDeckLegality", () => ({
  useDeckLegality: (decks: FavoriteDeck[] | undefined) => ({
    loading: false,
    error: null,
    cardsById: deckLegalityMock.cardsById,
    byDeckId: new Map(
      (decks ?? []).map((deck) => [
        deck.id,
        {
          valid:
            !deckLegalityMock.invalidDeckIds.has(deck.id) &&
            !deckLegalityMock.incompleteDeckIds.has(deck.id),
          errors: deckLegalityMock.incompleteDeckIds.has(deck.id)
            ? ["el mazo principal necesita 40 carta(s) más."]
            : deckLegalityMock.invalidDeckIds.has(deck.id)
              ? ["La carta de prueba ha rotado de Premier."]
              : [],
          warnings: [],
          mainCount: deckLegalityMock.incompleteDeckIds.has(deck.id) ? 10 : 50,
          sideboardCount: 0,
          minimumMainCount: 50,
          sideboardLimit: 10,
          aspectPenaltyCopies: 0,
          illegalCardIds: [],
          prereleaseCardIds: deckLegalityMock.prereleaseDeckIds.has(deck.id) ? ["HMW_100"] : [],
          prereleaseWarnings: deckLegalityMock.prereleaseDeckIds.has(deck.id)
            ? [
                "Carta de Mundos de origen: Prepublicación: Mundos de origen (HMW) será legal en Premier desde el 9/10/2026."
              ]
            : []
        }
      ])
    )
  })
}));

function savedDeck(
  id: string,
  name: string,
  requiredCount: number,
  isMounted: boolean,
  allocationPriority?: number,
  format = "Premier"
): FavoriteDeck {
  const normalizedDeck = normalizeDeckJson({
    metadata: { name, format },
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
    transferFavoriteDeckCard: vi.fn(),
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

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined
  });
});

afterEach(() => {
  deckLegalityMock.invalidDeckIds.clear();
  deckLegalityMock.incompleteDeckIds.clear();
  deckLegalityMock.prereleaseDeckIds.clear();
  deckLegalityMock.cardsById.clear();
  vi.restoreAllMocks();
});

describe("Favoritos y mazos montados", () => {
  it("ofrece continuar el mazo temporal desde el listado", async () => {
    saveDeckBuilderDraft("guest", undefined, {
      version: 1,
      savedAt: "2026-08-25T08:00:00.000Z",
      format: "twin-suns",
      trilogyCardPool: "premier",
      name: "Twin Suns temporal",
      decks: [{ mainCounts: {}, sideboardCounts: {} }],
      activeDeckIndex: 0,
      activeTab: "cards",
      query: "rebelde",
      manualAspects: null,
      includeColorless: true,
      selectedTypes: [],
      selectedSetCodes: [],
      selectedRarities: [],
      maximumCost: "all",
      ownedFilter: "all",
      cardPage: 1,
      scrollY: 320
    });

    render(
      <DataSourceContext.Provider value={dataSource([], collection)}>
        <MemoryRouter initialEntries={["/favoritos"]}>
          <Routes>
            <Route path="/favoritos" element={<FavoritesPage onOpenResult={vi.fn()} />} />
            <Route path="/mazos/crear" element={<p>Constructor temporal recuperado</p>} />
          </Routes>
        </MemoryRouter>
      </DataSourceContext.Provider>
    );

    const continueLink = screen.getByRole("link", {
      name: "Continuar mazo en curso: Twin Suns temporal"
    });
    expect(continueLink).toHaveAttribute("href", "/mazos/crear");
    fireEvent.click(continueLink);
    expect(await screen.findByText("Constructor temporal recuperado")).toBeInTheDocument();
  });

  it("marca un borrador como inacabado y permite continuar editándolo", async () => {
    const draft = savedDeck("draft", "Twin Suns en proceso", 10, false, undefined, "Twin Suns");
    deckLegalityMock.incompleteDeckIds.add(draft.id);

    render(
      <DataSourceContext.Provider value={dataSource([draft], collection)}>
        <MemoryRouter initialEntries={["/favoritos"]}>
          <Routes>
            <Route path="/favoritos" element={<FavoritesPage onOpenResult={vi.fn()} />} />
            <Route path="/mazos/editar/:favoriteId" element={<p>Constructor recuperado</p>} />
          </Routes>
        </MemoryRouter>
      </DataSourceContext.Provider>
    );

    expect(screen.getByText("Mazo inacabado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Montar mazo" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(await screen.findByText("Constructor recuperado")).toBeInTheDocument();
  });

  it("permite modificar un favorito terminado", async () => {
    const favorite = savedDeck("favorite", "Mazo favorito", 1, false);

    render(
      <DataSourceContext.Provider value={dataSource([favorite], collection)}>
        <MemoryRouter initialEntries={["/favoritos"]}>
          <Routes>
            <Route path="/favoritos" element={<FavoritesPage onOpenResult={vi.fn()} />} />
            <Route path="/mazos/editar/:favoriteId" element={<p>Editar favorito terminado</p>} />
          </Routes>
        </MemoryRouter>
      </DataSourceContext.Provider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Modificar mazo" }));
    expect(await screen.findByText("Editar favorito terminado")).toBeInTheDocument();
  });

  it("permite modificar un mazo montado sin desmontarlo primero", async () => {
    const mounted = savedDeck("mounted", "Mazo físico editable", 1, true, 1);

    render(
      <DataSourceContext.Provider value={dataSource([mounted], collection)}>
        <MemoryRouter initialEntries={["/montados"]}>
          <Routes>
            <Route path="/montados" element={<MountedDecksPage onOpenResult={vi.fn()} />} />
            <Route path="/mazos/editar/:favoriteId" element={<p>Editar mazo montado</p>} />
          </Routes>
        </MemoryRouter>
      </DataSourceContext.Provider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Modificar mazo" }));
    expect(await screen.findByText("Editar mazo montado")).toBeInTheDocument();
  });

  it("copia el JSON compatible desde Favoritos y lo coloca junto a Eliminar", async () => {
    const normalizedDeck = normalizeDeckJson({
      metadata: { name: "Original", author: "Dani" },
      leader: { id: "ASH_011", count: 1 },
      base: { id: "JTL_030", count: 1 },
      deck: [{ id: "LAW_174", count: 3 }],
      sideboard: [{ id: "LAW_149", count: 2 }]
    });
    const favorite: FavoriteDeck = {
      ...savedDeck("copy", "Mazo para Karabast", 1, false),
      name: "Mazo para Karabast",
      author: "Dani",
      normalizedDeck,
      originalJson: normalizedDeck.originalJson
    };
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    render(
      <DataSourceContext.Provider value={dataSource([favorite], collection)}>
        <MemoryRouter>
          <FavoritesPage onOpenResult={vi.fn()} />
        </MemoryRouter>
      </DataSourceContext.Provider>
    );

    const primaryActions = screen.getByRole("button", { name: "Modificar mazo" }).parentElement!;
    expect(primaryActions).toHaveClass("grid-cols-3");
    expect(within(primaryActions).getByRole("button", { name: "Montar mazo" })).toBeInTheDocument();
    expect(
      within(primaryActions).getByRole("button", { name: "Comprobar de nuevo" })
    ).toBeInTheDocument();
    const copyButton = screen.getByRole("button", { name: "Copiar JSON" });
    const managementActions = copyButton.parentElement!;
    expect(within(managementActions).getByRole("button", { name: "Duplicar" })).toBeInTheDocument();
    expect(within(managementActions).getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
    fireEvent.click(copyButton);

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(JSON.parse(writeText.mock.calls[0][0])).toEqual({
      metadata: { name: "Mazo para Karabast", author: "Dani" },
      leader: { id: "ASH_011", count: 1 },
      base: { id: "JTL_030", count: 1 },
      deck: [{ id: "LAW_174", count: 3 }],
      sideboard: [{ id: "LAW_149", count: 2 }]
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "JSON de «Mazo para Karabast» copiado al portapapeles."
    );
  });

  it("permite copiar el mismo JSON desde un mazo montado", async () => {
    const mounted = savedDeck("mounted-copy", "Mazo montado copiable", 1, true, 1);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    render(
      <DataSourceContext.Provider value={dataSource([mounted], collection)}>
        <MemoryRouter>
          <MountedDecksPage onOpenResult={vi.fn()} />
        </MemoryRouter>
      </DataSourceContext.Provider>
    );

    const mountedActions = screen.getByRole("button", { name: "Modificar mazo" }).parentElement!;
    expect(mountedActions).toHaveClass("grid-cols-2");
    expect(
      within(mountedActions).getByRole("button", { name: "Comprobar y ver cartas" })
    ).toBeInTheDocument();
    expect(
      within(mountedActions).getByRole("button", { name: "Desmontar mazo" })
    ).toBeInTheDocument();
    expect(within(mountedActions).getByRole("button", { name: "Copiar JSON" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copiar JSON" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(JSON.parse(writeText.mock.calls[0][0])).toMatchObject({
      metadata: { name: "Mazo montado copiable", author: "" },
      deck: [{ id: "SOR_001", count: 1 }],
      sideboard: []
    });
    expect(await screen.findByRole("status")).toHaveTextContent("copiado al portapapeles");
  });

  it("muestra el aspecto del líder a la izquierda y el de la base a la derecha", () => {
    const normalizedDeck = normalizeDeckJson({
      metadata: { name: "Mazo con borde" },
      leader: { id: "ASH_007", count: 1 },
      base: { id: "ASH_019", count: 1 },
      deck: [{ id: "SOR_001", count: 1 }]
    });
    const favorite: FavoriteDeck = {
      ...savedDeck("border", "Mazo con borde", 1, false),
      normalizedDeck,
      originalJson: normalizedDeck.originalJson
    };
    deckLegalityMock.cardsById.set("ASH_007", {
      cardId: "ASH_007",
      setCode: "ASH",
      cardNumber: "007",
      aspects: ["Command", "Villainy"]
    });
    deckLegalityMock.cardsById.set("ASH_019", {
      cardId: "ASH_019",
      setCode: "ASH",
      cardNumber: "019",
      aspects: ["Vigilance"]
    });

    render(
      <DataSourceContext.Provider value={dataSource([favorite], collection)}>
        <MemoryRouter>
          <FavoritesPage onOpenResult={vi.fn()} />
        </MemoryRouter>
      </DataSourceContext.Provider>
    );

    const deckCard = screen.getByText("Mazo con borde").closest("li");
    expect(deckCard).toHaveAttribute("data-leader-border-colors", "#3ddc84");
    expect(deckCard).toHaveAttribute("data-base-border-colors", "#4da6ff");
    expect(deckCard).toHaveStyle({
      backgroundImage: "linear-gradient(115deg, #3ddc84 0%, #3ddc84 46%, #4da6ff 54%, #4da6ff 100%)"
    });
  });

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

  it("permite elegir de qué mazos se retiran las copias", async () => {
    const transferCollection: CollectionCard[] = [{ ...collection[0], ownedCount: 6 }];
    const first = savedDeck("first", "Mazo A", 3, true, 1);
    const second = savedDeck("second", "Mazo B", 3, true, 2);
    const target = savedDeck("target", "Mazo objetivo", 3, true, 3);
    const transferFavoriteDeckCard = vi.fn().mockResolvedValue(undefined);
    const result = compareDeckWithCollection(target.normalizedDeck, transferCollection);
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
          transferFavoriteDeckCard
        })}
      >
        <MemoryRouter>
          <ResultPage deck={target.normalizedDeck} result={result} favoriteId={target.id} />
        </MemoryRouter>
      </DataSourceContext.Provider>
    );

    expect(screen.getAllByText("Faltan 3").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Asignar cartas a este mazo" })[0]);

    const dialog = screen.getByRole("dialog", { name: "Elegir mazos de origen" });
    fireEvent.change(
      within(dialog).getByRole("spinbutton", { name: "Copias a retirar de Mazo A" }),
      {
        target: { value: "1" }
      }
    );
    fireEvent.change(
      within(dialog).getByRole("spinbutton", { name: "Copias a retirar de Mazo B" }),
      {
        target: { value: "2" }
      }
    );
    expect(within(dialog).getByText("Reparto listo para confirmar.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar reasignación" }));

    await waitFor(() =>
      expect(transferFavoriteDeckCard).toHaveBeenCalledWith("target", "SOR_001", [
        { favoriteId: "first", count: 1 },
        { favoriteId: "second", count: 2 }
      ])
    );
  });

  it("filtra Favoritos por Premier, Eternal, Twin Suns y Trilogy", () => {
    const premier = savedDeck("premier", "Mazo Premier", 1, false);
    const eternal = savedDeck("eternal", "Mazo Eternal", 1, false, undefined, "Eternal");

    render(
      <DataSourceContext.Provider value={dataSource([premier, eternal], collection)}>
        <MemoryRouter>
          <FavoritesPage onOpenResult={vi.fn()} />
        </MemoryRouter>
      </DataSourceContext.Provider>
    );

    expect(screen.getByText("Mazo Premier")).toBeInTheDocument();
    expect(screen.getByText("Mazo Eternal")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Premier (1)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Eternal (1)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Twin Suns (0)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Trilogy (0)" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filtrar mazos por formato"), {
      target: { value: "eternal" }
    });

    expect(screen.queryByText("Mazo Premier")).not.toBeInTheDocument();
    expect(screen.getByText("Mazo Eternal")).toBeInTheDocument();
  });

  it("conserva un favorito ilegal y bloquea volver a montarlo", () => {
    const illegal = savedDeck("illegal", "Mazo rotado", 1, false);
    const mountFavoriteDeck = vi.fn();
    deckLegalityMock.invalidDeckIds.add(illegal.id);

    render(
      <DataSourceContext.Provider value={dataSource([illegal], collection, { mountFavoriteDeck })}>
        <MemoryRouter>
          <FavoritesPage onOpenResult={vi.fn()} />
        </MemoryRouter>
      </DataSourceContext.Provider>
    );

    expect(screen.getByText("Mazo rotado")).toBeInTheDocument();
    expect(screen.getByText("No legal")).toBeInTheDocument();
    expect(screen.getByText(/se conserva, pero no puede montarse/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Montar mazo" })).toBeDisabled();
    expect(mountFavoriteDeck).not.toHaveBeenCalled();
  });

  it("avisa de la prepublicación sin bloquear el montaje del favorito", () => {
    const preview = savedDeck("preview", "Mazo HMW anticipado", 1, false);
    deckLegalityMock.prereleaseDeckIds.add(preview.id);

    render(
      <DataSourceContext.Provider value={dataSource([preview], collection)}>
        <MemoryRouter>
          <FavoritesPage onOpenResult={vi.fn()} />
        </MemoryRouter>
      </DataSourceContext.Provider>
    );

    expect(screen.getByText("Prepublicación")).toBeInTheDocument();
    expect(screen.getByText(/todavía no es legal en Premier/i)).toBeInTheDocument();
    expect(screen.getByText(/será legal en Premier desde el 9\/10\/2026/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Montar mazo" })).toBeEnabled();
  });

  it("mantiene montado un mazo que deja de ser legal y permite desmontarlo", () => {
    const mounted = savedDeck("mounted-illegal", "Mazo antiguo", 1, true, 1);
    deckLegalityMock.invalidDeckIds.add(mounted.id);

    render(
      <DataSourceContext.Provider value={dataSource([mounted], collection)}>
        <MemoryRouter>
          <MountedDecksPage onOpenResult={vi.fn()} />
        </MemoryRouter>
      </DataSourceContext.Provider>
    );

    expect(screen.getByText("Mazo antiguo")).toBeInTheDocument();
    expect(screen.getByText("No legal")).toBeInTheDocument();
    expect(screen.getByText(/Se conserva montado/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desmontar mazo" })).toBeEnabled();
  });

  it("mantiene el aviso de prepublicación en un mazo ya montado", () => {
    const preview = savedDeck("mounted-preview", "HMW ya preparado", 1, true, 1);
    deckLegalityMock.prereleaseDeckIds.add(preview.id);

    render(
      <DataSourceContext.Provider value={dataSource([preview], collection)}>
        <MemoryRouter>
          <MountedDecksPage onOpenResult={vi.fn()} />
        </MemoryRouter>
      </DataSourceContext.Provider>
    );

    expect(screen.getByText("Prepublicación")).toBeInTheDocument();
    expect(screen.getByText(/todavía no es legal en Premier/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desmontar mazo" })).toBeEnabled();
  });
});

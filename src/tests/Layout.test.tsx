import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    session: null as Session | null,
    loading: false,
    passwordRecovery: false,
    finishPasswordFlow: vi.fn()
  },
  signOutCurrentSession: vi.fn()
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/contexts/DataSourceContext", () => ({
  useDataSource: () => ({
    mode: mocks.auth.session ? "account" : "guest",
    error: null,
    refresh: vi.fn(),
    refreshing: false
  })
}));
vi.mock("@/lib/supabaseClient", () => ({ isSupabaseConfigured: true }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return { ...original, signOutCurrentSession: mocks.signOutCurrentSession };
});
vi.mock("@/components/OfflineBanner", () => ({ OfflineBanner: () => null }));

import { Layout } from "@/components/Layout";
import { saveDeckBuilderDraft, type DeckBuilderDraft } from "@/lib/deckBuilderDraft";

function activeDraft(): DeckBuilderDraft {
  return {
    version: 1,
    savedAt: "2026-08-25T08:00:00.000Z",
    format: "premier",
    trilogyCardPool: "premier",
    name: "Mazo de navegación",
    decks: [{ mainCounts: {}, sideboardCounts: {} }],
    activeDeckIndex: 0,
    activeTab: "cards",
    query: "",
    manualAspects: null,
    includeColorless: true,
    selectedTypes: [],
    selectedSetCodes: [],
    selectedRarities: [],
    maximumCost: "all",
    ownedFilter: "all",
    cardPage: 1,
    scrollY: 450
  };
}

function accountSession(): Session {
  return {
    user: { email: "dani@example.com" }
  } as Session;
}

function renderLayout() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<p>Página de prueba</p>} />
          <Route path="cuenta" element={<p>Cuenta</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("acceso desde la cabecera", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.auth.session = null;
    mocks.signOutCurrentSession.mockReset().mockResolvedValue(undefined);
  });

  it("ofrece iniciar sesión y crear cuenta al invitado", () => {
    renderLayout();

    fireEvent.click(screen.getByText("Iniciar sesión", { selector: "span" }));

    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute(
      "href",
      "/cuenta?vista=iniciar"
    );
    expect(screen.getByRole("link", { name: "Crear cuenta" })).toHaveAttribute(
      "href",
      "/cuenta?vista=crear"
    );
  });

  it("muestra el usuario y permite cerrar solo la sesión de este dispositivo", async () => {
    mocks.auth.session = accountSession();
    renderLayout();

    fireEvent.click(screen.getByText("dani", { selector: "span" }));
    expect(screen.getByText("dani@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mi cuenta" })).toHaveAttribute("href", "/cuenta");

    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(mocks.signOutCurrentSession).toHaveBeenCalledTimes(1));
  });

  it("convierte Mazos en un acceso directo al editor cuando hay un borrador activo", async () => {
    renderLayout();
    expect(screen.getByRole("link", { name: "Mazos" })).toHaveAttribute("href", "/favoritos");

    act(() => {
      saveDeckBuilderDraft("guest", undefined, activeDraft());
    });

    expect(
      await screen.findByRole("link", { name: "Mazos, continuar Mazo de navegación" })
    ).toHaveAttribute("href", "/mazos/crear");
  });

  it("vuelve desde Buscar al mazo en curso al pulsar la navegación Mazos", async () => {
    saveDeckBuilderDraft("guest", undefined, activeDraft());
    render(
      <MemoryRouter initialEntries={["/buscar"]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="buscar" element={<p>Página Buscar</p>} />
            <Route path="mazos/crear" element={<p>Editor del mazo recuperado</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Página Buscar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Mazos, continuar Mazo de navegación" }));
    expect(await screen.findByText("Editor del mazo recuperado")).toBeInTheDocument();
  });
});

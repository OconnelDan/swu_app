import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
});

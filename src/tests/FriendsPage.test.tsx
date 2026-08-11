import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: null,
    loading: false,
    passwordRecovery: false,
    finishPasswordFlow: vi.fn()
  })
}));

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: {}
}));

import { FriendsPage } from "@/pages/FriendsPage";

describe("acceso a cuenta y amigos", () => {
  it("ofrece iniciar sesión o crear cuenta sin solicitar enlaces desde Amigos", () => {
    render(
      <MemoryRouter>
        <FriendsPage />
      </MemoryRouter>
    );

    expect(screen.queryByRole("button", { name: "Generar código de invitación" })).toBeNull();
    expect(screen.getByText(/amigos requiere una cuenta/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute(
      "href",
      "/cuenta?vista=iniciar"
    );
    expect(screen.getByRole("link", { name: "Crear cuenta" })).toHaveAttribute(
      "href",
      "/cuenta?vista=crear"
    );
    expect(screen.getByText(/datos de invitado permanecen separados/i)).toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithOtp: vi.fn().mockResolvedValue({ error: null })
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ session: null, loading: false })
}));

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      signInWithOtp: mocks.signInWithOtp,
      signOut: vi.fn()
    }
  }
}));

import { FriendsPage } from "@/pages/FriendsPage";

describe("acceso a cuenta y amigos", () => {
  it("solicita un enlace mágico que regresa a la ruta de Amigos", async () => {
    render(<FriendsPage />);

    expect(screen.queryByRole("button", { name: "Generar código de invitación" })).toBeNull();
    expect(screen.getByText(/no las funciones de amigos/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "dani@example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviarme el enlace de acceso" }));

    await waitFor(() => expect(mocks.signInWithOtp).toHaveBeenCalledTimes(1));
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "dani@example.com",
      options: {
        emailRedirectTo: expect.stringMatching(/\?auth=magic-link#\/amigos$/)
      }
    });
    expect(screen.getByRole("status")).toHaveTextContent("Te hemos enviado un enlace");
  });
});

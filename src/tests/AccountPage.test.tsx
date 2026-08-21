import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    session: null as Session | null,
    loading: false,
    passwordRecovery: false,
    finishPasswordFlow: vi.fn()
  },
  signInWithEmailAndPassword: vi.fn(),
  requestAccountVerification: vi.fn(),
  requestPasswordReset: vi.fn(),
  updateAccountPassword: vi.fn(),
  signOutCurrentSession: vi.fn(),
  loadCollectionBackupSettings: vi.fn(),
  updateCollectionBackupSettings: vi.fn()
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mocks.auth
}));

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...original,
    signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
    requestAccountVerification: mocks.requestAccountVerification,
    requestPasswordReset: mocks.requestPasswordReset,
    updateAccountPassword: mocks.updateAccountPassword,
    signOutCurrentSession: mocks.signOutCurrentSession
  };
});

vi.mock("@/lib/collectionBackupRepository", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/collectionBackupRepository")>();
  return {
    ...original,
    loadCollectionBackupSettings: mocks.loadCollectionBackupSettings,
    updateCollectionBackupSettings: mocks.updateCollectionBackupSettings
  };
});

import { AccountPage } from "@/pages/AccountPage";

function accountSession(): Session {
  return {
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      aud: "authenticated",
      role: "authenticated",
      email: "dani@example.com",
      email_confirmed_at: "2026-08-11T12:00:00.000Z",
      app_metadata: {},
      user_metadata: {},
      identities: [],
      created_at: "2026-08-11T12:00:00.000Z"
    }
  } as Session;
}

function renderPage(url = "/cuenta") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AccountPage />
    </MemoryRouter>
  );
}

describe("pantalla de cuenta", () => {
  beforeEach(() => {
    mocks.auth.session = null;
    mocks.auth.loading = false;
    mocks.auth.passwordRecovery = false;
    mocks.auth.finishPasswordFlow.mockReset();
    mocks.signInWithEmailAndPassword.mockReset().mockResolvedValue(undefined);
    mocks.requestAccountVerification.mockReset().mockResolvedValue(undefined);
    mocks.requestPasswordReset.mockReset().mockResolvedValue(undefined);
    mocks.updateAccountPassword.mockReset().mockResolvedValue(undefined);
    mocks.signOutCurrentSession.mockReset().mockResolvedValue(undefined);
    mocks.loadCollectionBackupSettings.mockReset().mockResolvedValue({
      emailEnabled: false,
      inactivityMinutes: 15,
      timezone: "Europe/Madrid",
      lastChangeAt: null,
      lastBackedUpChangeAt: null,
      lastEmailSentAt: null,
      hasPendingChanges: false,
      lastError: null
    });
    mocks.updateCollectionBackupSettings.mockReset().mockResolvedValue({
      emailEnabled: true,
      inactivityMinutes: 30,
      timezone: "Europe/Madrid",
      lastChangeAt: null,
      lastBackedUpChangeAt: null,
      lastEmailSentAt: null,
      hasPendingChanges: false,
      lastError: null
    });
  });

  it("inicia sesión con email y contraseña", async () => {
    renderPage("/cuenta?vista=iniciar");

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "dani@example.com" }
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "contraseña-segura" }
    });
    fireEvent.click(screen.getByRole("button", { name: /^iniciar sesión$/i }));

    await waitFor(() =>
      expect(mocks.signInWithEmailAndPassword).toHaveBeenCalledWith(
        "dani@example.com",
        "contraseña-segura"
      )
    );
  });

  it("para crear una cuenta solo pide primero el email", async () => {
    renderPage("/cuenta?vista=crear");

    expect(screen.queryByLabelText("Nueva contraseña")).toBeNull();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "dani@example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Verificar mi email" }));

    await waitFor(() =>
      expect(mocks.requestAccountVerification).toHaveBeenCalledWith("dani@example.com")
    );
    expect(screen.getByRole("status")).toHaveTextContent(/mismo navegador/i);
  });

  it("después de verificar el email obliga a repetir la nueva contraseña", async () => {
    mocks.auth.session = accountSession();
    renderPage("/cuenta?flujo=crear-contrasena");

    expect(screen.getByText(/email verificado: crea tu contraseña/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
      target: { value: "contraseña-segura" }
    });
    fireEvent.change(screen.getByLabelText("Repite la contraseña"), {
      target: { value: "contraseña-segura" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    await waitFor(() =>
      expect(mocks.updateAccountPassword).toHaveBeenCalledWith("contraseña-segura")
    );
    expect(mocks.auth.finishPasswordFlow).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(/a partir de ahora puedes entrar/i);
  });

  it("no envía dos contraseñas diferentes", async () => {
    mocks.auth.session = accountSession();
    renderPage("/cuenta?flujo=recuperar-contrasena");

    fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
      target: { value: "contraseña-segura" }
    });
    fireEvent.change(screen.getByLabelText("Repite la contraseña"), {
      target: { value: "otra-contraseña" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no coinciden/i);
    expect(mocks.updateAccountPassword).not.toHaveBeenCalled();
  });

  it("permite activar y configurar el correo diario desde Mi cuenta", async () => {
    mocks.auth.session = accountSession();
    renderPage();

    const toggle = await screen.findByRole("checkbox", {
      name: "Enviar la copia automática por correo"
    });
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText("Esperar después del último cambio"), {
      target: { value: "30" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));

    await waitFor(() =>
      expect(mocks.updateCollectionBackupSettings).toHaveBeenCalledWith(true, 30)
    );
    expect(screen.getByRole("status")).toHaveTextContent(/solo se enviará un correo/i);
  });
});

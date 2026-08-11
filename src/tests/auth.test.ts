import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn()
}));

vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: { auth: mocks }
}));

import {
  getAuthErrorMessage,
  getAuthRedirectUrl,
  requestAccountVerification,
  requestPasswordReset,
  signInWithEmailAndPassword,
  signOutCurrentSession,
  updateAccountPassword
} from "@/lib/auth";

describe("autenticación clásica", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset().mockResolvedValue({ error: null });
    }
  });

  it("construye callbacks de PKCE que conservan la ruta de cuenta en el hash", () => {
    const signupUrl = new URL(getAuthRedirectUrl("crear-contrasena"));
    const recoveryUrl = new URL(getAuthRedirectUrl("recuperar-contrasena"));

    expect(signupUrl.pathname).toBe("/");
    expect(signupUrl.hash).toBe("#/cuenta?flujo=crear-contrasena");
    expect(recoveryUrl.hash).toBe("#/cuenta?flujo=recuperar-contrasena");
  });

  it("verifica el email antes de crear la contraseña y reutiliza cuentas existentes", async () => {
    await requestAccountVerification("  dani@example.com ");

    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "dani@example.com",
      options: {
        shouldCreateUser: true,
        emailRedirectTo: expect.stringMatching(/#\/cuenta\?flujo=crear-contrasena$/)
      }
    });
  });

  it("usa contraseña para entrar y un callback distinto para recuperarla", async () => {
    await signInWithEmailAndPassword(" dani@example.com ", "contraseña-segura");
    await requestPasswordReset(" dani@example.com ");
    await updateAccountPassword("otra-contraseña-segura");
    await signOutCurrentSession();

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "dani@example.com",
      password: "contraseña-segura"
    });
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("dani@example.com", {
      redirectTo: expect.stringMatching(/#\/cuenta\?flujo=recuperar-contrasena$/)
    });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "otra-contraseña-segura" });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("traduce los límites de correo y credenciales inválidas", () => {
    const rateLimit = Object.assign(new Error("Email rate limit exceeded"), {
      code: "over_email_send_rate_limit"
    });
    const invalidCredentials = Object.assign(new Error("Invalid login credentials"), {
      code: "invalid_credentials"
    });

    expect(getAuthErrorMessage(rateLimit)).toMatch(/límite de correos/i);
    expect(getAuthErrorMessage(invalidCredentials)).toBe(
      "El email o la contraseña no son correctos."
    );
  });
});

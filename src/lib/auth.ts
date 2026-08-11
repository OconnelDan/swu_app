import { supabase } from "@/lib/supabaseClient";

export type AuthRedirectFlow = "crear-contrasena" | "recuperar-contrasena";

const DEFAULT_AUTH_ERROR = "No se ha podido completar la operación. Inténtalo de nuevo.";

function requireSupabase() {
  if (!supabase) {
    throw new Error("Las cuentas no están configuradas en este despliegue.");
  }
  return supabase;
}

function authErrorCode(cause: unknown): string | undefined {
  if (!cause || typeof cause !== "object" || !("code" in cause)) return undefined;
  const code = (cause as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function authErrorText(cause: unknown): string {
  if (cause instanceof Error) return cause.message.toLowerCase();
  return "";
}

/** Convierte los errores técnicos de Auth en mensajes útiles para la interfaz. */
export function getAuthErrorMessage(cause: unknown, fallback = DEFAULT_AUTH_ERROR): string {
  const code = authErrorCode(cause);
  const text = authErrorText(cause);

  if (code === "invalid_credentials" || text.includes("invalid login credentials")) {
    return "El email o la contraseña no son correctos.";
  }
  if (code === "email_not_confirmed" || text.includes("email not confirmed")) {
    return "Primero debes verificar tu email desde el correo que te enviamos.";
  }
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    text.includes("email rate limit exceeded") ||
    text.includes("rate limit")
  ) {
    return "Se ha alcanzado temporalmente el límite de correos de acceso. Espera un poco antes de volver a solicitar otro.";
  }
  if (code === "weak_password" || text.includes("password should be")) {
    return "La contraseña no cumple los requisitos de seguridad de la cuenta.";
  }
  if (code === "same_password" || text.includes("same password")) {
    return "La nueva contraseña debe ser diferente de la actual.";
  }
  if (code === "reauthentication_needed") {
    return "Por seguridad necesitas verificar de nuevo tu email. Cierra sesión y utiliza «He olvidado mi contraseña».";
  }
  if (code === "flow_state_expired" || code === "otp_expired") {
    return "El enlace ha caducado. Solicita uno nuevo desde la aplicación.";
  }
  if (code === "flow_state_not_found") {
    return "El enlace no puede validarse en este navegador. Solicita otro y ábrelo en el mismo navegador.";
  }
  if (code === "user_banned") {
    return "Esta cuenta no puede iniciar sesión en este momento.";
  }

  return fallback;
}

/**
 * Construye un callback compatible con GitHub Pages, HashRouter y PKCE.
 * Supabase añade `?code=...` antes del hash; la ruta y el flujo sobreviven al
 * intercambio y permiten mostrar el formulario correcto al volver del email.
 */
export function getAuthRedirectUrl(flow: AuthRedirectFlow): string {
  const redirectUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
  redirectUrl.hash = `/cuenta?flujo=${flow}`;
  return redirectUrl.toString();
}

export async function signInWithEmailAndPassword(email: string, password: string): Promise<void> {
  const { error } = await requireSupabase().auth.signInWithPassword({
    email: email.trim(),
    password
  });
  if (error) throw error;
}

/**
 * Verifica el email mediante un enlace de un solo uso. Si la cuenta ya existe
 * (incluidas las antiguas cuentas sin contraseña), Supabase conserva su mismo
 * id y abre esa cuenta para que el usuario pueda asignarle una contraseña.
 */
export async function requestAccountVerification(email: string): Promise<void> {
  const { error } = await requireSupabase().auth.signInWithOtp({
    email: email.trim(),
    options: {
      shouldCreateUser: true,
      emailRedirectTo: getAuthRedirectUrl("crear-contrasena")
    }
  });
  if (error) throw error;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await requireSupabase().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: getAuthRedirectUrl("recuperar-contrasena")
  });
  if (error) throw error;
}

export async function updateAccountPassword(password: string): Promise<void> {
  const { error } = await requireSupabase().auth.updateUser({ password });
  if (error) throw error;
}

export async function signOutCurrentSession(): Promise<void> {
  const { error } = await requireSupabase().auth.signOut({ scope: "local" });
  if (error) throw error;
}

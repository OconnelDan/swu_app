import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { indexedDbAuthStorage } from "@/lib/supabaseAuthStorage";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** true si el despliegue tiene configuradas las variables de Supabase. */
export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * Cliente de Supabase para cuentas, colección, mazos y amigos. Si no hay
 * variables de entorno, la app continúa disponible únicamente como invitado.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        // PKCE devuelve el código en ?code= y no compite con el HashRouter.
        // También evita guardar credenciales propias de la aplicación.
        flowType: "pkce",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
        storage: indexedDbAuthStorage
      }
    })
  : null;

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** true si el usuario ha configurado las variables de entorno de Supabase. */
export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * Cliente de Supabase para la sincronización opcional (amigos, colección
 * compartida). `null` si no hay variables de entorno configuradas: la app
 * debe seguir funcionando en modo 100% local sin esta pieza (ver README,
 * "Fase 4" / sincronización opcional).
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!)
  : null;

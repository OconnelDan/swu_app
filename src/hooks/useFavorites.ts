import { useDataSource } from "@/contexts/DataSourceContext";

/** Mazos del origen activo: Supabase con cuenta, IndexedDB como invitado. */
export function useFavorites() {
  return useDataSource().favorites;
}

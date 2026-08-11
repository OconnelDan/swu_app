import { useDataSource } from "@/contexts/DataSourceContext";

export type { CollectionStats } from "@/contexts/DataSourceContext";

/** Colección del origen activo: Supabase con cuenta, IndexedDB como invitado. */
export function useCollection() {
  return useDataSource().collection;
}

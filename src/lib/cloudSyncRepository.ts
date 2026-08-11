import {
  buildCloudCollectionWriteRows,
  buildCloudFavoriteDeckRows,
  parseCloudCollectionRows,
  parseCloudFavoriteDeckRows
} from "@/lib/cloudSyncData";
import { supabase } from "@/lib/supabaseClient";
import type { CollectionCard } from "@/types/collection";
import type { FavoriteDeck } from "@/types/deck";

interface SyncStateRow {
  updated_at: string;
}

export interface CloudDataSnapshot {
  userId: string;
  hasCloudData: boolean;
  updatedAt: string | null;
  collection: CollectionCard[];
  favoriteDecks: FavoriteDeck[];
}

function requireClient() {
  if (!supabase) throw new Error("Los datos de cuenta no están configurados.");
  return supabase;
}

async function requireUserId(): Promise<string> {
  const client = requireClient();
  const { data, error } = await client.auth.getUser();
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Debes iniciar sesión para acceder a los datos de tu cuenta.");
  return data.user.id;
}

function parseUpdatedAt(value: unknown): string {
  if (typeof value !== "string") return new Date().toISOString();
  return new Date(value).toISOString();
}

/** Carga colección y mazos exclusivamente desde la cuenta autenticada. */
export async function loadCloudDataSnapshot(): Promise<CloudDataSnapshot> {
  const client = requireClient();
  const userId = await requireUserId();

  const [collectionResult, decksResult, stateResult] = await Promise.all([
    client
      .from("collection_cards")
      .select("card_id, set_code, card_number, name, owned_count, free_count")
      .eq("user_id", userId)
      .order("card_id"),
    client
      .from("favorite_decks")
      .select(
        "id, name, author, original_json, normalized_deck, created_at, updated_at, last_result, last_result_fingerprint"
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    client.from("user_sync_state").select("updated_at").eq("user_id", userId).maybeSingle()
  ]);

  if (collectionResult.error) throw new Error(collectionResult.error.message);
  if (decksResult.error) throw new Error(decksResult.error.message);
  if (stateResult.error) throw new Error(stateResult.error.message);

  const state = stateResult.data as SyncStateRow | null;

  try {
    const collection = parseCloudCollectionRows((collectionResult.data ?? []) as unknown[]);
    const favoriteDecks = parseCloudFavoriteDeckRows((decksResult.data ?? []) as unknown[]);

    return {
      userId,
      hasCloudData: state !== null || collection.length > 0 || favoriteDecks.length > 0,
      updatedAt: state ? new Date(state.updated_at).toISOString() : null,
      collection,
      favoriteDecks
    };
  } catch {
    throw new Error("Los datos guardados en la cuenta no tienen el formato esperado.");
  }
}

/** Reemplaza únicamente la colección; los mazos de la cuenta no se modifican. */
export async function replaceCloudCollection(collection: CollectionCard[]): Promise<string> {
  const client = requireClient();
  await requireUserId();
  const { data, error } = await client.rpc("replace_my_collection", {
    p_collection: buildCloudCollectionWriteRows(collection)
  });
  if (error) throw new Error(error.message);
  return parseUpdatedAt(data);
}

/** Inserta o actualiza un único mazo sin sustituir los demás mazos de la cuenta. */
export async function upsertCloudFavoriteDeck(favorite: FavoriteDeck): Promise<string> {
  const client = requireClient();
  await requireUserId();
  const [row] = buildCloudFavoriteDeckRows([favorite]);
  const { data, error } = await client.rpc("upsert_my_favorite_deck", {
    p_favorite_deck: row
  });
  if (error) throw new Error(error.message);
  return parseUpdatedAt(data);
}

/** Elimina un único mazo sin tocar la colección ni el resto de favoritos. */
export async function deleteCloudFavoriteDeck(favoriteId: string): Promise<string> {
  const client = requireClient();
  await requireUserId();
  const { data, error } = await client.rpc("delete_my_favorite_deck", {
    p_id: favoriteId
  });
  if (error) throw new Error(error.message);
  return parseUpdatedAt(data);
}

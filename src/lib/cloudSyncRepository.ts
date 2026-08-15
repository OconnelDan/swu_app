import {
  buildCloudCollectionWriteRows,
  buildCloudFavoriteDeckRows,
  parseCloudCollectionRows,
  parseCloudFavoriteDeckRows
} from "@/lib/cloudSyncData";
import { supabase } from "@/lib/supabaseClient";
import type { CollectionCard, CollectionCardIdentity } from "@/types/collection";
import type { FavoriteDeck } from "@/types/deck";

interface SyncStateRow {
  updated_at: string;
}

const COLLECTION_PAGE_SIZE = 1_000;
const COLLECTION_COLUMNS = "card_id, set_code, card_number, name, owned_count, free_count";

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

/**
 * Supabase limita por defecto cada respuesta a 1.000 filas. La colección se
 * recupera por páginas para no perder las cartas que queden después de ese
 * límite (por ejemplo, los sets SEC de una colección grande).
 */
async function loadAllCloudCollectionRows(
  client: NonNullable<typeof supabase>,
  userId: string
): Promise<unknown[]> {
  const rows: unknown[] = [];

  for (let from = 0; ; from += COLLECTION_PAGE_SIZE) {
    const { data, error } = await client
      .from("collection_cards")
      .select(COLLECTION_COLUMNS)
      .eq("user_id", userId)
      .order("card_id")
      .range(from, from + COLLECTION_PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const page = (data ?? []) as unknown[];
    rows.push(...page);

    if (page.length < COLLECTION_PAGE_SIZE) return rows;
  }
}

/** Carga colección y mazos exclusivamente desde la cuenta autenticada. */
export async function loadCloudDataSnapshot(): Promise<CloudDataSnapshot> {
  const client = requireClient();
  const userId = await requireUserId();

  const [collectionRows, decksResult, stateResult] = await Promise.all([
    loadAllCloudCollectionRows(client, userId),
    client
      .from("favorite_decks")
      .select(
        "id, name, author, original_json, normalized_deck, created_at, updated_at, last_result, last_result_fingerprint, is_mounted, mounted_at, allocation_priority, preferred_card_ids"
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    client.from("user_sync_state").select("updated_at").eq("user_id", userId).maybeSingle()
  ]);

  if (decksResult.error) throw new Error(decksResult.error.message);
  if (stateResult.error) throw new Error(stateResult.error.message);

  const state = stateResult.data as SyncStateRow | null;

  try {
    const collection = parseCloudCollectionRows(collectionRows);
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

/** Suma copias de una carta a la colección de la cuenta de forma atómica. */
export async function addCloudCollectionCard(
  card: CollectionCardIdentity,
  quantity = 1
): Promise<number> {
  const client = requireClient();
  await requireUserId();
  const { data, error } = await client.rpc("add_my_collection_card", {
    p_card_id: card.cardId,
    p_set_code: card.setCode,
    p_card_number: card.cardNumber,
    p_name: card.name ?? null,
    p_quantity: quantity
  });
  if (error) throw new Error(error.message);

  const ownedCount = typeof data === "number" ? data : Number(data);
  if (!Number.isInteger(ownedCount) || ownedCount < 1) {
    throw new Error("Supabase no ha devuelto la nueva cantidad de la carta.");
  }

  return ownedCount;
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

/** Marca un favorito como montado y reserva para él las copias que estén libres. */
export async function mountCloudFavoriteDeck(favoriteId: string): Promise<string> {
  const client = requireClient();
  await requireUserId();
  const { data, error } = await client.rpc("mount_my_favorite_deck", {
    p_id: favoriteId
  });
  if (error) throw new Error(error.message);
  return parseUpdatedAt(data);
}

/** Desmonta un mazo y vuelve a dejar libres las copias que tenía reservadas. */
export async function unmountCloudFavoriteDeck(favoriteId: string): Promise<string> {
  const client = requireClient();
  await requireUserId();
  const { data, error } = await client.rpc("unmount_my_favorite_deck", {
    p_id: favoriteId
  });
  if (error) throw new Error(error.message);
  return parseUpdatedAt(data);
}

/** Da prioridad al mazo montado únicamente para la carta indicada. */
export async function prioritizeCloudFavoriteDeckCard(
  favoriteId: string,
  cardId: string
): Promise<string> {
  const client = requireClient();
  await requireUserId();
  const { data, error } = await client.rpc("prioritize_my_mounted_deck_card", {
    p_id: favoriteId,
    p_card_id: cardId
  });
  if (error) throw new Error(error.message);
  return parseUpdatedAt(data);
}

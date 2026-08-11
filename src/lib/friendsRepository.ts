import { supabase } from "@/lib/supabaseClient";

function requireClient() {
  if (!supabase) throw new Error("La sincronización con amigos no está configurada.");
  return supabase;
}

async function requireUserId(): Promise<string> {
  const client = requireClient();
  const { data, error } = await client.auth.getUser();
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Debes iniciar sesión para usar esta función.");
  return data.user.id;
}

export interface UserProfile {
  id: string;
  username: string;
}

export async function getMyProfile(): Promise<UserProfile> {
  const client = requireClient();
  const userId = await requireUserId();
  const { data, error } = await client
    .from("profiles")
    .select("id, username")
    .eq("id", userId)
    .single();

  if (error) throw new Error(error.message);
  return data as UserProfile;
}

export async function updateMyUsername(username: string): Promise<UserProfile> {
  const normalized = username.trim();
  if (normalized.length < 3 || normalized.length > 32) {
    throw new Error("El nombre de usuario debe tener entre 3 y 32 caracteres.");
  }

  const client = requireClient();
  const userId = await requireUserId();
  const { data, error } = await client
    .from("profiles")
    .update({ username: normalized, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("id, username")
    .single();

  if (error?.code === "23505") {
    throw new Error("Ese nombre de usuario ya está ocupado.");
  }
  if (error) throw new Error(error.message);
  return data as UserProfile;
}

/** Sin caracteres ambiguos (0/O, 1/I) y con 32 símbolos exactos. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateSecureCode(length = 10): string {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Este navegador no permite generar un código seguro.");
  }

  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => CODE_ALPHABET[byte & 31]).join("");
}

/** Genera y guarda un código de invitación que caduca a los siete días. */
export async function createInviteCode(): Promise<string> {
  const client = requireClient();
  const ownerId = await requireUserId();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateSecureCode();
    const { error } = await client.from("friend_invite_codes").insert({
      code,
      owner_id: ownerId
    });
    if (!error) return code;
    if (error.code !== "23505") throw new Error(error.message);
  }

  throw new Error("No se ha podido generar un código único, inténtalo de nuevo.");
}

/** Canjea el código de otro usuario; el propio código actúa como aceptación. */
export async function redeemInviteCode(code: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.rpc("redeem_friend_invite_code", {
    p_code: code.trim().toUpperCase()
  });
  if (error) throw new Error(error.message);
}

export interface FriendSummary {
  friendshipId: string;
  friendId: string;
  friendUsername: string;
}

interface FriendSummaryRow {
  friendship_id: string;
  friend_id: string;
  friend_username: string;
}

export async function listFriends(): Promise<FriendSummary[]> {
  const client = requireClient();
  await requireUserId();
  const { data, error } = await client.rpc("list_my_friends");
  if (error) throw new Error(error.message);

  return ((data ?? []) as FriendSummaryRow[]).map((row) => ({
    friendshipId: row.friendship_id,
    friendId: row.friend_id,
    friendUsername: row.friend_username
  }));
}

export async function removeFriend(friendshipId: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from("friendships").delete().eq("id", friendshipId);
  if (error) throw new Error(error.message);
}

export interface FriendCardAvailability {
  friendId: string;
  friendUsername: string;
  cardId: string;
  ownedCount: number;
  freeCount: number;
}

interface FriendCardAvailabilityRow {
  friend_id: string;
  friend_username: string;
  card_id: string;
  owned_count: number;
  free_count: number;
}

/** Para unas cartas concretas, indica qué amigos las poseen y cuántas tienen libres. */
export async function getFriendsCardAvailability(
  cardIds: string[]
): Promise<FriendCardAvailability[]> {
  const uniqueCardIds = [...new Set(cardIds)].slice(0, 500);
  if (uniqueCardIds.length === 0) return [];

  const client = requireClient();
  const { data, error } = await client.rpc("get_friends_card_availability", {
    p_card_ids: uniqueCardIds
  });
  if (error) throw new Error(error.message);

  return ((data ?? []) as FriendCardAvailabilityRow[]).map((row) => ({
    friendId: row.friend_id,
    friendUsername: row.friend_username,
    cardId: row.card_id,
    ownedCount: row.owned_count,
    freeCount: row.free_count
  }));
}

import { supabase } from "@/lib/supabaseClient";
import type { CollectionCard } from "@/types/collection";

function requireClient() {
  if (!supabase) throw new Error("La sincronización con amigos no está configurada.");
  return supabase;
}

async function requireUserId(): Promise<string> {
  const client = requireClient();
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error("Debes iniciar sesión para usar esta función.");
  return data.user.id;
}

/** Sin caracteres ambiguos (0/O, 1/I) para que el código sea fácil de teclear. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export async function createProfile(userId: string, username: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.from("profiles").insert({ id: userId, username });
  if (error) throw new Error(error.message);
}

/** Genera y guarda un código de invitación de amistad de un solo uso. */
export async function createInviteCode(): Promise<string> {
  const client = requireClient();
  const ownerId = await requireUserId();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { error } = await client.from("friend_invite_codes").insert({ code, owner_id: ownerId });
    if (!error) return code;
    if (error.code !== "23505") throw new Error(error.message);
  }
  throw new Error("No se ha podido generar un código único, inténtalo de nuevo.");
}

/** Canjea el código de invitación de otro usuario para haceros amigos. */
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

interface FriendshipRow {
  id: string;
  user_a_id: string;
  user_b_id: string;
  profiles_a: { username: string } | null;
  profiles_b: { username: string } | null;
}

export async function listFriends(): Promise<FriendSummary[]> {
  const client = requireClient();
  const userId = await requireUserId();

  const { data, error } = await client
    .from("friendships")
    .select(
      "id, user_a_id, user_b_id, profiles_a:profiles!friendships_user_a_id_fkey(username), profiles_b:profiles!friendships_user_b_id_fkey(username)"
    )
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as FriendshipRow[]).map((row) => {
    const isUserA = row.user_a_id === userId;
    return {
      friendshipId: row.id,
      friendId: isUserA ? row.user_b_id : row.user_a_id,
      friendUsername: (isUserA ? row.profiles_b?.username : row.profiles_a?.username) ?? "Amigo"
    };
  });
}

/** Sustituye la colección en la nube del usuario por la actual (necesario para que sus amigos puedan consultarla). */
export async function syncCollectionToCloud(cards: CollectionCard[]): Promise<void> {
  const client = requireClient();
  const userId = await requireUserId();

  const { error: deleteError } = await client.from("collection_cards").delete().eq("user_id", userId);
  if (deleteError) throw new Error(deleteError.message);

  if (cards.length === 0) return;

  const rows = cards.map((c) => ({
    user_id: userId,
    card_id: c.cardId,
    owned_count: c.ownedCount,
    updated_at: new Date().toISOString()
  }));

  const { error: insertError } = await client.from("collection_cards").insert(rows);
  if (insertError) throw new Error(insertError.message);
}

export interface FriendCardAvailability {
  friendId: string;
  friendUsername: string;
  cardId: string;
  ownedCount: number;
}

/** Para unas cartas dadas, qué amigos aceptados tienen copias y cuántas. */
export async function getFriendsCardAvailability(cardIds: string[]): Promise<FriendCardAvailability[]> {
  if (cardIds.length === 0) return [];
  const client = requireClient();

  const { data, error } = await client.rpc("get_friends_card_availability", { p_card_ids: cardIds });
  if (error) throw new Error(error.message);

  return (
    (data ?? []) as { friend_id: string; friend_username: string; card_id: string; owned_count: number }[]
  ).map((row) => ({
    friendId: row.friend_id,
    friendUsername: row.friend_username,
    cardId: row.card_id,
    ownedCount: row.owned_count
  }));
}

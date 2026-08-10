import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import type { FavoriteDeck } from "@/types/deck";

export function useFavorites(): FavoriteDeck[] | undefined {
  return useLiveQuery(() => db.favoriteDecks.orderBy("updatedAt").reverse().toArray(), []);
}

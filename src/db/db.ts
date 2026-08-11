import Dexie, { type Table } from "dexie";
import type { CollectionCard, CollectionImportResult } from "@/types/collection";
import type { CardInfo } from "@/types/card";
import type { DeckComparisonResult, FavoriteDeck } from "@/types/deck";

export interface SettingsRecord {
  key: string;
  value: unknown;
}

export interface DeckCheckRecord {
  id: string;
  favoriteId?: string;
  deckName: string;
  result: DeckComparisonResult;
  checkedAt: string;
}

/**
 * Base local del modo invitado y cachés del dispositivo. La colección y los
 * mazos de usuarios autenticados se leen y escriben únicamente en Supabase.
 */
export class SwuDatabase extends Dexie {
  cards!: Table<CardInfo, string>;
  collectionEntries!: Table<CollectionCard, string>;
  collectionImports!: Table<CollectionImportResult & { id?: number }, number>;
  favoriteDecks!: Table<FavoriteDeck, string>;
  deckChecks!: Table<DeckCheckRecord, string>;
  settings!: Table<SettingsRecord, string>;
  cardCache!: Table<CardInfo, string>;

  constructor() {
    super("swu-deck-collection-checker");
    this.version(1).stores({
      cards: "cardId, setCode",
      collectionEntries: "cardId, setCode",
      collectionImports: "++id, importedAt",
      favoriteDecks: "id, name, createdAt, updatedAt",
      deckChecks: "id, favoriteId, checkedAt",
      settings: "key",
      cardCache: "cardId, setCode"
    });
  }
}

export const db = new SwuDatabase();

export async function replaceCollection(
  cards: CollectionCard[],
  importResult: CollectionImportResult
): Promise<void> {
  await db.transaction("rw", db.collectionEntries, db.collectionImports, async () => {
    await db.collectionEntries.clear();
    await db.collectionEntries.bulkPut(cards);
    await db.collectionImports.add(importResult);
  });
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const record = await db.settings.get(key);
  return record ? (record.value as T) : fallback;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value });
}

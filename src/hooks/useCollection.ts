import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { computeCollectionFingerprint } from "@/lib/collectionFingerprint";
import type { CollectionCard, CollectionImportResult } from "@/types/collection";

export interface CollectionStats {
  cards: CollectionCard[];
  differentCards: number;
  totalCopies: number;
  fingerprint: string;
  lastImport?: CollectionImportResult;
  isEmpty: boolean;
}

export function useCollection(): CollectionStats | undefined {
  return useLiveQuery(async () => {
    const cards = await db.collectionEntries.toArray();
    const lastImport = await db.collectionImports.orderBy("importedAt").last();
    return {
      cards,
      differentCards: cards.length,
      totalCopies: cards.reduce((sum, c) => sum + c.ownedCount, 0),
      fingerprint: computeCollectionFingerprint(cards),
      lastImport,
      isEmpty: cards.length === 0
    };
  }, []);
}

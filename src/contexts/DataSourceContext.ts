import { createContext, useContext } from "react";
import type { CollectionCard, CollectionImportResult } from "@/types/collection";
import type { DeckComparisonResult, FavoriteDeck, NormalizedDeck } from "@/types/deck";

export interface CollectionStats {
  cards: CollectionCard[];
  differentCards: number;
  totalCopies: number;
  fingerprint: string;
  lastImport?: CollectionImportResult;
  isEmpty: boolean;
}

export type DataMode = "loading" | "guest" | "account";

export interface DataSourceValue {
  mode: DataMode;
  collection: CollectionStats | undefined;
  favorites: FavoriteDeck[] | undefined;
  accountUpdatedAt: string | null;
  hasAccountData: boolean;
  error: string | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
  replaceCollection: (
    cards: CollectionCard[],
    importResult: CollectionImportResult
  ) => Promise<void>;
  saveFavoriteDeck: (
    normalizedDeck: NormalizedDeck,
    result?: DeckComparisonResult
  ) => Promise<FavoriteDeck>;
  updateFavoriteResult: (favoriteId: string, result: DeckComparisonResult) => Promise<void>;
  renameFavoriteDeck: (favoriteId: string, name: string) => Promise<void>;
  deleteFavoriteDeck: (favoriteId: string) => Promise<void>;
  duplicateFavoriteDeck: (favoriteId: string) => Promise<FavoriteDeck | undefined>;
}

export const DataSourceContext = createContext<DataSourceValue | null>(null);

export function useDataSource(): DataSourceValue {
  const value = useContext(DataSourceContext);
  if (!value) {
    throw new Error("useDataSource debe utilizarse dentro de DataSourceProvider.");
  }
  return value;
}

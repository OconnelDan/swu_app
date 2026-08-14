import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  DataSourceContext,
  type CollectionStats,
  type DataMode,
  type DataSourceValue
} from "@/contexts/DataSourceContext";
import { db, replaceCollection as replaceLocalCollection } from "@/db/db";
import { useAuth } from "@/hooks/useAuth";
import { computeCollectionFingerprint } from "@/lib/collectionFingerprint";
import {
  deleteCloudFavoriteDeck,
  loadCloudDataSnapshot,
  mountCloudFavoriteDeck,
  prioritizeCloudFavoriteDeckCard,
  replaceCloudCollection,
  unmountCloudFavoriteDeck,
  upsertCloudFavoriteDeck,
  type CloudDataSnapshot
} from "@/lib/cloudSyncRepository";
import { buildRemoteImportResult } from "@/lib/cloudSyncData";
import {
  deleteFavoriteDeck as deleteLocalFavoriteDeck,
  duplicateFavoriteDeck as duplicateLocalFavoriteDeck,
  mountFavoriteDeck as mountLocalFavoriteDeck,
  prioritizeFavoriteDeckCard as prioritizeLocalFavoriteDeckCard,
  renameFavoriteDeck as renameLocalFavoriteDeck,
  saveFavoriteDeck as saveLocalFavoriteDeck,
  unmountFavoriteDeck as unmountLocalFavoriteDeck,
  updateFavoriteResult as updateLocalFavoriteResult
} from "@/lib/favoritesRepository";
import { v4 as uuid } from "@/lib/uuid";
import type { CollectionCard, CollectionImportResult } from "@/types/collection";
import type { DeckComparisonResult, FavoriteDeck, NormalizedDeck } from "@/types/deck";

function buildCollectionStats(
  cards: CollectionCard[],
  lastImport?: CollectionImportResult
): CollectionStats {
  return {
    cards,
    differentCards: cards.length,
    totalCopies: cards.reduce((sum, card) => sum + card.ownedCount, 0),
    fingerprint: computeCollectionFingerprint(cards),
    lastImport,
    isEmpty: cards.length === 0
  };
}

function getErrorMessage(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "No se han podido cargar los datos guardados en tu cuenta.";
}

interface DataSourceProviderProps {
  children: ReactNode;
}

/**
 * Separa por completo los dos modos de persistencia:
 * - invitado: colección y mazos guardados en IndexedDB;
 * - cuenta: colección y mazos guardados únicamente en Supabase.
 *
 * La colección y los mazos de una cuenta nunca se copian a IndexedDB ni usan
 * los datos locales como respaldo silencioso.
 */
export function DataSourceProvider({ children }: DataSourceProviderProps) {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user.id ?? null;
  const currentUserIdRef = useRef<string | null>(userId);
  currentUserIdRef.current = userId;

  const localCollection = useLiveQuery(async () => {
    if (authLoading || userId) return undefined;
    const cards = await db.collectionEntries.toArray();
    const lastImport = await db.collectionImports.orderBy("importedAt").last();
    return buildCollectionStats(cards, lastImport);
  }, [authLoading, userId]);

  const localFavorites = useLiveQuery(
    () => (authLoading || userId ? [] : db.favoriteDecks.orderBy("updatedAt").reverse().toArray()),
    [authLoading, userId]
  );

  const [cloudSnapshot, setCloudSnapshot] = useState<CloudDataSnapshot | null>(null);
  const cloudSnapshotRef = useRef<CloudDataSnapshot | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestIdRef = useRef(0);

  const storeCloudSnapshot = useCallback((snapshot: CloudDataSnapshot | null) => {
    cloudSnapshotRef.current = snapshot;
    setCloudSnapshot(snapshot);
  }, []);

  const refresh = useCallback(async () => {
    const targetUserId = userId;
    if (!targetUserId) return;

    const requestId = ++requestIdRef.current;
    setRefreshing(true);
    setCloudError(null);

    try {
      const snapshot = await loadCloudDataSnapshot();
      if (snapshot.userId !== targetUserId) {
        throw new Error("La respuesta de la cuenta pertenece a otra sesión.");
      }
      if (requestId === requestIdRef.current && currentUserIdRef.current === targetUserId) {
        storeCloudSnapshot(snapshot);
      }
    } catch (cause) {
      if (requestId === requestIdRef.current && currentUserIdRef.current === targetUserId) {
        setCloudError(getErrorMessage(cause));
      }
      throw cause;
    } finally {
      if (requestId === requestIdRef.current && currentUserIdRef.current === targetUserId) {
        setRefreshing(false);
      }
    }
  }, [storeCloudSnapshot, userId]);

  useEffect(() => {
    ++requestIdRef.current;
    setCloudError(null);
    setRefreshing(false);
    storeCloudSnapshot(null);

    if (!authLoading && userId) {
      void refresh().catch(() => undefined);
    }
  }, [authLoading, refresh, storeCloudSnapshot, userId]);

  useEffect(() => {
    if (!userId) return;

    const refreshWhenReturning = () => {
      if (document.visibilityState === "visible") {
        void refresh().catch(() => undefined);
      }
    };

    window.addEventListener("focus", refreshWhenReturning);
    window.addEventListener("online", refreshWhenReturning);
    document.addEventListener("visibilitychange", refreshWhenReturning);
    return () => {
      window.removeEventListener("focus", refreshWhenReturning);
      window.removeEventListener("online", refreshWhenReturning);
      document.removeEventListener("visibilitychange", refreshWhenReturning);
    };
  }, [refresh, userId]);

  const mode: DataMode = authLoading ? "loading" : userId ? "account" : "guest";
  const activeCloudSnapshot = userId && cloudSnapshot?.userId === userId ? cloudSnapshot : null;

  const cloudCollection = useMemo(() => {
    if (!activeCloudSnapshot) return undefined;
    const lastImport = activeCloudSnapshot.updatedAt
      ? buildRemoteImportResult(activeCloudSnapshot.collection, activeCloudSnapshot.updatedAt)
      : undefined;
    return buildCollectionStats(activeCloudSnapshot.collection, lastImport);
  }, [activeCloudSnapshot]);

  const collection =
    mode === "account" ? cloudCollection : mode === "guest" ? localCollection : undefined;
  const favorites =
    mode === "account"
      ? activeCloudSnapshot?.favoriteDecks
      : mode === "guest"
        ? localFavorites
        : undefined;

  const requireAccountSnapshot = useCallback((): CloudDataSnapshot => {
    const snapshot = cloudSnapshotRef.current;
    const activeUserId = currentUserIdRef.current;
    if (!activeUserId) throw new Error("Debes iniciar sesión para usar los datos de la cuenta.");
    if (!snapshot || snapshot.userId !== activeUserId) {
      throw new Error("Espera a que terminen de cargar los datos de tu cuenta.");
    }
    return snapshot;
  }, []);

  const commitAccountMutation = useCallback(
    async (mutation: () => Promise<unknown>) => {
      setCloudError(null);
      try {
        await mutation();
        await refresh();
      } catch (cause) {
        setCloudError(getErrorMessage(cause));
        throw cause;
      }
    },
    [refresh]
  );

  const replaceCollection = useCallback(
    async (cards: CollectionCard[], importResult: CollectionImportResult) => {
      if (!userId) {
        await replaceLocalCollection(cards, importResult);
        return;
      }

      requireAccountSnapshot();
      await commitAccountMutation(() => replaceCloudCollection(cards));
    },
    [commitAccountMutation, requireAccountSnapshot, userId]
  );

  const saveFavoriteDeck = useCallback(
    async (
      normalizedDeck: NormalizedDeck,
      result?: DeckComparisonResult
    ): Promise<FavoriteDeck> => {
      if (!userId) return saveLocalFavoriteDeck(normalizedDeck, result);

      requireAccountSnapshot();
      const now = new Date().toISOString();
      const favorite: FavoriteDeck = {
        id: uuid(),
        name: normalizedDeck.name,
        author: normalizedDeck.author,
        originalJson: normalizedDeck.originalJson,
        normalizedDeck,
        createdAt: now,
        updatedAt: now,
        lastResult: result,
        lastResultFingerprint: result?.collectionFingerprint,
        isMounted: false,
        preferredCardIds: []
      };
      await commitAccountMutation(() => upsertCloudFavoriteDeck(favorite));
      return favorite;
    },
    [commitAccountMutation, requireAccountSnapshot, userId]
  );

  const updateFavoriteResult = useCallback(
    async (favoriteId: string, result: DeckComparisonResult) => {
      if (!userId) {
        await updateLocalFavoriteResult(favoriteId, result);
        return;
      }

      const snapshot = requireAccountSnapshot();
      const favorite = snapshot.favoriteDecks.find((entry) => entry.id === favoriteId);
      if (!favorite) throw new Error("El mazo ya no existe en tu cuenta.");
      const updated: FavoriteDeck = {
        ...favorite,
        updatedAt: new Date().toISOString(),
        lastResult: result,
        lastResultFingerprint: result.collectionFingerprint
      };
      await commitAccountMutation(() => upsertCloudFavoriteDeck(updated));
    },
    [commitAccountMutation, requireAccountSnapshot, userId]
  );

  const renameFavoriteDeck = useCallback(
    async (favoriteId: string, name: string) => {
      if (!userId) {
        await renameLocalFavoriteDeck(favoriteId, name);
        return;
      }

      const snapshot = requireAccountSnapshot();
      const favorite = snapshot.favoriteDecks.find((entry) => entry.id === favoriteId);
      if (!favorite) throw new Error("El mazo ya no existe en tu cuenta.");
      await commitAccountMutation(() =>
        upsertCloudFavoriteDeck({
          ...favorite,
          name,
          updatedAt: new Date().toISOString()
        })
      );
    },
    [commitAccountMutation, requireAccountSnapshot, userId]
  );

  const deleteFavoriteDeck = useCallback(
    async (favoriteId: string) => {
      if (!userId) {
        await deleteLocalFavoriteDeck(favoriteId);
        return;
      }

      requireAccountSnapshot();
      await commitAccountMutation(() => deleteCloudFavoriteDeck(favoriteId));
    },
    [commitAccountMutation, requireAccountSnapshot, userId]
  );

  const duplicateFavoriteDeck = useCallback(
    async (favoriteId: string): Promise<FavoriteDeck | undefined> => {
      if (!userId) return duplicateLocalFavoriteDeck(favoriteId);

      const snapshot = requireAccountSnapshot();
      const original = snapshot.favoriteDecks.find((entry) => entry.id === favoriteId);
      if (!original) return undefined;
      const now = new Date().toISOString();
      const copy: FavoriteDeck = {
        ...original,
        id: uuid(),
        name: `${original.name} (copia)`,
        createdAt: now,
        updatedAt: now,
        isMounted: false,
        mountedAt: undefined,
        allocationPriority: undefined,
        preferredCardIds: []
      };
      await commitAccountMutation(() => upsertCloudFavoriteDeck(copy));
      return copy;
    },
    [commitAccountMutation, requireAccountSnapshot, userId]
  );

  const mountFavoriteDeck = useCallback(
    async (favoriteId: string) => {
      if (!userId) {
        await mountLocalFavoriteDeck(favoriteId);
        return;
      }

      requireAccountSnapshot();
      await commitAccountMutation(() => mountCloudFavoriteDeck(favoriteId));
    },
    [commitAccountMutation, requireAccountSnapshot, userId]
  );

  const unmountFavoriteDeck = useCallback(
    async (favoriteId: string) => {
      if (!userId) {
        await unmountLocalFavoriteDeck(favoriteId);
        return;
      }

      requireAccountSnapshot();
      await commitAccountMutation(() => unmountCloudFavoriteDeck(favoriteId));
    },
    [commitAccountMutation, requireAccountSnapshot, userId]
  );

  const prioritizeFavoriteDeckCard = useCallback(
    async (favoriteId: string, cardId: string) => {
      if (!userId) {
        await prioritizeLocalFavoriteDeckCard(favoriteId, cardId);
        return;
      }

      requireAccountSnapshot();
      await commitAccountMutation(() => prioritizeCloudFavoriteDeckCard(favoriteId, cardId));
    },
    [commitAccountMutation, requireAccountSnapshot, userId]
  );

  const value = useMemo<DataSourceValue>(
    () => ({
      mode,
      collection,
      favorites,
      accountUpdatedAt: activeCloudSnapshot?.updatedAt ?? null,
      hasAccountData: activeCloudSnapshot?.hasCloudData ?? false,
      error: mode === "account" ? cloudError : null,
      refreshing: mode === "account" && refreshing,
      refresh,
      replaceCollection,
      saveFavoriteDeck,
      updateFavoriteResult,
      renameFavoriteDeck,
      deleteFavoriteDeck,
      duplicateFavoriteDeck,
      mountFavoriteDeck,
      unmountFavoriteDeck,
      prioritizeFavoriteDeckCard
    }),
    [
      activeCloudSnapshot,
      cloudError,
      collection,
      deleteFavoriteDeck,
      duplicateFavoriteDeck,
      favorites,
      mountFavoriteDeck,
      mode,
      prioritizeFavoriteDeckCard,
      refresh,
      refreshing,
      renameFavoriteDeck,
      replaceCollection,
      saveFavoriteDeck,
      unmountFavoriteDeck,
      updateFavoriteResult
    ]
  );

  return <DataSourceContext.Provider value={value}>{children}</DataSourceContext.Provider>;
}

import { z } from "zod";
import { computeCardAllocations } from "@/lib/cardAllocation";
import type { CollectionCard, CollectionImportResult } from "@/types/collection";
import type { FavoriteDeck } from "@/types/deck";

export interface CloudCollectionRow {
  card_id: string;
  set_code: string;
  card_number: string;
  name: string | null;
  owned_count: number;
  free_count: number;
}

export type CloudCollectionWriteRow = Omit<CloudCollectionRow, "free_count">;

export interface CloudFavoriteDeckRow {
  id: string;
  name: string;
  author: string | null;
  original_json: unknown;
  normalized_deck: unknown;
  created_at: string;
  updated_at: string;
  last_result: unknown | null;
  last_result_fingerprint: string | null;
  is_mounted: boolean;
  mounted_at: string | null;
  allocation_priority: number | null;
}

const cloudCollectionRowSchema = z
  .object({
    card_id: z.string().min(1),
    set_code: z.string().min(1),
    card_number: z.string().min(1),
    name: z.string().nullable().optional(),
    owned_count: z.number().int().nonnegative(),
    free_count: z.number().int().nonnegative()
  })
  .refine((row) => row.free_count <= row.owned_count, {
    message: "Las copias libres no pueden superar las copias poseídas."
  });

const cloudFavoriteDeckRowSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1),
    author: z.string().nullable().optional(),
    original_json: z.unknown(),
    normalized_deck: z.record(z.unknown()),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
    last_result: z.record(z.unknown()).nullable().optional(),
    last_result_fingerprint: z.string().nullable().optional(),
    is_mounted: z.boolean().default(false),
    mounted_at: z.string().datetime({ offset: true }).nullable().optional(),
    allocation_priority: z.number().int().positive().nullable().optional()
  })
  .refine(
    (row) =>
      row.is_mounted
        ? Boolean(row.mounted_at && row.allocation_priority)
        : !row.mounted_at && !row.allocation_priority,
    { message: "El estado de montaje del mazo no es coherente." }
  );

/**
 * Prepara la colección para la nube y calcula cuántas copias están realmente
 * libres después de repartirlas entre todos los mazos montados.
 */
export function buildCloudCollectionRows(
  collection: CollectionCard[],
  favoriteDecks: FavoriteDeck[]
): CloudCollectionRow[] {
  const allocations = computeCardAllocations(collection, favoriteDecks);

  return collection.map((card) => ({
    card_id: card.cardId,
    set_code: card.setCode,
    card_number: card.cardNumber,
    name: card.name ?? null,
    owned_count: card.ownedCount,
    free_count: allocations.get(card.cardId)?.freeCount ?? card.ownedCount
  }));
}

/**
 * Datos aceptados al reemplazar la colección de una cuenta. Las copias libres
 * se calculan en PostgreSQL usando los mazos que haya guardados en ese momento,
 * por lo que un navegador antiguo no puede publicar un reparto obsoleto.
 */
export function buildCloudCollectionWriteRows(
  collection: CollectionCard[]
): CloudCollectionWriteRow[] {
  return collection.map((card) => ({
    card_id: card.cardId,
    set_code: card.setCode,
    card_number: card.cardNumber,
    name: card.name ?? null,
    owned_count: card.ownedCount
  }));
}

export function buildCloudFavoriteDeckRows(favoriteDecks: FavoriteDeck[]): CloudFavoriteDeckRow[] {
  return favoriteDecks.map((favorite) => ({
    id: favorite.id,
    name: favorite.name,
    author: favorite.author ?? null,
    original_json: favorite.originalJson,
    normalized_deck: favorite.normalizedDeck,
    created_at: favorite.createdAt,
    updated_at: favorite.updatedAt,
    last_result: favorite.lastResult ?? null,
    last_result_fingerprint: favorite.lastResultFingerprint ?? null,
    is_mounted: favorite.isMounted,
    mounted_at: favorite.mountedAt ?? null,
    allocation_priority: favorite.allocationPriority ?? null
  }));
}

export function parseCloudCollectionRows(rows: unknown[]): CollectionCard[] {
  return rows.map((raw) => {
    const row = cloudCollectionRowSchema.parse(raw);
    return {
      cardId: row.card_id,
      setCode: row.set_code,
      cardNumber: row.card_number,
      name: row.name ?? undefined,
      ownedCount: row.owned_count
    };
  });
}

export function parseCloudFavoriteDeckRows(rows: unknown[]): FavoriteDeck[] {
  return rows.map((raw) => {
    const row = cloudFavoriteDeckRowSchema.parse(raw);
    return {
      id: row.id,
      name: row.name,
      author: row.author ?? undefined,
      originalJson: row.original_json,
      normalizedDeck: row.normalized_deck as unknown as FavoriteDeck["normalizedDeck"],
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      lastResult: (row.last_result ?? undefined) as FavoriteDeck["lastResult"],
      lastResultFingerprint: row.last_result_fingerprint ?? undefined,
      isMounted: row.is_mounted,
      mountedAt: row.mounted_at ? new Date(row.mounted_at).toISOString() : undefined,
      allocationPriority: row.allocation_priority ?? undefined
    };
  });
}

export function buildRemoteImportResult(
  cards: CollectionCard[],
  importedAt: string
): CollectionImportResult {
  return {
    source: "remote",
    importedAt,
    rowsProcessed: cards.length,
    cardsRecognized: cards.length,
    rowsIgnored: 0,
    invalidValues: 0,
    totalCopies: cards.reduce((sum, card) => sum + card.ownedCount, 0),
    setsFound: [...new Set(cards.map((card) => card.setCode))].sort(),
    warnings: [],
    cards
  };
}

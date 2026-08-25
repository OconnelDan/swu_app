import { z } from "zod";

const deckCountsSchema = z.record(z.number().int().min(0).max(99));

const subdeckSchema = z.object({
  name: z.string().optional(),
  leaderId: z.string().optional(),
  leaderIds: z.array(z.string()).optional(),
  baseId: z.string().optional(),
  mainCounts: deckCountsSchema,
  sideboardCounts: deckCountsSchema
});

const deckBuilderDraftSchema = z.object({
  version: z.literal(1),
  savedAt: z.string(),
  sourceFavoriteUpdatedAt: z.string().optional(),
  format: z.enum(["premier", "eternal", "twin-suns", "trilogy"]),
  trilogyCardPool: z.enum(["premier", "eternal"]),
  name: z.string(),
  decks: z.array(subdeckSchema).min(1),
  activeDeckIndex: z.number().int().min(0),
  activeTab: z.enum(["leader", "base", "cards"]),
  query: z.string(),
  manualAspects: z.array(z.string()).nullable(),
  includeColorless: z.boolean(),
  selectedTypes: z.array(z.enum(["ground-unit", "space-unit", "event", "upgrade"])),
  selectedSetCodes: z.array(z.string()),
  selectedRarities: z.array(z.string()),
  maximumCost: z.string(),
  ownedFilter: z.enum(["all", "owned", "free"]),
  cardPage: z.number().int().min(1),
  scrollY: z.number().finite().min(0).optional().default(0)
});

export type DeckBuilderDraft = z.infer<typeof deckBuilderDraftSchema>;

const STORAGE_PREFIX = "swu-deck-builder-draft-v1";
const ACTIVE_STORAGE_PREFIX = "swu-deck-builder-active-v1";
export const DECK_BUILDER_DRAFT_CHANGE_EVENT = "swu-deck-builder-draft-change";

const activeDraftPointerSchema = z.object({
  version: z.literal(1),
  favoriteId: z.string().nullable(),
  savedAt: z.string()
});

export interface ActiveDeckBuilderDraft {
  favoriteId?: string;
  path: string;
  name: string;
  format: DeckBuilderDraft["format"];
  savedAt: string;
}

function draftStorageKey(scope: string, favoriteId?: string): string {
  const target = favoriteId ? `favorite:${favoriteId}` : "new";
  return `${STORAGE_PREFIX}:${encodeURIComponent(scope)}:${encodeURIComponent(target)}`;
}

function activeDraftStorageKey(scope: string): string {
  return `${ACTIVE_STORAGE_PREFIX}:${encodeURIComponent(scope)}`;
}

function notifyDraftChange(scope: string): void {
  window.dispatchEvent(new CustomEvent(DECK_BUILDER_DRAFT_CHANGE_EVENT, { detail: { scope } }));
}

export function getDeckBuilderDraftPath(favoriteId?: string): string {
  return favoriteId ? `/mazos/editar/${encodeURIComponent(favoriteId)}` : "/mazos/crear";
}

/** Lee un borrador local sin permitir que un dato antiguo o corrupto bloquee el creador. */
export function loadDeckBuilderDraft(
  scope: string,
  favoriteId?: string
): DeckBuilderDraft | undefined {
  try {
    const key = draftStorageKey(scope, favoriteId);
    const serialized = localStorage.getItem(key);
    if (!serialized) return undefined;

    const parsed = deckBuilderDraftSchema.safeParse(JSON.parse(serialized));
    if (parsed.success) return parsed.data;

    localStorage.removeItem(key);
    return undefined;
  } catch {
    return undefined;
  }
}

/** Guarda de forma síncrona para resistir una navegación o recarga accidental inmediata. */
export function saveDeckBuilderDraft(
  scope: string,
  favoriteId: string | undefined,
  draft: DeckBuilderDraft
): boolean {
  try {
    localStorage.setItem(draftStorageKey(scope, favoriteId), JSON.stringify(draft));
    localStorage.setItem(
      activeDraftStorageKey(scope),
      JSON.stringify({ version: 1, favoriteId: favoriteId ?? null, savedAt: draft.savedAt })
    );
    notifyDraftChange(scope);
    return true;
  } catch {
    return false;
  }
}

/** Devuelve el último editor activo y descarta punteros que ya no tengan borrador. */
export function loadActiveDeckBuilderDraft(scope: string): ActiveDeckBuilderDraft | undefined {
  try {
    const serialized = localStorage.getItem(activeDraftStorageKey(scope));
    if (!serialized) return undefined;

    const pointer = activeDraftPointerSchema.safeParse(JSON.parse(serialized));
    if (!pointer.success) {
      localStorage.removeItem(activeDraftStorageKey(scope));
      return undefined;
    }

    const favoriteId = pointer.data.favoriteId ?? undefined;
    const draft = loadDeckBuilderDraft(scope, favoriteId);
    if (!draft) {
      localStorage.removeItem(activeDraftStorageKey(scope));
      return undefined;
    }

    return {
      ...(favoriteId ? { favoriteId } : {}),
      path: getDeckBuilderDraftPath(favoriteId),
      name: draft.name,
      format: draft.format,
      savedAt: draft.savedAt
    };
  } catch {
    return undefined;
  }
}

export function clearDeckBuilderDraft(scope: string, favoriteId?: string): void {
  try {
    localStorage.removeItem(draftStorageKey(scope, favoriteId));
    const serialized = localStorage.getItem(activeDraftStorageKey(scope));
    const pointer = serialized
      ? activeDraftPointerSchema.safeParse(JSON.parse(serialized))
      : undefined;
    if (pointer?.success && (pointer.data.favoriteId ?? undefined) === favoriteId) {
      localStorage.removeItem(activeDraftStorageKey(scope));
    }
    notifyDraftChange(scope);
  } catch {
    // El guardado automático es una protección adicional y nunca debe bloquear la pantalla.
  }
}

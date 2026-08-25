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
  cardPage: z.number().int().min(1)
});

export type DeckBuilderDraft = z.infer<typeof deckBuilderDraftSchema>;

const STORAGE_PREFIX = "swu-deck-builder-draft-v1";

function draftStorageKey(scope: string, favoriteId?: string): string {
  const target = favoriteId ? `favorite:${favoriteId}` : "new";
  return `${STORAGE_PREFIX}:${encodeURIComponent(scope)}:${encodeURIComponent(target)}`;
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
    return true;
  } catch {
    return false;
  }
}

export function clearDeckBuilderDraft(scope: string, favoriteId?: string): void {
  try {
    localStorage.removeItem(draftStorageKey(scope, favoriteId));
  } catch {
    // El guardado automático es una protección adicional y nunca debe bloquear la pantalla.
  }
}

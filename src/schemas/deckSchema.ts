import { z } from "zod";

/** Una entrada de carta { id, count } tal y como aparece en casi todos los formatos. */
export const cardEntrySchema = z.object({
  id: z.string().min(1, "La carta no tiene 'id'"),
  count: z
    .number({ invalid_type_error: "'count' debe ser numérico" })
    .refine((n) => n > 0, "'count' debe ser mayor que cero")
});

export type CardEntry = z.infer<typeof cardEntrySchema>;

const leaderBaseRefSchema = z.union([
  cardEntrySchema,
  z.string().min(1) // formatos que solo dan "leader_id": "JTL_001"
]);

const rawDeckPartSchema = z
  .object({
    name: z.string().optional(),
    leader: leaderBaseRefSchema.optional(),
    leaders: z.array(leaderBaseRefSchema).optional(),
    leader_id: z.string().optional(),
    secondleader: leaderBaseRefSchema.optional(),
    secondLeader: leaderBaseRefSchema.optional(),
    second_leader: leaderBaseRefSchema.optional(),
    secondleader_id: z.string().optional(),
    secondLeaderId: z.string().optional(),
    second_leader_id: z.string().optional(),
    leader2: leaderBaseRefSchema.optional(),
    leader_2: leaderBaseRefSchema.optional(),
    leader2_id: z.string().optional(),
    leader_2_id: z.string().optional(),
    base: leaderBaseRefSchema.optional(),
    base_id: z.string().optional(),
    deck: z.array(cardEntrySchema).optional(),
    mainDeck: z.array(cardEntrySchema).optional(),
    mainboard: z.array(cardEntrySchema).optional(),
    cards: z.array(cardEntrySchema).optional(),
    sideboard: z.array(cardEntrySchema).optional(),
    deck_grouped: z.record(z.array(cardEntrySchema)).optional(),
    sideboard_grouped: z.record(z.array(cardEntrySchema)).optional()
  })
  .passthrough();

export type RawDeckPart = z.infer<typeof rawDeckPartSchema>;

/** Esquema laxo: acepta cualquier combinación de las claves reconocidas. */
export const rawDeckJsonSchema = rawDeckPartSchema
  .extend({
    metadata: z
      .object({
        name: z.string().optional(),
        author: z.string().optional(),
        format: z.string().optional(),
        source: z.string().optional(),
        cardPool: z.string().optional(),
        trilogyCardPool: z.string().optional()
      })
      .partial()
      .optional(),
    author: z.string().optional(),
    format: z.string().optional(),
    trilogyCardPool: z.string().optional(),
    trilogyDecks: z.array(rawDeckPartSchema).optional(),
    decks: z.array(rawDeckPartSchema).optional()
  })
  .passthrough();

export type RawDeckJson = z.infer<typeof rawDeckJsonSchema>;

export function parseDeckJsonText(text: string): unknown {
  if (!text || !text.trim()) {
    throw new Error("El JSON está vacío. Pega el contenido de un mazo.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("El JSON no tiene un formato válido. Revisa comas, llaves y comillas.");
  }
}

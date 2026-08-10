import { z } from "zod";

export const BACKUP_VERSION = 1;

export const backupSchema = z.object({
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  collection: z.array(
    z.object({
      cardId: z.string(),
      setCode: z.string(),
      cardNumber: z.string(),
      name: z.string().optional(),
      ownedCount: z.number()
    })
  ),
  favoriteDecks: z.array(z.record(z.unknown())),
  deckChecks: z.array(z.record(z.unknown())),
  settings: z.record(z.unknown())
});

export type Backup = z.infer<typeof backupSchema>;

export function parseBackupText(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("El archivo de copia de seguridad no es un JSON válido.");
  }
  const result = backupSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      `El archivo de copia de seguridad no tiene el formato esperado: ${issue?.message ?? ""}`
    );
  }
  return result.data;
}

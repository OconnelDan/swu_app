import { db } from "@/db/db";
import { BACKUP_VERSION, parseBackupText, type Backup } from "@/schemas/backupSchema";

export async function exportBackup(): Promise<Backup> {
  const [collection, favoriteDecks, deckChecks, settingsRows] = await Promise.all([
    db.collectionEntries.toArray(),
    db.favoriteDecks.toArray(),
    db.deckChecks.toArray(),
    db.settings.toArray()
  ]);

  const settings: Record<string, unknown> = {};
  for (const row of settingsRows) settings[row.key] = row.value;

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    collection,
    favoriteDecks: favoriteDecks as unknown as Record<string, unknown>[],
    deckChecks: deckChecks as unknown as Record<string, unknown>[],
    settings
  };
}

export function exportBackupAsJsonText(backup: Backup): string {
  return JSON.stringify(backup, null, 2);
}

/** Restaura una copia de seguridad, sustituyendo por completo los datos locales. */
export async function importBackupFromText(text: string): Promise<void> {
  const backup = parseBackupText(text);

  await db.transaction(
    "rw",
    db.collectionEntries,
    db.favoriteDecks,
    db.deckChecks,
    db.settings,
    async () => {
      await Promise.all([
        db.collectionEntries.clear(),
        db.favoriteDecks.clear(),
        db.deckChecks.clear(),
        db.settings.clear()
      ]);

      await db.collectionEntries.bulkPut(backup.collection);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.favoriteDecks.bulkPut(backup.favoriteDecks as any[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.deckChecks.bulkPut(backup.deckChecks as any[]);
      await db.settings.bulkPut(
        Object.entries(backup.settings).map(([key, value]) => ({ key, value }))
      );
    }
  );
}

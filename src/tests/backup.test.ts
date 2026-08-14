import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/db";
import { exportBackup, exportBackupAsJsonText, importBackupFromText } from "@/lib/backup";
import { normalizeDeckJson } from "@/lib/normalizeDeckJson";

describe("copia de seguridad", () => {
  beforeEach(async () => {
    await Promise.all([
      db.collectionEntries.clear(),
      db.favoriteDecks.clear(),
      db.deckChecks.clear(),
      db.settings.clear()
    ]);
  });

  it("caso 11: exporta e importa/restaura una copia de seguridad completa", async () => {
    await db.collectionEntries.put({
      cardId: "SOR_001",
      setCode: "SOR",
      cardNumber: "001",
      ownedCount: 3
    });
    await db.settings.put({ key: "theme", value: "dark" });
    const deck = normalizeDeckJson({ name: "Montado", deck: [{ id: "SOR_001", count: 2 }] });
    await db.favoriteDecks.put({
      id: "mounted-deck",
      name: deck.name,
      originalJson: deck.originalJson,
      normalizedDeck: deck,
      createdAt: "2026-08-14T10:00:00.000Z",
      updatedAt: "2026-08-14T10:00:00.000Z",
      isMounted: true,
      mountedAt: "2026-08-14T10:00:00.000Z",
      allocationPriority: 1,
      preferredCardIds: ["SOR_001"]
    });

    const backup = await exportBackup();
    expect(backup.version).toBe(1);
    expect(backup.collection).toHaveLength(1);

    const json = exportBackupAsJsonText(backup);

    // Simula pérdida de datos y restauración
    await db.collectionEntries.clear();
    await db.settings.clear();
    expect(await db.collectionEntries.count()).toBe(0);

    await importBackupFromText(json);

    const restoredCollection = await db.collectionEntries.toArray();
    expect(restoredCollection).toHaveLength(1);
    expect(restoredCollection[0].cardId).toBe("SOR_001");

    const restoredSetting = await db.settings.get("theme");
    expect(restoredSetting?.value).toBe("dark");
    expect(await db.favoriteDecks.get("mounted-deck")).toMatchObject({
      isMounted: true,
      preferredCardIds: ["SOR_001"]
    });
  });

  it("rechaza un archivo de copia de seguridad con formato inválido", async () => {
    await expect(importBackupFromText("{ esto no es json valido")).rejects.toThrow();
    await expect(importBackupFromText(JSON.stringify({ version: 99 }))).rejects.toThrow();
  });

  it("restaura los favoritos antiguos como no montados", async () => {
    const oldBackup = {
      version: 1,
      exportedAt: "2026-08-10T10:00:00.000Z",
      collection: [],
      favoriteDecks: [
        {
          id: "old-favorite",
          name: "Idea antigua",
          normalizedDeck: { allRequiredCards: [] },
          originalJson: {},
          createdAt: "2026-08-10T10:00:00.000Z",
          updatedAt: "2026-08-10T10:00:00.000Z"
        }
      ],
      deckChecks: [],
      settings: {}
    };

    await importBackupFromText(JSON.stringify(oldBackup));

    expect(await db.favoriteDecks.get("old-favorite")).toMatchObject({
      name: "Idea antigua",
      isMounted: false,
      preferredCardIds: []
    });
  });
});

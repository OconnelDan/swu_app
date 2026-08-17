import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn()
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { rpc: mocks.rpc }
}));

import {
  loadCollectionBackupSettings,
  updateCollectionBackupSettings
} from "@/lib/collectionBackupRepository";

const settingsRow = {
  email_enabled: true,
  inactivity_minutes: 15,
  timezone: "Europe/Madrid",
  last_change_at: "2026-08-17T10:00:00.000Z",
  last_backed_up_change_at: "2026-08-16T10:00:00.000Z",
  last_email_sent_at: "2026-08-16T10:15:00.000Z",
  has_pending_changes: true,
  last_error: null
};

describe("configuración del backup diario de colección", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
  });

  it("carga y normaliza la configuración de Supabase", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [settingsRow], error: null });

    await expect(loadCollectionBackupSettings()).resolves.toEqual({
      emailEnabled: true,
      inactivityMinutes: 15,
      timezone: "Europe/Madrid",
      lastChangeAt: "2026-08-17T10:00:00.000Z",
      lastBackedUpChangeAt: "2026-08-16T10:00:00.000Z",
      lastEmailSentAt: "2026-08-16T10:15:00.000Z",
      hasPendingChanges: true,
      lastError: null
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_my_collection_backup_settings");
  });

  it("guarda activación, inactividad y zona horaria", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: settingsRow, error: null });

    await updateCollectionBackupSettings(true, 15);

    expect(mocks.rpc).toHaveBeenCalledWith("update_my_collection_backup_settings", {
      p_email_enabled: true,
      p_inactivity_minutes: 15,
      p_timezone: expect.any(String)
    });
  });

  it("propaga el error de Supabase", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Falta la migración" } });

    await expect(loadCollectionBackupSettings()).rejects.toThrow("Falta la migración");
  });
});

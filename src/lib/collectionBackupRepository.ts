import { supabase } from "@/lib/supabaseClient";

export const COLLECTION_BACKUP_INACTIVITY_OPTIONS = [15, 30, 60] as const;

export type CollectionBackupInactivityMinutes =
  (typeof COLLECTION_BACKUP_INACTIVITY_OPTIONS)[number];

export interface CollectionBackupSettings {
  emailEnabled: boolean;
  inactivityMinutes: CollectionBackupInactivityMinutes;
  timezone: string;
  lastChangeAt: string | null;
  lastBackedUpChangeAt: string | null;
  lastEmailSentAt: string | null;
  hasPendingChanges: boolean;
  lastError: string | null;
}

interface CollectionBackupSettingsRow {
  email_enabled?: unknown;
  inactivity_minutes?: unknown;
  timezone?: unknown;
  last_change_at?: unknown;
  last_backed_up_change_at?: unknown;
  last_email_sent_at?: unknown;
  has_pending_changes?: unknown;
  last_error?: unknown;
}

function requireClient() {
  if (!supabase) throw new Error("Las copias automáticas no están configuradas.");
  return supabase;
}

function parseNullableDate(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`Supabase ha devuelto ${fieldName} con un formato inválido.`);
  }
  return new Date(value).toISOString();
}

function parseSettingsRow(value: unknown): CollectionBackupSettings {
  const row = (Array.isArray(value) ? value[0] : value) as
    CollectionBackupSettingsRow | null | undefined;

  if (!row || typeof row !== "object") {
    throw new Error("Supabase no ha devuelto la configuración de las copias automáticas.");
  }

  const inactivityMinutes = Number(row.inactivity_minutes);
  if (
    !COLLECTION_BACKUP_INACTIVITY_OPTIONS.includes(
      inactivityMinutes as CollectionBackupInactivityMinutes
    )
  ) {
    throw new Error("El tiempo de inactividad configurado no es válido.");
  }

  if (typeof row.email_enabled !== "boolean" || typeof row.timezone !== "string") {
    throw new Error("La configuración de las copias automáticas no tiene el formato esperado.");
  }

  return {
    emailEnabled: row.email_enabled,
    inactivityMinutes: inactivityMinutes as CollectionBackupInactivityMinutes,
    timezone: row.timezone,
    lastChangeAt: parseNullableDate(row.last_change_at, "la fecha del último cambio"),
    lastBackedUpChangeAt: parseNullableDate(
      row.last_backed_up_change_at,
      "la fecha de la última copia"
    ),
    lastEmailSentAt: parseNullableDate(row.last_email_sent_at, "la fecha del último correo"),
    hasPendingChanges: row.has_pending_changes === true,
    lastError: typeof row.last_error === "string" ? row.last_error : null
  };
}

function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Madrid";
  } catch {
    return "Europe/Madrid";
  }
}

export async function loadCollectionBackupSettings(): Promise<CollectionBackupSettings> {
  const client = requireClient();
  const { data, error } = await client.rpc("get_my_collection_backup_settings");
  if (error) throw new Error(error.message);
  return parseSettingsRow(data);
}

export async function updateCollectionBackupSettings(
  emailEnabled: boolean,
  inactivityMinutes: CollectionBackupInactivityMinutes
): Promise<CollectionBackupSettings> {
  const client = requireClient();
  const { data, error } = await client.rpc("update_my_collection_backup_settings", {
    p_email_enabled: emailEnabled,
    p_inactivity_minutes: inactivityMinutes,
    p_timezone: getBrowserTimezone()
  });
  if (error) throw new Error(error.message);
  return parseSettingsRow(data);
}

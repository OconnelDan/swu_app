import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import {
  buildChangesCsv,
  calculateCollectionChanges,
  encodeBase64,
  escapeHtml,
  parseSnapshot,
  type CollectionChange,
  type SnapshotCard
} from "./collectionBackupEmail.ts";

interface ClaimedBackup {
  delivery_id: string;
  user_id: string;
  change_through_at: string;
  timezone: string;
  current_snapshot: unknown;
  previous_snapshot: unknown;
}

interface EmailSummary {
  differentCards: number;
  totalCopies: number;
  addedCopies: number;
  removedCopies: number;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const resendApiKey = Deno.env.get("RESEND_API_KEY");
const emailFrom = Deno.env.get("BACKUP_EMAIL_FROM");
const cronSecret = Deno.env.get("BACKUP_CRON_SECRET");

function requireEnvironment(): void {
  const missing = [
    ["SUPABASE_URL", supabaseUrl],
    ["SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey],
    ["RESEND_API_KEY", resendApiKey],
    ["BACKUP_EMAIL_FROM", emailFrom],
    ["BACKUP_CRON_SECRET", cronSecret]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Faltan secretos de la función: ${missing.join(", ")}.`);
  }
}

function summarizeCollection(cards: SnapshotCard[], changes: CollectionChange[]): EmailSummary {
  return {
    differentCards: cards.filter((card) => card.ownedCount > 0).length,
    totalCopies: cards.reduce((sum, card) => sum + card.ownedCount, 0),
    addedCopies: changes.reduce((sum, change) => sum + Math.max(0, change.difference), 0),
    removedCopies: changes.reduce((sum, change) => sum + Math.max(0, -change.difference), 0)
  };
}

function formatDate(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: timezone
  }).format(new Date(value));
}

function fileDate(value: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone
  }).formatToParts(new Date(value));
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

function buildChangeList(changes: CollectionChange[]): string {
  const visible = changes.slice(0, 20);
  const items = visible
    .map((change) => {
      const sign = change.difference > 0 ? "+" : "";
      const name = change.name ? ` · ${escapeHtml(change.name)}` : "";
      return `<li><strong>${sign}${change.difference}</strong> ${escapeHtml(change.cardId)}${name} (${change.previousCount} → ${change.currentCount})</li>`;
    })
    .join("");
  const remaining = changes.length - visible.length;
  return `<ul>${items}</ul>${remaining > 0 ? `<p>Y ${remaining} carta(s) más en el CSV adjunto.</p>` : ""}`;
}

function buildEmailHtml(
  changeThroughAt: string,
  timezone: string,
  summary: EmailSummary,
  changes: CollectionChange[]
): string {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:680px;margin:auto">
      <h1 style="font-size:22px">Copia diaria de tu colección SWU</h1>
      <p>Tu colección cambió y ya ha transcurrido el tiempo de inactividad configurado.</p>
      <table style="border-collapse:collapse;width:100%;margin:18px 0">
        <tr><td style="padding:8px;border:1px solid #d1d5db">Cartas diferentes</td><td style="padding:8px;border:1px solid #d1d5db"><strong>${summary.differentCards}</strong></td></tr>
        <tr><td style="padding:8px;border:1px solid #d1d5db">Copias totales</td><td style="padding:8px;border:1px solid #d1d5db"><strong>${summary.totalCopies}</strong></td></tr>
        <tr><td style="padding:8px;border:1px solid #d1d5db">Copias añadidas</td><td style="padding:8px;border:1px solid #d1d5db"><strong>+${summary.addedCopies}</strong></td></tr>
        <tr><td style="padding:8px;border:1px solid #d1d5db">Copias retiradas</td><td style="padding:8px;border:1px solid #d1d5db"><strong>-${summary.removedCopies}</strong></td></tr>
      </table>
      <h2 style="font-size:18px">Cambios incluidos</h2>
      ${buildChangeList(changes)}
      <p>Se adjuntan dos archivos:</p>
      <ul>
        <li><strong>coleccion-swu.json</strong>: copia completa que puedes volver a importar en la aplicación.</li>
        <li><strong>cambios-swu.csv</strong>: resumen de las cantidades modificadas.</li>
      </ul>
      <p style="font-size:12px;color:#6b7280">Cambios incluidos hasta ${escapeHtml(formatDate(changeThroughAt, timezone))}. Como máximo se envía un correo por día.</p>
    </div>`;
}

function buildEmailText(
  changeThroughAt: string,
  timezone: string,
  summary: EmailSummary,
  changes: CollectionChange[]
): string {
  const visibleChanges = changes
    .slice(0, 20)
    .map((change) => {
      const sign = change.difference > 0 ? "+" : "";
      return `- ${sign}${change.difference} ${change.cardId}${change.name ? ` · ${change.name}` : ""} (${change.previousCount} -> ${change.currentCount})`;
    })
    .join("\n");

  return [
    "Copia diaria de tu colección SWU",
    "",
    `Cartas diferentes: ${summary.differentCards}`,
    `Copias totales: ${summary.totalCopies}`,
    `Copias añadidas: +${summary.addedCopies}`,
    `Copias retiradas: -${summary.removedCopies}`,
    "",
    "Cambios incluidos:",
    visibleChanges,
    changes.length > 20 ? `Y ${changes.length - 20} carta(s) más en el CSV adjunto.` : "",
    "",
    "El JSON adjunto es una copia completa que puedes volver a importar en la aplicación.",
    `Cambios incluidos hasta ${formatDate(changeThroughAt, timezone)}.`
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendBackupEmail(
  delivery: ClaimedBackup,
  email: string,
  currentSnapshot: SnapshotCard[],
  changes: CollectionChange[],
  summary: EmailSummary
): Promise<string> {
  // El nombre refleja el día real del envío. Es importante cuando los cambios
  // hechos después del correo de ayer quedan pendientes para hoy.
  const date = fileDate(new Date().toISOString(), delivery.timezone);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `swu-collection-backup-${delivery.delivery_id}`
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [email],
      subject: `Copia diaria de tu colección SWU · ${date}`,
      html: buildEmailHtml(delivery.change_through_at, delivery.timezone, summary, changes),
      text: buildEmailText(delivery.change_through_at, delivery.timezone, summary, changes),
      attachments: [
        {
          filename: `coleccion-swu-${date}.json`,
          content: encodeBase64(`${JSON.stringify(currentSnapshot, null, 2)}\n`)
        },
        {
          filename: `cambios-swu-${date}.csv`,
          content: encodeBase64(buildChangesCsv(changes))
        }
      ],
      tags: [{ name: "type", value: "collection_backup" }]
    })
  });

  const result = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    error?: string;
  };
  if (!response.ok || !result.id) {
    throw new Error(result.message ?? result.error ?? `Resend ha respondido ${response.status}.`);
  }
  return result.id;
}

Deno.serve(async (request: Request) => {
  try {
    requireEnvironment();

    if (request.method !== "POST") {
      return Response.json({ error: "Método no permitido" }, { status: 405 });
    }
    if (request.headers.get("x-backup-cron-secret") !== cronSecret) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    const admin = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await admin.rpc("claim_due_collection_backups", { p_limit: 10 });
    if (error) throw new Error(error.message);

    const deliveries = (Array.isArray(data) ? data : []) as ClaimedBackup[];
    const results: Array<{ deliveryId: string; status: string; error?: string }> = [];

    for (const delivery of deliveries) {
      try {
        // Respeta una desactivación que ocurra después de reclamar el trabajo
        // pero antes de contactar con el proveedor de correo.
        const { data: activeSettings, error: settingsError } = await admin
          .from("collection_backup_settings")
          .select("email_enabled,pending_delivery_id")
          .eq("user_id", delivery.user_id)
          .maybeSingle();
        if (settingsError) throw new Error(settingsError.message);
        if (
          !activeSettings?.email_enabled ||
          activeSettings.pending_delivery_id !== delivery.delivery_id
        ) {
          const { error: skipError } = await admin.rpc("skip_collection_backup_delivery", {
            p_delivery_id: delivery.delivery_id,
            p_reason: "El usuario desactivó la copia antes del envío."
          });
          if (skipError) throw new Error(skipError.message);
          results.push({ deliveryId: delivery.delivery_id, status: "skipped" });
          continue;
        }

        const currentSnapshot = parseSnapshot(delivery.current_snapshot);
        const previousSnapshot = parseSnapshot(delivery.previous_snapshot);
        const changes = calculateCollectionChanges(previousSnapshot, currentSnapshot);

        if (changes.length === 0) {
          const { error: skipError } = await admin.rpc("skip_collection_backup_delivery", {
            p_delivery_id: delivery.delivery_id,
            p_reason: "La colección volvió al estado de la última copia; no había cambios netos."
          });
          if (skipError) throw new Error(skipError.message);
          results.push({ deliveryId: delivery.delivery_id, status: "skipped" });
          continue;
        }

        const { data: userData, error: userError } = await admin.auth.admin.getUserById(
          delivery.user_id
        );
        if (userError) throw new Error(userError.message);
        const email = userData.user?.email;
        if (!email || !userData.user.email_confirmed_at) {
          throw new Error("La cuenta no tiene un correo verificado.");
        }

        const summary = summarizeCollection(currentSnapshot, changes);
        const providerMessageId = await sendBackupEmail(
          delivery,
          email,
          currentSnapshot,
          changes,
          summary
        );

        const { error: completeError } = await admin.rpc("complete_collection_backup_delivery", {
          p_delivery_id: delivery.delivery_id,
          p_provider_message_id: providerMessageId,
          p_changed_card_count: changes.length,
          p_card_count: summary.differentCards,
          p_total_copies: summary.totalCopies
        });
        if (completeError) throw new Error(completeError.message);
        results.push({ deliveryId: delivery.delivery_id, status: "sent" });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Error de envío desconocido.";
        await admin.rpc("fail_collection_backup_delivery", {
          p_delivery_id: delivery.delivery_id,
          p_error: message
        });
        results.push({ deliveryId: delivery.delivery_id, status: "failed", error: message });
      }
    }

    return Response.json({ claimed: deliveries.length, results });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Error interno desconocido.";
    console.error(message);
    return Response.json({ error: message }, { status: 500 });
  }
});

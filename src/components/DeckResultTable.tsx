import type { CardComparison, DeckZone } from "@/types/deck";
import type { FriendCardAvailability } from "@/lib/friendsRepository";
import { useSettings } from "@/hooks/useSettings";
import { CardImageThumbnail } from "./CardImageThumbnail";

const ZONE_LABELS: Record<DeckZone, string> = {
  leader: "Líder",
  base: "Base",
  main: "Mazo principal",
  sideboard: "Banquillo"
};

function zoneLabel(zones: DeckZone[]): string {
  return zones.map((z) => ZONE_LABELS[z]).join(" + ");
}

function usedElsewhereLabel(row: CardComparison): string | undefined {
  if (!row.usedElsewhere || row.usedElsewhere.length === 0) return undefined;
  return row.usedElsewhere.map((a) => `${a.usedCount}x en «${a.favoriteName}»`).join(", ");
}

function friendsLabel(entries: FriendCardAvailability[] | undefined): string | undefined {
  if (!entries || entries.length === 0) return undefined;
  return entries
    .map(
      (friend) => `${friend.friendUsername}: ${friend.freeCount} libre(s) de ${friend.ownedCount}`
    )
    .join(", ");
}

interface DeckResultTableProps {
  comparisons: CardComparison[];
  showAll: boolean;
  friendAvailability?: Map<string, FriendCardAvailability[]>;
}

export function DeckResultTable({
  comparisons,
  showAll,
  friendAvailability
}: DeckResultTableProps) {
  const { settings } = useSettings();
  const rows = showAll ? comparisons : comparisons.filter((c) => c.status === "missing");

  if (rows.length === 0) {
    return (
      <p className="card text-center text-sm text-slate-300">
        {showAll ? "No hay cartas en el mazo." : "No falta ninguna carta con este filtro."}
      </p>
    );
  }

  return (
    <>
      {/* Tabla en pantallas medianas y grandes */}
      <table
        className="hidden w-full border-collapse text-left text-sm sm:table"
        aria-label="Resultado de la comprobación del mazo"
      >
        <thead>
          <tr className="border-b border-space-700 text-xs uppercase tracking-wide text-slate-400">
            <th scope="col" className="py-2 pr-2">
              Código
            </th>
            <th scope="col" className="py-2 pr-2">
              Carta
            </th>
            <th scope="col" className="py-2 pr-2 text-right">
              Necesitas
            </th>
            <th scope="col" className="py-2 pr-2 text-right">
              Tienes
            </th>
            <th scope="col" className="py-2 pr-2 text-right">
              Te faltan
            </th>
            <th scope="col" className="py-2 pr-2">
              Zona
            </th>
            <th scope="col" className="py-2 pr-2">
              Usadas en otros mazos
            </th>
            <th scope="col" className="py-2 pr-2">
              Amigos con esta carta
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.cardId} className="border-b border-space-800">
              <td className="py-2 pr-2 font-mono text-slate-300">{row.cardId}</td>
              <td className="py-2 pr-2">
                <div className="flex items-center gap-2">
                  {settings.showImages && row.imageUrl && (
                    <CardImageThumbnail src={row.imageUrl} className="h-10 w-auto rounded" />
                  )}
                  <span>{row.cardName ?? "—"}</span>
                </div>
              </td>
              <td className="py-2 pr-2 text-right">{row.requiredCount}</td>
              <td className="py-2 pr-2 text-right">{row.ownedCount}</td>
              <td className="py-2 pr-2 text-right font-semibold">
                <span className={row.missingCount > 0 ? "text-saber-red" : "text-saber-green"}>
                  {row.missingCount}
                </span>
              </td>
              <td className="py-2 pr-2 text-slate-400">{zoneLabel(row.zones)}</td>
              <td className="py-2 pr-2 text-xs text-slate-400">{usedElsewhereLabel(row) ?? "—"}</td>
              <td className="py-2 pr-2 text-xs text-slate-400">
                {friendsLabel(friendAvailability?.get(row.cardId)) ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Tarjetas en móvil */}
      <ul className="space-y-2 sm:hidden">
        {rows.map((row) => (
          <li
            key={row.cardId}
            className={`card ${row.status === "missing" ? "border-saber-red/40" : "border-saber-green/40"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                {settings.showImages && row.imageUrl && (
                  <CardImageThumbnail src={row.imageUrl} className="h-14 w-auto rounded" />
                )}
                <div>
                  <p className="font-mono text-xs text-slate-400">{row.cardId}</p>
                  <p className="font-semibold">{row.cardName ?? "Carta sin nombre en caché"}</p>
                  <p className="mt-1 text-xs text-slate-400">{zoneLabel(row.zones)}</p>
                </div>
              </div>
              <span className={row.status === "missing" ? "badge-missing" : "badge-complete"}>
                {row.status === "missing" ? `Faltan ${row.missingCount}` : "Completa"}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <dt className="text-slate-400">Necesitas</dt>
                <dd className="font-semibold">{row.requiredCount}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Tienes</dt>
                <dd className="font-semibold">{row.ownedCount}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Te faltan</dt>
                <dd className="font-semibold">{row.missingCount}</dd>
              </div>
            </dl>
            {usedElsewhereLabel(row) && (
              <p className="mt-2 text-xs text-slate-400">
                Usadas en otros mazos: {usedElsewhereLabel(row)}
              </p>
            )}
            {friendsLabel(friendAvailability?.get(row.cardId)) && (
              <p className="mt-1 text-xs text-saber-green">
                Amigos con esta carta: {friendsLabel(friendAvailability?.get(row.cardId))}
              </p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

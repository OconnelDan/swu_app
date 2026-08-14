import { useMemo, useState } from "react";
import { Check, Copy, Download, Star, RefreshCw } from "lucide-react";
import type { DeckComparisonResult } from "@/types/deck";

interface DeckSummaryProps {
  result: DeckComparisonResult;
  onSaveFavorite?: () => void;
  onRecheck?: () => void;
  isFavorite?: boolean;
}

function buildMissingListText(result: DeckComparisonResult): string {
  return result.missingCards
    .map((c) => `${c.missingCount}x ${c.cardId}${c.cardName ? ` – ${c.cardName}` : ""}`)
    .join("\n");
}

function buildCsv(result: DeckComparisonResult): string {
  const header = "Codigo,Carta,Necesitas,Tienes,TeFaltan,Zona";
  const rows = result.comparisons.map((c) =>
    [c.cardId, c.cardName ?? "", c.requiredCount, c.ownedCount, c.missingCount, c.zones.join("+")]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header, ...rows].join("\n");
}

function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function DeckSummary({ result, onSaveFavorite, onRecheck, isFavorite }: DeckSummaryProps) {
  const [copied, setCopied] = useState(false);
  const missingListText = useMemo(() => buildMissingListText(result), [result]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(missingListText || "No te falta ninguna carta.");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {result.complete ? (
        <div className="card border-saber-green/50 bg-saber-green/10 text-center">
          <h2 className="font-display text-xl text-saber-green">
            Tienes todas las cartas necesarias
          </h2>
        </div>
      ) : (
        <div className="card border-saber-red/50 bg-saber-red/10 text-center">
          <h2 className="font-display text-xl text-saber-red">Te faltan cartas para este mazo</h2>
        </div>
      )}

      <dl className="card grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-400">Mazo</dt>
          <dd className="font-semibold">{result.deckName}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Comprobado</dt>
          <dd className="font-semibold">{new Date(result.checkedAt).toLocaleString("es-ES")}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Mazo principal</dt>
          <dd className="font-semibold">{result.mainDeckCount} cartas</dd>
        </div>
        <div>
          <dt className="text-slate-400">Banquillo</dt>
          <dd className="font-semibold">{result.sideboardCount} cartas</dd>
        </div>
        <div>
          <dt className="text-slate-400">Líder</dt>
          <dd>
            <span
              className={result.leaderStatus === "missing" ? "badge-missing" : "badge-complete"}
            >
              {result.leaderStatus === "missing" ? "Pendiente" : "Cubierto"}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Base</dt>
          <dd>
            <span className={result.baseStatus === "missing" ? "badge-missing" : "badge-complete"}>
              {result.baseStatus === "missing" ? "Pendiente" : "Cubierta"}
            </span>
          </dd>
        </div>
      </dl>

      {!result.complete && (
        <div className="card space-y-1 text-sm">
          <p>
            Te faltan <strong>{result.differentMissingCards}</strong> cartas diferentes.
          </p>
          <p>
            Te faltan <strong>{result.totalMissingCopies}</strong> copias en total.
          </p>
        </div>
      )}

      {onSaveFavorite && (
        <p className="text-xs text-slate-400">
          Guardarlo en Favoritos conserva la lista para probarla más adelante, pero no reserva
          cartas. Podrás montarlo después desde la sección Mazos.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={handleCopy}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? "Copiado" : "Copiar lista de faltantes"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => downloadFile(missingListText, "cartas-faltantes.txt", "text/plain")}
        >
          <Download size={16} />
          Descargar TXT
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => downloadFile(buildCsv(result), "resultado-comprobacion.csv", "text/csv")}
        >
          <Download size={16} />
          Descargar CSV
        </button>
        {onSaveFavorite && (
          <button
            type="button"
            className="btn-primary"
            disabled={isFavorite}
            onClick={onSaveFavorite}
          >
            <Star size={16} />
            {isFavorite ? "Guardado en favoritos" : "Guardar como favorito"}
          </button>
        )}
        {onRecheck && (
          <button type="button" className="btn-secondary" onClick={onRecheck}>
            <RefreshCw size={16} />
            Volver a comprobar
          </button>
        )}
      </div>
    </div>
  );
}

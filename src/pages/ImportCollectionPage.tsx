import { useRef, useState } from "react";
import { AlertTriangle, FileUp } from "lucide-react";
import { ExcelCollectionProvider } from "@/providers/collectionProvider/ExcelCollectionProvider";
import { CsvCollectionProvider } from "@/providers/collectionProvider/CsvCollectionProvider";
import { JsonCollectionProvider } from "@/providers/collectionProvider/JsonCollectionProvider";
import { replaceCollection } from "@/db/db";
import type { CollectionImportResult } from "@/types/collection";

type Mode = "excel" | "csv" | "json";

function detectMode(fileName: string): Mode {
  if (fileName.endsWith(".csv")) return "csv";
  if (fileName.endsWith(".json")) return "json";
  return "excel";
}

export function ImportCollectionPage() {
  const [pendingResult, setPendingResult] = useState<CollectionImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const mode = detectMode(file.name);
      let result: CollectionImportResult;
      if (mode === "excel") {
        result = await new ExcelCollectionProvider().importFromSource({
          file,
          fileName: file.name
        });
      } else if (mode === "csv") {
        const text = await file.text();
        result = await new CsvCollectionProvider().importFromSource({
          text,
          fileName: file.name
        });
      } else {
        const text = await file.text();
        result = await new JsonCollectionProvider().importFromSource({
          text,
          fileName: file.name
        });
      }
      setPendingResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se ha podido leer el archivo.");
    } finally {
      setBusy(false);
    }
  };

  const handlePasteJson = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await new JsonCollectionProvider().importFromSource({ text: jsonText });
      setPendingResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "El JSON de colección no es válido.");
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = async () => {
    if (!pendingResult) return;
    await replaceCollection(pendingResult.cards, pendingResult);
    setPendingResult(null);
    setJsonText("");
  };

  return (
    <div className="space-y-4">
      <section className="card">
        <h2 className="mb-2 font-display text-base">Importar desde archivo</h2>
        <p className="mb-3 text-sm text-slate-400">
          Arrastra o selecciona el Excel (.xlsx) o CSV exportado de tu colección.
        </p>
        <div
          className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-space-600 p-4 text-center text-sm text-slate-300 hover:border-saber-blue"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          role="button"
          tabIndex={0}
          aria-label="Arrastra o selecciona el archivo de colección"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
          }}
        >
          <FileUp size={28} aria-hidden="true" />
          Arrastra tu archivo aquí o pulsa para seleccionarlo
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </div>
      </section>

      <section className="card">
        <h2 className="mb-2 font-display text-base">O pegar JSON de colección</h2>
        <label htmlFor="collection-json" className="sr-only">
          JSON de colección
        </label>
        <textarea
          id="collection-json"
          className="h-32 w-full rounded-lg border border-space-600 bg-space-950 p-3 font-mono text-xs"
          placeholder='[{"set":"LAW","number":38,"variants":[1,1,1]}]'
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
        <button
          type="button"
          className="btn-secondary mt-2"
          disabled={busy || !jsonText.trim()}
          onClick={handlePasteJson}
        >
          Procesar JSON
        </button>
      </section>

      {error && (
        <div role="alert" className="card flex items-start gap-2 border-saber-red/50 text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-saber-red" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      {pendingResult && (
        <section className="card space-y-2" aria-live="polite">
          <h2 className="font-display text-base text-saber-blue">Previsualización</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-slate-400">Filas procesadas</dt>
              <dd className="font-semibold">{pendingResult.rowsProcessed}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Cartas reconocidas</dt>
              <dd className="font-semibold">{pendingResult.cardsRecognized}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Filas ignoradas</dt>
              <dd className="font-semibold">{pendingResult.rowsIgnored}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Total de copias</dt>
              <dd className="font-semibold">{pendingResult.totalCopies}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-400">Sets encontrados</dt>
              <dd className="font-semibold">{pendingResult.setsFound.join(", ") || "—"}</dd>
            </div>
          </dl>
          {pendingResult.warnings.length > 0 && (
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer text-saber-yellow">
                {pendingResult.warnings.length} advertencia(s)
              </summary>
              <ul className="mt-1 list-inside list-disc space-y-1">
                {pendingResult.warnings.slice(0, 30).map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
            </details>
          )}
          <button type="button" className="btn-primary w-full" onClick={confirmImport}>
            Guardar como mi colección
          </button>
        </section>
      )}
    </div>
  );
}

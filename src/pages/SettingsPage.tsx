import { useRef, useState } from "react";
import { Database, Download, Trash2, Upload } from "lucide-react";
import { useDataSource } from "@/contexts/DataSourceContext";
import { useSettings } from "@/hooks/useSettings";
import { db } from "@/db/db";
import { exportBackup, exportBackupAsJsonText, importBackupFromText } from "@/lib/backup";

const APP_VERSION = "0.1.0";

export function SettingsPage() {
  const { settings, updateSetting } = useSettings();
  const { mode } = useDataSource();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportBackup = async () => {
    const backup = await exportBackup();
    const blob = new Blob([exportBackupAsJsonText(backup)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `swu-checker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = async (file: File) => {
    setError(null);
    setMessage(null);
    try {
      const text = await file.text();
      await importBackupFromText(text);
      setMessage("Copia de seguridad restaurada correctamente.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se ha podido restaurar la copia de seguridad.");
    }
  };

  const handleClearCollection = async () => {
    if (!confirm("¿Borrar la colección local? Esta acción no se puede deshacer.")) return;
    await db.collectionEntries.clear();
    setMessage("Colección local borrada.");
  };

  const handleClearFavorites = async () => {
    if (!confirm("¿Borrar todos los mazos favoritos? Esta acción no se puede deshacer.")) return;
    await db.favoriteDecks.clear();
    setMessage("Favoritos borrados.");
  };

  return (
    <div className="space-y-4">
      {message && (
        <div role="status" className="card border-saber-green/50 text-sm text-saber-green">
          {message}
        </div>
      )}
      {error && (
        <div role="alert" className="card border-saber-red/50 text-sm text-saber-red">
          {error}
        </div>
      )}

      <section className="card space-y-3">
        <h2 className="font-display text-base">Apariencia</h2>
        <fieldset>
          <legend className="mb-1 text-sm text-slate-400">Tema</legend>
          <div className="flex gap-2">
            {(["light", "dark", "system"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={settings.theme === option ? "btn-primary" : "btn-secondary"}
                aria-pressed={settings.theme === option}
                onClick={() => updateSetting("theme", option)}
              >
                {option === "light" ? "Claro" : option === "dark" ? "Oscuro" : "Sistema"}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={settings.showImages}
            onChange={(e) => updateSetting("showImages", e.target.checked)}
          />
          Mostrar imágenes de cartas cuando estén disponibles
        </label>
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-base">Proveedor de datos de cartas</h2>
        <p className="text-xs text-slate-400">
          Nombres e imágenes de las cartas se cargan siempre desde el catálogo público de swu-db.com
          cuando hay conexión (y se guardan en caché para futuras consultas offline). Si no hay
          conexión, o una carta no está en el catálogo, la comprobación sigue funcionando igualmente
          solo con los códigos de carta.
        </p>
      </section>

      {mode === "account" ? (
        <section className="card space-y-3">
          <div className="flex items-center gap-2">
            <Database size={18} className="text-saber-blue" />
            <h2 className="font-display text-base">Persistencia de la cuenta</h2>
          </div>
          <p className="text-sm text-slate-400">
            Tu colección y tus mazos se guardan exclusivamente en la base de datos de tu cuenta.
            Para actualizar la colección, importa un nuevo archivo o JSON desde «Colección». Las
            copias locales y los botones de borrado local están desactivados mientras mantienes la
            sesión iniciada.
          </p>
        </section>
      ) : mode === "guest" ? (
        <>
          <section className="card space-y-3">
            <h2 className="font-display text-base">Copia de seguridad local</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={handleExportBackup}>
                <Download size={16} />
                Exportar copia de seguridad
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={16} />
                Importar copia de seguridad
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImportBackup(file);
                }}
              />
            </div>
          </section>

          <section className="card space-y-3">
            <h2 className="font-display text-base text-saber-red">Zona de riesgo local</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-danger" onClick={handleClearCollection}>
                <Trash2 size={16} />
                Borrar colección local
              </button>
              <button type="button" className="btn-danger" onClick={handleClearFavorites}>
                <Trash2 size={16} />
                Borrar favoritos locales
              </button>
            </div>
          </section>
        </>
      ) : null}

      <p className="text-center text-xs text-slate-500">Versión {APP_VERSION}</p>
    </div>
  );
}

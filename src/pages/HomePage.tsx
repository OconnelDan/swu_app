import { Link } from "react-router-dom";
import { Upload, ClipboardCheck, Star } from "lucide-react";
import { useDataSource } from "@/contexts/DataSourceContext";
import { useCollection } from "@/hooks/useCollection";
import { SkeletonLines } from "@/components/Skeleton";

export function HomePage() {
  const collection = useCollection();
  const { mode } = useDataSource();

  return (
    <div className="space-y-4">
      <section className="card">
        <h2 className="mb-2 font-display text-base text-slate-200">Estado de la colección</h2>
        {collection === undefined ? (
          <SkeletonLines count={3} />
        ) : collection.isEmpty ? (
          <p className="text-sm text-slate-300">
            Todavía no has importado tu colección. Ve a "Colección" para subir tu Excel, CSV o JSON.
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-slate-400">Cartas diferentes</dt>
              <dd className="text-lg font-semibold">{collection.differentCards}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Copias totales</dt>
              <dd className="text-lg font-semibold">{collection.totalCopies}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-400">
                {mode === "account" ? "Última actualización de la cuenta" : "Última importación"}
              </dt>
              <dd className="font-medium">
                {collection.lastImport
                  ? new Date(collection.lastImport.importedAt).toLocaleString("es-ES")
                  : "—"}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <div className="grid gap-3">
        <Link to="/importar" className="btn-primary w-full">
          <Upload size={18} />
          Actualizar colección
        </Link>
        <Link to="/comprobar" className="btn-secondary w-full">
          <ClipboardCheck size={18} />
          Comprobar un mazo
        </Link>
        <Link to="/favoritos" className="btn-secondary w-full">
          <Star size={18} />
          Ver favoritos y mazos montados
        </Link>
      </div>

      <p className="text-center text-xs text-slate-500">
        {mode === "account"
          ? "Colección y mazos cargados desde tu cuenta. No se usa la colección local de este navegador."
          : "Modo invitado: colección y mazos guardados solo en este dispositivo. Las funciones de amigos requieren iniciar sesión."}
      </p>
    </div>
  );
}

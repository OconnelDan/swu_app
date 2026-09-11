import { Minus, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CardTransferPlan } from "@/lib/cardAllocation";
import type { CardTransferSelection } from "@/types/deck";

interface CardTransferDialogProps {
  plan: CardTransferPlan;
  cardName?: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (sources: CardTransferSelection[]) => void;
}

export function CardTransferDialog({
  plan,
  cardName,
  busy = false,
  error,
  onCancel,
  onConfirm
}: CardTransferDialogProps) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    setCounts(Object.fromEntries(plan.sources.map((source) => [source.favoriteId, 0])));
  }, [plan]);

  const selectedCount = useMemo(
    () => Object.values(counts).reduce((total, count) => total + count, 0),
    [counts]
  );
  const remainingCount = Math.max(plan.copiesToMove - selectedCount, 0);

  const setSourceCount = (favoriteId: string, nextCount: number) => {
    const source = plan.sources.find((entry) => entry.favoriteId === favoriteId);
    if (!source) return;
    const otherSelected = selectedCount - (counts[favoriteId] ?? 0);
    const maximum = Math.min(source.availableCount, plan.copiesToMove - otherSelected);
    setCounts((current) => ({
      ...current,
      [favoriteId]: Math.max(0, Math.min(Math.trunc(nextCount) || 0, maximum))
    }));
  };

  const handleConfirm = () => {
    if (selectedCount !== plan.copiesToMove) return;
    onConfirm(
      plan.sources.flatMap((source) => {
        const count = counts[source.favoriteId] ?? 0;
        return count > 0 ? [{ favoriteId: source.favoriteId, count }] : [];
      })
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-transfer-title"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-space-600 bg-space-950 p-4 shadow-2xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="card-transfer-title" className="font-display text-lg">
              Elegir mazos de origen
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Asigna {plan.copiesToMove} copia{plan.copiesToMove === 1 ? "" : "s"} de{" "}
              <strong>{cardName ?? plan.cardId}</strong> a «{plan.targetFavoriteName}».
            </p>
            <p className="mt-1 font-mono text-xs text-slate-500">{plan.cardId}</p>
          </div>
          <button
            type="button"
            className="rounded p-1 text-slate-400 hover:text-white"
            aria-label="Cerrar elección de mazos de origen"
            disabled={busy}
            onClick={onCancel}
          >
            <X size={20} />
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-saber-blue/40 bg-saber-blue/10 p-3 text-sm">
          <p>
            Elegidas: <strong>{selectedCount}</strong> de <strong>{plan.copiesToMove}</strong>
          </p>
          <p className={remainingCount > 0 ? "text-saber-yellow" : "text-saber-green"}>
            {remainingCount > 0
              ? `Falta elegir ${remainingCount} copia(s).`
              : "Reparto listo para confirmar."}
          </p>
        </div>

        <ul className="mt-3 space-y-2">
          {plan.sources.map((source) => {
            const count = counts[source.favoriteId] ?? 0;
            return (
              <li key={source.favoriteId} className="rounded-xl border border-space-700 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{source.favoriteName}</p>
                    <p className="text-xs text-slate-400">
                      Tiene {source.availableCount} copia(s) asignada(s).
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary whitespace-nowrap text-xs"
                    disabled={busy || remainingCount === 0}
                    onClick={() =>
                      setSourceCount(
                        source.favoriteId,
                        count + Math.min(source.availableCount - count, remainingCount)
                      )
                    }
                  >
                    Usar las necesarias
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    className="btn-secondary px-3"
                    aria-label={`Quitar una copia de ${source.favoriteName}`}
                    disabled={busy || count <= 0}
                    onClick={() => setSourceCount(source.favoriteId, count - 1)}
                  >
                    <Minus size={16} />
                  </button>
                  <label className="text-center text-xs text-slate-400">
                    Copias a retirar
                    <input
                      type="number"
                      min={0}
                      max={source.availableCount}
                      inputMode="numeric"
                      className="mt-1 block w-20 rounded-lg border border-space-600 bg-space-900 px-2 py-2 text-center text-base text-white"
                      aria-label={`Copias a retirar de ${source.favoriteName}`}
                      disabled={busy}
                      value={count}
                      onChange={(event) =>
                        setSourceCount(source.favoriteId, Number.parseInt(event.target.value, 10))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-secondary px-3"
                    aria-label={`Añadir una copia de ${source.favoriteName}`}
                    disabled={
                      busy || count >= source.availableCount || selectedCount >= plan.copiesToMove
                    }
                    onClick={() => setSourceCount(source.favoriteId, count + 1)}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {plan.copiesStillMissingFromCollection > 0 && (
          <p className="mt-3 rounded-lg border border-saber-red/40 bg-saber-red/10 p-3 text-sm text-saber-red">
            Después de reasignar, seguirán faltando {plan.copiesStillMissingFromCollection} copia(s)
            que no están en tu colección.
          </p>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Las listas guardadas no cambian. Solo se modifica en qué mazo físico están esas copias;
          los mazos de origen pueden quedar incompletos.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-saber-red">
            {error}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || selectedCount !== plan.copiesToMove}
            onClick={handleConfirm}
          >
            {busy ? "Asignando..." : "Confirmar reasignación"}
          </button>
        </div>
      </section>
    </div>
  );
}

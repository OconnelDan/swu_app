import { Hammer, Pencil, Plus, Star } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { useActiveDeckBuilderDraft } from "@/hooks/useActiveDeckBuilderDraft";
import { useAuth } from "@/hooks/useAuth";
import { DECK_FORMAT_LABELS } from "@/lib/deckFormats";

interface DecksTabsProps {
  favoriteCount: number;
  mountedCount: number;
}

export function DecksTabs({ favoriteCount, mountedCount }: DecksTabsProps) {
  const { session } = useAuth();
  const activeDraft = useActiveDeckBuilderDraft(session?.user.id ?? "guest");
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors ${
      isActive
        ? "bg-saber-blue text-space-950"
        : "text-slate-300 hover:bg-space-800 hover:text-white"
    }`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-lg">Mazos</h1>
        <Link to="/mazos/crear" className="btn-primary">
          <Plus size={16} aria-hidden="true" />
          Crear mazo
        </Link>
      </div>
      {activeDraft && (
        <Link
          to={activeDraft.path}
          className="card flex items-center justify-between gap-3 border-saber-green/50 text-left transition hover:border-saber-green"
          aria-label={`Continuar mazo en curso: ${activeDraft.name || "Mazo sin nombre"}`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <Pencil className="shrink-0 text-saber-green" size={19} aria-hidden="true" />
            <span className="min-w-0">
              <strong className="block text-sm text-saber-green">Continuar mazo en curso</strong>
              <span className="block truncate text-xs text-slate-400">
                {activeDraft.name || "Mazo sin nombre"} · {DECK_FORMAT_LABELS[activeDraft.format]}
              </span>
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-slate-200">Continuar</span>
        </Link>
      )}
      <nav
        aria-label="Tipo de mazos guardados"
        className="grid grid-cols-2 gap-1 rounded-xl border border-space-700 bg-space-900 p-1"
      >
        <NavLink to="/favoritos" className={tabClass}>
          <Star size={16} aria-hidden="true" />
          Favoritos ({favoriteCount})
        </NavLink>
        <NavLink to="/montados" className={tabClass}>
          <Hammer size={16} aria-hidden="true" />
          Montados ({mountedCount})
        </NavLink>
      </nav>
    </div>
  );
}

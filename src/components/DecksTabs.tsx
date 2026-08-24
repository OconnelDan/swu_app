import { Hammer, Plus, Star } from "lucide-react";
import { Link, NavLink } from "react-router-dom";

interface DecksTabsProps {
  favoriteCount: number;
  mountedCount: number;
}

export function DecksTabs({ favoriteCount, mountedCount }: DecksTabsProps) {
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

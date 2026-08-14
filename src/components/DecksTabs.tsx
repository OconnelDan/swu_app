import { Hammer, Star } from "lucide-react";
import { NavLink } from "react-router-dom";

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
  );
}

import { NavLink, Outlet } from "react-router-dom";
import {
  AlertTriangle,
  ClipboardCheck,
  Home,
  RefreshCw,
  Search,
  Settings,
  Star,
  Upload,
  Users
} from "lucide-react";
import { useDataSource } from "@/contexts/DataSourceContext";
import { OfflineBanner } from "./OfflineBanner";

const NAV_ITEMS = [
  { to: "/", label: "Inicio", icon: Home },
  { to: "/importar", label: "Colección", icon: Upload },
  { to: "/comprobar", label: "Comprobar", icon: ClipboardCheck },
  { to: "/favoritos", label: "Favoritos", icon: Star },
  { to: "/buscar", label: "Buscar", icon: Search },
  { to: "/amigos", label: "Amigos", icon: Users },
  { to: "/ajustes", label: "Ajustes", icon: Settings }
];

export function Layout() {
  const { mode, error, refresh, refreshing } = useDataSource();

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col pb-20">
      <OfflineBanner />
      <header className="px-4 pb-2 pt-6">
        <h1 className="font-display text-lg tracking-wide text-saber-blue">
          SWU Deck Collection Checker
        </h1>
      </header>
      <main className="flex-1 px-4 pb-6">
        {mode === "account" && error && (
          <div
            role="alert"
            className="card mb-4 flex items-start gap-2 border-saber-red/50 text-sm"
          >
            <AlertTriangle
              size={18}
              className="mt-0.5 shrink-0 text-saber-red"
              aria-hidden="true"
            />
            <div className="flex-1">
              <p>{error}</p>
              <p className="mt-1 text-xs text-slate-400">
                No se usarán los datos locales como sustitución de los datos de tu cuenta.
              </p>
              <button
                type="button"
                className="btn-secondary mt-2"
                disabled={refreshing}
                onClick={() => void refresh().catch(() => undefined)}
              >
                <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                Reintentar
              </button>
            </div>
          </div>
        )}
        <Outlet />
      </main>
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-space-700 bg-space-900/95 backdrop-blur"
      >
        <ul className="mx-auto flex max-w-3xl justify-between px-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex min-h-[56px] flex-col items-center justify-center gap-1 text-xs font-medium ${
                    isActive ? "text-saber-blue" : "text-slate-400 hover:text-slate-200"
                  }`
                }
              >
                <Icon size={20} aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

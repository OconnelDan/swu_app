import { NavLink, Outlet } from "react-router-dom";
import { Home, Upload, ClipboardCheck, Star, Search, Users, Settings } from "lucide-react";
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
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col pb-20">
      <OfflineBanner />
      <header className="px-4 pb-2 pt-6">
        <h1 className="font-display text-lg tracking-wide text-saber-blue">
          SWU Deck Collection Checker
        </h1>
      </header>
      <main className="flex-1 px-4 pb-6">
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

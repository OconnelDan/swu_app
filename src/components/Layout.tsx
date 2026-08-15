import { useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  AlertTriangle,
  ChevronDown,
  ClipboardCheck,
  Home,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  Settings,
  Star,
  Upload,
  UserRound,
  UserPlus,
  Users
} from "lucide-react";
import { useDataSource } from "@/contexts/DataSourceContext";
import { useAuth } from "@/hooks/useAuth";
import { getAuthErrorMessage, signOutCurrentSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { OfflineBanner } from "./OfflineBanner";

const NAV_ITEMS = [
  { to: "/", label: "Inicio", icon: Home },
  { to: "/importar", label: "Colección", icon: Upload },
  { to: "/comprobar", label: "Comprobar", icon: ClipboardCheck },
  { to: "/favoritos", label: "Mazos", icon: Star },
  { to: "/buscar", label: "Buscar", icon: Search },
  { to: "/amigos", label: "Amigos", icon: Users },
  { to: "/ajustes", label: "Ajustes", icon: Settings }
];

export function Layout() {
  const { mode, error, refresh, refreshing } = useDataSource();
  const { session, loading: authLoading } = useAuth();
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const location = useLocation();

  const closeAccountMenu = () => accountMenu.current?.removeAttribute("open");

  const handleSignOut = async () => {
    setSignOutError(null);
    setSigningOut(true);
    try {
      await signOutCurrentSession();
      closeAccountMenu();
    } catch (cause) {
      setSignOutError(getAuthErrorMessage(cause, "No se ha podido cerrar la sesión."));
    } finally {
      setSigningOut(false);
    }
  };

  const userLabel = session?.user.email?.split("@")[0] ?? "Mi cuenta";

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col pb-20">
      <OfflineBanner />
      <header className="flex items-start justify-between gap-3 px-4 pb-3 pt-6">
        <Link
          to="/"
          className="min-w-0 pt-2 font-display text-base tracking-wide text-saber-blue sm:text-lg"
        >
          SWU Deck Vault
        </Link>

        {isSupabaseConfigured && (
          <details ref={accountMenu} className="relative z-30 shrink-0">
            <summary className="btn-secondary cursor-pointer list-none px-3 [&::-webkit-details-marker]:hidden">
              {authLoading ? (
                <Loader2 size={17} className="animate-spin" />
              ) : session ? (
                <UserRound size={17} />
              ) : (
                <LogIn size={17} />
              )}
              <span className="max-w-[8rem] truncate">
                {authLoading ? "Cuenta" : session ? userLabel : "Iniciar sesión"}
              </span>
              <ChevronDown size={14} />
            </summary>

            <div className="absolute right-0 mt-2 w-64 space-y-2 rounded-xl border border-space-700 bg-space-900 p-3 shadow-xl">
              {session ? (
                <>
                  <p className="truncate px-1 text-xs text-slate-400" title={session.user.email}>
                    {session.user.email}
                  </p>
                  <Link to="/cuenta" className="btn-secondary w-full" onClick={closeAccountMenu}>
                    <UserRound size={16} />
                    Mi cuenta
                  </Link>
                  <button
                    type="button"
                    className="btn-danger w-full"
                    disabled={signingOut}
                    onClick={handleSignOut}
                  >
                    {signingOut ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <LogOut size={16} />
                    )}
                    Cerrar sesión
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/cuenta?vista=iniciar"
                    className="btn-primary w-full"
                    onClick={closeAccountMenu}
                  >
                    <KeyRound size={16} />
                    Iniciar sesión
                  </Link>
                  <Link
                    to="/cuenta?vista=crear"
                    className="btn-secondary w-full"
                    onClick={closeAccountMenu}
                  >
                    <UserPlus size={16} />
                    Crear cuenta
                  </Link>
                </>
              )}
              {signOutError && (
                <p role="alert" className="text-xs text-saber-red">
                  {signOutError}
                </p>
              )}
            </div>
          </details>
        )}
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
                className={({ isActive }) => {
                  const isDecksSection = to === "/favoritos" && location.pathname === "/montados";
                  const isCollectionSection =
                    to === "/importar" && location.pathname === "/escanear";
                  return `flex min-h-[56px] flex-col items-center justify-center gap-1 text-xs font-medium ${
                    isActive || isDecksSection || isCollectionSection
                      ? "text-saber-blue"
                      : "text-slate-400 hover:text-slate-200"
                  }`;
                }}
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

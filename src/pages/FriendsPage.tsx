import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Database, Loader2, RefreshCw, Trash2, UserPlus, Users } from "lucide-react";
import { useDataSource } from "@/contexts/DataSourceContext";
import { useAuth } from "@/hooks/useAuth";
import {
  createInviteCode,
  getMyProfile,
  listFriends,
  redeemInviteCode,
  removeFriend,
  updateMyUsername,
  type FriendSummary,
  type UserProfile
} from "@/lib/friendsRepository";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

function formatDate(value: string | null): string {
  if (!value) return "Todavía no hay datos guardados";
  return new Date(value).toLocaleString("es-ES");
}

function AccountManager() {
  const { collection, favorites, accountUpdatedAt, hasAccountData, refresh, refreshing } =
    useDataSource();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [username, setUsername] = useState("");
  const [friends, setFriends] = useState<FriendSummary[] | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [redeemInput, setRedeemInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>("load");

  const loadProfileAndFriends = useCallback(async () => {
    const [nextProfile, nextFriends] = await Promise.all([getMyProfile(), listFriends()]);
    setProfile(nextProfile);
    setUsername(nextProfile.username);
    setFriends(nextFriends);
  }, []);

  useEffect(() => {
    setError(null);
    void loadProfileAndFriends()
      .catch((cause) => {
        setError(
          cause instanceof Error ? cause.message : "No se han podido cargar los datos de la cuenta."
        );
      })
      .finally(() => setBusyAction(null));
  }, [loadProfileAndFriends]);

  const startAction = (action: string) => {
    setError(null);
    setMessage(null);
    setBusyAction(action);
  };

  const handleRefreshAll = async () => {
    startAction("refresh");
    try {
      await Promise.all([refresh(), loadProfileAndFriends()]);
      setMessage("Datos actualizados desde tu cuenta.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se han podido actualizar los datos.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleUpdateUsername = async () => {
    startAction("username");
    try {
      const nextProfile = await updateMyUsername(username);
      setProfile(nextProfile);
      setUsername(nextProfile.username);
      setMessage("Nombre de usuario actualizado.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se ha podido cambiar el nombre.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateCode = async () => {
    startAction("invite");
    try {
      setInviteCode(await createInviteCode());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se ha podido generar el código.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setMessage("Código copiado.");
    } catch {
      setError("No se ha podido copiar automáticamente. Mantén pulsado el código para copiarlo.");
    }
  };

  const handleRedeem = async () => {
    startAction("redeem");
    try {
      await redeemInviteCode(redeemInput);
      setRedeemInput("");
      setMessage("¡Ahora sois amigos!");
      setFriends(await listFriends());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Código inválido o ya utilizado.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleRemoveFriend = async (friend: FriendSummary) => {
    if (!window.confirm(`¿Eliminar a «${friend.friendUsername}» de tus amigos?`)) return;
    startAction(`remove-${friend.friendshipId}`);
    try {
      await removeFriend(friend.friendshipId);
      setFriends(await listFriends());
      setMessage("Amistad eliminada.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se ha podido eliminar la amistad.");
    } finally {
      setBusyAction(null);
    }
  };

  const busy = busyAction !== null || refreshing;

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="card border-saber-red/50 text-sm text-saber-red">
          {error}
        </div>
      )}
      {message && (
        <div role="status" className="card border-saber-green/50 text-sm text-saber-green">
          {message}
        </div>
      )}

      <section className="card space-y-3">
        <h2 className="font-display text-base">Perfil</h2>
        {profile ? (
          <div className="flex gap-2">
            <input
              aria-label="Nombre de usuario"
              className="min-w-0 flex-1 rounded-lg border border-space-600 bg-space-950 p-2 text-sm"
              value={username}
              maxLength={32}
              onChange={(event) => setUsername(event.target.value)}
            />
            <button
              type="button"
              className="btn-secondary"
              disabled={busy || username.trim() === profile.username}
              onClick={handleUpdateUsername}
            >
              Guardar
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Cargando perfil…</p>
        )}
      </section>

      <section className="card space-y-3">
        <div className="flex items-center gap-2">
          <Database size={18} className="text-saber-blue" />
          <h2 className="font-display text-base">Datos de tu cuenta</h2>
        </div>
        <p className="text-xs text-slate-400">
          Esta es la única colección y lista de mazos que utiliza la app mientras tienes la sesión
          iniciada. Se recuperan automáticamente al entrar desde otro navegador. Para cambiar la
          colección, importa un nuevo Excel, CSV o JSON desde «Colección».
        </p>

        <div className="rounded-lg bg-space-950 p-3 text-sm">
          {collection === undefined || favorites === undefined ? (
            <p className="text-slate-400">Cargando colección y mazos…</p>
          ) : (
            <>
              <p>
                <strong>{collection.differentCards}</strong> cartas diferentes ·{" "}
                <strong>{collection.totalCopies}</strong> copias ·{" "}
                <strong>{favorites.filter((deck) => !deck.isMounted).length}</strong> favoritos ·{" "}
                <strong>{favorites.filter((deck) => deck.isMounted).length}</strong> montados
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Última actualización: {formatDate(accountUpdatedAt)}
              </p>
              {!hasAccountData && (
                <p className="mt-2 text-xs text-saber-yellow">
                  La cuenta todavía está vacía. Importa tu colección o guarda tu primer mazo.
                </p>
              )}
            </>
          )}
        </div>

        <button type="button" className="btn-secondary" disabled={busy} onClick={handleRefreshAll}>
          {(busyAction === "refresh" || refreshing) && (
            <Loader2 size={16} className="animate-spin" />
          )}
          {busyAction !== "refresh" && !refreshing && <RefreshCw size={16} />}
          Volver a cargar desde mi cuenta
        </button>
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-base">Invitar a un amigo</h2>
        <p className="text-xs text-slate-400">
          El código es de un solo uso y caduca a los siete días.
        </p>
        <button type="button" className="btn-primary" disabled={busy} onClick={handleCreateCode}>
          <UserPlus size={16} />
          Generar código de invitación
        </button>
        {inviteCode && (
          <div className="flex items-center gap-2 rounded-lg bg-space-950 p-3">
            <span className="flex-1 text-center font-mono text-lg tracking-widest">
              {inviteCode}
            </span>
            <button type="button" className="btn-secondary" onClick={handleCopyCode}>
              <Copy size={16} />
              Copiar
            </button>
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-base">Añadir amigo con un código</h2>
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-lg border border-space-600 bg-space-950 p-2 text-sm uppercase"
            placeholder="CÓDIGO"
            value={redeemInput}
            maxLength={10}
            onChange={(event) => setRedeemInput(event.target.value.toUpperCase())}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !redeemInput.trim()}
            onClick={handleRedeem}
          >
            Añadir
          </button>
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="font-display text-base">Tus amigos</h2>
        {friends === null && <p className="text-sm text-slate-400">Cargando…</p>}
        {friends?.length === 0 && (
          <p className="text-sm text-slate-400">Todavía no tienes amigos añadidos.</p>
        )}
        <ul className="space-y-2">
          {friends?.map((friend) => (
            <li
              key={friend.friendshipId}
              className="flex items-center gap-2 rounded-lg bg-space-950 p-2 text-sm"
            >
              <Users size={14} className="text-slate-400" />
              <span className="flex-1">{friend.friendUsername}</span>
              <button
                type="button"
                className="btn-danger"
                disabled={busy}
                onClick={() => handleRemoveFriend(friend)}
              >
                <Trash2 size={14} />
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function FriendsPage() {
  const { session, loading } = useAuth();

  if (!isSupabaseConfigured) {
    return (
      <div className="card text-center text-sm text-slate-300">
        Las cuentas y los amigos no están configurados en este despliegue.
      </div>
    );
  }

  if (loading) {
    return (
      <p className="card flex items-center justify-center gap-2 text-sm text-slate-300">
        <Loader2 size={16} className="animate-spin" />
        Comprobando la sesión…
      </p>
    );
  }

  if (!session) {
    return (
      <div className="space-y-4">
        <section className="card space-y-4 text-center">
          <div>
            <Users size={28} className="mx-auto text-saber-blue" />
            <h2 className="mt-2 font-display text-base">Amigos requiere una cuenta</h2>
            <p className="mt-2 text-sm text-slate-400">
              Inicia sesión si ya tienes contraseña o crea una cuenta verificando primero tu email.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Link to="/cuenta?vista=iniciar" className="btn-primary">
              Iniciar sesión
            </Link>
            <Link to="/cuenta?vista=crear" className="btn-secondary">
              Crear cuenta
            </Link>
          </div>
        </section>

        <p className="card text-xs text-slate-400">
          Sin cuenta puedes seguir usando la colección y los mazos guardados en este dispositivo,
          pero no las funciones de amigos. Los datos de invitado permanecen separados y no se suben
          automáticamente al iniciar sesión.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">
          Sesión iniciada como <strong>{session.user.email}</strong>
        </span>
        <Link to="/cuenta" className="btn-secondary shrink-0">
          Mi cuenta
        </Link>
      </div>
      <AccountManager />
    </div>
  );
}

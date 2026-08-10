import { useEffect, useState } from "react";
import { UserPlus, Users, RefreshCw } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/hooks/useAuth";
import { useCollection } from "@/hooks/useCollection";
import {
  createInviteCode,
  createProfile,
  listFriends,
  redeemInviteCode,
  syncCollectionToCloud,
  type FriendSummary
} from "@/lib/friendsRepository";

function AuthForm() {
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      if (mode === "signUp") {
        if (!username.trim()) throw new Error("Elige un nombre de usuario.");
        const { data, error: signUpError } = await supabase!.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        if (data.user) await createProfile(data.user.id, username.trim());
        setMessage("Cuenta creada. Si tu proyecto requiere confirmación por email, revisa tu bandeja.");
      } else {
        const { error: signInError } = await supabase!.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se ha podido completar la operación.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2" role="group" aria-label="Modo de acceso">
        <button
          type="button"
          className={mode === "signIn" ? "btn-primary" : "btn-secondary"}
          onClick={() => setMode("signIn")}
        >
          Iniciar sesión
        </button>
        <button
          type="button"
          className={mode === "signUp" ? "btn-primary" : "btn-secondary"}
          onClick={() => setMode("signUp")}
        >
          Crear cuenta
        </button>
      </div>

      <section className="card space-y-3">
        {mode === "signUp" && (
          <div>
            <label htmlFor="username" className="mb-1 block text-sm text-slate-400">
              Nombre de usuario
            </label>
            <input
              id="username"
              className="w-full rounded-lg border border-space-600 bg-space-950 p-2 text-sm"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
        )}
        <div>
          <label htmlFor="email" className="mb-1 block text-sm text-slate-400">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="w-full rounded-lg border border-space-600 bg-space-950 p-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm text-slate-400">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            className="w-full rounded-lg border border-space-600 bg-space-950 p-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-saber-red">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm text-saber-green">
            {message}
          </p>
        )}

        <button type="button" className="btn-primary w-full" disabled={busy} onClick={handleSubmit}>
          {mode === "signUp" ? "Crear cuenta" : "Iniciar sesión"}
        </button>
      </section>
    </div>
  );
}

function FriendsManager() {
  const collection = useCollection();
  const [friends, setFriends] = useState<FriendSummary[] | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [redeemInput, setRedeemInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshFriends = async () => {
    try {
      setFriends(await listFriends());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se han podido cargar los amigos.");
    }
  };

  useEffect(() => {
    refreshFriends();
  }, []);

  const handleCreateCode = async () => {
    setError(null);
    setBusy(true);
    try {
      setInviteCode(await createInviteCode());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se ha podido generar el código.");
    } finally {
      setBusy(false);
    }
  };

  const handleRedeem = async () => {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await redeemInviteCode(redeemInput);
      setRedeemInput("");
      setMessage("¡Ahora sois amigos!");
      await refreshFriends();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Código inválido o ya usado.");
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await syncCollectionToCloud(collection?.cards ?? []);
      setMessage("Colección sincronizada con la nube.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se ha podido sincronizar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="card text-sm text-saber-red">
          {error}
        </div>
      )}
      {message && (
        <div role="status" className="card text-sm text-saber-green">
          {message}
        </div>
      )}

      <section className="card space-y-3">
        <h2 className="font-display text-base">Sincronizar tu colección</h2>
        <p className="text-xs text-slate-400">
          Tus amigos solo pueden ver, carta por carta, si tienes copias de las que a ellos les
          faltan; nunca tu colección completa.
        </p>
        <button type="button" className="btn-secondary" disabled={busy} onClick={handleSync}>
          <RefreshCw size={16} />
          Sincronizar colección con la nube
        </button>
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-base">Invitar a un amigo</h2>
        <button type="button" className="btn-primary" disabled={busy} onClick={handleCreateCode}>
          <UserPlus size={16} />
          Generar código de invitación
        </button>
        {inviteCode && (
          <p className="rounded-lg bg-space-950 p-3 text-center font-mono text-lg tracking-widest">
            {inviteCode}
          </p>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-base">Añadir amigo con un código</h2>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-space-600 bg-space-950 p-2 text-sm uppercase"
            placeholder="CÓDIGO"
            value={redeemInput}
            onChange={(e) => setRedeemInput(e.target.value)}
          />
          <button type="button" className="btn-primary" disabled={busy || !redeemInput.trim()} onClick={handleRedeem}>
            Añadir
          </button>
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="font-display text-base">Tus amigos</h2>
        {friends === null && <p className="text-sm text-slate-400">Cargando…</p>}
        {friends?.length === 0 && <p className="text-sm text-slate-400">Todavía no tienes amigos añadidos.</p>}
        <ul className="space-y-1">
          {friends?.map((friend) => (
            <li key={friend.friendshipId} className="flex items-center gap-2 text-sm">
              <Users size={14} className="text-slate-400" />
              {friend.friendUsername}
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
        La función de amigos no está configurada en este despliegue.
      </div>
    );
  }

  if (loading) return <p className="card text-center text-sm text-slate-300">Cargando…</p>;

  if (!session) return <AuthForm />;

  return (
    <div className="space-y-4">
      <div className="card flex items-center justify-between text-sm">
        <span>
          Sesión iniciada como <strong>{session.user.email}</strong>
        </span>
        <button type="button" className="btn-secondary" onClick={() => supabase!.auth.signOut()}>
          Cerrar sesión
        </button>
      </div>
      <FriendsManager />
    </div>
  );
}

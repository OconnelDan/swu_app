import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  BellRing,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  MailCheck,
  Save,
  ShieldCheck,
  UserPlus
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  COLLECTION_BACKUP_INACTIVITY_OPTIONS,
  loadCollectionBackupSettings,
  updateCollectionBackupSettings,
  type CollectionBackupInactivityMinutes,
  type CollectionBackupSettings
} from "@/lib/collectionBackupRepository";
import {
  getAuthErrorMessage,
  requestAccountVerification,
  requestPasswordReset,
  signInWithEmailAndPassword,
  signOutCurrentSession,
  updateAccountPassword
} from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

type AccountView = "iniciar" | "crear" | "recuperar";

interface FeedbackProps {
  error: string | null;
  message: string | null;
}

function Feedback({ error, message }: FeedbackProps) {
  return (
    <>
      {error && (
        <p role="alert" className="rounded-lg bg-saber-red/10 p-3 text-sm text-saber-red">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-lg bg-saber-green/10 p-3 text-sm text-saber-green">
          {message}
        </p>
      )}
    </>
  );
}

interface ViewLinkProps {
  children: React.ReactNode;
  onClick: () => void;
}

function ViewLink({ children, onClick }: ViewLinkProps) {
  return (
    <button
      type="button"
      className="font-semibold text-saber-blue hover:underline"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface SignInFormProps {
  changeView: (view: AccountView) => void;
}

function SignInForm({ changeView }: SignInFormProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      await signInWithEmailAndPassword(email, password);
      navigate("/", { replace: true });
    } catch (cause) {
      setError(getAuthErrorMessage(cause, "No se ha podido iniciar sesión."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-display text-base">
          <LogIn size={18} className="text-saber-blue" />
          Iniciar sesión
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Entra con el mismo email y contraseña desde cualquier dispositivo.
        </p>
      </div>

      <form className="space-y-3" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="login-email" className="mb-1 block text-sm text-slate-400">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-lg border border-space-600 bg-space-950 p-2.5 text-sm"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="login-password" className="mb-1 block text-sm text-slate-400">
            Contraseña
          </label>
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-space-600 bg-space-950 p-2.5 pr-12 text-sm"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-200"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <Feedback error={error} message={null} />

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={busy || !email.trim() || !password}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
          Iniciar sesión
        </button>
      </form>

      <div className="space-y-2 text-center text-sm text-slate-400">
        <p>
          <ViewLink onClick={() => changeView("recuperar")}>He olvidado mi contraseña</ViewLink>
        </p>
        <p>
          ¿Aún no tienes contraseña?{" "}
          <ViewLink onClick={() => changeView("crear")}>Crear cuenta</ViewLink>
        </p>
      </div>
    </section>
  );
}

interface CreateAccountFormProps {
  changeView: (view: AccountView) => void;
}

function CreateAccountForm({ changeView }: CreateAccountFormProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);

    try {
      await requestAccountVerification(email);
      setSent(true);
      setMessage(
        "Te hemos enviado un correo de verificación. Ábrelo en este mismo navegador y volverás a la pantalla para crear tu contraseña."
      );
    } catch (cause) {
      setError(getAuthErrorMessage(cause, "No se ha podido enviar el correo de verificación."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-display text-base">
          <UserPlus size={18} className="text-saber-blue" />
          Crear cuenta
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Primero verificaremos que el email es tuyo. Después podrás crear la contraseña.
        </p>
      </div>

      <ol className="grid grid-cols-3 gap-2 text-center text-xs text-slate-400">
        <li className="rounded-lg bg-space-950 p-2">
          <strong className="mb-1 block text-saber-blue">1</strong>
          Email
        </li>
        <li className="rounded-lg bg-space-950 p-2">
          <strong className="mb-1 block text-saber-blue">2</strong>
          Verificación
        </li>
        <li className="rounded-lg bg-space-950 p-2">
          <strong className="mb-1 block text-saber-blue">3</strong>
          Contraseña
        </li>
      </ol>

      <form className="space-y-3" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="signup-email" className="mb-1 block text-sm text-slate-400">
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            required
            disabled={sent}
            className="w-full rounded-lg border border-space-600 bg-space-950 p-2.5 text-sm"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <Feedback error={error} message={message} />

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={busy || sent || !email.trim()}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <MailCheck size={16} />}
          {sent ? "Correo enviado" : "Verificar mi email"}
        </button>
        {sent && (
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={() => {
              setSent(false);
              setMessage(null);
              setEmail("");
            }}
          >
            Usar otro email
          </button>
        )}
      </form>

      <p className="text-center text-sm text-slate-400">
        ¿Ya tienes contraseña?{" "}
        <ViewLink onClick={() => changeView("iniciar")}>Iniciar sesión</ViewLink>
      </p>
    </section>
  );
}

interface ForgotPasswordFormProps {
  changeView: (view: AccountView) => void;
}

function ForgotPasswordForm({ changeView }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);

    try {
      await requestPasswordReset(email);
      setSent(true);
      setMessage(
        "Si existe una cuenta con ese email, recibirás un enlace. Ábrelo en este mismo navegador para crear una contraseña nueva."
      );
    } catch (cause) {
      setError(getAuthErrorMessage(cause, "No se ha podido enviar el correo de recuperación."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-display text-base">
          <KeyRound size={18} className="text-saber-blue" />
          Recuperar contraseña
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Te enviaremos un enlace seguro para crear una contraseña nueva.
        </p>
      </div>

      <form className="space-y-3" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="recovery-email" className="mb-1 block text-sm text-slate-400">
            Email
          </label>
          <input
            id="recovery-email"
            type="email"
            autoComplete="email"
            required
            disabled={sent}
            className="w-full rounded-lg border border-space-600 bg-space-950 p-2.5 text-sm"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <Feedback error={error} message={message} />

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={busy || sent || !email.trim()}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <MailCheck size={16} />}
          {sent ? "Correo enviado" : "Enviar enlace de recuperación"}
        </button>
      </form>

      <p className="text-center text-sm text-slate-400">
        <ViewLink onClick={() => changeView("iniciar")}>Volver a iniciar sesión</ViewLink>
      </p>
    </section>
  );
}

interface PasswordFormProps {
  flow: "crear-contrasena" | "recuperar-contrasena" | "cambiar-contrasena";
  onCancel?: () => void;
  onComplete: () => void;
}

function PasswordForm({ flow, onCancel, onComplete }: PasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const title =
    flow === "crear-contrasena"
      ? "Email verificado: crea tu contraseña"
      : flow === "recuperar-contrasena"
        ? "Crea una contraseña nueva"
        : "Crear o cambiar contraseña";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }

    setBusy(true);
    try {
      await updateAccountPassword(password);
      onComplete();
    } catch (cause) {
      setError(getAuthErrorMessage(cause, "No se ha podido guardar la contraseña."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-display text-base">
          <ShieldCheck size={18} className="text-saber-green" />
          {title}
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Utiliza al menos 8 caracteres. La contraseña se envía directamente a Supabase y no se
          guarda dentro de SWU Deck Vault.
        </p>
      </div>

      <form className="space-y-3" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="new-password" className="mb-1 block text-sm text-slate-400">
            Nueva contraseña
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              required
              className="w-full rounded-lg border border-space-600 bg-space-950 p-2.5 pr-12 text-sm"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-200"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="confirm-password" className="mb-1 block text-sm text-slate-400">
            Repite la contraseña
          </label>
          <input
            id="confirm-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            minLength={8}
            required
            className="w-full rounded-lg border border-space-600 bg-space-950 p-2.5 text-sm"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>

        <Feedback error={error} message={null} />

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {onCancel && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>
              Cancelar
            </button>
          )}
          <button
            type="submit"
            className="btn-primary"
            disabled={busy || !password || !confirmation}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
            Guardar contraseña
          </button>
        </div>
      </form>
    </section>
  );
}

function formatAccountDate(value: string | null): string {
  if (!value) return "Todavía no se ha enviado ninguna copia";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

interface CollectionBackupSettingsCardProps {
  email: string;
}

function CollectionBackupSettingsCard({ email }: CollectionBackupSettingsCardProps) {
  const [settings, setSettings] = useState<CollectionBackupSettings | null>(null);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [inactivityMinutes, setInactivityMinutes] = useState<CollectionBackupInactivityMinutes>(15);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    void loadCollectionBackupSettings()
      .then((loadedSettings) => {
        if (!active) return;
        setSettings(loadedSettings);
        setEmailEnabled(loadedSettings.emailEnabled);
        setInactivityMinutes(loadedSettings.inactivityMinutes);
      })
      .catch((cause) => {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "No se ha podido cargar la configuración de las copias."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const updatedSettings = await updateCollectionBackupSettings(emailEnabled, inactivityMinutes);
      setSettings(updatedSettings);
      setEmailEnabled(updatedSettings.emailEnabled);
      setInactivityMinutes(updatedSettings.inactivityMinutes);
      setMessage(
        updatedSettings.emailEnabled
          ? "Copias diarias activadas. Solo se enviará un correo cuando haya cambios."
          : "Copias diarias por correo desactivadas."
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se ha podido guardar la configuración de las copias."
      );
    } finally {
      setSaving(false);
    }
  };

  const hasUnsavedChanges =
    settings !== null &&
    (settings.emailEnabled !== emailEnabled || settings.inactivityMinutes !== inactivityMinutes);

  return (
    <section className="card space-y-4" aria-labelledby="collection-backup-heading">
      <div className="flex items-start gap-3">
        <BellRing size={24} className="mt-0.5 shrink-0 text-saber-blue" aria-hidden="true" />
        <div>
          <h2 id="collection-backup-heading" className="font-display text-base">
            Copia diaria de la colección
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            Recibe un JSON restaurable cuando tu colección haya cambiado. Nunca se enviará más de un
            correo por día.
          </p>
        </div>
      </div>

      {loading ? (
        <p role="status" className="flex items-center gap-2 text-sm text-slate-300">
          <Loader2 size={16} className="animate-spin" />
          Cargando la configuración…
        </p>
      ) : (
        <>
          <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-space-700 bg-space-950 p-3">
            <span>
              <strong className="block text-sm">Enviar la copia automática por correo</strong>
              <span className="mt-1 block break-all text-xs text-slate-400">{email}</span>
            </span>
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 accent-saber-blue"
              checked={emailEnabled}
              disabled={settings === null}
              aria-label="Enviar la copia automática por correo"
              onChange={(event) => {
                setEmailEnabled(event.currentTarget.checked);
                setMessage(null);
              }}
            />
          </label>

          <div>
            <label htmlFor="backup-inactivity" className="mb-1 flex items-center gap-2 text-sm">
              <Clock3 size={16} className="text-saber-blue" aria-hidden="true" />
              Esperar después del último cambio
            </label>
            <select
              id="backup-inactivity"
              className="w-full rounded-lg border border-space-600 bg-space-950 p-2.5 text-sm"
              value={inactivityMinutes}
              disabled={settings === null || !emailEnabled}
              onChange={(event) => {
                setInactivityMinutes(
                  Number(event.currentTarget.value) as CollectionBackupInactivityMinutes
                );
                setMessage(null);
              }}
            >
              {COLLECTION_BACKUP_INACTIVITY_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutos de inactividad
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-lg bg-space-950 p-3 text-xs text-slate-400">
            <p>
              Si haces más cambios después de recibir el correo de hoy, quedarán pendientes para el
              día siguiente. Cerrar la aplicación no interrumpe el proceso.
            </p>
            <p className="mt-2">
              <strong className="text-slate-300">Último correo:</strong>{" "}
              {formatAccountDate(settings?.lastEmailSentAt ?? null)}
            </p>
            {settings?.hasPendingChanges && (
              <p className="mt-2 flex items-start gap-1.5 text-saber-yellow">
                <Clock3 size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                Hay cambios pendientes. Se enviarán cuando se cumpla la espera y no se haya enviado
                ya la copia de hoy.
              </p>
            )}
          </div>

          {settings?.lastError && (
            <p role="alert" className="rounded-lg bg-saber-red/10 p-3 text-xs text-saber-red">
              El último envío no pudo completarse: {settings.lastError}
            </p>
          )}
          <Feedback error={error} message={message} />

          <button
            type="button"
            className="btn-primary w-full"
            disabled={saving || settings === null || !hasUnsavedChanges}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : hasUnsavedChanges ? (
              <Save size={16} />
            ) : (
              <CheckCircle2 size={16} />
            )}
            {saving ? "Guardando…" : hasUnsavedChanges ? "Guardar configuración" : "Guardado"}
          </button>
        </>
      )}
    </section>
  );
}

export function AccountPage() {
  const { session, loading, passwordRecovery, finishPasswordFlow } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [changingPassword, setChangingPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const flowParam = searchParams.get("flujo");
  const redirectFlow =
    flowParam === "crear-contrasena" || flowParam === "recuperar-contrasena" ? flowParam : null;
  const viewParam = searchParams.get("vista");
  const view: AccountView =
    viewParam === "crear" || viewParam === "recuperar" ? viewParam : "iniciar";

  const changeView = (nextView: AccountView) => {
    setError(null);
    setMessage(null);
    navigate(`/cuenta?vista=${nextView}`, { replace: true });
  };

  const completePassword = () => {
    finishPasswordFlow();
    setChangingPassword(false);
    setMessage("Contraseña guardada. A partir de ahora puedes entrar con tu email y contraseña.");
    navigate("/cuenta", { replace: true });
  };

  const handleSignOut = async () => {
    setError(null);
    setSigningOut(true);
    try {
      await signOutCurrentSession();
      navigate("/", { replace: true });
    } catch (cause) {
      setError(getAuthErrorMessage(cause, "No se ha podido cerrar la sesión."));
    } finally {
      setSigningOut(false);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="card text-center text-sm text-slate-300">
        Las cuentas no están configuradas en este despliegue.
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
        {redirectFlow && (
          <div role="alert" className="card border-saber-yellow/50 text-sm text-saber-yellow">
            No se ha podido abrir una sesión con ese enlace. Solicita otro y ábrelo en el mismo
            dispositivo y navegador desde el que lo pediste.
          </div>
        )}
        {view === "crear" && <CreateAccountForm changeView={changeView} />}
        {view === "recuperar" && <ForgotPasswordForm changeView={changeView} />}
        {view === "iniciar" && <SignInForm changeView={changeView} />}
        <p className="card text-xs text-slate-400">
          Los datos de invitado de este navegador permanecen separados. Al iniciar sesión se
          mostrarán únicamente la colección y los mazos de la cuenta; no se mezclan ni se suben
          automáticamente.
        </p>
      </div>
    );
  }

  if (redirectFlow || passwordRecovery || changingPassword) {
    return (
      <PasswordForm
        flow={redirectFlow ?? (passwordRecovery ? "recuperar-contrasena" : "cambiar-contrasena")}
        onCancel={redirectFlow || passwordRecovery ? undefined : () => setChangingPassword(false)}
        onComplete={completePassword}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Feedback error={error} message={message} />

      <section className="card space-y-4">
        <div className="flex items-start gap-3">
          <ShieldCheck size={24} className="mt-0.5 shrink-0 text-saber-green" />
          <div className="min-w-0">
            <h2 className="font-display text-base">Tu cuenta</h2>
            <p className="mt-1 truncate text-sm text-slate-300">{session.user.email}</p>
            <p className="mt-1 text-xs text-saber-green">Email verificado</p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setError(null);
              setMessage(null);
              setChangingPassword(true);
            }}
          >
            <KeyRound size={16} />
            Crear o cambiar contraseña
          </button>
          <Link to="/amigos" className="btn-secondary">
            <UserPlus size={16} />
            Ir a Amigos
          </Link>
        </div>

        <button
          type="button"
          className="btn-danger w-full"
          disabled={signingOut}
          onClick={handleSignOut}
        >
          {signingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
          Cerrar sesión en este dispositivo
        </button>
      </section>

      <CollectionBackupSettingsCard email={session.user.email ?? "Email de la cuenta"} />

      <p className="card text-xs text-slate-400">
        Al cerrar sesión volverán a mostrarse los datos locales del modo invitado que existan en
        este navegador. Tu colección y tus mazos de la cuenta seguirán guardados en Supabase.
      </p>
    </div>
  );
}

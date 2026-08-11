import { WifiOff } from "lucide-react";
import { useDataSource } from "@/contexts/DataSourceContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const { mode } = useDataSource();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-saber-yellow/15 px-4 py-2 text-sm font-medium text-saber-yellow"
    >
      <WifiOff size={16} aria-hidden="true" />
      {mode === "account"
        ? "Sin conexión: los datos de tu cuenta no se sustituirán por una copia local."
        : "Sin conexión: usando los datos de invitado guardados en este dispositivo."}
    </div>
  );
}

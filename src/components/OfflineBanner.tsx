import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-saber-yellow/15 px-4 py-2 text-sm font-medium text-saber-yellow"
    >
      <WifiOff size={16} aria-hidden="true" />
      Sin conexión: usando datos guardados en este dispositivo.
    </div>
  );
}

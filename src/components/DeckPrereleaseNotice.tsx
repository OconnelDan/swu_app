import { AlertTriangle } from "lucide-react";
import type { DeckValidation } from "@/lib/deckBuilder";

interface DeckPrereleaseNoticeProps {
  validation: DeckValidation;
}

export function DeckPrereleaseNotice({ validation }: DeckPrereleaseNoticeProps) {
  if (!validation.valid || validation.prereleaseWarnings.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-saber-yellow/40 bg-saber-yellow/10 p-2 text-xs text-saber-yellow">
      <p className="flex items-start gap-1 font-semibold">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        Mazo en prepublicación: puedes prepararlo y montarlo, pero todavía no es legal en Premier.
      </p>
      {validation.prereleaseWarnings.slice(0, 2).map((message) => (
        <p key={message}>• {message}</p>
      ))}
      {validation.prereleaseWarnings.length > 2 && (
        <p>• Hay {validation.prereleaseWarnings.length - 2} carta(s) afectada(s) más.</p>
      )}
    </div>
  );
}

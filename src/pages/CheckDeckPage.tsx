import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ClipboardPaste, FileUp } from "lucide-react";
import { parseDeckJsonText } from "@/schemas/deckSchema";
import { normalizeDeckJson } from "@/lib/normalizeDeckJson";
import { compareDeckWithCollection } from "@/lib/compareDeckWithCollection";
import { computeCardAllocations } from "@/lib/cardAllocation";
import { useCollection } from "@/hooks/useCollection";
import { useFavorites } from "@/hooks/useFavorites";
import { SwUnlimitedDbCardProvider } from "@/providers/cardProvider/SwUnlimitedDbCardProvider";
import type { DeckComparisonResult, NormalizedDeck } from "@/types/deck";

interface CheckDeckPageProps {
  onResult: (deck: NormalizedDeck, result: DeckComparisonResult) => void;
}

export function CheckDeckPage({ onResult }: CheckDeckPageProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const collection = useCollection();
  const favorites = useFavorites();
  const navigate = useNavigate();

  const runCheck = async () => {
    setError(null);
    setBusy(true);
    try {
      const raw = parseDeckJsonText(text);
      const deck = normalizeDeckJson(raw);

      const cardIds = deck.allRequiredCards.map((c) => c.cardId);
      const cardProvider = new SwUnlimitedDbCardProvider();
      const cardInfos = await cardProvider.getCards(cardIds);
      const allocations = computeCardAllocations(collection?.cards ?? [], favorites ?? []);

      const result = compareDeckWithCollection(deck, collection?.cards ?? [], cardInfos, allocations);
      onResult(deck, result);
      navigate("/resultado");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se ha podido comprobar el mazo.");
    } finally {
      setBusy(false);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      setText(clipboardText);
    } catch {
      setError("No se ha podido leer el portapapeles. Pégalo manualmente en el editor.");
    }
  };

  const handleFile = async (file: File) => {
    const fileText = await file.text();
    setText(fileText);
  };

  return (
    <div className="space-y-4">
      {collection?.isEmpty && (
        <div role="alert" className="card flex items-start gap-2 border-saber-yellow/50 text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-saber-yellow" aria-hidden="true" />
          <p>Aún no has importado tu colección: todas las cartas aparecerán como faltantes.</p>
        </div>
      )}

      <section className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-base">Pegar JSON del mazo</h2>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={handlePasteClipboard}>
              <ClipboardPaste size={16} />
              Pegar
            </button>
            <button type="button" className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
              <FileUp size={16} />
              Archivo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </div>
        </div>
        <label htmlFor="deck-json" className="sr-only">
          JSON del mazo
        </label>
        <textarea
          id="deck-json"
          className="h-56 w-full rounded-lg border border-space-600 bg-space-950 p-3 font-mono text-xs"
          placeholder='{"metadata": {"name": "Mi mazo"}, "deck": [{"id": "ASH_188", "count": 3}]}'
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-describedby={error ? "deck-json-error" : undefined}
        />
      </section>

      {error && (
        <div id="deck-json-error" role="alert" className="card flex items-start gap-2 border-saber-red/50 text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-saber-red" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      <button type="button" className="btn-primary w-full" disabled={busy || !text.trim()} onClick={runCheck}>
        Comprobar mazo
      </button>
    </div>
  );
}

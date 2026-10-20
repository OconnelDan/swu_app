import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, Hammer, Star, RefreshCw } from "lucide-react";
import { cardIdParts, compareSetCodesByRelease } from "@/lib/cardCollectionOrder";
import {
  calculateCardmarketDeckValue,
  getCardmarketPrices,
  type CardmarketDeckValue
} from "@/lib/cardmarketPrice";
import { downloadTextFile } from "@/lib/downloadTextFile";
import type { CardComparison, DeckComparisonResult, DeckZone } from "@/types/deck";

interface DeckSummaryProps {
  result: DeckComparisonResult;
  onSaveFavorite?: () => void;
  onMountDeck?: () => void;
  onRecheck?: () => void;
  isFavorite?: boolean;
  isMounted?: boolean;
  mounting?: boolean;
  mountDisabled?: boolean;
}

type MarketValueState =
  { status: "loading" } | { status: "ready"; value: CardmarketDeckValue } | { status: "error" };

const euroFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR"
});

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

function marketValueLabel(cents: number, unpricedCopies: number): string {
  const value = euroFormatter.format(cents / 100);
  if (unpricedCopies === 0) return value;
  const pending = `${unpricedCopies} ${unpricedCopies === 1 ? "copia" : "copias"} sin precio`;
  return cents > 0 ? `${value} + ${pending}` : pending;
}

function formattedDate(value: string): string | undefined {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : dateFormatter.format(date);
}

function buildMissingListText(result: DeckComparisonResult): string {
  return result.missingCards
    .map((c) => `${c.missingCount}x ${c.cardId}${c.cardName ? ` – ${c.cardName}` : ""}`)
    .join("\n");
}

function compareCardsByRelease(left: CardComparison, right: CardComparison): number {
  const leftParts = cardIdParts(left.cardId);
  const rightParts = cardIdParts(right.cardId);
  return (
    compareSetCodesByRelease(leftParts.setCode, rightParts.setCode) ||
    leftParts.cardNumber.localeCompare(rightParts.cardNumber, "es", {
      numeric: true,
      sensitivity: "base"
    }) ||
    left.cardId.localeCompare(right.cardId, "es", { numeric: true })
  );
}

function cardNames(card: CardComparison): string {
  const localized = card.localizedCardName?.trim();
  const english = card.cardName?.trim();
  if (localized && english && localized.localeCompare(english, "es", { sensitivity: "base" })) {
    return `${localized} / ${english}`;
  }
  return localized || english || "Carta sin nombre";
}

function cardLine(card: CardComparison, count: number): string {
  return `${card.cardId} — ${count}x — ${cardNames(card)}`;
}

function zoneSection(title: string, zone: DeckZone, comparisons: CardComparison[]): string[] {
  const lines = comparisons
    .filter((card) => (card.zoneCounts[zone] ?? 0) > 0)
    .slice()
    .sort(compareCardsByRelease)
    .map((card) => cardLine(card, card.zoneCounts[zone] ?? 0));
  return [title, ...(lines.length > 0 ? lines : ["Sin cartas."])];
}

function buildDeckListText(result: DeckComparisonResult): string {
  const missingLines = result.missingCards
    .slice()
    .sort(compareCardsByRelease)
    .map((card) => cardLine(card, card.missingCount));

  return [
    `MAZO: ${result.deckName}`,
    "",
    ...zoneSection("LÍDER O LÍDERES", "leader", result.comparisons),
    "",
    ...zoneSection("BASE", "base", result.comparisons),
    "",
    ...zoneSection("MAZO PRINCIPAL", "main", result.comparisons),
    "",
    ...zoneSection("BANQUILLO", "sideboard", result.comparisons),
    "",
    "CARTAS FALTANTES",
    ...(missingLines.length > 0 ? missingLines : ["No falta ninguna carta."])
  ].join("\n");
}

function buildCsv(result: DeckComparisonResult): string {
  const mountedDeckView = result.comparisons.some((card) => card.assignedCount !== undefined);
  const header = mountedDeckView
    ? "Codigo,Carta,Necesitas,Tienes,AsignadasAqui,EnOtrosMazos,NoPoseidas,TeFaltan,Zona"
    : "Codigo,Carta,Necesitas,Tienes,TeFaltan,Zona";
  const rows = result.comparisons.map((card) => {
    const values = mountedDeckView
      ? [
          card.cardId,
          card.cardName ?? "",
          card.requiredCount,
          card.ownedCount,
          card.assignedCount ?? 0,
          card.copiesInOtherMountedDecks ?? 0,
          card.copiesMissingFromCollection ?? 0,
          card.missingCount,
          card.zones.join("+")
        ]
      : [
          card.cardId,
          card.cardName ?? "",
          card.requiredCount,
          card.ownedCount,
          card.missingCount,
          card.zones.join("+")
        ];
    return values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",");
  });
  return [header, ...rows].join("\n");
}

export function DeckSummary({
  result,
  onSaveFavorite,
  onMountDeck,
  onRecheck,
  isFavorite,
  isMounted,
  mounting,
  mountDisabled
}: DeckSummaryProps) {
  const [copied, setCopied] = useState(false);
  const [marketValue, setMarketValue] = useState<MarketValueState>({ status: "loading" });
  const missingListText = useMemo(() => buildMissingListText(result), [result]);
  const deckListText = useMemo(() => buildDeckListText(result), [result]);
  const mountedDeckView = result.comparisons.some((card) => card.assignedCount !== undefined);
  const copiesInOtherMountedDecks = result.comparisons.reduce(
    (total, card) => total + (card.copiesInOtherMountedDecks ?? 0),
    0
  );
  const copiesMissingFromCollection = result.comparisons.reduce(
    (total, card) => total + (card.copiesMissingFromCollection ?? 0),
    0
  );

  useEffect(() => {
    if (!isFavorite) return;

    let active = true;
    setMarketValue({ status: "loading" });
    void getCardmarketPrices(result.comparisons.map((card) => card.cardId))
      .then((selection) => {
        if (!active) return;
        setMarketValue({
          status: "ready",
          value: calculateCardmarketDeckValue(result.comparisons, selection)
        });
      })
      .catch(() => {
        if (active) setMarketValue({ status: "error" });
      });

    return () => {
      active = false;
    };
  }, [isFavorite, result.comparisons]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(missingListText || "No te falta ninguna carta.");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {result.complete ? (
        <div className="card border-saber-green/50 bg-saber-green/10 text-center">
          <h2 className="font-display text-xl text-saber-green">
            Tienes todas las cartas necesarias
          </h2>
        </div>
      ) : (
        <div className="card border-saber-red/50 bg-saber-red/10 text-center">
          <h2 className="font-display text-xl text-saber-red">Te faltan cartas para este mazo</h2>
        </div>
      )}

      <dl className="card grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-slate-400">Mazo</dt>
          <dd className="font-semibold">{result.deckName}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Comprobado</dt>
          <dd className="font-semibold">{new Date(result.checkedAt).toLocaleString("es-ES")}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Mazo principal</dt>
          <dd className="font-semibold">{result.mainDeckCount} cartas</dd>
        </div>
        <div>
          <dt className="text-slate-400">Banquillo</dt>
          <dd className="font-semibold">{result.sideboardCount} cartas</dd>
        </div>
        <div>
          <dt className="text-slate-400">Líder</dt>
          <dd>
            <span
              className={result.leaderStatus === "missing" ? "badge-missing" : "badge-complete"}
            >
              {result.leaderStatus === "missing" ? "Pendiente" : "Cubierto"}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Base</dt>
          <dd>
            <span className={result.baseStatus === "missing" ? "badge-missing" : "badge-complete"}>
              {result.baseStatus === "missing" ? "Pendiente" : "Cubierta"}
            </span>
          </dd>
        </div>
        {isFavorite && (
          <>
            <div>
              <dt className="text-slate-400">Valor de cartas faltantes</dt>
              <dd className="font-semibold text-saber-yellow">
                {marketValue.status === "loading"
                  ? "Calculando…"
                  : marketValue.status === "error"
                    ? "No disponible"
                    : marketValueLabel(
                        marketValue.value.missingCents,
                        marketValue.value.unpricedMissingCopies
                      )}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Valor total del mazo</dt>
              <dd className="font-semibold text-saber-blue">
                {marketValue.status === "loading"
                  ? "Calculando…"
                  : marketValue.status === "error"
                    ? "No disponible"
                    : marketValueLabel(
                        marketValue.value.totalCents,
                        marketValue.value.unpricedTotalCopies
                      )}
              </dd>
            </div>
            <div className="col-span-2 text-xs text-slate-500">
              {marketValue.status === "error" ? (
                <p>No se ha podido cargar ahora la guía diaria de precios de Cardmarket.</p>
              ) : (
                <p>
                  Precios mínimos orientativos por copia normal, sin gastos de envío.
                  {marketValue.status === "ready" && formattedDate(marketValue.value.updatedAt)
                    ? ` Actualizados el ${formattedDate(marketValue.value.updatedAt)}.`
                    : ""}
                  {marketValue.status === "ready" &&
                  (marketValue.value.unpricedTotalCopies > 0 ||
                    marketValue.value.unpricedMissingCopies > 0)
                    ? " Las copias sin precio no están incluidas en el importe."
                    : ""}
                </p>
              )}
            </div>
          </>
        )}
      </dl>

      {!result.complete && (
        <div className="card space-y-1 text-sm">
          <p>
            Te faltan <strong>{result.differentMissingCards}</strong> cartas diferentes.
          </p>
          <p>
            Te faltan <strong>{result.totalMissingCopies}</strong> copias en total.
          </p>
          {mountedDeckView && (
            <>
              <p>
                En otros mazos montados: <strong>{copiesInOtherMountedDecks}</strong> copias.
              </p>
              <p>
                No están en tu colección: <strong>{copiesMissingFromCollection}</strong> copias.
              </p>
            </>
          )}
        </div>
      )}

      {onSaveFavorite && (
        <p className="text-xs text-slate-400">
          Guardarlo en Favoritos conserva la lista para probarla más adelante, pero no reserva
          cartas. Podrás montarlo después desde la sección Mazos.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={handleCopy}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? "Copiado" : "Copiar lista de faltantes"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => downloadTextFile(deckListText, "mazo-completo.txt", "text/plain")}
        >
          <Download size={16} />
          Descargar TXT
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() =>
            downloadTextFile(buildCsv(result), "resultado-comprobacion.csv", "text/csv")
          }
        >
          <Download size={16} />
          Descargar CSV
        </button>
        {onSaveFavorite && (
          <button
            type="button"
            className="btn-primary"
            disabled={isFavorite}
            onClick={onSaveFavorite}
          >
            <Star size={16} />
            {isFavorite ? "Guardado en favoritos" : "Guardar como favorito"}
          </button>
        )}
        {isFavorite && onMountDeck && (
          <button
            type="button"
            className={isMounted ? "btn-secondary" : "btn-primary"}
            disabled={isMounted || mounting || mountDisabled}
            onClick={onMountDeck}
          >
            <Hammer size={16} />
            {isMounted ? "Mazo montado" : mounting ? "Montando..." : "Montar mazo"}
          </button>
        )}
        {onRecheck && (
          <button type="button" className="btn-secondary" onClick={onRecheck}>
            <RefreshCw size={16} />
            Volver a comprobar
          </button>
        )}
      </div>
    </div>
  );
}

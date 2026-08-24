import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PackageOpen, Pencil, RefreshCw } from "lucide-react";
import {
  DeckFormatBadge,
  DeckFormatFilter,
  type DeckFormatFilterValue
} from "@/components/DeckFormatFilter";
import { DecksTabs } from "@/components/DecksTabs";
import { SkeletonLines } from "@/components/Skeleton";
import { useDataSource } from "@/contexts/DataSourceContext";
import { useCollection } from "@/hooks/useCollection";
import { useFavorites } from "@/hooks/useFavorites";
import { useDeckLegality } from "@/hooks/useDeckLegality";
import { computeCardAllocations, summarizeMountedDeckAllocation } from "@/lib/cardAllocation";
import { compareDeckWithCollection } from "@/lib/compareDeckWithCollection";
import { SwUnlimitedDbCardProvider } from "@/providers/cardProvider/SwUnlimitedDbCardProvider";
import { getDeckBaseIds, getDeckFormat, getDeckLeaderIds } from "@/lib/deckFormats";
import type { DeckComparisonResult, FavoriteDeck, NormalizedDeck } from "@/types/deck";

interface MountedDecksPageProps {
  onOpenResult: (deck: NormalizedDeck, result: DeckComparisonResult, favoriteId?: string) => void;
}

export function MountedDecksPage({ onOpenResult }: MountedDecksPageProps) {
  const favorites = useFavorites();
  const collection = useCollection();
  const { unmountFavoriteDeck, updateFavoriteResult } = useDataSource();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [formatFilter, setFormatFilter] = useState<DeckFormatFilterValue>("all");

  const allMountedDecks = useMemo(
    () => (favorites ?? []).filter((deck) => deck.isMounted),
    [favorites]
  );
  const mountedDecks = useMemo(
    () =>
      formatFilter === "all"
        ? allMountedDecks
        : allMountedDecks.filter((deck) => getDeckFormat(deck.normalizedDeck) === formatFilter),
    [allMountedDecks, formatFilter]
  );
  const favoriteCount = (favorites?.length ?? 0) - allMountedDecks.length;
  const deckLegality = useDeckLegality(favorites);
  const allocations = useMemo(
    () => computeCardAllocations(collection?.cards ?? [], favorites ?? []),
    [collection?.cards, favorites]
  );

  const handleRecheck = async (deck: FavoriteDeck) => {
    setError(null);
    setMessage(null);
    setBusyId(deck.id);
    try {
      const cardIds = deck.normalizedDeck.allRequiredCards.map((card) => card.cardId);
      const cardProvider = new SwUnlimitedDbCardProvider();
      const cardInfos = await cardProvider.getCards(cardIds);
      const otherDeckAllocations = computeCardAllocations(
        collection?.cards ?? [],
        favorites ?? [],
        deck.id
      );
      const result = compareDeckWithCollection(
        deck.normalizedDeck,
        collection?.cards ?? [],
        cardInfos,
        otherDeckAllocations
      );

      await updateFavoriteResult(deck.id, result);
      onOpenResult(deck.normalizedDeck, result, deck.id);
      navigate("/resultado");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se ha podido comprobar el mazo.");
    } finally {
      setBusyId(null);
    }
  };

  const handleUnmount = async (deck: FavoriteDeck) => {
    const confirmed = confirm(
      `¿Desmontar «${deck.name}»?\n\nLas cartas que tiene reservadas quedarán libres y el mazo volverá a Favoritos. No se borrará su JSON.`
    );
    if (!confirmed) return;

    setError(null);
    setMessage(null);
    setBusyId(deck.id);
    try {
      await unmountFavoriteDeck(deck.id);
      setMessage(`«${deck.name}» se ha desmontado y vuelve a estar en Favoritos.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se ha podido desmontar el mazo.");
    } finally {
      setBusyId(null);
    }
  };

  if (favorites === undefined || collection === undefined) {
    return <SkeletonLines count={5} />;
  }

  return (
    <div className="space-y-4">
      <DecksTabs favoriteCount={favoriteCount} mountedCount={allMountedDecks.length} />

      <section className="card space-y-1 text-sm">
        <h2 className="font-display text-base">Mazos montados</h2>
        <p className="text-slate-400">
          Solo estos mazos reservan copias de tu colección. Desmontar uno libera sus cartas sin
          borrar la lista guardada.
        </p>
      </section>

      <DeckFormatFilter value={formatFilter} decks={allMountedDecks} onChange={setFormatFilter} />

      {deckLegality.error && (
        <p className="card border-saber-yellow/50 text-xs text-saber-yellow">
          No se ha podido actualizar la legalidad de los mazos: {deckLegality.error}
        </p>
      )}

      {message && (
        <p role="status" className="card border-saber-green/50 text-sm text-saber-green">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="card border-saber-red/50 text-sm text-saber-red">
          {error}
        </p>
      )}

      {mountedDecks.length === 0 ? (
        <p className="card text-center text-sm text-slate-300">
          {allMountedDecks.length === 0
            ? "No tienes ningún mazo montado. Puedes montar uno desde la pestaña Favoritos."
            : "No tienes mazos montados de este formato."}
        </p>
      ) : (
        <ul className="space-y-3">
          {mountedDecks.map((deck) => {
            const status = summarizeMountedDeckAllocation(deck, allocations);
            const legality = deckLegality.byDeckId.get(deck.id);

            return (
              <li key={deck.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{deck.name}</h3>
                      <DeckFormatBadge deck={deck.normalizedDeck} />
                    </div>
                    {deck.author && <p className="text-xs text-slate-400">Autor: {deck.author}</p>}
                    <p className="mt-1 text-xs text-slate-400">
                      Líder{getDeckLeaderIds(deck.normalizedDeck).length === 1 ? "" : "es"}:{" "}
                      {getDeckLeaderIds(deck.normalizedDeck).join(", ") || "—"} · Base
                      {getDeckBaseIds(deck.normalizedDeck).length === 1 ? "" : "s"}:{" "}
                      {getDeckBaseIds(deck.normalizedDeck).join(", ") || "—"}
                    </p>
                    <p className="text-xs text-slate-500">
                      Montado:{" "}
                      {new Date(deck.mountedAt ?? deck.updatedAt).toLocaleDateString("es-ES")}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={status.complete ? "badge-complete" : "badge-warning"}>
                      {status.complete ? "Montado completo" : "Montado incompleto"}
                    </span>
                    {!deckLegality.loading && legality && (
                      <span className={legality.valid ? "badge-complete" : "badge-missing"}>
                        {legality.valid ? "Legal" : "No legal"}
                      </span>
                    )}
                  </div>
                </div>

                {legality && !legality.valid && (
                  <div className="mt-2 rounded-lg border border-saber-yellow/40 bg-saber-yellow/10 p-2 text-xs text-saber-yellow">
                    <p className="font-semibold">
                      Se conserva montado para no alterar el reparto de tu colección.
                    </p>
                    {legality.errors.slice(0, 2).map((reason) => (
                      <p key={reason}>• {reason}</p>
                    ))}
                  </div>
                )}

                <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <dt className="text-slate-400">Reservadas</dt>
                    <dd className="font-semibold">
                      {status.assignedCopies}/{status.totalRequiredCopies}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">En otros mazos</dt>
                    <dd className="font-semibold">{status.copiesInOtherMountedDecks}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">No poseídas</dt>
                    <dd className="font-semibold">{status.copiesMissingFromCollection}</dd>
                  </div>
                </dl>

                {status.copiesInOtherMountedDecks > 0 && (
                  <p className="mt-2 text-xs text-saber-yellow">
                    Hay cartas en otros mazos montados. Abre el detalle para traer únicamente las
                    copias que quieras dar a este mazo.
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busyId !== null}
                    onClick={() => navigate(`/mazos/editar/${deck.id}`)}
                  >
                    <Pencil size={14} />
                    Modificar mazo
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busyId !== null}
                    onClick={() => void handleRecheck(deck)}
                  >
                    <RefreshCw size={14} />
                    Comprobar y ver cartas
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busyId !== null}
                    onClick={() => void handleUnmount(deck)}
                  >
                    <PackageOpen size={14} />
                    Desmontar mazo
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Hammer, Pencil, RefreshCw, Trash2 } from "lucide-react";
import {
  DeckFormatBadge,
  DeckFormatFilter,
  type DeckFormatFilterValue
} from "@/components/DeckFormatFilter";
import { DecksTabs } from "@/components/DecksTabs";
import { useDataSource } from "@/contexts/DataSourceContext";
import { useFavorites } from "@/hooks/useFavorites";
import { useCollection } from "@/hooks/useCollection";
import { useDeckLegality } from "@/hooks/useDeckLegality";
import { SkeletonLines } from "@/components/Skeleton";
import { isFavoriteOutdated } from "@/lib/favoritesRepository";
import { compareDeckWithCollection } from "@/lib/compareDeckWithCollection";
import { isDeckDraftIncomplete } from "@/lib/deckBuilder";
import { computeCardAllocations, summarizeMountAvailability } from "@/lib/cardAllocation";
import { buildMountDeckConfirmationMessage } from "@/lib/mountDeckConfirmation";
import { SwUnlimitedDbCardProvider } from "@/providers/cardProvider/SwUnlimitedDbCardProvider";
import { getDeckBaseIds, getDeckFormat, getDeckLeaderIds } from "@/lib/deckFormats";
import type { DeckComparisonResult, FavoriteDeck, NormalizedDeck } from "@/types/deck";

interface FavoritesPageProps {
  onOpenResult: (deck: NormalizedDeck, result: DeckComparisonResult, favoriteId?: string) => void;
}

export function FavoritesPage({ onOpenResult }: FavoritesPageProps) {
  const favorites = useFavorites();
  const collection = useCollection();
  const { deleteFavoriteDeck, duplicateFavoriteDeck, mountFavoriteDeck, updateFavoriteResult } =
    useDataSource();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formatFilter, setFormatFilter] = useState<DeckFormatFilterValue>("all");
  const allFavoriteDecks = useMemo(
    () => (favorites ?? []).filter((deck) => !deck.isMounted),
    [favorites]
  );
  const favoriteDecks = useMemo(
    () =>
      formatFilter === "all"
        ? allFavoriteDecks
        : allFavoriteDecks.filter((deck) => getDeckFormat(deck.normalizedDeck) === formatFilter),
    [allFavoriteDecks, formatFilter]
  );
  const mountedCount = (favorites?.length ?? 0) - allFavoriteDecks.length;
  const deckLegality = useDeckLegality(favorites);
  const allocations = useMemo(
    () => computeCardAllocations(collection?.cards ?? [], favorites ?? []),
    [collection?.cards, favorites]
  );

  const handleRecheck = async (favorite: FavoriteDeck) => {
    setError(null);
    setBusyId(favorite.id);
    try {
      const cardIds = favorite.normalizedDeck.allRequiredCards.map((c) => c.cardId);
      const cardProvider = new SwUnlimitedDbCardProvider();
      const cardInfos = await cardProvider.getCards(cardIds);
      const allocations = computeCardAllocations(
        collection?.cards ?? [],
        favorites ?? [],
        favorite.id
      );

      const result = compareDeckWithCollection(
        favorite.normalizedDeck,
        collection?.cards ?? [],
        cardInfos,
        allocations
      );
      await updateFavoriteResult(favorite.id, result);
      onOpenResult(favorite.normalizedDeck, result, favorite.id);
      navigate("/resultado");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se ha podido actualizar el mazo.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDuplicate = async (favoriteId: string) => {
    setError(null);
    setBusyId(favoriteId);
    try {
      await duplicateFavoriteDeck(favoriteId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se ha podido duplicar el mazo.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (favorite: FavoriteDeck) => {
    if (!confirm(`¿Eliminar "${favorite.name}" de favoritos?`)) return;
    setError(null);
    setBusyId(favorite.id);
    try {
      await deleteFavoriteDeck(favorite.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se ha podido eliminar el mazo.");
    } finally {
      setBusyId(null);
    }
  };

  const handleMount = async (favorite: FavoriteDeck) => {
    const legality = deckLegality.byDeckId.get(favorite.id);
    if (deckLegality.loading) {
      setError("Espera a que termine la comprobación de legalidad del mazo.");
      return;
    }
    if (!legality?.valid) {
      setError(
        legality?.errors[0] ?? "No se puede montar este mazo porque ya no es legal en su formato."
      );
      return;
    }
    const availability = summarizeMountAvailability(favorite.normalizedDeck, allocations);
    const confirmed = confirm(buildMountDeckConfirmationMessage(favorite.name, availability));
    if (!confirmed) return;

    setError(null);
    setBusyId(favorite.id);
    try {
      await mountFavoriteDeck(favorite.id);
      navigate("/montados");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se ha podido montar el mazo.");
    } finally {
      setBusyId(null);
    }
  };

  if (favorites === undefined || collection === undefined) return <SkeletonLines count={4} />;

  return (
    <div className="space-y-4">
      <DecksTabs favoriteCount={allFavoriteDecks.length} mountedCount={mountedCount} />

      <section className="card space-y-1 text-sm">
        <h2 className="font-display text-base">Favoritos</h2>
        <p className="text-slate-400">
          Aquí guardas ideas y mazos que quieres probar. No reservan ninguna carta hasta que pulses
          «Montar mazo».
        </p>
      </section>

      <DeckFormatFilter value={formatFilter} decks={allFavoriteDecks} onChange={setFormatFilter} />

      {deckLegality.error && (
        <p className="card border-saber-yellow/50 text-xs text-saber-yellow">
          No se ha podido actualizar la legalidad de los mazos: {deckLegality.error}
        </p>
      )}

      {error && (
        <p role="alert" className="card border-saber-red/50 text-sm text-saber-red">
          {error}
        </p>
      )}
      {favoriteDecks.length === 0 ? (
        <p className="card text-center text-sm text-slate-300">
          {allFavoriteDecks.length === 0
            ? "Todavía no tienes mazos en Favoritos."
            : "No tienes mazos favoritos de este formato."}
        </p>
      ) : (
        <ul className="space-y-3">
          {favoriteDecks.map((favorite) => {
            const legality = deckLegality.byDeckId.get(favorite.id);
            const draftIncomplete = legality
              ? isDeckDraftIncomplete(legality)
              : false;
            const outdated = collection
              ? isFavoriteOutdated(favorite, collection.fingerprint)
              : false;
            const status = favorite.lastResult
              ? favorite.lastResult.complete
                ? "Completo"
                : "Incompleto"
              : "No comprobado";

            return (
              <li key={favorite.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{favorite.name}</h3>
                      <DeckFormatBadge deck={favorite.normalizedDeck} />
                    </div>
                    {favorite.author && (
                      <p className="text-xs text-slate-400">Autor: {favorite.author}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-400">
                      Líder{getDeckLeaderIds(favorite.normalizedDeck).length === 1 ? "" : "es"}:{" "}
                      {getDeckLeaderIds(favorite.normalizedDeck).join(", ") || "—"} · Base
                      {getDeckBaseIds(favorite.normalizedDeck).length === 1 ? "" : "s"}:{" "}
                      {getDeckBaseIds(favorite.normalizedDeck).join(", ") || "—"}
                    </p>
                    <p className="text-xs text-slate-500">
                      Guardado: {new Date(favorite.createdAt).toLocaleDateString("es-ES")}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={
                        status === "Completo"
                          ? "badge-complete"
                          : status === "Incompleto"
                            ? "badge-missing"
                            : "badge-warning"
                      }
                    >
                      {status}
                    </span>
                    {!deckLegality.loading && legality && (
                      <span
                        className={
                          draftIncomplete
                            ? "badge-warning"
                            : legality.valid
                              ? "badge-complete"
                              : "badge-missing"
                        }
                      >
                        {draftIncomplete ? "Mazo inacabado" : legality.valid ? "Legal" : "No legal"}
                      </span>
                    )}
                  </div>
                </div>

                {legality && !legality.valid && (
                  <div className="mt-2 rounded-lg border border-saber-red/40 bg-saber-red/10 p-2 text-xs text-saber-red">
                    <p className="font-semibold">Este mazo se conserva, pero no puede montarse.</p>
                    {legality.errors.slice(0, 2).map((message) => (
                      <p key={message}>• {message}</p>
                    ))}
                    {legality.errors.length > 2 && (
                      <p>• Hay {legality.errors.length - 2} incidencia(s) más.</p>
                    )}
                  </div>
                )}

                {outdated && (
                  <p className="mt-2 text-xs text-saber-yellow">
                    Colección actualizada: vuelve a comprobar este mazo.
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busyId !== null}
                    onClick={() => navigate(`/mazos/editar/${favorite.id}`)}
                  >
                    <Pencil size={14} />
                    Continuar editando
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busyId !== null || deckLegality.loading || !legality?.valid}
                    onClick={() => void handleMount(favorite)}
                  >
                    <Hammer size={14} />
                    Montar mazo
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busyId !== null}
                    onClick={() => handleRecheck(favorite)}
                  >
                    <RefreshCw size={14} />
                    Comprobar de nuevo
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busyId !== null}
                    onClick={() => void handleDuplicate(favorite.id)}
                  >
                    <Copy size={14} />
                    Duplicar
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    disabled={busyId !== null}
                    onClick={() => void handleDelete(favorite)}
                  >
                    <Trash2 size={14} />
                    Eliminar
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

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Hammer, RefreshCw, Trash2 } from "lucide-react";
import { DecksTabs } from "@/components/DecksTabs";
import { useDataSource } from "@/contexts/DataSourceContext";
import { useFavorites } from "@/hooks/useFavorites";
import { useCollection } from "@/hooks/useCollection";
import { SkeletonLines } from "@/components/Skeleton";
import { isFavoriteOutdated } from "@/lib/favoritesRepository";
import { compareDeckWithCollection } from "@/lib/compareDeckWithCollection";
import { computeCardAllocations, summarizeMountAvailability } from "@/lib/cardAllocation";
import { buildMountDeckConfirmationMessage } from "@/lib/mountDeckConfirmation";
import { SwUnlimitedDbCardProvider } from "@/providers/cardProvider/SwUnlimitedDbCardProvider";
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
  const favoriteDecks = useMemo(
    () => (favorites ?? []).filter((deck) => !deck.isMounted),
    [favorites]
  );
  const mountedCount = (favorites?.length ?? 0) - favoriteDecks.length;
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
      <DecksTabs favoriteCount={favoriteDecks.length} mountedCount={mountedCount} />

      <section className="card space-y-1 text-sm">
        <h2 className="font-display text-base">Favoritos</h2>
        <p className="text-slate-400">
          Aquí guardas ideas y mazos que quieres probar. No reservan ninguna carta hasta que pulses
          «Montar mazo».
        </p>
      </section>

      {error && (
        <p role="alert" className="card border-saber-red/50 text-sm text-saber-red">
          {error}
        </p>
      )}
      {favoriteDecks.length === 0 ? (
        <p className="card text-center text-sm text-slate-300">
          Todavía no tienes mazos en Favoritos.
        </p>
      ) : (
        <ul className="space-y-3">
          {favoriteDecks.map((favorite) => {
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
                    <h3 className="font-semibold">{favorite.name}</h3>
                    {favorite.author && (
                      <p className="text-xs text-slate-400">Autor: {favorite.author}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-400">
                      Líder: {favorite.normalizedDeck.leader?.cardId ?? "—"} · Base:{" "}
                      {favorite.normalizedDeck.base?.cardId ?? "—"}
                    </p>
                    <p className="text-xs text-slate-500">
                      Guardado: {new Date(favorite.createdAt).toLocaleDateString("es-ES")}
                    </p>
                  </div>
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
                </div>

                {outdated && (
                  <p className="mt-2 text-xs text-saber-yellow">
                    Colección actualizada: vuelve a comprobar este mazo.
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busyId !== null}
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

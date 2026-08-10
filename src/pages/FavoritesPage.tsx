import { useNavigate } from "react-router-dom";
import { Copy, RefreshCw, Trash2 } from "lucide-react";
import { useFavorites } from "@/hooks/useFavorites";
import { useCollection } from "@/hooks/useCollection";
import { SkeletonLines } from "@/components/Skeleton";
import {
  deleteFavoriteDeck,
  duplicateFavoriteDeck,
  isFavoriteOutdated,
  updateFavoriteResult
} from "@/lib/favoritesRepository";
import { compareDeckWithCollection } from "@/lib/compareDeckWithCollection";
import { computeCardAllocations } from "@/lib/cardAllocation";
import { SwUnlimitedDbCardProvider } from "@/providers/cardProvider/SwUnlimitedDbCardProvider";
import type { DeckComparisonResult, FavoriteDeck, NormalizedDeck } from "@/types/deck";

interface FavoritesPageProps {
  onOpenResult: (deck: NormalizedDeck, result: DeckComparisonResult, favoriteId?: string) => void;
}

export function FavoritesPage({ onOpenResult }: FavoritesPageProps) {
  const favorites = useFavorites();
  const collection = useCollection();
  const navigate = useNavigate();

  const handleRecheck = async (favorite: FavoriteDeck) => {
    const cardIds = favorite.normalizedDeck.allRequiredCards.map((c) => c.cardId);
    const cardProvider = new SwUnlimitedDbCardProvider();
    const cardInfos = await cardProvider.getCards(cardIds);
    const allocations = computeCardAllocations(collection?.cards ?? [], favorites ?? [], favorite.id);

    const result = compareDeckWithCollection(
      favorite.normalizedDeck,
      collection?.cards ?? [],
      cardInfos,
      allocations
    );
    await updateFavoriteResult(favorite.id, result);
    onOpenResult(favorite.normalizedDeck, result, favorite.id);
    navigate("/resultado");
  };

  if (favorites === undefined) return <SkeletonLines count={4} />;

  if (favorites.length === 0) {
    return <p className="card text-center text-sm text-slate-300">Todavía no tienes mazos favoritos guardados.</p>;
  }

  return (
    <ul className="space-y-3">
      {favorites.map((favorite) => {
        const outdated = collection ? isFavoriteOutdated(favorite, collection.fingerprint) : false;
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
                {favorite.author && <p className="text-xs text-slate-400">Autor: {favorite.author}</p>}
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
                  status === "Completo" ? "badge-complete" : status === "Incompleto" ? "badge-missing" : "badge-warning"
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
              <button type="button" className="btn-secondary" onClick={() => handleRecheck(favorite)}>
                <RefreshCw size={14} />
                Comprobar de nuevo
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => duplicateFavoriteDeck(favorite.id)}
              >
                <Copy size={14} />
                Duplicar
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  if (confirm(`¿Eliminar "${favorite.name}" de favoritos?`)) {
                    void deleteFavoriteDeck(favorite.id);
                  }
                }}
              >
                <Trash2 size={14} />
                Eliminar
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

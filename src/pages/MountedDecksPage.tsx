import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PackageOpen, RefreshCw } from "lucide-react";
import { DecksTabs } from "@/components/DecksTabs";
import { SkeletonLines } from "@/components/Skeleton";
import { useDataSource } from "@/contexts/DataSourceContext";
import { useCollection } from "@/hooks/useCollection";
import { useFavorites } from "@/hooks/useFavorites";
import { computeCardAllocations, summarizeMountedDeckAllocation } from "@/lib/cardAllocation";
import { compareDeckWithCollection } from "@/lib/compareDeckWithCollection";
import { SwUnlimitedDbCardProvider } from "@/providers/cardProvider/SwUnlimitedDbCardProvider";
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

  const mountedDecks = useMemo(
    () => (favorites ?? []).filter((deck) => deck.isMounted),
    [favorites]
  );
  const favoriteCount = (favorites?.length ?? 0) - mountedDecks.length;
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
      <DecksTabs favoriteCount={favoriteCount} mountedCount={mountedDecks.length} />

      <section className="card space-y-1 text-sm">
        <h2 className="font-display text-base">Mazos montados</h2>
        <p className="text-slate-400">
          Solo estos mazos reservan copias de tu colección. Desmontar uno libera sus cartas sin
          borrar la lista guardada.
        </p>
      </section>

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
          No tienes ningún mazo montado. Puedes montar uno desde la pestaña Favoritos.
        </p>
      ) : (
        <ul className="space-y-3">
          {mountedDecks.map((deck) => {
            const status = summarizeMountedDeckAllocation(deck, allocations);

            return (
              <li key={deck.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{deck.name}</h3>
                    {deck.author && <p className="text-xs text-slate-400">Autor: {deck.author}</p>}
                    <p className="mt-1 text-xs text-slate-400">
                      Líder: {deck.normalizedDeck.leader?.cardId ?? "—"} · Base:{" "}
                      {deck.normalizedDeck.base?.cardId ?? "—"}
                    </p>
                    <p className="text-xs text-slate-500">
                      Montado:{" "}
                      {new Date(deck.mountedAt ?? deck.updatedAt).toLocaleDateString("es-ES")}
                    </p>
                  </div>
                  <span className={status.complete ? "badge-complete" : "badge-warning"}>
                    {status.complete ? "Montado completo" : "Montado incompleto"}
                  </span>
                </div>

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
                    Hay cartas en otros mazos montados. La siguiente función permitirá traerlas a
                    este mazo de forma controlada.
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
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

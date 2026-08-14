import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users } from "lucide-react";
import { DeckSummary } from "@/components/DeckSummary";
import { DeckResultTable } from "@/components/DeckResultTable";
import { useDataSource } from "@/contexts/DataSourceContext";
import { useAuth } from "@/hooks/useAuth";
import { computeCardAllocations, summarizeMountAvailability } from "@/lib/cardAllocation";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { buildMountDeckConfirmationMessage } from "@/lib/mountDeckConfirmation";
import { getFriendsCardAvailability, type FriendCardAvailability } from "@/lib/friendsRepository";
import type { DeckComparisonResult, FavoriteDeck, NormalizedDeck } from "@/types/deck";

interface ResultPageProps {
  deck: NormalizedDeck | null;
  result: DeckComparisonResult | null;
  favoriteId?: string | null;
  onFavoriteSaved?: (favoriteId: string) => void;
}

export function ResultPage({ deck, result, favoriteId = null, onFavoriteSaved }: ResultPageProps) {
  const [showAll, setShowAll] = useState(false);
  const [activeFavoriteId, setActiveFavoriteId] = useState<string | null>(favoriteId);
  const [savedFavoriteSnapshot, setSavedFavoriteSnapshot] = useState<FavoriteDeck | null>(null);
  const [savedAsFavorite, setSavedAsFavorite] = useState(favoriteId !== null);
  const [mountedOnResult, setMountedOnResult] = useState(false);
  const [mounting, setMounting] = useState(false);
  const [friendAvailability, setFriendAvailability] = useState<
    Map<string, FriendCardAvailability[]>
  >(new Map());
  const [friendLookupError, setFriendLookupError] = useState<string | null>(null);
  const [friendLookupBusy, setFriendLookupBusy] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const [favoriteMessage, setFavoriteMessage] = useState<string | null>(null);
  const { session } = useAuth();
  const { collection, favorites, mountFavoriteDeck, saveFavoriteDeck } = useDataSource();
  const navigate = useNavigate();
  const favoriteFromSource = activeFavoriteId
    ? favorites?.find((favorite) => favorite.id === activeFavoriteId)
    : undefined;
  const activeFavorite =
    favoriteFromSource ??
    (savedFavoriteSnapshot?.id === activeFavoriteId ? savedFavoriteSnapshot : undefined);
  const allocations = useMemo(
    () => computeCardAllocations(collection?.cards ?? [], favorites ?? []),
    [collection?.cards, favorites]
  );
  const isMounted = Boolean(activeFavorite?.isMounted || mountedOnResult);

  if (!deck || !result) {
    return (
      <div className="card text-center text-sm text-slate-300">
        Todavía no has comprobado ningún mazo.{" "}
        <button className="text-saber-blue underline" onClick={() => navigate("/comprobar")}>
          Ir a comprobar un mazo
        </button>
      </div>
    );
  }

  const handleSaveFavorite = async () => {
    setFavoriteError(null);
    setFavoriteMessage(null);
    try {
      const favorite = await saveFavoriteDeck(deck, result);
      setActiveFavoriteId(favorite.id);
      setSavedFavoriteSnapshot(favorite);
      setSavedAsFavorite(true);
      onFavoriteSaved?.(favorite.id);
    } catch (cause) {
      setFavoriteError(cause instanceof Error ? cause.message : "No se ha podido guardar el mazo.");
    }
  };

  const handleMountFavorite = async () => {
    if (!activeFavorite) {
      setFavoriteError("Espera a que termine de cargar el mazo guardado.");
      return;
    }

    const availability = summarizeMountAvailability(activeFavorite.normalizedDeck, allocations);
    const confirmed = confirm(buildMountDeckConfirmationMessage(activeFavorite.name, availability));
    if (!confirmed) return;

    setFavoriteError(null);
    setFavoriteMessage(null);
    setMounting(true);
    try {
      await mountFavoriteDeck(activeFavorite.id);
      setMountedOnResult(true);
      setFavoriteMessage(
        `«${activeFavorite.name}» ya está en Mazos montados y sus copias libres han quedado reservadas.`
      );
    } catch (cause) {
      setFavoriteError(cause instanceof Error ? cause.message : "No se ha podido montar el mazo.");
    } finally {
      setMounting(false);
    }
  };

  const handleCheckFriends = async () => {
    setFriendLookupError(null);
    setFriendLookupBusy(true);
    try {
      const missingCardIds = result.missingCards.map((c) => c.cardId);
      const availability = await getFriendsCardAvailability(missingCardIds);
      const map = new Map<string, FriendCardAvailability[]>();
      for (const entry of availability) {
        const list = map.get(entry.cardId) ?? [];
        list.push(entry);
        map.set(entry.cardId, list);
      }
      setFriendAvailability(map);
    } catch (e) {
      setFriendLookupError(
        e instanceof Error ? e.message : "No se ha podido consultar a tus amigos."
      );
    } finally {
      setFriendLookupBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <DeckSummary
        result={result}
        onSaveFavorite={handleSaveFavorite}
        isFavorite={savedAsFavorite}
        isMounted={isMounted}
        mounting={mounting}
        mountDisabled={!activeFavorite}
        onMountDeck={activeFavoriteId ? handleMountFavorite : undefined}
        onRecheck={() => navigate("/comprobar")}
      />

      {favoriteMessage && (
        <p role="status" className="card border-saber-green/50 text-sm text-saber-green">
          {favoriteMessage}
        </p>
      )}
      {favoriteError && (
        <p role="alert" className="card border-saber-red/50 text-sm text-saber-red">
          {favoriteError}
        </p>
      )}

      <div className="flex gap-2" role="group" aria-label="Filtro de cartas">
        <button
          type="button"
          className={showAll ? "btn-secondary" : "btn-primary"}
          onClick={() => setShowAll(false)}
          aria-pressed={!showAll}
        >
          Mostrar solo faltantes
        </button>
        <button
          type="button"
          className={showAll ? "btn-primary" : "btn-secondary"}
          onClick={() => setShowAll(true)}
          aria-pressed={showAll}
        >
          Mostrar todas las cartas
        </button>
      </div>

      {isSupabaseConfigured && !result.complete && (
        <div className="card space-y-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={friendLookupBusy}
            onClick={session ? handleCheckFriends : () => navigate("/amigos")}
          >
            <Users size={16} />
            {session
              ? "Ver si mis amigos tienen las cartas que me faltan"
              : "Inicia sesión para consultar a tus amigos"}
          </button>
          {friendLookupError && (
            <p role="alert" className="text-sm text-saber-red">
              {friendLookupError}
            </p>
          )}
        </div>
      )}

      <DeckResultTable
        comparisons={result.comparisons}
        showAll={showAll}
        friendAvailability={friendAvailability}
      />
    </div>
  );
}

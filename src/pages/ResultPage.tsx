import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users } from "lucide-react";
import { DeckSummary } from "@/components/DeckSummary";
import { DeckResultTable } from "@/components/DeckResultTable";
import { useDataSource } from "@/contexts/DataSourceContext";
import { useAuth } from "@/hooks/useAuth";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getFriendsCardAvailability, type FriendCardAvailability } from "@/lib/friendsRepository";
import type { DeckComparisonResult, NormalizedDeck } from "@/types/deck";

interface ResultPageProps {
  deck: NormalizedDeck | null;
  result: DeckComparisonResult | null;
  isFavorite?: boolean;
}

export function ResultPage({ deck, result, isFavorite = false }: ResultPageProps) {
  const [showAll, setShowAll] = useState(false);
  const [savedAsFavorite, setSavedAsFavorite] = useState(isFavorite);
  const [friendAvailability, setFriendAvailability] = useState<
    Map<string, FriendCardAvailability[]>
  >(new Map());
  const [friendLookupError, setFriendLookupError] = useState<string | null>(null);
  const [friendLookupBusy, setFriendLookupBusy] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const { session } = useAuth();
  const { saveFavoriteDeck } = useDataSource();
  const navigate = useNavigate();

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
    try {
      await saveFavoriteDeck(deck, result);
      setSavedAsFavorite(true);
    } catch (cause) {
      setFavoriteError(cause instanceof Error ? cause.message : "No se ha podido guardar el mazo.");
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
        onRecheck={() => navigate("/comprobar")}
      />

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

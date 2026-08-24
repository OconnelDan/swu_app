import { useEffect, useMemo, useState } from "react";
import { validateNormalizedDeck, type DeckValidation } from "@/lib/deckBuilder";
import { buildCardLegalityIndex } from "@/lib/deckFormats";
import { SwUnlimitedDbCardProvider } from "@/providers/cardProvider/SwUnlimitedDbCardProvider";
import type { CardInfo } from "@/types/card";
import type { FavoriteDeck } from "@/types/deck";

interface DeckLegalityState {
  loading: boolean;
  error: string | null;
  byDeckId: Map<string, DeckValidation>;
}

export function useDeckLegality(decks: FavoriteDeck[] | undefined): DeckLegalityState {
  const [cardsById, setCardsById] = useState<Map<string, CardInfo> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requiredCardIds = useMemo(
    () => [
      ...new Set(
        (decks ?? []).flatMap((deck) =>
          deck.normalizedDeck.allRequiredCards.map((card) => card.cardId)
        )
      )
    ],
    [decks]
  );
  const requiredKey = requiredCardIds.join("|");
  const decksReady = decks !== undefined;

  useEffect(() => {
    if (!decksReady) {
      setCardsById(null);
      setError(null);
      return;
    }
    if (requiredCardIds.length === 0) {
      setCardsById(new Map());
      setError(null);
      return;
    }

    let active = true;
    const provider = new SwUnlimitedDbCardProvider();
    void Promise.all([provider.getAllCards(), provider.getCards(requiredCardIds)])
      .then(([allCards, requestedCards]) => {
        if (!active) return;
        const next = new Map(allCards.map((card) => [card.cardId, card]));
        for (const [requestedId, card] of requestedCards) next.set(requestedId, card);
        setCardsById(next);
        setError(null);
      })
      .catch((cause) => {
        if (!active) return;
        setCardsById(null);
        setError(
          cause instanceof Error
            ? cause.message
            : "No se ha podido comprobar la legalidad de los mazos."
        );
      });
    return () => {
      active = false;
    };
    // requiredKey evita repetir la carga por cambios de referencia sin cambios de cartas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decksReady, requiredKey]);

  const byDeckId = useMemo(() => {
    const result = new Map<string, DeckValidation>();
    if (!cardsById) return result;
    const legalityIndex = buildCardLegalityIndex([...cardsById.values()]);
    for (const deck of decks ?? []) {
      result.set(deck.id, validateNormalizedDeck(deck.normalizedDeck, cardsById, legalityIndex));
    }
    return result;
  }, [cardsById, decks]);

  return { loading: !decksReady || (!cardsById && !error), error, byDeckId };
}

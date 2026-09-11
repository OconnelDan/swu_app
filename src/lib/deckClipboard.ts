import { getDeckFormat } from "@/lib/deckFormats";
import type { FavoriteDeck, NormalizedDeckCard, NormalizedDeckPart } from "@/types/deck";

interface ClipboardCardEntry {
  id: string;
  count: number;
}

function cardsForZone(
  cards: NormalizedDeckCard[],
  zone: "main" | "sideboard"
): ClipboardCardEntry[] {
  return cards.flatMap((card) => {
    const count = card.zoneCounts[zone] ?? 0;
    return count > 0 ? [{ id: card.cardId, count }] : [];
  });
}

function getLeaders(part: NormalizedDeckPart): NormalizedDeckCard[] {
  return part.leaders?.length ? part.leaders : part.leader ? [part.leader] : [];
}

function buildClipboardDeckPart(part: NormalizedDeckPart, includeName = false) {
  const leaders = getLeaders(part);

  return {
    ...(includeName ? { name: part.name } : {}),
    ...(leaders[0] ? { leader: { id: leaders[0].cardId, count: 1 } } : {}),
    ...(leaders[1] ? { secondleader: { id: leaders[1].cardId, count: 1 } } : {}),
    ...(part.base ? { base: { id: part.base.cardId, count: 1 } } : {}),
    deck: cardsForZone(part.mainDeck, "main"),
    sideboard: cardsForZone(part.sideboard, "sideboard")
  };
}

/**
 * Reconstruye el JSON desde el modelo normalizado para no arrastrar claves de
 * importadores externos ni datos antiguos. Premier y Eternal conservan la
 * estructura solicitada para Karabast. Twin Suns añade `secondleader` para no
 * perder su segundo líder. Trilogy mantiene sus tres mazos separados para que
 * la copia nunca pierda información.
 */
export function buildDeckClipboardJson(
  favorite: Pick<FavoriteDeck, "name" | "author" | "normalizedDeck">
): unknown {
  const { normalizedDeck } = favorite;
  const metadata = {
    name: favorite.name,
    author: favorite.author ?? normalizedDeck.author ?? ""
  };

  if (getDeckFormat(normalizedDeck) === "trilogy") {
    return {
      metadata: { ...metadata, format: "Trilogy" },
      trilogyDecks: (normalizedDeck.trilogyDecks ?? []).map((part) =>
        buildClipboardDeckPart(part, true)
      )
    };
  }

  return {
    metadata,
    ...buildClipboardDeckPart(normalizedDeck)
  };
}

export function buildDeckClipboardText(
  favorite: Pick<FavoriteDeck, "name" | "author" | "normalizedDeck">
): string {
  return JSON.stringify(buildDeckClipboardJson(favorite), null, 2);
}

import {
  DECK_FORMATS,
  DECK_FORMAT_LABELS,
  getDeckFormat,
  getDeckFormatLabel
} from "@/lib/deckFormats";
import type { DeckFormat, FavoriteDeck } from "@/types/deck";

export type DeckFormatFilterValue = "all" | DeckFormat;

export function DeckFormatFilter({
  value,
  decks,
  onChange
}: {
  value: DeckFormatFilterValue;
  decks: FavoriteDeck[];
  onChange: (value: DeckFormatFilterValue) => void;
}) {
  return (
    <label className="card flex items-center justify-between gap-3 text-sm">
      <span className="font-semibold">Filtrar por formato</span>
      <select
        aria-label="Filtrar mazos por formato"
        className="min-w-40"
        value={value}
        onChange={(event) => onChange(event.target.value as DeckFormatFilterValue)}
      >
        <option value="all">Todos ({decks.length})</option>
        {DECK_FORMATS.map((format) => {
          const count = decks.filter(
            (deck) => getDeckFormat(deck.normalizedDeck) === format
          ).length;
          return (
            <option key={format} value={format}>
              {DECK_FORMAT_LABELS[format]} ({count})
            </option>
          );
        })}
      </select>
    </label>
  );
}

export function DeckFormatBadge({ deck }: { deck: FavoriteDeck["normalizedDeck"] }) {
  return <span className="badge-warning">{getDeckFormatLabel(deck)}</span>;
}

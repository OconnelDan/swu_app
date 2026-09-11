import type { ReactNode } from "react";
import { buildDeckCardBorderGradient, getDeckCardBorderColors } from "@/lib/deckCardBorder";
import type { CardInfo } from "@/types/card";
import type { NormalizedDeck } from "@/types/deck";

export function DeckCardFrame({
  deck,
  cardsById,
  children
}: {
  deck: NormalizedDeck;
  cardsById?: ReadonlyMap<string, Pick<CardInfo, "aspects">> | null;
  children: ReactNode;
}) {
  const colors = getDeckCardBorderColors(deck, cardsById);

  return (
    <li
      className="rounded-xl p-[3px] shadow-lg"
      style={{ backgroundImage: buildDeckCardBorderGradient(colors) }}
      data-leader-border-colors={colors.leader.join(",")}
      data-base-border-colors={colors.base.join(",")}
    >
      <div className="h-full rounded-[9px] bg-space-900/95 p-4">{children}</div>
    </li>
  );
}

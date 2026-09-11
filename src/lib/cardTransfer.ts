import type { CardTransferPlan } from "@/lib/cardAllocation";
import type { CardTransferSelection } from "@/types/deck";

/** Construye un resumen textual del reparto elegido por el usuario. */
export function buildCardTransferConfirmationMessage(
  plan: CardTransferPlan,
  selections: CardTransferSelection[]
): string {
  const movements = selections
    .map((selection) => {
      const source = plan.sources.find((entry) => entry.favoriteId === selection.favoriteId);
      return `- ${selection.count}× ${plan.cardId} desde «${source?.favoriteName ?? selection.favoriteId}».`;
    })
    .join("\n");
  const stillMissing =
    plan.copiesStillMissingFromCollection > 0
      ? `\n\nDespués del movimiento seguirás necesitando ${plan.copiesStillMissingFromCollection} copia(s) que no están en tu colección.`
      : "";

  return `Para preparar «${plan.targetFavoriteName}» se reasignarán:\n\n${movements}\n\nLos mazos afectados conservarán su composición, pero pueden quedar físicamente incompletos.${stillMissing}`;
}

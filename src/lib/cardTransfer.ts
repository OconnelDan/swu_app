import type { CardTransferPlan } from "@/lib/cardAllocation";

/** Construye la confirmación exacta antes de reasignar una carta física. */
export function buildCardTransferConfirmationMessage(plan: CardTransferPlan): string {
  const movements = plan.sources
    .map((source) => `- ${source.movedCount}× ${plan.cardId} desde «${source.favoriteName}».`)
    .join("\n");
  const stillMissing =
    plan.copiesStillMissingFromCollection > 0
      ? `\n\nDespués del movimiento seguirás necesitando ${plan.copiesStillMissingFromCollection} copia(s) que no están en tu colección.`
      : "";

  return `Para preparar «${plan.targetFavoriteName}» se moverán:\n\n${movements}\n\nLos mazos afectados seguirán guardados, pero quedarán marcados como incompletos. No se modificará la composición ni el JSON de ningún mazo.${stillMissing}`;
}

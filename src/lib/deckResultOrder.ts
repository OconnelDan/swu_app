import type { CardComparison, DeckZone } from "@/types/deck";

const ZONE_ORDER: DeckZone[] = ["leader", "base", "main", "sideboard"];

export interface DeckDisplayRow extends CardComparison {
  displayZone: DeckZone;
  rowKey: string;
}

function compareCost(left: CardComparison, right: CardComparison): number {
  const leftCost = left.cost ?? Number.POSITIVE_INFINITY;
  const rightCost = right.cost ?? Number.POSITIVE_INFINITY;
  return (
    leftCost - rightCost ||
    (left.localizedCardName ?? left.cardName ?? left.cardId).localeCompare(
      right.localizedCardName ?? right.cardName ?? right.cardId,
      "es",
      { numeric: true, sensitivity: "base" }
    ) ||
    left.cardId.localeCompare(right.cardId, "es", { numeric: true })
  );
}

/**
 * Separa una carta que esté a la vez en el mazo y el banquillo para que cada
 * zona aparezca donde corresponde. Las copias disponibles se aplican primero
 * al mazo principal y después al banquillo.
 */
export function buildDeckDisplayRows(comparisons: CardComparison[]): DeckDisplayRow[] {
  const rows: DeckDisplayRow[] = [];

  for (const comparison of comparisons) {
    let availableForZones =
      comparison.assignedCount ?? Math.min(comparison.ownedCount, comparison.requiredCount);

    for (const zone of ZONE_ORDER) {
      const requiredCount = comparison.zoneCounts[zone] ?? 0;
      if (requiredCount <= 0) continue;

      const assignedCount = Math.min(requiredCount, Math.max(availableForZones, 0));
      availableForZones -= assignedCount;
      const missingCount = requiredCount - assignedCount;
      rows.push({
        ...comparison,
        rowKey: `${comparison.cardId}:${zone}`,
        displayZone: zone,
        requiredCount,
        assignedCount: comparison.assignedCount === undefined ? undefined : assignedCount,
        missingCount,
        surplusCount: Math.max(comparison.ownedCount - requiredCount, 0),
        zones: [zone],
        zoneCounts: { [zone]: requiredCount },
        status: missingCount > 0 ? "missing" : "complete"
      });
    }
  }

  return rows.sort((left, right) => {
    const zoneDifference =
      ZONE_ORDER.indexOf(left.displayZone) - ZONE_ORDER.indexOf(right.displayZone);
    return zoneDifference || compareCost(left, right);
  });
}

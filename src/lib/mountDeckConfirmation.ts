import type { MountAvailabilitySummary } from "@/lib/cardAllocation";

/** Mensaje común para montar un mazo desde Favoritos o desde su resultado. */
export function buildMountDeckConfirmationMessage(
  deckName: string,
  availability: MountAvailabilitySummary
): string {
  const details = [
    `Se reservarán ${availability.freeCopiesAvailable} copia(s) que ahora están libres.`,
    availability.copiesInMountedDecks > 0
      ? `${availability.copiesInMountedDecks} copia(s) están en otros mazos montados y quedarán pendientes.`
      : null,
    availability.copiesMissingFromCollection > 0
      ? `${availability.copiesMissingFromCollection} copia(s) no están en tu colección y quedarán pendientes.`
      : null
  ]
    .filter(Boolean)
    .join("\n");

  return `¿Montar «${deckName}»?\n\n${details}\n\nNo se quitarán cartas automáticamente a otros mazos.`;
}

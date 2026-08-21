export interface SnapshotCard {
  cardId: string;
  setCode: string;
  cardNumber: string;
  name?: string;
  ownedCount: number;
}

export interface CollectionChange {
  cardId: string;
  name?: string;
  previousCount: number;
  currentCount: number;
  difference: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseSnapshot(value: unknown): SnapshotCard[] {
  if (!Array.isArray(value)) throw new Error("La instantánea de colección no es un array.");

  return value.map((entry) => {
    const row = asRecord(entry);
    const cardId = typeof row?.cardId === "string" ? row.cardId : "";
    const ownedCount = Number(row?.ownedCount);
    const [fallbackSet = "", fallbackNumber = ""] = cardId.split("_", 2);
    const setCode = typeof row?.setCode === "string" ? row.setCode : fallbackSet;
    const cardNumber = typeof row?.cardNumber === "string" ? row.cardNumber : fallbackNumber;

    if (!cardId || !setCode || !cardNumber || !Number.isInteger(ownedCount) || ownedCount < 0) {
      throw new Error(`La instantánea contiene una carta inválida: ${cardId || "sin código"}.`);
    }

    return {
      cardId,
      setCode,
      cardNumber,
      ...(typeof row?.name === "string" && row.name.trim() ? { name: row.name.trim() } : {}),
      ownedCount
    };
  });
}

export function calculateCollectionChanges(
  previousSnapshot: SnapshotCard[],
  currentSnapshot: SnapshotCard[]
): CollectionChange[] {
  const previousById = new Map(previousSnapshot.map((card) => [card.cardId, card]));
  const currentById = new Map(currentSnapshot.map((card) => [card.cardId, card]));
  const cardIds = new Set([...previousById.keys(), ...currentById.keys()]);

  return [...cardIds]
    .sort((left, right) => left.localeCompare(right))
    .flatMap((cardId) => {
      const previous = previousById.get(cardId);
      const current = currentById.get(cardId);
      const previousCount = previous?.ownedCount ?? 0;
      const currentCount = current?.ownedCount ?? 0;
      if (previousCount === currentCount) return [];

      return [
        {
          cardId,
          name: current?.name ?? previous?.name,
          previousCount,
          currentCount,
          difference: currentCount - previousCount
        }
      ];
    });
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildChangesCsv(changes: CollectionChange[]): string {
  const rows = [
    ["Código", "Nombre", "Cantidad anterior", "Cantidad actual", "Diferencia"],
    ...changes.map((change) => [
      change.cardId,
      change.name ?? "",
      change.previousCount,
      change.currentCount,
      change.difference > 0 ? `+${change.difference}` : change.difference
    ])
  ];

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

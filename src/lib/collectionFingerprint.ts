import type { CollectionCard } from "@/types/collection";

/**
 * Genera una huella determinista del estado de la colección (orden
 * independiente) para poder detectar si ha cambiado desde la última
 * comprobación de un mazo favorito. No es criptográfica, solo de
 * detección de cambios (djb2 sobre una representación canónica).
 */
export function computeCollectionFingerprint(collection: CollectionCard[]): string {
  const sorted = [...collection]
    .map((c) => `${c.cardId}:${c.ownedCount}`)
    .sort();
  const canonical = sorted.join("|");

  let hash = 5381;
  for (let i = 0; i < canonical.length; i++) {
    hash = (hash * 33) ^ canonical.charCodeAt(i);
  }
  // Convertir a entero sin signo y a base36 para que sea compacto.
  return (hash >>> 0).toString(36);
}

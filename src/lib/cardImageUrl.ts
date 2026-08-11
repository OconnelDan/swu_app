import { parseCardId } from "./normalizeCardId";

/**
 * Construye la URL de la imagen de una carta a partir de su cardId.
 *
 * No usa la API JSON de swu-db.com (`api.swu-db.com`) porque esa API no
 * envía cabeceras CORS y el navegador bloquea el `fetch()` desde la app
 * (comprobado: "blocked by CORS policy"). En cambio, el CDN de imágenes
 * (`cdn.swu-db.com`) sigue un patrón estable y una etiqueta `<img>` no está
 * sujeta a la política de CORS, así que la imagen se puede mostrar siempre
 * que exista, sin depender de ninguna llamada de red desde nuestro código.
 */
export function getCardImageUrl(cardId: string): string {
  const { setCode, cardNumber } = parseCardId(cardId);
  return `https://cdn.swu-db.com/images/cards/${setCode}/${cardNumber}.png`;
}

/**
 * Variante segura para los límites de la interfaz.
 *
 * Una colección antigua, una copia de seguridad o un proveedor remoto podría
 * contener algún identificador todavía desconocido. En ese caso se omite la
 * miniatura, pero nunca se interrumpe el renderizado de la pantalla.
 */
export function tryGetCardImageUrl(cardId: string): string | undefined {
  try {
    return getCardImageUrl(cardId);
  } catch {
    return undefined;
  }
}

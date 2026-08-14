const URL_RELEASE_DELAY_MS = 1_000;

/**
 * Descarga texto generado en el navegador de forma compatible con la PWA.
 *
 * El enlace debe estar conectado al documento cuando se pulsa y la URL del
 * Blob no puede revocarse de forma inmediata: algunos navegadores móviles
 * cancelan la descarga si cualquiera de esas dos condiciones no se cumple.
 */
export function downloadTextFile(content: string, fileName: string, mimeType: string): void {
  const type = mimeType.includes("charset=") ? mimeType : `${mimeType};charset=utf-8`;
  const blob = new Blob(["\uFEFF", content], { type });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = fileName;
  link.hidden = true;
  document.body.appendChild(link);

  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), URL_RELEASE_DELAY_MS);
  }
}

export interface PremierSetRelease {
  name: string;
  releaseDate: string;
}

/**
 * Fechas oficiales de colecciones que ya aparecen en el catálogo, pero que
 * todavía no pueden utilizarse en Premier. La API de cartas no publica esta
 * fecha, por lo que cada colección futura debe registrar aquí su propio día
 * oficial de lanzamiento. Una fecha nunca se reutiliza entre colecciones.
 */
export const PREMIER_SET_RELEASES: Readonly<Record<string, PremierSetRelease>> = {
  HMW: {
    name: "Mundos de origen",
    releaseDate: "2026-10-09"
  }
};

function localDateKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatReleaseDate(releaseDate: string): string {
  const [year, month, day] = releaseDate.split("-");
  return `${Number(day)}/${Number(month)}/${year}`;
}

export function getUpcomingPremierSetRelease(
  setCode: string,
  now: Date = new Date()
): PremierSetRelease | undefined {
  const release = PREMIER_SET_RELEASES[setCode];
  if (!release || localDateKey(now) >= release.releaseDate) return undefined;
  return release;
}

export function isPremierSetReleased(setCode: string, now: Date = new Date()): boolean {
  return !getUpcomingPremierSetRelease(setCode, now);
}

export function getPremierPrereleaseNotice(
  setCode: string,
  now: Date = new Date()
): string | undefined {
  const release = getUpcomingPremierSetRelease(setCode, now);
  if (!release) return undefined;
  return `Prepublicación: ${release.name} (${setCode}) será legal en Premier desde el ${formatReleaseDate(release.releaseDate)}.`;
}

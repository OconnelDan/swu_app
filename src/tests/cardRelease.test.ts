import { describe, expect, it } from "vitest";
import {
  formatReleaseDate,
  getPremierPrereleaseNotice,
  getUpcomingPremierSetRelease,
  isPremierSetReleased
} from "@/lib/cardRelease";

describe("fechas de lanzamiento Premier", () => {
  it("mantiene HMW en prepublicación antes del 9 de octubre de 2026", () => {
    const beforeRelease = new Date(2026, 9, 8, 23, 59);

    expect(getUpcomingPremierSetRelease("HMW", beforeRelease)).toMatchObject({
      name: "Mundos de origen",
      releaseDate: "2026-10-09"
    });
    expect(getPremierPrereleaseNotice("HMW", beforeRelease)).toBe(
      "Prepublicación: Mundos de origen (HMW) será legal en Premier desde el 9/10/2026."
    );
    expect(isPremierSetReleased("HMW", beforeRelease)).toBe(false);
  });

  it("retira automáticamente el aviso el día oficial de lanzamiento", () => {
    const releaseDay = new Date(2026, 9, 9, 0, 0);

    expect(getUpcomingPremierSetRelease("HMW", releaseDay)).toBeUndefined();
    expect(getPremierPrereleaseNotice("HMW", releaseDay)).toBeUndefined();
    expect(isPremierSetReleased("HMW", releaseDay)).toBe(true);
  });

  it("considera publicadas las colecciones sin una fecha futura configurada", () => {
    expect(isPremierSetReleased("JTL", new Date(2026, 8, 25))).toBe(true);
    expect(formatReleaseDate("2026-10-09")).toBe("9/10/2026");
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { compareDeckWithCollection } from "@/lib/compareDeckWithCollection";
import { normalizeDeckJson } from "@/lib/normalizeDeckJson";

const mocks = vi.hoisted(() => ({
  downloadTextFile: vi.fn()
}));

vi.mock("@/lib/downloadTextFile", () => ({
  downloadTextFile: mocks.downloadTextFile
}));

import { DeckSummary } from "@/components/DeckSummary";

describe("resumen y exportación del resultado", () => {
  beforeEach(() => {
    mocks.downloadTextFile.mockReset();
  });

  it("genera las descargas TXT y CSV desde sus botones", () => {
    const deck = normalizeDeckJson({
      name: "Mazo para exportar",
      deck: [{ id: "SOR_001", count: 2 }]
    });
    const result = compareDeckWithCollection(deck, []);

    render(<DeckSummary result={result} />);

    fireEvent.click(screen.getByRole("button", { name: "Descargar TXT" }));
    fireEvent.click(screen.getByRole("button", { name: "Descargar CSV" }));

    expect(mocks.downloadTextFile).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("2x SOR_001"),
      "cartas-faltantes.txt",
      "text/plain"
    );
    expect(mocks.downloadTextFile).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("Codigo,Carta,Necesitas,Tienes,TeFaltan,Zona"),
      "resultado-comprobacion.csv",
      "text/csv"
    );
  });
});

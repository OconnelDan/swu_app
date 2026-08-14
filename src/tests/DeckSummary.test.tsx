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

  it("incluye el reparto físico en el CSV de un mazo montado", () => {
    const deck = normalizeDeckJson({
      name: "Mazo montado",
      deck: [{ id: "SEC_041", count: 3 }]
    });
    const baseResult = compareDeckWithCollection(deck, [
      { cardId: "SEC_041", setCode: "SEC", cardNumber: "041", ownedCount: 2 }
    ]);
    const comparison = {
      ...baseResult.comparisons[0],
      assignedCount: 0,
      copiesInOtherMountedDecks: 2,
      copiesMissingFromCollection: 1
    };
    const result = {
      ...baseResult,
      comparisons: [comparison],
      missingCards: [comparison]
    };

    render(<DeckSummary result={result} />);
    fireEvent.click(screen.getByRole("button", { name: "Descargar CSV" }));

    expect(mocks.downloadTextFile).toHaveBeenCalledWith(
      expect.stringContaining(
        "Codigo,Carta,Necesitas,Tienes,AsignadasAqui,EnOtrosMazos,NoPoseidas,TeFaltan,Zona"
      ),
      "resultado-comprobacion.csv",
      "text/csv"
    );
    expect(screen.getByText(/En otros mazos montados:/)).toHaveTextContent("2 copias");
    expect(screen.getByText(/No están en tu colección:/)).toHaveTextContent("1 copias");
  });
});

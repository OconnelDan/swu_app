import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCardmarketPriceCache } from "@/lib/cardmarketPrice";
import { compareDeckWithCollection } from "@/lib/compareDeckWithCollection";
import { normalizeDeckJson } from "@/lib/normalizeDeckJson";
import type { CardInfo } from "@/types/card";

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

  afterEach(() => {
    resetCardmarketPriceCache();
    vi.unstubAllGlobals();
  });

  it("muestra el valor de lo que falta y el valor completo de un mazo guardado", async () => {
    const deck = normalizeDeckJson({
      name: "Mazo valorado",
      leader: { id: "SEC_001", count: 1 },
      base: { id: "SEC_020", count: 1 },
      deck: [{ id: "ASH_109", count: 3 }],
      sideboard: [{ id: "SEC_101", count: 2 }]
    });
    const result = compareDeckWithCollection(deck, [
      { cardId: "SEC_001", setCode: "SEC", cardNumber: "001", ownedCount: 1 },
      { cardId: "SEC_020", setCode: "SEC", cardNumber: "020", ownedCount: 1 },
      { cardId: "ASH_109", setCode: "ASH", cardNumber: "109", ownedCount: 1 }
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          version: 1,
          createdAt: "2026-10-20T02:45:11+0200",
          prices: {
            SEC_001: [853001, 1],
            SEC_020: [853020, 0.5],
            ASH_109: [896088, 2],
            SEC_101: [853880, 0.25]
          }
        })
      })
    );

    render(<DeckSummary result={result} isFavorite />);

    const missingValue = screen.getByText("Valor de cartas faltantes").closest("div");
    const totalValue = screen.getByText("Valor total del mazo").closest("div");
    expect(missingValue).not.toBeNull();
    expect(totalValue).not.toBeNull();
    await waitFor(() => expect(missingValue).toHaveTextContent("4,50 €"));
    expect(totalValue).toHaveTextContent("8,00 €");
    expect(screen.getByText(/Actualizados el 20\/10\/2026/)).toBeInTheDocument();
  });

  it("genera las descargas TXT y CSV desde sus botones", () => {
    const deck = normalizeDeckJson({
      name: "Mazo para exportar",
      leader: { id: "SEC_001", count: 1 },
      base: { id: "SEC_020", count: 1 },
      deck: [
        { id: "ASH_116", count: 2 },
        { id: "SOR_001", count: 1 }
      ],
      sideboard: [{ id: "LAW_105", count: 1 }]
    });
    const infos = new Map<string, CardInfo>([
      [
        "SEC_001",
        {
          cardId: "SEC_001",
          setCode: "SEC",
          cardNumber: "001",
          name: "English Leader",
          localizedName: "Líder español"
        }
      ],
      [
        "SEC_020",
        {
          cardId: "SEC_020",
          setCode: "SEC",
          cardNumber: "020",
          name: "English Base",
          localizedName: "Base española"
        }
      ],
      [
        "ASH_116",
        {
          cardId: "ASH_116",
          setCode: "ASH",
          cardNumber: "116",
          name: "Ant Droid",
          localizedName: "Droide hormiga"
        }
      ],
      [
        "SOR_001",
        {
          cardId: "SOR_001",
          setCode: "SOR",
          cardNumber: "001",
          name: "Director Krennic",
          localizedName: "Director Krennic"
        }
      ],
      [
        "LAW_105",
        {
          cardId: "LAW_105",
          setCode: "LAW",
          cardNumber: "105",
          name: "Clever Upgrade",
          localizedName: "Mejora astuta"
        }
      ]
    ]);
    const result = compareDeckWithCollection(
      deck,
      [
        { cardId: "SEC_001", setCode: "SEC", cardNumber: "001", ownedCount: 1 },
        { cardId: "SEC_020", setCode: "SEC", cardNumber: "020", ownedCount: 1 },
        { cardId: "SOR_001", setCode: "SOR", cardNumber: "001", ownedCount: 1 }
      ],
      infos
    );

    render(<DeckSummary result={result} />);

    fireEvent.click(screen.getByRole("button", { name: "Descargar TXT" }));
    fireEvent.click(screen.getByRole("button", { name: "Descargar CSV" }));

    expect(mocks.downloadTextFile).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("ASH_116 — 2x — Droide hormiga / Ant Droid"),
      "mazo-completo.txt",
      "text/plain"
    );
    const txt = mocks.downloadTextFile.mock.calls[0][0] as string;
    expect(txt).toContain("LÍDER O LÍDERES\nSEC_001 — 1x — Líder español / English Leader");
    expect(txt).toContain("BASE\nSEC_020 — 1x — Base española / English Base");
    expect(txt).toContain("BANQUILLO\nLAW_105 — 1x — Mejora astuta / Clever Upgrade");
    expect(txt).toContain("CARTAS FALTANTES\nLAW_105 — 1x");
    expect(txt.indexOf("SOR_001 — 1x")).toBeLessThan(txt.indexOf("ASH_116 — 2x"));
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

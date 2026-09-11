import { describe, expect, it } from "vitest";
import { buildDeckClipboardJson, buildDeckClipboardText } from "@/lib/deckClipboard";
import { normalizeDeckJson } from "@/lib/normalizeDeckJson";

describe("JSON de mazo para el portapapeles", () => {
  it("reconstruye Premier con la estructura compatible y separa el banquillo", () => {
    const normalizedDeck = normalizeDeckJson({
      metadata: { name: "Nombre anterior", author: "Autor importado" },
      leader: { id: "ASH_011", count: 1 },
      base: { id: "JTL_030", count: 1 },
      deck: [
        { id: "LAW_174", count: 3 },
        { id: "JTL_095", count: 2 }
      ],
      sideboard: [
        { id: "JTL_095", count: 1 },
        { id: "LAW_149", count: 2 }
      ]
    });

    const json = buildDeckClipboardJson({
      name: "Nombre actualizado",
      author: "Dani",
      normalizedDeck
    });

    expect(json).toEqual({
      metadata: { name: "Nombre actualizado", author: "Dani" },
      leader: { id: "ASH_011", count: 1 },
      base: { id: "JTL_030", count: 1 },
      deck: [
        { id: "LAW_174", count: 3 },
        { id: "JTL_095", count: 2 }
      ],
      sideboard: [
        { id: "JTL_095", count: 1 },
        { id: "LAW_149", count: 2 }
      ]
    });
    expect(
      JSON.parse(buildDeckClipboardText({ name: "Nombre actualizado", normalizedDeck }))
    ).toEqual({
      ...(json as Record<string, unknown>),
      metadata: { name: "Nombre actualizado", author: "Autor importado" }
    });
  });

  it("exporta los dos líderes de Twin Suns sin mezclarlos con el mazo", () => {
    const normalizedDeck = normalizeDeckJson({
      metadata: { name: "Soles gemelos", format: "Twin Suns" },
      leaders: [
        { id: "TWI_017", count: 1 },
        { id: "SEC_009", count: 1 }
      ],
      base: { id: "ASH_021", count: 1 },
      deck: [{ id: "ASH_100", count: 1 }]
    });

    expect(buildDeckClipboardJson({ name: normalizedDeck.name, normalizedDeck })).toEqual({
      metadata: { name: "Soles gemelos", author: "" },
      leader: { id: "TWI_017", count: 1 },
      secondleader: { id: "SEC_009", count: 1 },
      base: { id: "ASH_021", count: 1 },
      deck: [{ id: "ASH_100", count: 1 }],
      sideboard: []
    });
  });

  it("mantiene separados los tres mazos de Trilogy", () => {
    const normalizedDeck = normalizeDeckJson({
      metadata: { name: "Equipo Trilogy", author: "Dani", format: "Trilogy" },
      trilogyDecks: [
        {
          name: "Uno",
          leader: { id: "ASH_011", count: 1 },
          base: { id: "ASH_021", count: 1 },
          deck: [{ id: "ASH_100", count: 3 }]
        },
        {
          name: "Dos",
          leader: { id: "SEC_001", count: 1 },
          base: { id: "SEC_021", count: 1 },
          deck: [{ id: "SEC_100", count: 3 }]
        },
        {
          name: "Tres",
          leader: { id: "LAW_001", count: 1 },
          base: { id: "LAW_021", count: 1 },
          deck: [{ id: "LAW_100", count: 3 }]
        }
      ]
    });

    const json = buildDeckClipboardJson({
      name: normalizedDeck.name,
      author: normalizedDeck.author,
      normalizedDeck
    }) as { metadata: unknown; trilogyDecks: unknown[] };

    expect(json.metadata).toEqual({ name: "Equipo Trilogy", author: "Dani", format: "Trilogy" });
    expect(json.trilogyDecks).toHaveLength(3);
    expect(json.trilogyDecks[0]).toEqual({
      name: "Uno",
      leader: { id: "ASH_011", count: 1 },
      base: { id: "ASH_021", count: 1 },
      deck: [{ id: "ASH_100", count: 3 }],
      sideboard: []
    });
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearDeckBuilderDraft,
  loadDeckBuilderDraft,
  saveDeckBuilderDraft,
  type DeckBuilderDraft
} from "@/lib/deckBuilderDraft";

function draft(name: string): DeckBuilderDraft {
  return {
    version: 1,
    savedAt: "2026-08-25T08:00:00.000Z",
    format: "premier",
    trilogyCardPool: "premier",
    name,
    decks: [
      {
        name: "Mazo",
        leaderIds: ["SEC_001"],
        baseId: "SEC_020",
        mainCounts: { SEC_101: 2 },
        sideboardCounts: { SEC_102: 1 }
      }
    ],
    activeDeckIndex: 0,
    activeTab: "cards",
    query: "centinela / rebelde / 2",
    manualAspects: ["Vigilance"],
    includeColorless: false,
    selectedTypes: ["ground-unit"],
    selectedSetCodes: ["SEC"],
    selectedRarities: ["Common"],
    maximumCost: "3",
    ownedFilter: "owned",
    cardPage: 2
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("memoria automática del creador", () => {
  it("guarda y recupera toda la composición y el estado de la interfaz", () => {
    const saved = draft("Mazo protegido");
    expect(saveDeckBuilderDraft("guest", undefined, saved)).toBe(true);
    expect(loadDeckBuilderDraft("guest")).toEqual(saved);
  });

  it("separa los borradores por cuenta y por mazo editado", () => {
    saveDeckBuilderDraft("guest", undefined, draft("Invitado"));
    saveDeckBuilderDraft("user-1", "favorite-a", draft("Cuenta A"));

    expect(loadDeckBuilderDraft("guest")?.name).toBe("Invitado");
    expect(loadDeckBuilderDraft("user-1", "favorite-a")?.name).toBe("Cuenta A");
    expect(loadDeckBuilderDraft("user-1")).toBeUndefined();
    expect(loadDeckBuilderDraft("user-2", "favorite-a")).toBeUndefined();

    clearDeckBuilderDraft("user-1", "favorite-a");
    expect(loadDeckBuilderDraft("user-1", "favorite-a")).toBeUndefined();
    expect(loadDeckBuilderDraft("guest")?.name).toBe("Invitado");
  });
});

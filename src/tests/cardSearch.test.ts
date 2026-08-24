import { describe, expect, it } from "vitest";
import { searchCards } from "@/lib/cardSearch";

describe("búsqueda general de cartas", () => {
  const cards = Array.from({ length: 45 }, (_, index) => ({
    cardId: `TST_${String(index + 1).padStart(3, "0")}`,
    name: `Carta coincidente ${index + 1}`
  }));

  it("devuelve todas las coincidencias para que la pantalla pueda paginarlas", () => {
    expect(searchCards(cards, "Carta coincidente")).toHaveLength(45);
  });

  it("conserva un límite explícito para consumidores que lo necesiten", () => {
    expect(searchCards(cards, "Carta coincidente", 12)).toHaveLength(12);
  });
});

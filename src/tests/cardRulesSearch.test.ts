import { describe, expect, it } from "vitest";
import {
  buildCardRulesSearchText,
  matchesCardSearchQuery,
  stripKeywordReminderText
} from "@/lib/cardRulesSearch";
import type { CardInfo } from "@/types/card";

function card(overrides: Partial<CardInfo>): CardInfo {
  return {
    cardId: "TST_001",
    setCode: "TST",
    cardNumber: "001",
    ...overrides
  };
}

describe("texto de reglas para búsquedas", () => {
  it("elimina la explicación inglesa y española de Saboteur", () => {
    const searchText = buildCardRulesSearchText(
      card({
        keywords: ["Saboteur"],
        text: "Saboteur (When this unit attacks, ignore Sentinel and defeat the defender's Shields.)\nOn Attack: Deal 2 damage.",
        localizedText:
          "Sabotaje (Cuando esta unidad ataca, ignora Centinela y derrota los Escudos del defensor.)\nAl atacar: Inflige 2 de daño."
      })
    );

    expect(searchText).not.toMatch(/Sentinel|Centinela/);
    expect(searchText).toContain("On Attack: Deal 2 damage.");
    expect(searchText).toContain("Al atacar: Inflige 2 de daño.");
    expect(searchText).toContain("Saboteur");
  });

  it("elimina el recordatorio cuando una habilidad concede la keyword", () => {
    expect(
      stripKeywordReminderText(
        "A unit gains Shielded for this phase. (When you play that unit, give a Shield token to it.)",
        ["Shielded"]
      )
    ).toBe("A unit gains Shielded for this phase. ");
    expect(
      stripKeywordReminderText(
        "Esa unidad gana Sacrificio 1. (Puedes derrotar 1 unidad que controles.)",
        ["Exploit"]
      )
    ).toBe("Esa unidad gana Sacrificio 1. ");
  });

  it("conserva una referencia real a Centinela aunque esté entre paréntesis", () => {
    const text = "No se puede atacar a esta unidad (a menos que gane Centinela).";
    expect(stripKeywordReminderText(text, [])).toBe(text);
    expect(stripKeywordReminderText(text, ["Overwhelm"])).toBe(text);
  });

  it("conserva paréntesis funcionales que no explican la keyword", () => {
    const text =
      "Coordinate — Search the top 3 cards, reveal one, and draw it. (Put the other cards on the bottom of your deck.)";
    expect(stripKeywordReminderText(text, ["Coordinate"])).toBe(text);
  });

  it("procesa correctamente más de un recordatorio en la misma carta", () => {
    const text =
      "Ambush (When you play this unit, it may attack an enemy unit.)\n" +
      "Saboteur (When this unit attacks, ignore Sentinel and defeat Shields.)";
    expect(stripKeywordReminderText(text, ["Ambush", "Saboteur"]).trim()).toBe(
      "Ambush \nSaboteur"
    );
  });

  it("combina frases separadas por barras y exige que se cumplan todas", () => {
    const target = card({
      cost: 3,
      traits: ["Rebel"],
      keywords: ["Sentinel"],
      localizedText: "Centinela\nCuando se juegue: Roba una carta."
    });

    expect(matchesCardSearchQuery(target, "cuando se juegue")).toBe(true);
    expect(matchesCardSearchQuery(target, " cuando   se juegue / rebelde ")).toBe(true);
    expect(matchesCardSearchQuery(target, "cuando se juegue / rebelde / 3")).toBe(true);
    expect(matchesCardSearchQuery(target, "rebelde / cuando se juegue / centinela")).toBe(true);
    expect(matchesCardSearchQuery(target, "cuando se juegue / imperial")).toBe(false);
  });

  it("interpreta una condición numérica como coste exacto", () => {
    const target = card({ cost: 3, localizedText: "Inflige 2 de daño." });

    expect(matchesCardSearchQuery(target, "3")).toBe(true);
    expect(matchesCardSearchQuery(target, "2")).toBe(false);
    expect(matchesCardSearchQuery(target, "daño / 3")).toBe(true);
    expect(matchesCardSearchQuery(target, "daño / 2")).toBe(false);
    expect(matchesCardSearchQuery(target, "TST_001")).toBe(true);
  });

  it("ignora condiciones vacías creadas por barras sobrantes", () => {
    const target = card({ traits: ["Rebel"] });
    expect(matchesCardSearchQuery(target, "/ rebelde //")).toBe(true);
    expect(matchesCardSearchQuery(target, " / ")).toBe(true);
  });
});

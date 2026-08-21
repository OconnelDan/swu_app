import { describe, expect, it } from "vitest";
import {
  buildChangesCsv,
  calculateCollectionChanges,
  parseSnapshot
} from "../../supabase/functions/send-collection-backups/collectionBackupEmail.ts";

describe("contenido del correo de backup diario", () => {
  it("calcula altas, incrementos y retiradas respecto a la última copia", () => {
    const previous = parseSnapshot([
      {
        cardId: "ASH_001",
        setCode: "ASH",
        cardNumber: "001",
        name: "Carta uno",
        ownedCount: 1
      },
      {
        cardId: "SEC_262",
        setCode: "SEC",
        cardNumber: "262",
        name: "Carta retirada",
        ownedCount: 2
      }
    ]);
    const current = parseSnapshot([
      {
        cardId: "ASH_001",
        setCode: "ASH",
        cardNumber: "001",
        name: "Carta uno",
        ownedCount: 3
      },
      {
        cardId: "LAW_005",
        setCode: "LAW",
        cardNumber: "005",
        name: "Carta nueva",
        ownedCount: 1
      }
    ]);

    expect(calculateCollectionChanges(previous, current)).toEqual([
      {
        cardId: "ASH_001",
        name: "Carta uno",
        previousCount: 1,
        currentCount: 3,
        difference: 2
      },
      {
        cardId: "LAW_005",
        name: "Carta nueva",
        previousCount: 0,
        currentCount: 1,
        difference: 1
      },
      {
        cardId: "SEC_262",
        name: "Carta retirada",
        previousCount: 2,
        currentCount: 0,
        difference: -2
      }
    ]);
  });

  it("no genera cambios si el usuario vuelve al estado de la última copia", () => {
    const snapshot = parseSnapshot([
      {
        cardId: "ASH_001",
        setCode: "ASH",
        cardNumber: "001",
        ownedCount: 2
      }
    ]);

    expect(calculateCollectionChanges(snapshot, snapshot)).toEqual([]);
  });

  it("genera un CSV con separador compatible con Excel en español", () => {
    const csv = buildChangesCsv([
      {
        cardId: "ASH_001",
        name: "Nombre; con separador",
        previousCount: 1,
        currentCount: 2,
        difference: 1
      }
    ]);

    expect(csv).toContain("Código;Nombre;Cantidad anterior;Cantidad actual;Diferencia");
    expect(csv).toContain('ASH_001;"Nombre; con separador";1;2;+1');
  });
});

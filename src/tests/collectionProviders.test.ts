import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { ExcelCollectionProvider } from "@/providers/collectionProvider/ExcelCollectionProvider";
import { CsvCollectionProvider } from "@/providers/collectionProvider/CsvCollectionProvider";
import { JsonCollectionProvider } from "@/providers/collectionProvider/JsonCollectionProvider";

function buildWorkbookArrayBuffer(rows: (string | number)[][]): ArrayBuffer {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Coleccion");
  const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return wbout as ArrayBuffer;
}

describe("ExcelCollectionProvider", () => {
  it("suma D:X y normaliza el número a 3 dígitos (ejemplo LAW 38)", async () => {
    const buffer = buildWorkbookArrayBuffer([
      ["Set", "Numero", "Nombre", "Normal", "Foil", "Hyperspace"],
      ["LAW", 38, "Lepi Lookout", 1, 1, 1]
    ]);
    const provider = new ExcelCollectionProvider();
    const result = await provider.importFromSource({ file: buffer, fileName: "coleccion.xlsx" });

    const card = result.cards.find((c) => c.cardId === "LAW_038");
    expect(card?.ownedCount).toBe(3);
  });

  it("caso 7: suma filas duplicadas del mismo identificador y avisa", async () => {
    const buffer = buildWorkbookArrayBuffer([
      ["Set", "Numero", "Nombre", "Normal", "Foil"],
      ["ASH", 147, "The Cyborg Mech", 1, 0],
      ["ASH", "147", "The Cyborg Mech", 0, 2]
    ]);
    const provider = new ExcelCollectionProvider();
    const result = await provider.importFromSource({ file: buffer });

    const card = result.cards.find((c) => c.cardId === "ASH_147");
    expect(card?.ownedCount).toBe(3);
    expect(result.warnings.some((w) => w.type === "duplicate_row")).toBe(true);
  });

  it("detecta automáticamente la hoja correcta entre varias", async () => {
    const worksheet1 = XLSX.utils.aoa_to_sheet([["Notas"], ["esto no es una colección"]]);
    const worksheet2 = XLSX.utils.aoa_to_sheet([
      ["Set", "Numero", "Nombre", "Normal"],
      ["SOR", 1, "Carta", 2]
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet1, "Notas");
    XLSX.utils.book_append_sheet(workbook, worksheet2, "Coleccion");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;

    const provider = new ExcelCollectionProvider();
    const result = await provider.importFromSource({ file: buffer });
    expect(result.sheetName).toBe("Coleccion");
    expect(result.cards[0].cardId).toBe("SOR_001");
  });
});

describe("CsvCollectionProvider", () => {
  it("suma variantes desde un CSV separado por comas", async () => {
    const csv = "Set,Numero,Nombre,Normal,Foil\nSEC,179,Carta,2,1\n";
    const provider = new CsvCollectionProvider();
    const result = await provider.importFromSource({ text: csv });
    expect(result.cards.find((c) => c.cardId === "SEC_179")?.ownedCount).toBe(3);
  });

  it("detecta delimitador punto y coma", async () => {
    const csv = "Set;Numero;Nombre;Normal\nSEC;179;Carta;4\n";
    const provider = new CsvCollectionProvider();
    const result = await provider.importFromSource({ text: csv });
    expect(result.cards.find((c) => c.cardId === "SEC_179")?.ownedCount).toBe(4);
  });
});

describe("JsonCollectionProvider", () => {
  it("acepta filas crudas tipo Excel en JSON", async () => {
    const json = JSON.stringify([
      { set: "LAW", number: 38, name: "Lepi Lookout", variants: [1, 1, 1] }
    ]);
    const provider = new JsonCollectionProvider();
    const result = await provider.importFromSource({ text: json });
    expect(result.cards[0].cardId).toBe("LAW_038");
    expect(result.cards[0].ownedCount).toBe(3);
  });

  it("acepta filas ya agregadas con cardId y ownedCount", async () => {
    const json = JSON.stringify([{ cardId: "ASH_248", ownedCount: 2 }]);
    const provider = new JsonCollectionProvider();
    const result = await provider.importFromSource({ text: json });
    expect(result.cards[0].ownedCount).toBe(2);
  });
});

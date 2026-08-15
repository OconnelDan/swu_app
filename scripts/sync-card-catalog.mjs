import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "https://api.swu-db.com";
const SET_CODES = ["SOR", "SHD", "TWI", "JTL", "LOF", "IBH", "SEC", "LAW", "ASH", "HMW", "TS26"];
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../public/data/swu-card-catalog.json"
);

function normalizeApiNumber(value) {
  const withoutFoilSuffix = String(value).trim().toUpperCase().replace(/F$/, "");
  if (!/^\d{1,4}$/.test(withoutFoilSuffix)) {
    throw new Error(`Número de catálogo no reconocido: ${value}`);
  }
  return withoutFoilSuffix.padStart(3, "0");
}

function identityKey(card) {
  return JSON.stringify([card.Name, card.Subtitle ?? "", card.Type ?? ""]);
}

function sortRecord(record) {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right))
  );
}

async function fetchSet(setCode) {
  const response = await fetch(`${API_BASE}/cards/${setCode.toLowerCase()}`);
  if (!response.ok) {
    throw new Error(`No se ha podido descargar ${setCode}: HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || !Array.isArray(payload.data)) {
    throw new Error(`La respuesta de ${setCode} no tiene el formato esperado.`);
  }
  return payload.data;
}

const cards = {};
const aliases = {};
const setsWithVariants = await Promise.all(
  SET_CODES.map(async (setCode) => [setCode, await fetchSet(setCode)])
);

for (const [setCode, variants] of setsWithVariants) {
  const normalByIdentity = new Map(
    variants
      .filter((card) => card.VariantType === "Normal")
      .map((card) => [identityKey(card), card])
  );

  for (const variant of variants) {
    const normal = normalByIdentity.get(identityKey(variant));
    if (!normal) {
      throw new Error(
        `${setCode}_${variant.Number} (${variant.Name}) no tiene una impresión normal asociada.`
      );
    }

    const canonicalId = `${setCode}_${normalizeApiNumber(normal.Number)}`;
    const printedId = `${setCode}_${normalizeApiNumber(variant.Number)}`;
    cards[canonicalId] = [
      normal.Name,
      normal.Subtitle ?? "",
      normal.Type ?? "",
      normal.Rarity ?? ""
    ];

    if (printedId !== canonicalId) {
      const previous = aliases[printedId];
      if (previous && previous !== canonicalId) {
        throw new Error(`${printedId} coincide con dos cartas base: ${previous} y ${canonicalId}.`);
      }
      aliases[printedId] = canonicalId;
    }
  }
}

const catalog = {
  version: 1,
  source: `${API_BASE}/cards/{set}`,
  sets: SET_CODES,
  cards: sortRecord(cards),
  aliases: sortRecord(aliases)
};

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(catalog)}\n`, "utf8");

console.log(
  `Catálogo actualizado: ${Object.keys(cards).length} cartas base y ${Object.keys(aliases).length} variantes.`
);

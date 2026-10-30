import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CARDMARKET_GAME_ID = 21;
const PRODUCTS_URL = `https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_${CARDMARKET_GAME_ID}.json`;
const PRICES_URL = `https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_${CARDMARKET_GAME_ID}.json`;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CARD_CATALOG_PATH = path.join(ROOT, "public/data/swu-card-catalog.json");
const OUTPUT_PATH = path.join(ROOT, "public/data/cardmarket-prices.json");

/**
 * Expansiones principales de Cardmarket. Se fijan para no confundir la carta
 * normal con su reimpresión Hyperspace/Showcase en la colección "Extras".
 * Las colecciones futuras se detectan por cobertura y quedan registradas en
 * el JSON generado para que la revisión mensual pueda confirmarlas.
 */
const KNOWN_MAIN_EXPANSION_IDS = {
  SOR: 5618,
  SHD: 5769,
  TWI: 5888,
  JTL: 5995,
  LOF: 6105,
  IBH: 6268,
  SEC: 6333,
  TS26: 6532,
  LAW: 6451,
  ASH: 6591,
  HMW: 6759
};

// Las cartas de una colección o promoción nueva pueden aparecer en el catálogo
// oficial de SWU antes de que Cardmarket cree su producto. Los códigos todavía
// no confirmados se conservan sin precio si no pueden detectarse con seguridad
// y se vuelven a intentar en cada sincronización. Cuando Cardmarket publique
// una colección principal completa, su ID debe pasar a
// KNOWN_MAIN_EXPANSION_IDS para recuperar la validación estricta habitual.

function assertRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} no tiene el formato esperado.`);
  }
  return value;
}

function assertExport(value, arrayKey, label) {
  const record = assertRecord(value, label);
  if (record.version !== 1 || !Array.isArray(record[arrayKey])) {
    throw new Error(`${label} ha cambiado de versión o estructura.`);
  }
  return record;
}

async function downloadJson(url, label) {
  const response = await fetch(url, {
    headers: { "user-agent": "swu-app-cardmarket-price-sync/1.0" }
  });
  if (!response.ok) {
    throw new Error(`No se pudo descargar ${label} (HTTP ${response.status}).`);
  }
  return response.json();
}

function normalizeName(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/""/g, '"')
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en");
}

function cardNames(entry) {
  const title = String(entry[0] ?? "");
  const subtitle = String(entry[1] ?? "");
  return {
    title: normalizeName(title),
    subtitle: normalizeName(subtitle),
    fullName: normalizeName(subtitle ? `${title}, ${subtitle}` : title)
  };
}

function productMatchesCard(productName, names) {
  const normalizedProductName = normalizeName(productName);
  return (
    normalizedProductName === names.fullName ||
    // Las bases antiguas comparten reverso con una ficha y Cardmarket publica
    // ambas caras como un único producto: "Base // Ficha".
    normalizedProductName.startsWith(`${names.fullName} //`) ||
    // Palpatine/Sidious y otros líderes de doble identidad insertan la
    // segunda identidad entre el nombre y el subtítulo.
    (Boolean(names.subtitle) &&
      normalizedProductName.startsWith(`${names.title} //`) &&
      normalizedProductName.endsWith(`, ${names.subtitle}`))
  );
}

function groupByExpansion(products) {
  const result = new Map();
  for (const product of products) {
    const expansionId = Number(product.idExpansion);
    if (!Number.isInteger(expansionId)) continue;
    const entries = result.get(expansionId) ?? [];
    entries.push(product);
    result.set(expansionId, entries);
  }
  return result;
}

function matchingProducts(products, entry) {
  const names = cardNames(entry);
  return products.filter((product) => productMatchesCard(String(product.name ?? ""), names));
}

function detectMainExpansionId(setCode, cards, productsByExpansion) {
  const scored = [...productsByExpansion.entries()]
    .map(([expansionId, products]) => ({
      expansionId,
      matched: cards.reduce(
        (count, [, entry]) => count + Number(matchingProducts(products, entry).length > 0),
        0
      )
    }))
    .filter(({ matched }) => matched > 0)
    .sort((left, right) => right.matched - left.matched || left.expansionId - right.expansionId);

  const best = scored[0];
  const minimumCoverage = Math.max(1, Math.ceil(cards.length * 0.75));
  if (!best || best.matched < minimumCoverage) {
    throw new Error(
      `No se pudo identificar con seguridad la expansión principal de ${setCode}: ` +
        `${best?.matched ?? 0}/${cards.length} coincidencias.`
    );
  }

  console.warn(
    `::warning::Cardmarket: ${setCode} se ha asociado automáticamente a la expansión ` +
      `${best.expansionId} (${best.matched}/${cards.length}). Revisa este ID antes de fusionar.`
  );
  return best.expansionId;
}

function positiveLowPrice(price) {
  const low = Number(price?.low);
  return Number.isFinite(low) && low > 0 ? low : null;
}

function chooseProduct(candidates, pricesByProduct) {
  return [...candidates].sort((left, right) => {
    const leftPrice = positiveLowPrice(pricesByProduct.get(Number(left.idProduct)));
    const rightPrice = positiveLowPrice(pricesByProduct.get(Number(right.idProduct)));
    if (leftPrice !== null && rightPrice === null) return -1;
    if (leftPrice === null && rightPrice !== null) return 1;
    if (leftPrice !== null && rightPrice !== null && leftPrice !== rightPrice) {
      return leftPrice - rightPrice;
    }
    return Number(left.idProduct) - Number(right.idProduct);
  })[0];
}

async function main() {
  const [catalogRaw, productsRaw, pricesRaw] = await Promise.all([
    readFile(CARD_CATALOG_PATH, "utf8").then(JSON.parse),
    downloadJson(PRODUCTS_URL, "el catálogo de productos de Cardmarket"),
    downloadJson(PRICES_URL, "la guía de precios de Cardmarket")
  ]);

  const catalog = assertRecord(catalogRaw, "El catálogo SWU");
  const cardsRecord = assertRecord(catalog.cards, "Las cartas del catálogo SWU");
  const productsExport = assertExport(productsRaw, "products", "El catálogo de Cardmarket");
  const pricesExport = assertExport(pricesRaw, "priceGuides", "La guía de Cardmarket");
  const productsByExpansion = groupByExpansion(productsExport.products);
  const pricesByProduct = new Map(
    pricesExport.priceGuides.map((price) => [Number(price.idProduct), price])
  );
  const cardsBySet = new Map();

  for (const [cardId, entry] of Object.entries(cardsRecord)) {
    if (!Array.isArray(entry)) throw new Error(`La carta ${cardId} no tiene el formato esperado.`);
    const separator = cardId.indexOf("_");
    const setCode = separator > 0 ? cardId.slice(0, separator) : "";
    const cards = cardsBySet.get(setCode) ?? [];
    cards.push([cardId, entry]);
    cardsBySet.set(setCode, cards);
  }

  const expansionIds = {};
  const outputPrices = {};
  const unmatched = [];
  const pendingUnmatched = [];
  let availablePriceCount = 0;

  for (const [setCode, cards] of [...cardsBySet.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    let expansionId = KNOWN_MAIN_EXPANSION_IDS[setCode];
    const strictMapping = expansionId !== undefined;
    if (expansionId === undefined) {
      try {
        expansionId = detectMainExpansionId(setCode, cards, productsByExpansion);
      } catch (cause) {
        pendingUnmatched.push(...cards.map(([cardId]) => cardId));
        console.warn(
          `::warning::Cardmarket todavía no permite identificar ${setCode}; ` +
            `${cards.length} carta(s) se conservarán temporalmente sin precio. ` +
            `${cause instanceof Error ? cause.message : String(cause)}`
        );
        continue;
      }
    }

    const expansionProducts = productsByExpansion.get(expansionId) ?? [];
    expansionIds[setCode] = expansionId;

    for (const [cardId, entry] of cards) {
      const candidates = matchingProducts(expansionProducts, entry);
      if (candidates.length === 0) {
        if (!strictMapping) pendingUnmatched.push(cardId);
        else unmatched.push(cardId);
        continue;
      }

      const product = chooseProduct(candidates, pricesByProduct);
      const price = positiveLowPrice(pricesByProduct.get(Number(product.idProduct)));
      if (price !== null) availablePriceCount += 1;
      outputPrices[cardId] = [Number(product.idProduct), price];
    }
  }

  if (unmatched.length > 0) {
    throw new Error(
      `Hay ${unmatched.length} carta(s) sin producto normal en Cardmarket: ` +
        `${unmatched.slice(0, 20).join(", ")}${unmatched.length > 20 ? "…" : ""}`
    );
  }

  if (pendingUnmatched.length > 0) {
    console.warn(
      `::warning::Cardmarket: ${pendingUnmatched.length} carta(s) en prepublicación ` +
        "todavía no tienen producto normal y se mostrarán sin precio."
    );
  }

  const output = {
    version: 1,
    source: "Cardmarket public product catalog and price guide",
    createdAt: String(pricesExport.createdAt ?? new Date().toISOString()),
    productsCreatedAt: String(productsExport.createdAt ?? ""),
    expansionIds,
    prices: outputPrices
  };

  await writeFile(OUTPUT_PATH, `${JSON.stringify(output)}\n`, "utf8");
  console.log(
    `Cardmarket: ${Object.keys(outputPrices).length} cartas enlazadas, ` +
      `${availablePriceCount} con precio mínimo, ` +
      `${pendingUnmatched.length} en prepublicación sin precio, ` +
      `guía ${output.createdAt}.`
  );
}

await main();

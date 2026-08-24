import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

const API_BASE = "https://admin.starwarsunlimited.com/api";
const CATALOG_ENDPOINT = "card-list";
const CATALOG_LOCALE = "en";
const RULES_CHAPTER_ID = 2;
const PAGE_SIZE = 250;
const DOWNLOAD_CONCURRENCY = 4;
const MAX_ATTEMPTS = 5;
const LEGACY_WEEKLY_PLAY_SETS = new Set(["SOR", "SHD", "TWI"]);
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../public/data/swu-card-catalog.json"
);
const META_OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/generated/officialCardCatalogMeta.ts"
);
const FORMAT_RULES_OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/generated/officialFormatRules.ts"
);

// La API todavía no publica de forma fiable la legalidad de los productos
// especiales. Estos dos productos oficiales no pertenecen a Premier. Si
// aparece un producto especial nuevo, se genera como pendiente de revisión y
// la aplicación lo bloquea en Premier hasta que una fuente oficial lo aclare.
const NON_PREMIER_SPECIAL_SET_CODES = new Set(["IBH", "TS26"]);
const PREMIER_SPECIAL_SET_CODES = new Set([]);

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function fetchJson(url, description) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(60_000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (cause) {
      lastError = cause;
      if (attempt < MAX_ATTEMPTS) await sleep(attempt * 1_000);
    }
  }

  throw new Error(`No se ha podido descargar ${description}: ${String(lastError)}`);
}

function sortRecord(record) {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right))
  );
}

function relationAttributes(relation) {
  return relation?.data?.attributes ?? {};
}

function relationList(relation) {
  return Array.isArray(relation?.data) ? relation.data : [];
}

function relationId(relation) {
  return relation?.data?.id;
}

function variantNames(card) {
  return (card.attributes.variantTypes?.data ?? []).map(({ attributes }) => attributes.name);
}

function localizedAttributes(card, locale) {
  return (
    relationList(card.attributes.localizations).find(
      ({ attributes }) => attributes.locale === locale
    )?.attributes ?? {}
  );
}

function nullableNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function relationNames(relation, preferredKey = "name") {
  return relationList(relation)
    .map(({ attributes }) => attributes[preferredKey] ?? attributes.name)
    .filter((name) => typeof name === "string" && name.length > 0);
}

function getDeckLimit(text) {
  const explicitLimit = /deck can have up to (\d+) copies of this card/i.exec(text ?? "");
  if (explicitLimit) return Number(explicitLimit[1]);
  if (/include any number of (?:copies of )?this card in your deck/i.test(text ?? "")) return 99;
  return 3;
}

function isToken(card) {
  const type = relationAttributes(card.attributes.type).name ?? "";
  const type2 = relationAttributes(card.attributes.type2).name ?? "";
  return /token/i.test(`${type} ${type2}`);
}

function normalizeNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0 || number > 9999) {
    throw new Error(`Número de catálogo no reconocido: ${value}`);
  }
  return String(number).padStart(3, "0");
}

/**
 * El campo cardNumber tiene unas pocas erratas conocidas. serialCode es el
 * identificador editorial que también se usa para nombrar el arte oficial y
 * conserva el número impreso correcto en sus tres o cuatro últimas cifras.
 */
function getPrintedNumber(card) {
  const apiNumber = Number(card.attributes.cardNumber);
  const serialWithoutSuffix = String(card.attributes.serialCode ?? "").replace(/[a-z]$/i, "");
  const serialTail = /(\d{3,4})$/.exec(serialWithoutSuffix)?.[1];
  if (!serialTail) return apiNumber;

  const serialNumber = Number(apiNumber >= 1000 ? serialTail.slice(-4) : serialTail.slice(-3));
  return Number.isInteger(serialNumber) && serialNumber > 0 ? serialNumber : apiNumber;
}

function getPrintedSetCode(card) {
  const expansionCode = relationAttributes(card.attributes.expansion).code;
  if (!expansionCode) throw new Error(`La carta ${card.id} no tiene código de expansión.`);

  // SOR, SHD y TWI imprimieron las Weekly Play como SET 001/20. Usamos un
  // código interno terminado en P para no confundirlas con SET 001 del sobre.
  if (LEGACY_WEEKLY_PLAY_SETS.has(expansionCode) && Number(card.attributes.cardCount) === 20) {
    return `${expansionCode}P`;
  }

  return expansionCode;
}

function getPrintedId(card) {
  return `${getPrintedSetCode(card)}_${normalizeNumber(getPrintedNumber(card))}`;
}

function getImageUrl(card) {
  const attributes = relationAttributes(card.attributes.artFront);
  const url = attributes.formats?.card?.url ?? attributes.url ?? "";
  if (!url) return "";

  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "cdn.starwarsunlimited.com") {
    throw new Error(`La carta ${card.id} utiliza una URL de imagen oficial no reconocida: ${url}`);
  }

  // La doble barra tras el dominio forma parte de la clave publicada por el
  // CDN oficial. No debe normalizarse: /card_... puede devolver 403 mientras
  // que //card_... sirve correctamente la misma imagen.
  return url;
}

function imagePriority(card, canonicalCard) {
  const variants = variantNames(card).join(" ");
  let score = getImageUrl(card) ? 1 : 0;
  if (!/foil/i.test(variants)) score += 10;
  if (variants === "Standard") score += 20;
  if (card.id === canonicalCard.id) score += 40;
  return score;
}

async function fetchPage(start) {
  const url = new URL(`${API_BASE}/${CATALOG_ENDPOINT}`);
  url.searchParams.set("locale", CATALOG_LOCALE);
  url.searchParams.set("publicationState", "live");
  url.searchParams.set("sort[0]", "id:asc");
  url.searchParams.set("pagination[start]", String(start));
  url.searchParams.set("pagination[limit]", String(PAGE_SIZE));

  const payload = await fetchJson(url, `la página del catálogo que empieza en ${start}`);
  if (!payload || !Array.isArray(payload.data) || !payload.meta?.pagination) {
    throw new Error(`La página del catálogo que empieza en ${start} no contiene data/paginación.`);
  }
  return payload;
}

async function fetchAllCards() {
  const firstPage = await fetchPage(0);
  const total = Number(firstPage.meta.pagination.total);
  if (!Number.isInteger(total) || total <= 0) {
    throw new Error("La API oficial no ha indicado un total de cartas válido.");
  }

  const pages = [firstPage];
  const starts = [];
  for (let start = PAGE_SIZE; start < total; start += PAGE_SIZE) starts.push(start);

  for (let index = 0; index < starts.length; index += DOWNLOAD_CONCURRENCY) {
    const batch = starts.slice(index, index + DOWNLOAD_CONCURRENCY);
    pages.push(...(await Promise.all(batch.map(fetchPage))));
    console.log(`Descargadas ${Math.min(total, batch.at(-1) + PAGE_SIZE)}/${total} impresiones.`);
  }

  const cards = pages.flatMap(({ data }) => data);
  if (cards.length !== total) {
    throw new Error(`La API anunció ${total} impresiones, pero se descargaron ${cards.length}.`);
  }
  return cards;
}

function collectStrings(value, result = []) {
  if (typeof value === "string") result.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => collectStrings(entry, result));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((entry) => collectStrings(entry, result));
  }
  return result;
}

function extractSuspendedCardUids(rulesChapter) {
  const html = collectStrings(rulesChapter).find((value) =>
    /<h1>Suspended Cards<\/h1>/i.test(value)
  );
  if (!html) throw new Error("La página oficial de reglas no contiene 'Suspended Cards'.");

  const start = html.search(/<h1>Suspended Cards<\/h1>/i);
  const end = html.search(/<h2>What is a suspended card\?/i);
  if (start < 0 || end <= start) {
    throw new Error("No se ha podido delimitar la lista oficial de cartas suspendidas.");
  }

  const block = html.slice(start, end).replaceAll("&nbsp;", " ");
  const labels = [
    { key: "premier", expression: /<strong>Premier:\s*<\/strong>/i },
    { key: "twinSuns", expression: /<strong>Twin Suns:\s*<\/strong>/i },
    { key: "eternal", expression: /<strong>Eternal:\s*<\/strong>/i }
  ];
  const positions = labels.map(({ key, expression }) => {
    const match = expression.exec(block);
    if (!match) throw new Error(`Falta la sección ${key} en la lista de cartas suspendidas.`);
    return {
      key,
      labelStart: match.index,
      contentStart: match.index + match[0].length
    };
  });

  return Object.fromEntries(
    positions.map(({ key, contentStart: sectionStart }, index) => {
      const sectionEnd = positions[index + 1]?.labelStart ?? block.length;
      const section = block.slice(sectionStart, sectionEnd);
      const uids = [...section.matchAll(/data-card="([0-9]+)"/gi)].map((match) => match[1]);
      return [key, [...new Set(uids)]];
    })
  );
}

function getCardKey(card) {
  return card.attributes.validationId ?? card.attributes.cardUid;
}

function getRuleCard(ruleEntry, cardsByUid, canonicalByCardId) {
  const uid = ruleEntry?.card?.data?.attributes?.cardUid;
  if (!uid) return undefined;
  const printedCard = uid ? cardsByUid.get(uid) : undefined;
  const canonicalCard = printedCard ? canonicalByCardId.get(printedCard.id) : undefined;
  if (!canonicalCard)
    throw new Error(`Una excepción oficial referencia una carta desconocida (${uid}).`);
  return canonicalCard;
}

function formatSuspendedCards(uidsByFormat, cardsByUid, canonicalByCardId) {
  return Object.fromEntries(
    Object.entries(uidsByFormat).map(([formatName, uids]) => [
      formatName,
      uids.map((uid) => {
        const printedCard = cardsByUid.get(uid);
        const canonicalCard = printedCard ? canonicalByCardId.get(printedCard.id) : undefined;
        if (!canonicalCard) {
          throw new Error(`La lista de suspendidas referencia una carta desconocida (${uid}).`);
        }
        const attributes = canonicalCard.attributes;
        return {
          cardId: getPrintedId(canonicalCard),
          cardKey: getCardKey(canonicalCard),
          name: attributes.subtitle
            ? `${attributes.title}, ${attributes.subtitle}`
            : attributes.title
        };
      })
    ])
  );
}

function resolveCanonicalCard(card, cardsById, cardsByUid) {
  const visitedIds = new Set();
  let current = card;

  while (current && !visitedIds.has(current.id)) {
    visitedIds.add(current.id);

    const variantOfId = relationId(current.attributes.variantOf);
    if (variantOfId) {
      const variantOf = cardsById.get(variantOfId);
      if (variantOf) {
        current = variantOf;
        continue;
      }
    }

    // Una reimpresión Standard de otra colección conserva identidad propia.
    if (variantNames(current).includes("Standard")) return current;

    const validationId = current.attributes.validationId;
    if (validationId && validationId !== current.attributes.cardUid) {
      const validatedCard = cardsByUid.get(validationId);
      if (validatedCard) {
        current = validatedCard;
        continue;
      }
    }

    return current;
  }

  throw new Error(`La carta ${card.id} contiene un ciclo al resolver su impresión base.`);
}

const [downloadedCards, filtersPayload, deckRulePayload, rulesChapterPayload] = await Promise.all([
  fetchAllCards(),
  fetchJson(`${API_BASE}/card-filters?locale=en`, "los filtros y colecciones oficiales"),
  fetchJson(`${API_BASE}/deck-rule?locale=en&populate=deep,5`, "las excepciones de construcción"),
  fetchJson(
    `${API_BASE}/game-info-chapters/${RULES_CHAPTER_ID}?locale=en&populate=deep,4`,
    "la lista oficial de cartas suspendidas"
  )
]);
const scannableCards = downloadedCards.filter((card) => !isToken(card));
const cardsById = new Map(downloadedCards.map((card) => [card.id, card]));
const cardsByUid = new Map(downloadedCards.map((card) => [card.attributes.cardUid, card]));
const canonicalByCardId = new Map();

for (const card of scannableCards) {
  canonicalByCardId.set(card.id, resolveCanonicalCard(card, cardsById, cardsByUid));
}

const deckRuleAttributes = deckRulePayload?.data?.attributes ?? {};
const officialCopyLimits = new Map();
for (const exception of deckRuleAttributes.limitExceptions ?? []) {
  const canonicalCard = getRuleCard(exception, cardsByUid, canonicalByCardId);
  if (!canonicalCard) continue;
  officialCopyLimits.set(getCardKey(canonicalCard), Number(exception.limit));
}

const officialDeckSizeModifiers = {};
for (const exception of deckRuleAttributes.deckTotalLimitExceptions ?? []) {
  const canonicalCard = getRuleCard(exception, cardsByUid, canonicalByCardId);
  if (!canonicalCard) continue;
  officialDeckSizeModifiers[getCardKey(canonicalCard)] = Number(exception.limitAdjustment);
}

const suspendedCards = formatSuspendedCards(
  extractSuspendedCardUids(rulesChapterPayload),
  cardsByUid,
  canonicalByCardId
);

const cards = {};
const canonicalCardByPrintedId = new Map();
for (const canonicalCard of new Map(
  [...canonicalByCardId.values()].map((card) => [card.id, card])
).values()) {
  const canonicalId = getPrintedId(canonicalCard);
  const previous = canonicalCardByPrintedId.get(canonicalId);
  if (previous && previous.id !== canonicalCard.id) {
    throw new Error(`${canonicalId} coincide con dos cartas base oficiales.`);
  }

  canonicalCardByPrintedId.set(canonicalId, canonicalCard);
  const attributes = canonicalCard.attributes;
  const spanish = localizedAttributes(canonicalCard, "es");
  const aspects = [
    ...relationNames(attributes.aspects, "englishName"),
    ...relationNames(attributes.aspectDuplicates, "englishName")
  ];
  cards[canonicalId] = [
    attributes.title,
    attributes.subtitle ?? "",
    spanish.title ?? "",
    spanish.subtitle ?? "",
    relationAttributes(attributes.type).value ?? relationAttributes(attributes.type).name ?? "",
    relationAttributes(attributes.rarity).englishName ??
      relationAttributes(attributes.rarity).name ??
      "",
    nullableNumber(attributes.cost),
    aspects,
    relationNames(attributes.traits),
    relationNames(attributes.arenas).at(0) ?? "",
    attributes.text ?? "",
    spanish.text ?? "",
    nullableNumber(attributes.power),
    nullableNumber(attributes.hp),
    nullableNumber(attributes.upgradePower),
    nullableNumber(attributes.upgradeHp),
    attributes.unique === true,
    relationNames(attributes.keywords),
    getCardKey(canonicalCard) ?? canonicalId,
    officialCopyLimits.get(getCardKey(canonicalCard)) ?? getDeckLimit(attributes.text)
  ];
}

const printingsById = new Map();
for (const card of scannableCards) {
  const printedId = getPrintedId(card);
  const canonicalCard = canonicalByCardId.get(card.id);
  const canonicalId = getPrintedId(canonicalCard);
  const group = printingsById.get(printedId) ?? [];
  group.push({ card, canonicalCard, canonicalId });
  printingsById.set(printedId, group);
}

const aliases = {};
const images = {};
const ambiguousPrintCodes = [];

for (const [canonicalId, canonicalCard] of canonicalCardByPrintedId) {
  const imageUrl = getImageUrl(canonicalCard);
  if (imageUrl) images[canonicalId] = imageUrl;
}

for (const [printedId, printings] of printingsById) {
  const canonicalIds = new Set(printings.map(({ canonicalId }) => canonicalId));
  if (canonicalIds.size !== 1) {
    ambiguousPrintCodes.push(printedId);
    continue;
  }

  const canonicalId = canonicalIds.values().next().value;
  if (printedId !== canonicalId) aliases[printedId] = canonicalId;

  const preferred = [...printings].sort(
    (left, right) =>
      imagePriority(right.card, right.canonicalCard) - imagePriority(left.card, left.canonicalCard)
  )[0];
  const imageUrl = getImageUrl(preferred.card);
  if (imageUrl) images[printedId] = imageUrl;
}

const correctedNumbers = scannableCards.filter(
  (card) => getPrintedNumber(card) !== Number(card.attributes.cardNumber)
);
const sets = [...new Set(scannableCards.map(getPrintedSetCode))].sort();
const printedBaseTotals = {};
const standaloneNumberRanges = {};
const legacyPromoBySet = {};
const setNames = {};

for (const setCode of sets) {
  const setCards = scannableCards.filter((card) => getPrintedSetCode(card) === setCode);
  const printedNumbers = setCards.map(getPrintedNumber);
  setNames[setCode] = relationAttributes(setCards[0]?.attributes.expansion).name ?? setCode;
  const standardTotals = setCards
    .filter((card) => variantNames(card).includes("Standard"))
    .map((card) => Number(card.attributes.cardCount))
    .filter((total) => total >= 50);

  if (standardTotals.length > 0) {
    printedBaseTotals[setCode] = Math.max(...standardTotals);
  } else {
    standaloneNumberRanges[setCode] = [Math.min(...printedNumbers), Math.max(...printedNumbers)];
  }
}

for (const card of scannableCards) {
  const expansionCode = relationAttributes(card.attributes.expansion).code;
  const printedSetCode = getPrintedSetCode(card);
  if (expansionCode === printedSetCode) continue;

  const candidate = {
    printedTotal: Number(card.attributes.cardCount),
    promoSetCode: printedSetCode
  };
  const previous = legacyPromoBySet[expansionCode];
  if (
    previous &&
    (previous.printedTotal !== candidate.printedTotal ||
      previous.promoSetCode !== candidate.promoSetCode)
  ) {
    throw new Error(`La promoción heredada de ${expansionCode} tiene dos formatos distintos.`);
  }
  legacyPromoBySet[expansionCode] = candidate;
}

const expansionSortValues = new Map(
  (filtersPayload?.data?.expansions ?? []).map((expansion) => [
    expansion.code,
    Number(expansion.sortValue)
  ])
);
const releasedStandardSetCodes = Object.entries(printedBaseTotals)
  .filter(([setCode, total]) => {
    const standardNumbers = new Set(
      scannableCards
        .filter(
          (card) => getPrintedSetCode(card) === setCode && variantNames(card).includes("Standard")
        )
        .map(getPrintedNumber)
    );
    return standardNumbers.size >= Number(total) * 0.9;
  })
  .map(([setCode]) => setCode);
const coreSetSequence = releasedStandardSetCodes
  .filter((setCode) => Number(printedBaseTotals[setCode]) >= 200)
  .sort(
    (left, right) =>
      (expansionSortValues.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (expansionSortValues.get(right) ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right)
  );
if (coreSetSequence.length < 3) {
  throw new Error("No se han reconocido suficientes colecciones principales para Premier.");
}

// Las colecciones principales se publican en bloques de tres símbolos de
// rotación. Premier admite los dos bloques más recientes, incluso cuando el
// último todavía no ha publicado sus tres colecciones.
const newestRotationGroup = Math.floor((coreSetSequence.length - 1) / 3);
const firstLegalRotationGroup = Math.max(newestRotationGroup - 1, 0);
const premierCoreSetCodes = coreSetSequence.filter(
  (_setCode, index) => Math.floor(index / 3) >= firstLegalRotationGroup
);
const rotatedCoreSetCodes = coreSetSequence.filter(
  (_setCode, index) => Math.floor(index / 3) < firstLegalRotationGroup
);
const specialStandardSetCodes = releasedStandardSetCodes
  .filter((setCode) => Number(printedBaseTotals[setCode]) < 200)
  .sort();
const unreviewedSpecialSetCodes = specialStandardSetCodes.filter(
  (setCode) =>
    !NON_PREMIER_SPECIAL_SET_CODES.has(setCode) && !PREMIER_SPECIAL_SET_CODES.has(setCode)
);
const premierSetCodes = [...premierCoreSetCodes, ...PREMIER_SPECIAL_SET_CODES].sort();

for (const setCode of unreviewedSpecialSetCodes) {
  console.warn(
    `::warning::La legalidad Premier de ${setCode} necesita revisión oficial. Se bloqueará por seguridad.`
  );
}

const catalog = {
  version: 3,
  source: `${API_BASE}/${CATALOG_ENDPOINT}?locale=${CATALOG_LOCALE}`,
  sets,
  setNames: sortRecord(setNames),
  cards: sortRecord(cards),
  aliases: sortRecord(aliases),
  images: sortRecord(images),
  ambiguousPrintCodes: ambiguousPrintCodes.sort()
};

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(catalog)}\n`, "utf8");
await mkdir(dirname(META_OUTPUT_PATH), { recursive: true });
const metaSource = [
  "// Archivo generado por `npm run catalog:sync`. No editar manualmente.",
  `export const OFFICIAL_SET_CODES = ${JSON.stringify(sets, null, 2)} as const;`,
  `export const OFFICIAL_PRINTED_BASE_TOTALS = ${JSON.stringify(sortRecord(printedBaseTotals), null, 2)} as const;`,
  `export const OFFICIAL_STANDALONE_NUMBER_RANGES = ${JSON.stringify(sortRecord(standaloneNumberRanges), null, 2)} as const;`,
  `export const OFFICIAL_LEGACY_PROMO_BY_SET = ${JSON.stringify(sortRecord(legacyPromoBySet), null, 2)} as const;`,
  ""
].join("\n");
await writeFile(META_OUTPUT_PATH, await format(metaSource, { parser: "typescript" }), "utf8");

const formatRulesSource = [
  "// Archivo generado por `npm run catalog:sync`. No editar manualmente.",
  `export const OFFICIAL_FORMAT_RULES_LAST_UPDATED = ${JSON.stringify(
    rulesChapterPayload?.data?.attributes?.updatedAt ?? new Date().toISOString()
  )};`,
  `export const OFFICIAL_CORE_SET_SEQUENCE = ${JSON.stringify(coreSetSequence, null, 2)} as const;`,
  `export const OFFICIAL_PREMIER_SET_CODES = ${JSON.stringify(premierSetCodes, null, 2)} as const;`,
  `export const OFFICIAL_ROTATED_CORE_SET_CODES = ${JSON.stringify(rotatedCoreSetCodes, null, 2)} as const;`,
  `export const OFFICIAL_NON_PREMIER_SPECIAL_SET_CODES = ${JSON.stringify(
    [...NON_PREMIER_SPECIAL_SET_CODES].sort(),
    null,
    2
  )} as const;`,
  `export const OFFICIAL_UNREVIEWED_SPECIAL_SET_CODES = ${JSON.stringify(
    unreviewedSpecialSetCodes,
    null,
    2
  )} as const;`,
  `export const OFFICIAL_SUSPENDED_CARDS = ${JSON.stringify(suspendedCards, null, 2)} as const;`,
  `export const OFFICIAL_CARD_COPY_LIMITS = ${JSON.stringify(
    sortRecord(Object.fromEntries(officialCopyLimits)),
    null,
    2
  )} as const;`,
  `export const OFFICIAL_DECK_SIZE_MODIFIERS = ${JSON.stringify(
    sortRecord(officialDeckSizeModifiers),
    null,
    2
  )} as const;`,
  ""
].join("\n");
await mkdir(dirname(FORMAT_RULES_OUTPUT_PATH), { recursive: true });
await writeFile(
  FORMAT_RULES_OUTPUT_PATH,
  await format(formatRulesSource, { parser: "typescript" }),
  "utf8"
);

console.log(
  [
    `Catálogo oficial actualizado: ${Object.keys(cards).length} cartas base`,
    `${Object.keys(aliases).length} alias inequívocos`,
    `${Object.keys(images).length} imágenes`,
    `${sets.length} códigos de colección`,
    `${ambiguousPrintCodes.length} códigos ambiguos omitidos`,
    `${correctedNumbers.length} números corregidos mediante serialCode`,
    `${premierSetCodes.length} colecciones legales en Premier`,
    `${Object.values(suspendedCards).flat().length} suspensiones oficiales`
  ].join(", ") + "."
);

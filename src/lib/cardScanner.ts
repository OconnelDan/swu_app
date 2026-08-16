import {
  OFFICIAL_LEGACY_PROMO_BY_SET,
  OFFICIAL_PRINTED_BASE_TOTALS,
  OFFICIAL_STANDALONE_NUMBER_RANGES
} from "@/generated/officialCardCatalogMeta";
import { KNOWN_SET_CODES, normalizeCardId } from "@/lib/normalizeCardId";

const CARD_ASPECT_RATIO = 1100 / 1536;
const OCR_FOOTER_START = 0.76;
const OCR_FALLBACK_START = 0.58;
const OCR_TARGET_WIDTH = 2200;
const OCR_VARIANT_THRESHOLD_SPLIT = 0.7;
const OCR_VARIANT_LEFT_THRESHOLD = 0.45 * 255;
const OCR_VARIANT_RIGHT_THRESHOLD = 0.55 * 255;
const MIN_FRAME_BRIGHTNESS = 42;
const MAX_FRAME_BRIGHTNESS = 224;
const MIN_FRAME_CONTRAST = 20;
const MIN_FRAME_SHARPNESS = 90;
const MAX_PRINTED_VARIANT_NUMBER = 1500;
const PRINTED_LANGUAGE_CODES = new Set(["DE", "EN", "ES", "FR", "IT", "PL", "PT"]);

const SCANNABLE_SET_CODES = [...KNOWN_SET_CODES].sort((left, right) => right.length - left.length);
const PRINTED_BASE_TOTALS: Readonly<Record<string, number>> = OFFICIAL_PRINTED_BASE_TOTALS;
const PROMO_NUMBER_RANGES: Readonly<Record<string, readonly [number, number]>> =
  OFFICIAL_STANDALONE_NUMBER_RANGES;
const LEGACY_PROMO_BY_SET: Readonly<
  Record<string, { printedTotal: number; promoSetCode: string }>
> = OFFICIAL_LEGACY_PROMO_BY_SET;

interface OcrWorker {
  recognize: (
    image: HTMLCanvasElement,
    options?: { rotateAuto?: boolean }
  ) => Promise<{ data: { text: string } }>;
  setParameters: (params: Record<string, string>) => Promise<unknown>;
  terminate: () => Promise<unknown>;
}

interface LoadedImage {
  source: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
  close: () => void;
}

export interface CardScanProgress {
  status: string;
  progress: number;
}

export interface CardCodeRecognition {
  cardId: string;
  setCode: string;
  cardNumber: string;
  printedTotal?: number;
  rawText: string;
}

export type CardFrameIssue = "too-dark" | "too-bright" | "low-contrast" | "blurry";

export interface CardFrameQuality {
  issue?: CardFrameIssue;
  brightness: number;
  contrast: number;
  sharpness: number;
  signature: Uint8Array;
}

interface CardRecognitionOptions {
  /** Evita pases costosos si el OCR rápido todavía no ha localizado ningún set. */
  fast?: boolean;
}

type OcrPreprocessing = "grayscale" | "variant-binary";

let activeProgressListener: ((progress: CardScanProgress) => void) | undefined;
let workerPromise: Promise<OcrWorker> | null = null;
let recognitionQueue: Promise<void> = Promise.resolve();

function normalizeOcrDigits(value: string, allowMergedEleven = false): string | undefined {
  const normalized = value
    .toUpperCase()
    .replace(/[OQ]/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/Z/g, "2")
    .replace(/S/g, "5")
    .replace(/B/g, "8")
    // Tesseract suele unir dos unos estrechos como una N: "SN" -> "511".
    .replace(/N/g, allowMergedEleven ? "11" : "N");

  return /^\d{1,4}$/.test(normalized) ? normalized : undefined;
}

function normalizeOcrText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
}

function isSetBoundary(text: string, index: number, length: number): boolean {
  const previous = index > 0 ? text[index - 1] : "";
  const next = index + length < text.length ? text[index + length] : "";
  if (/[A-Z0-9]/.test(previous)) return false;
  if (!/[A-Z0-9]/.test(next)) return true;

  // El OCR puede borrar el guion de "ASH-EN" y devolver "ASHEN".
  const languageCode = text.slice(index + length, index + length + 2);
  const afterLanguage = text[index + length + 2] ?? "";
  return PRINTED_LANGUAGE_CODES.has(languageCode) && !/[A-Z0-9]/.test(afterLanguage);
}

function findSetOccurrences(text: string): Array<{ setCode: string; index: number }> {
  const occurrences: Array<{ setCode: string; index: number }> = [];

  for (const setCode of SCANNABLE_SET_CODES) {
    let fromIndex = 0;
    let index = text.indexOf(setCode, fromIndex);

    while (index >= 0) {
      if (isSetBoundary(text, index, setCode.length)) occurrences.push({ setCode, index });
      fromIndex = index + setCode.length;
      index = text.indexOf(setCode, fromIndex);
    }
  }

  return occurrences;
}

function findClosestSetBefore(
  occurrences: Array<{ setCode: string; index: number }>,
  numberIndex: number,
  maxDistance: number
): { setCode: string; distance: number } | undefined {
  let closest: { setCode: string; distance: number } | undefined;

  for (const occurrence of occurrences) {
    const distance = numberIndex - (occurrence.index + occurrence.setCode.length);
    if (distance < 0 || distance > maxDistance) continue;
    if (!closest || distance < closest.distance)
      closest = { setCode: occurrence.setCode, distance };
  }

  return closest;
}

function isStandaloneNumberAllowed(setCode: string, number: number): boolean {
  const promoRange = PROMO_NUMBER_RANGES[setCode];
  if (promoRange) return number >= promoRange[0] && number <= promoRange[1];

  const printedBaseTotal = PRINTED_BASE_TOTALS[setCode];
  return (
    printedBaseTotal !== undefined &&
    number > printedBaseTotal &&
    number <= MAX_PRINTED_VARIANT_NUMBER
  );
}

function resolveFractionSetCode(
  setCode: string,
  printedTotal: number | undefined
): string | undefined {
  const legacyPromo = LEGACY_PROMO_BY_SET[setCode];
  if (legacyPromo && printedTotal === legacyPromo.printedTotal) {
    return legacyPromo.promoSetCode;
  }

  // Si el total pequeño de una promo se ha leído mal, es más seguro pedir
  // otro fotograma que añadir por accidente la carta normal con ese número.
  if (legacyPromo && printedTotal !== undefined && printedTotal <= 40) return undefined;
  return setCode;
}

function buildRecognition(
  setCode: string,
  number: number,
  rawText: string,
  printedTotal?: number
): CardCodeRecognition | undefined {
  try {
    const cardId = normalizeCardId(setCode, number);
    return {
      cardId,
      setCode,
      cardNumber: cardId.split("_")[1],
      printedTotal,
      rawText
    };
  } catch {
    return undefined;
  }
}

/**
 * Mide si un fotograma tiene luz, contraste y nitidez suficientes para leer
 * el pie de la carta. La firma reducida también permite detectar movimiento.
 */
export function analyzeCardFrameQuality(
  pixels: Pick<ImageData, "data" | "width" | "height">
): CardFrameQuality {
  const { data, width, height } = pixels;
  const signature = new Uint8Array(width * height);
  let sum = 0;
  let sumSquared = 0;

  for (let pixel = 0, signatureIndex = 0; pixel < data.length; pixel += 4, signatureIndex++) {
    const grayscale = Math.round(
      0.299 * data[pixel] + 0.587 * data[pixel + 1] + 0.114 * data[pixel + 2]
    );
    signature[signatureIndex] = grayscale;
    sum += grayscale;
    sumSquared += grayscale * grayscale;
  }

  const sampleCount = Math.max(1, signature.length);
  const brightness = sum / sampleCount;
  const variance = Math.max(0, sumSquared / sampleCount - brightness * brightness);
  const contrast = Math.sqrt(variance);

  // El código de colección está en la zona inferior; medimos allí la nitidez
  // mediante la varianza del Laplaciano para no dejarnos engañar por el arte.
  const sharpnessStartY = Math.max(1, Math.floor(height * 0.58));
  let laplacianSum = 0;
  let laplacianSquaredSum = 0;
  let laplacianCount = 0;

  for (let y = sharpnessStartY; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      const laplacian =
        4 * signature[index] -
        signature[index - 1] -
        signature[index + 1] -
        signature[index - width] -
        signature[index + width];
      laplacianSum += laplacian;
      laplacianSquaredSum += laplacian * laplacian;
      laplacianCount++;
    }
  }

  const laplacianMean = laplacianCount > 0 ? laplacianSum / laplacianCount : 0;
  const sharpness =
    laplacianCount > 0
      ? Math.max(0, laplacianSquaredSum / laplacianCount - laplacianMean * laplacianMean)
      : 0;

  let issue: CardFrameIssue | undefined;
  if (brightness < MIN_FRAME_BRIGHTNESS) issue = "too-dark";
  else if (brightness > MAX_FRAME_BRIGHTNESS) issue = "too-bright";
  else if (contrast < MIN_FRAME_CONTRAST) issue = "low-contrast";
  else if (sharpness < MIN_FRAME_SHARPNESS) issue = "blurry";

  return { issue, brightness, contrast, sharpness, signature };
}

/** Diferencia media entre dos firmas: cuanto mayor, más se ha movido la imagen. */
export function calculateFrameMovement(previous: Uint8Array, current: Uint8Array): number {
  if (previous.length === 0 || previous.length !== current.length) return Number.POSITIVE_INFINITY;

  let difference = 0;
  for (let index = 0; index < previous.length; index++) {
    difference += Math.abs(previous[index] - current[index]);
  }
  return difference / previous.length;
}

/**
 * Extrae SET + número impreso de la línea inferior de una carta.
 *
 * Solo utiliza el numerador de "132/264": el total del set puede variar entre
 * idiomas o ser leído con errores, mientras que SET_132 identifica la carta.
 */
export function parseCardCodeFromOcr(text: string): CardCodeRecognition | undefined {
  const normalizedText = normalizeOcrText(text);
  const setOccurrences = findSetOccurrences(normalizedText);

  const fractions = [
    ...normalizedText.matchAll(/([0-9OQILSZB]{1,4})\s*F?\s*[/|\\]\s*([0-9OQILSZB]{1,4})/g)
  ];

  let best:
    | {
        setCode: string;
        number: number;
        printedTotal?: number;
        distance: number;
      }
    | undefined;

  for (const fraction of fractions) {
    const numberDigits = normalizeOcrDigits(fraction[1]);
    const totalDigits = normalizeOcrDigits(fraction[2]);
    if (!numberDigits) continue;

    const number = Number(numberDigits);
    const printedTotal = totalDigits ? Number(totalDigits) : undefined;
    if (!Number.isInteger(number) || number <= 0) continue;

    const closestSet = findClosestSetBefore(setOccurrences, fraction.index ?? 0, 100);
    if (closestSet && (!best || closestSet.distance < best.distance)) {
      const resolvedSetCode = resolveFractionSetCode(closestSet.setCode, printedTotal);
      if (!resolvedSetCode) continue;
      best = {
        setCode: resolvedSetCode,
        number,
        printedTotal,
        distance: closestSet.distance
      };
    }
  }

  if (best) return buildRecognition(best.setCode, best.number, text, best.printedTotal);

  // Las impresiones modernas alternativas, Hyperspace y foil muestran, por
  // ejemplo, "LAW-ES 511" o "SEC-ES 748", sin el total "/264". Solo se
  // aceptan números por encima del set base para evitar que una lectura
  // truncada (748 -> 148) añada silenciosamente una carta normal equivocada.
  let standaloneBest:
    | {
        setCode: string;
        number: number;
        distance: number;
      }
    | undefined;

  for (const occurrence of setOccurrences) {
    const setEnd = occurrence.index + occurrence.setCode.length;
    const nearbyText = normalizedText.slice(setEnd, setEnd + 56);
    const numberTokens = [
      ...nearbyText.matchAll(/(?:^|[^A-Z0-9])([0-9OQILSZBN]{1,4})\s*F?(?![A-Z0-9])/g)
    ];

    for (const token of numberTokens) {
      const rawNumber = token[1];
      const tokenOffset = token[0].indexOf(rawNumber);
      const numberIndex = setEnd + (token.index ?? 0) + tokenOffset;
      const beforeNumber = normalizedText.slice(Math.max(0, numberIndex - 4), numberIndex);
      const afterNumber = normalizedText.slice(numberIndex + rawNumber.length, numberIndex + 8);
      if (/[/|\\]\s*$/.test(beforeNumber) || /^\s*[/|\\]/.test(afterNumber)) continue;

      const numberDigits = normalizeOcrDigits(rawNumber, true);
      if (!numberDigits) continue;

      const number = Number(numberDigits);
      if (!Number.isInteger(number) || !isStandaloneNumberAllowed(occurrence.setCode, number)) {
        continue;
      }

      const distance = numberIndex - setEnd;
      if (!standaloneBest || distance < standaloneBest.distance) {
        standaloneBest = { setCode: occurrence.setCode, number, distance };
      }
    }
  }

  if (!standaloneBest) return undefined;
  return buildRecognition(standaloneBest.setCode, standaloneBest.number, text);
}

function findLooseVariantNumbers(text: string, setCode: string): Set<number> {
  const normalizedText = normalizeOcrText(text);
  const numbers = new Set<number>();
  const tokens = [...normalizedText.matchAll(/(?:^|[^A-Z0-9])([0-9OQILSZBN]{1,4})(?![A-Z0-9])/g)];

  for (const token of tokens) {
    const rawNumber = token[1];
    const tokenOffset = token[0].indexOf(rawNumber);
    const numberIndex = (token.index ?? 0) + tokenOffset;
    const beforeNumber = normalizedText.slice(Math.max(0, numberIndex - 4), numberIndex);
    const afterNumber = normalizedText.slice(numberIndex + rawNumber.length, numberIndex + 8);
    if (/[/|\\]\s*$/.test(beforeNumber) || /^\s*[/|\\]/.test(afterNumber)) continue;

    const numberDigits = normalizeOcrDigits(rawNumber, true);
    if (!numberDigits) continue;

    const number = Number(numberDigits);
    if (Number.isInteger(number) && isStandaloneNumberAllowed(setCode, number)) numbers.add(number);
  }

  return numbers;
}

/**
 * Combina distintos preprocesados del mismo recorte. En una foil, un pase
 * puede leer "SEC-ES" y otro solo "748" por culpa del reflejo; únicamente se
 * combinan si queda un solo set y un solo número de variante posibles.
 */
export function parseCardCodeFromOcrResults(texts: string[]): CardCodeRecognition | undefined {
  const rawText = texts.filter(Boolean).join("\n");
  const directRecognitions = texts
    .map(parseCardCodeFromOcr)
    .filter((recognition): recognition is CardCodeRecognition => recognition !== undefined);
  const directByCardId = new Map(
    directRecognitions.map((recognition) => [recognition.cardId, recognition])
  );

  if (directByCardId.size === 1) {
    const recognition = directByCardId.values().next().value as CardCodeRecognition;
    return { ...recognition, rawText };
  }
  if (directByCardId.size > 1) return undefined;

  const setCodes = new Set(
    texts.flatMap((result) =>
      findSetOccurrences(normalizeOcrText(result)).map(({ setCode }) => setCode)
    )
  );
  if (setCodes.size !== 1) return undefined;

  const setCode = setCodes.values().next().value as string;
  // Los números pequeños de una promo se confunden fácilmente con coste,
  // poder o vida. En promos exigimos siempre set y número en el mismo pase.
  if (PROMO_NUMBER_RANGES[setCode]) return undefined;

  const numbers = new Set(texts.flatMap((result) => [...findLooseVariantNumbers(result, setCode)]));
  if (numbers.size !== 1) return undefined;

  return buildRecognition(setCode, numbers.values().next().value as number, rawText);
}

function containsScannableSetCode(texts: string[]): boolean {
  return texts.some((text) => findSetOccurrences(normalizeOcrText(text)).length > 0);
}

function getImageDimensions(source: ImageBitmap | HTMLImageElement): {
  width: number;
  height: number;
} {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }

  return { width: source.width, height: source.height };
}

async function loadImage(image: Blob): Promise<LoadedImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(image, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close()
    };
  }

  const objectUrl = URL.createObjectURL(image);
  const element = new Image();

  try {
    await new Promise<void>((resolve, reject) => {
      element.onload = () => resolve();
      element.onerror = () => reject(new Error("No se ha podido abrir la fotografía."));
      element.src = objectUrl;
    });

    const { width, height } = getImageDimensions(element);
    return {
      source: element,
      width,
      height,
      close: () => URL.revokeObjectURL(objectUrl)
    };
  } catch (cause) {
    URL.revokeObjectURL(objectUrl);
    throw cause;
  }
}

function drawGrayscale(
  source: CanvasImageSource,
  sourceRect: { x: number; y: number; width: number; height: number },
  targetWidth: number,
  preprocessing: OcrPreprocessing = "grayscale"
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(targetWidth));
  canvas.height = Math.max(1, Math.round((sourceRect.height / sourceRect.width) * canvas.width));

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("El navegador no permite procesar la fotografía.");

  context.drawImage(
    source,
    sourceRect.x,
    sourceRect.y,
    sourceRect.width,
    sourceRect.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  const contrast = 1.35;

  for (let index = 0; index < data.length; index += 4) {
    const grayscale = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    const pixelX = (index / 4) % canvas.width;
    const threshold =
      pixelX < canvas.width * OCR_VARIANT_THRESHOLD_SPLIT
        ? OCR_VARIANT_LEFT_THRESHOLD
        : OCR_VARIANT_RIGHT_THRESHOLD;
    const adjusted =
      preprocessing === "variant-binary"
        ? grayscale >= threshold
          ? 255
          : 0
        : Math.max(0, Math.min(255, (grayscale - 128) * contrast + 128));
    data[index] = adjusted;
    data[index + 1] = adjusted;
    data[index + 2] = adjusted;
  }

  context.putImageData(pixels, 0, 0);
  return canvas;
}

function getCenteredCardRect(width: number, height: number) {
  let cropWidth = width;
  let cropHeight = cropWidth / CARD_ASPECT_RATIO;

  if (cropHeight > height) {
    cropHeight = height;
    cropWidth = cropHeight * CARD_ASPECT_RATIO;
  }

  return {
    x: (width - cropWidth) / 2,
    y: (height - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight
  };
}

function buildOcrCanvas(
  image: LoadedImage,
  startRatio: number,
  targetWidth = OCR_TARGET_WIDTH,
  preprocessing: OcrPreprocessing = "grayscale"
): HTMLCanvasElement {
  const card = getCenteredCardRect(image.width, image.height);
  const startY = card.y + card.height * startRatio;

  return drawGrayscale(
    image.source,
    {
      x: card.x,
      y: startY,
      width: card.width,
      height: card.y + card.height - startY
    },
    targetWidth,
    preprocessing
  );
}

async function getWorker(): Promise<OcrWorker> {
  if (!workerPromise) {
    workerPromise = import("tesseract.js")
      .then(async ({ createWorker, OEM, PSM }) => {
        const worker = (await createWorker("eng", OEM.LSTM_ONLY, {
          logger: (message) => {
            activeProgressListener?.({
              status: message.status,
              progress: Number.isFinite(message.progress) ? message.progress : 0
            });
          }
        })) as OcrWorker;

        await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
        return worker;
      })
      .catch((cause) => {
        workerPromise = null;
        throw cause;
      });
  }

  return workerPromise;
}

async function recognizeCardCodeNow(
  image: Blob,
  onProgress?: (progress: CardScanProgress) => void,
  options: CardRecognitionOptions = {}
): Promise<CardCodeRecognition | undefined> {
  activeProgressListener = onProgress;
  let loaded: LoadedImage | undefined;

  try {
    loaded = await loadImage(image);
    const worker = await getWorker();
    await worker.setParameters({ tessedit_pageseg_mode: "6" });
    const footerCanvas = buildOcrCanvas(loaded, OCR_FOOTER_START);
    const footerResult = await worker.recognize(footerCanvas);
    const ocrTexts = [footerResult.data.text];
    const footerRecognition = parseCardCodeFromOcrResults(ocrTexts);
    if (footerRecognition) return footerRecognition;

    await worker.setParameters({ tessedit_pageseg_mode: "11" });
    const fallbackCanvas = buildOcrCanvas(loaded, OCR_FALLBACK_START, 1800);
    const fallbackResult = await worker.recognize(fallbackCanvas, { rotateAuto: true });
    ocrTexts.push(fallbackResult.data.text);
    const fallbackRecognition = parseCardCodeFromOcrResults(ocrTexts);
    if (fallbackRecognition) return fallbackRecognition;

    if (options.fast && !containsScannableSetCode(ocrTexts)) return undefined;

    const variantCanvas = buildOcrCanvas(loaded, OCR_FALLBACK_START, 1800, "variant-binary");
    const variantResult = await worker.recognize(variantCanvas, { rotateAuto: true });
    ocrTexts.push(variantResult.data.text);
    return parseCardCodeFromOcrResults(ocrTexts);
  } finally {
    activeProgressListener = undefined;
    loaded?.close();
  }
}

/**
 * Reconoce una carta localmente. La imagen nunca se envía al servidor de la
 * app. Las lecturas se serializan para poder cancelar y reabrir la cámara sin
 * ejecutar dos trabajos simultáneos sobre el mismo worker de Tesseract.
 */
export function recognizeCardCode(
  image: Blob,
  onProgress?: (progress: CardScanProgress) => void,
  options: CardRecognitionOptions = {}
): Promise<CardCodeRecognition | undefined> {
  const recognition = recognitionQueue.then(() => recognizeCardCodeNow(image, onProgress, options));
  recognitionQueue = recognition.then(
    () => undefined,
    () => undefined
  );
  return recognition;
}

/** Libera la memoria WebAssembly cuando se abandona la pantalla de escaneo. */
export async function disposeCardScanner(): Promise<void> {
  await recognitionQueue.catch(() => undefined);
  const pendingWorker = workerPromise;
  workerPromise = null;
  activeProgressListener = undefined;

  if (pendingWorker) {
    const worker = await pendingWorker.catch(() => undefined);
    await worker?.terminate().catch(() => undefined);
  }
}

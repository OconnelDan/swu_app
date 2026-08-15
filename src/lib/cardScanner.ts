import { KNOWN_SET_CODES, normalizeCardId } from "@/lib/normalizeCardId";

const CARD_ASPECT_RATIO = 1100 / 1536;
const OCR_FOOTER_START = 0.76;
const OCR_FALLBACK_START = 0.58;
const OCR_TARGET_WIDTH = 2200;

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

let activeProgressListener: ((progress: CardScanProgress) => void) | undefined;
let workerPromise: Promise<OcrWorker> | null = null;

function normalizeOcrDigits(value: string): string | undefined {
  const normalized = value
    .toUpperCase()
    .replace(/[OQ]/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/Z/g, "2")
    .replace(/S/g, "5")
    .replace(/B/g, "8");

  return /^\d{1,4}$/.test(normalized) ? normalized : undefined;
}

/**
 * Extrae SET + número impreso de la línea inferior de una carta.
 *
 * Solo utiliza el numerador de "132/264": el total del set puede variar entre
 * idiomas o ser leído con errores, mientras que SET_132 identifica la carta.
 */
export function parseCardCodeFromOcr(text: string): CardCodeRecognition | undefined {
  const normalizedText = text.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();

  const fractions = [
    ...normalizedText.matchAll(/([0-9OQILSZB]{1,4})\s*[/|\\]\s*([0-9OQILSZB]{1,4})/g)
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

    const fractionIndex = fraction.index ?? 0;
    const nearbyStart = Math.max(0, fractionIndex - 100);
    const nearbyText = normalizedText.slice(nearbyStart, fractionIndex);

    for (const setCode of KNOWN_SET_CODES) {
      const setIndex = nearbyText.lastIndexOf(setCode);
      if (setIndex < 0) continue;

      const distance = nearbyText.length - (setIndex + setCode.length);
      if (!best || distance < best.distance) {
        best = { setCode, number, printedTotal, distance };
      }
    }
  }

  if (!best) return undefined;

  try {
    const cardId = normalizeCardId(best.setCode, best.number);
    return {
      cardId,
      setCode: best.setCode,
      cardNumber: cardId.split("_")[1],
      printedTotal: best.printedTotal,
      rawText: text
    };
  } catch {
    return undefined;
  }
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
  targetWidth: number
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
    const adjusted = Math.max(0, Math.min(255, (grayscale - 128) * contrast + 128));
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
  targetWidth = OCR_TARGET_WIDTH
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
    targetWidth
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

/** Reconoce una carta localmente. La imagen nunca se envía al servidor de la app. */
export async function recognizeCardCode(
  image: Blob,
  onProgress?: (progress: CardScanProgress) => void
): Promise<CardCodeRecognition | undefined> {
  activeProgressListener = onProgress;
  let loaded: LoadedImage | undefined;

  try {
    loaded = await loadImage(image);
    const worker = await getWorker();
    await worker.setParameters({ tessedit_pageseg_mode: "6" });
    const footerCanvas = buildOcrCanvas(loaded, OCR_FOOTER_START);
    const footerResult = await worker.recognize(footerCanvas);
    const footerRecognition = parseCardCodeFromOcr(footerResult.data.text);
    if (footerRecognition) return footerRecognition;

    await worker.setParameters({ tessedit_pageseg_mode: "11" });
    const fallbackCanvas = buildOcrCanvas(loaded, OCR_FALLBACK_START, 1800);
    const fallbackResult = await worker.recognize(fallbackCanvas, { rotateAuto: true });
    return parseCardCodeFromOcr(`${footerResult.data.text}\n${fallbackResult.data.text}`);
  } finally {
    activeProgressListener = undefined;
    loaded?.close();
  }
}

/** Libera la memoria WebAssembly cuando se abandona la pantalla de escaneo. */
export async function disposeCardScanner(): Promise<void> {
  const pendingWorker = workerPromise;
  workerPromise = null;
  activeProgressListener = undefined;

  if (pendingWorker) {
    const worker = await pendingWorker.catch(() => undefined);
    await worker?.terminate().catch(() => undefined);
  }
}

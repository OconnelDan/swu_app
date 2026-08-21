import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  X
} from "lucide-react";
import { CardImageThumbnail } from "@/components/CardImageThumbnail";
import { SkeletonLines } from "@/components/Skeleton";
import { useDataSource } from "@/contexts/DataSourceContext";
import {
  analyzeCardFrameQuality,
  calculateFrameMovement,
  disposeCardScanner,
  recognizeCardCode,
  type CardCodeRecognition,
  type CardFrameIssue,
  type CardFrameQuality,
  type CardScanProgress
} from "@/lib/cardScanner";
import { tryGetCardImageUrl } from "@/lib/cardImageUrl";
import { SwUnlimitedDbCardProvider } from "@/providers/cardProvider/SwUnlimitedDbCardProvider";
import type { CardInfo } from "@/types/card";

const CARD_ASPECT_RATIO = 1100 / 1536;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const LIVE_SAMPLE_WIDTH = 160;
const LIVE_OCR_WIDTH = 1600;
const LIVE_RETRY_DELAY_MS = 350;
const LIVE_HOLD_DURATION_MS = 1200;
const LIVE_HOLD_SAMPLE_MS = 180;
const MAX_STEP_MOVEMENT = 20;
const MAX_TOTAL_MOVEMENT = 38;
const MAX_QUANTITY_PER_SCAN = 99;

type LiveScanTone = "error" | "reading" | "success";

interface LiveScanFeedback {
  tone: LiveScanTone;
  message: string;
  progress: number;
}

const INITIAL_LIVE_FEEDBACK: LiveScanFeedback = {
  tone: "error",
  message: "Centra la carta completa dentro del marco",
  progress: 0
};

const LIVE_BORDER_CLASSES: Record<LiveScanTone, string> = {
  error: "border-saber-red shadow-[0_0_18px_rgba(248,113,113,0.75)]",
  reading: "border-saber-yellow shadow-[0_0_18px_rgba(250,204,21,0.65)]",
  success: "border-saber-green shadow-[0_0_22px_rgba(74,222,128,0.8)]"
};

interface RecognizedCard {
  recognition: CardCodeRecognition;
  info: CardInfo;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function getFrameIssueMessage(issue: CardFrameIssue): string {
  if (issue === "too-dark") return "Falta luz. Ilumina mejor la carta";
  if (issue === "too-bright") return "Hay demasiado brillo. Evita reflejos sobre la carta";
  if (issue === "low-contrast") return "Acerca y centra la carta dentro del marco";
  return "La imagen está desenfocada. Mantén la cámara quieta";
}

function getCenteredVideoRect(video: HTMLVideoElement) {
  let sourceWidth = video.videoWidth;
  let sourceHeight = sourceWidth / CARD_ASPECT_RATIO;
  if (sourceHeight > video.videoHeight) {
    sourceHeight = video.videoHeight;
    sourceWidth = sourceHeight * CARD_ASPECT_RATIO;
  }

  return {
    x: (video.videoWidth - sourceWidth) / 2,
    y: (video.videoHeight - sourceHeight) / 2,
    width: sourceWidth,
    height: sourceHeight
  };
}

function drawVideoFrame(video: HTMLVideoElement, targetWidth: number): HTMLCanvasElement {
  if (
    video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
    video.videoWidth === 0 ||
    video.videoHeight === 0
  ) {
    throw new Error("La cámara todavía se está preparando.");
  }

  const source = getCenteredVideoRect(video);
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = Math.max(1, Math.round(targetWidth / CARD_ASPECT_RATIO));
  const context = canvas.getContext("2d", {
    willReadFrequently: targetWidth === LIVE_SAMPLE_WIDTH
  });
  if (!context) throw new Error("El navegador no permite analizar la cámara.");

  context.drawImage(
    video,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return canvas;
}

function readLiveFrameQuality(video: HTMLVideoElement): CardFrameQuality {
  const canvas = drawVideoFrame(video, LIVE_SAMPLE_WIDTH);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("El navegador no permite analizar la cámara.");
  return analyzeCardFrameQuality(context.getImageData(0, 0, canvas.width, canvas.height));
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("No se ha podido analizar el fotograma de la cámara."));
      },
      "image/jpeg",
      0.9
    );
  });
}

function translateOcrStatus(status: string): string {
  if (status.includes("loading tesseract core")) return "Preparando el lector…";
  if (status.includes("initializing tesseract")) return "Inicializando el lector…";
  if (status.includes("loading language")) return "Cargando el reconocimiento de texto…";
  if (status.includes("recognizing text")) return "Leyendo la colección y el número…";
  return "Analizando la carta…";
}

function getErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function parseQuantity(value: string): number | null {
  if (!/^\d{1,2}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_QUANTITY_PER_SCAN ? parsed : null;
}

export function ScanCardsPage() {
  const { mode, collection, addCollectionCard } = useDataSource();
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const scanSessionRef = useRef(0);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recognizedCard, setRecognizedCard] = useState<RecognizedCard | null>(null);
  const [quantityInput, setQuantityInput] = useState("1");
  const [ownedBefore, setOwnedBefore] = useState(0);
  const [newOwnedCount, setNewOwnedCount] = useState<number | null>(null);
  const [scanProgress, setScanProgress] = useState<CardScanProgress>({
    status: "",
    progress: 0
  });
  const [liveFeedback, setLiveFeedback] = useState<LiveScanFeedback>(INITIAL_LIVE_FEEDBACK);
  const quantity = parseQuantity(quantityInput);

  const replacePreview = useCallback((nextUrl: string | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
  }, []);

  const stopCamera = useCallback(() => {
    scanSessionRef.current += 1;
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  }, []);

  useEffect(() => {
    if (!cameraOpen || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => undefined);
  }, [cameraOpen]);

  useEffect(() => {
    return () => {
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      void disposeCardScanner();
    };
  }, []);

  const resetResult = useCallback(() => {
    setError(null);
    setMessage(null);
    setRecognizedCard(null);
    setQuantityInput("1");
    setOwnedBefore(0);
    setNewOwnedCount(null);
    setScanProgress({ status: "", progress: 0 });
    setLiveFeedback(INITIAL_LIVE_FEEDBACK);
    replacePreview(null);
  }, [replacePreview]);

  const resolveRecognition = useCallback(
    async (recognition: CardCodeRecognition) => {
      const info = await new SwUnlimitedDbCardProvider().getCard(recognition.cardId);
      if (!info) {
        throw new Error(
          `Se ha leído ${recognition.cardId}, pero no se ha podido confirmar en el catálogo. Vuelve a escanearla.`
        );
      }

      setOwnedBefore(
        collection?.cards.find((card) => card.cardId === info.cardId)?.ownedCount ?? 0
      );
      setRecognizedCard({ recognition, info });
    },
    [collection?.cards]
  );

  const analyzeImage = useCallback(
    async (image: Blob) => {
      if (image.size > MAX_IMAGE_BYTES) {
        setError("La fotografía supera los 25 MB. Reduce su tamaño o toma otra foto.");
        return;
      }

      resetResult();
      replacePreview(URL.createObjectURL(image));
      setBusy(true);
      setScanProgress({ status: "Preparando la fotografía…", progress: 0 });

      try {
        const recognition = await recognizeCardCode(image, setScanProgress);
        if (!recognition) {
          throw new Error(
            "No se distingue la colección y el número. Acerca la cámara, evita reflejos y vuelve a intentarlo."
          );
        }

        setScanProgress({ status: "Comprobando la carta en el catálogo…", progress: 1 });
        await resolveRecognition(recognition);
      } catch (cause) {
        setError(getErrorMessage(cause, "No se ha podido reconocer la carta."));
      } finally {
        setBusy(false);
      }
    },
    [replacePreview, resetResult, resolveRecognition]
  );

  const openCamera = async () => {
    resetResult();

    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }

    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 2560 }
        }
      });
      scanSessionRef.current += 1;
      streamRef.current = stream;
      setLiveFeedback(INITIAL_LIVE_FEEDBACK);
      setCameraOpen(true);
    } catch {
      setError(
        "No se ha podido abrir la cámara. Revisa el permiso del navegador o utiliza «Elegir una foto»."
      );
    }
  };

  useEffect(() => {
    if (!cameraOpen) return;

    const sessionId = scanSessionRef.current;
    let cancelled = false;
    const isActive = () => !cancelled && scanSessionRef.current === sessionId;

    const showFrameIssue = (issue: CardFrameIssue) => {
      setLiveFeedback({ tone: "error", message: getFrameIssueMessage(issue), progress: 0 });
    };

    const holdCardStill = async (): Promise<boolean> => {
      const video = videoRef.current;
      if (!video || !isActive()) return false;

      const initialQuality = readLiveFrameQuality(video);
      if (initialQuality.issue) {
        showFrameIssue(initialQuality.issue);
        return false;
      }

      const baseline = initialQuality.signature;
      let previous = baseline;
      const startedAt = performance.now();
      setLiveFeedback({
        tone: "success",
        message: "Carta detectada. Mantén la posición…",
        progress: 0
      });

      while (performance.now() - startedAt < LIVE_HOLD_DURATION_MS) {
        await wait(LIVE_HOLD_SAMPLE_MS);
        if (!isActive() || !videoRef.current) return false;

        const currentQuality = readLiveFrameQuality(videoRef.current);
        if (currentQuality.issue) {
          showFrameIssue(currentQuality.issue);
          return false;
        }

        const stepMovement = calculateFrameMovement(previous, currentQuality.signature);
        const totalMovement = calculateFrameMovement(baseline, currentQuality.signature);
        if (stepMovement > MAX_STEP_MOVEMENT || totalMovement > MAX_TOTAL_MOVEMENT) {
          setLiveFeedback({
            tone: "error",
            message: "La carta se ha movido. Vuelve a centrarla y mantenla quieta",
            progress: 0
          });
          return false;
        }

        const progress = Math.min(1, (performance.now() - startedAt) / LIVE_HOLD_DURATION_MS);
        setLiveFeedback({
          tone: "success",
          message: "Carta detectada. Mantén la posición…",
          progress
        });
        previous = currentQuality.signature;
      }

      return true;
    };

    const scanContinuously = async () => {
      while (isActive()) {
        const video = videoRef.current;
        if (
          !video ||
          video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
          video.videoWidth === 0
        ) {
          setLiveFeedback({
            tone: "reading",
            message: "Preparando la cámara…",
            progress: 0
          });
          await wait(LIVE_RETRY_DELAY_MS);
          continue;
        }

        const quality = readLiveFrameQuality(video);
        if (quality.issue) {
          showFrameIssue(quality.issue);
          await wait(LIVE_RETRY_DELAY_MS);
          continue;
        }

        setLiveFeedback({
          tone: "reading",
          message: "Leyendo el código inferior. Mantén la carta quieta…",
          progress: 0
        });

        const image = await canvasToBlob(drawVideoFrame(video, LIVE_OCR_WIDTH));
        const recognition = await recognizeCardCode(
          image,
          (progress) => {
            if (!isActive()) return;
            setLiveFeedback({
              tone: "reading",
              message: translateOcrStatus(progress.status),
              progress: progress.progress
            });
          },
          { fast: true }
        );
        if (!isActive()) return;

        if (!recognition) {
          setLiveFeedback({
            tone: "error",
            message: "No se lee el código inferior. Centra y acerca la carta",
            progress: 0
          });
          await wait(LIVE_RETRY_DELAY_MS);
          continue;
        }

        if (!(await holdCardStill())) {
          await wait(LIVE_RETRY_DELAY_MS);
          continue;
        }
        if (!isActive()) return;

        stopCamera();
        setBusy(true);
        setScanProgress({ status: "Comprobando la carta en el catálogo…", progress: 1 });
        try {
          await resolveRecognition(recognition);
        } catch (cause) {
          setError(getErrorMessage(cause, "No se ha podido confirmar la carta."));
        } finally {
          setBusy(false);
        }
        return;
      }
    };

    void scanContinuously().catch((cause) => {
      if (!isActive()) return;
      stopCamera();
      setError(getErrorMessage(cause, "No se ha podido analizar el vídeo de la cámara."));
    });

    return () => {
      cancelled = true;
    };
  }, [cameraOpen, resolveRecognition, stopCamera]);

  const handleImageFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Selecciona una fotografía válida.");
      return;
    }
    stopCamera();
    void analyzeImage(file);
  };

  const saveCard = async () => {
    if (!recognizedCard || mode !== "account" || quantity === null) return;
    setError(null);
    setMessage(null);
    setSaving(true);

    try {
      const count = await addCollectionCard(
        {
          cardId: recognizedCard.info.cardId,
          setCode: recognizedCard.info.setCode,
          cardNumber: recognizedCard.info.cardNumber,
          name: recognizedCard.info.name
        },
        quantity
      );
      setNewOwnedCount(count);
      setMessage(
        `${quantity} copia${quantity === 1 ? "" : "s"} de ${recognizedCard.info.name ?? recognizedCard.info.cardId} añadida${quantity === 1 ? "" : "s"}.`
      );
    } catch (cause) {
      setError(getErrorMessage(cause, "No se ha podido actualizar la colección."));
    } finally {
      setSaving(false);
    }
  };

  if (mode === "loading" || (mode === "account" && collection === undefined)) {
    return <SkeletonLines count={5} />;
  }

  if (mode !== "account") {
    return (
      <section className="card space-y-3 text-center">
        <Camera size={34} className="mx-auto text-saber-blue" aria-hidden="true" />
        <h2 className="font-display text-base">Añadir cartas con la cámara</h2>
        <p className="text-sm text-slate-300">
          Esta función guarda cambios directamente en Supabase y está disponible únicamente con una
          cuenta iniciada.
        </p>
        <Link to="/cuenta?vista=iniciar" className="btn-primary w-full">
          Iniciar sesión
        </Link>
      </section>
    );
  }

  const catalogImageUrl = recognizedCard
    ? (recognizedCard.info.imageUrl ?? tryGetCardImageUrl(recognizedCard.recognition.cardId))
    : undefined;

  return (
    <div className="space-y-4">
      <section className="card space-y-2">
        <h2 className="font-display text-base">Añadir cartas con la cámara</h2>
        <p className="text-sm text-slate-300">
          Coloca una carta ocupando el marco y mantenla quieta. El borde te avisará si falta luz,
          enfoque o encuadre, y la lectura se completará automáticamente cuando esté correcta.
        </p>
        <p className="text-xs text-slate-400">
          Los fotogramas se procesan en tu dispositivo y no se guardan en tu cuenta.
        </p>
      </section>

      {!cameraOpen && !busy && !recognizedCard && (
        <section className="card grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn-primary" onClick={() => void openCamera()}>
            <Camera size={18} />
            Abrir escáner en vivo
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => galleryInputRef.current?.click()}
          >
            <ImagePlus size={18} />
            Elegir una foto
          </button>
        </section>
      )}

      {cameraOpen && (
        <section className="card space-y-3">
          <div
            className="relative mx-auto aspect-[1100/1536] max-h-[65vh] overflow-hidden rounded-xl bg-black"
            aria-label="Vista de la cámara"
          >
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover"
            />
            <div
              className={`pointer-events-none absolute inset-3 rounded-lg border-4 transition-colors duration-200 ${LIVE_BORDER_CLASSES[liveFeedback.tone]}`}
            />
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-none absolute inset-x-6 top-1/2 -translate-y-1/2 space-y-2 rounded-xl bg-black/75 p-3 text-center text-sm backdrop-blur-sm"
            >
              {liveFeedback.tone === "error" && (
                <AlertTriangle size={24} className="mx-auto text-saber-red" aria-hidden="true" />
              )}
              {liveFeedback.tone === "reading" && (
                <Loader2
                  size={24}
                  className="mx-auto animate-spin text-saber-yellow"
                  aria-hidden="true"
                />
              )}
              {liveFeedback.tone === "success" && (
                <CheckCircle2 size={24} className="mx-auto text-saber-green" aria-hidden="true" />
              )}
              <p>{liveFeedback.message}</p>
              {liveFeedback.tone !== "error" && (
                <div className="h-1.5 overflow-hidden rounded-full bg-space-700">
                  <div
                    className={`h-full transition-[width] duration-150 ${
                      liveFeedback.tone === "success" ? "bg-saber-green" : "bg-saber-yellow"
                    }`}
                    style={{ width: `${Math.max(6, Math.round(liveFeedback.progress * 100))}%` }}
                  />
                </div>
              )}
            </div>
            <p className="pointer-events-none absolute inset-x-4 bottom-5 rounded bg-black/70 px-2 py-1 text-center text-xs">
              El escaneo se completará automáticamente
            </p>
          </div>
          <button type="button" className="btn-secondary w-full" onClick={stopCamera}>
            <X size={18} />
            Cancelar escaneo
          </button>
        </section>
      )}

      {busy && !previewUrl && (
        <section role="status" className="card space-y-2 text-center text-sm">
          <Loader2 size={24} className="mx-auto animate-spin text-saber-blue" />
          <p>{scanProgress.status || "Confirmando la carta…"}</p>
        </section>
      )}

      {previewUrl && (
        <section className="card space-y-3">
          <img
            src={previewUrl}
            alt="Fotografía de la carta que se está analizando"
            className="mx-auto max-h-64 rounded-lg"
          />

          {busy && (
            <div role="status" className="space-y-2 text-center text-sm">
              <Loader2 size={24} className="mx-auto animate-spin text-saber-blue" />
              <p>{translateOcrStatus(scanProgress.status)}</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-space-700">
                <div
                  className="h-full bg-saber-blue transition-[width]"
                  style={{ width: `${Math.max(5, Math.round(scanProgress.progress * 100))}%` }}
                />
              </div>
            </div>
          )}
        </section>
      )}

      {recognizedCard && (
        <section className="card space-y-4" aria-live="polite">
          <div className="flex items-start gap-3">
            {catalogImageUrl && (
              <CardImageThumbnail
                src={catalogImageUrl}
                fallbackSrc={tryGetCardImageUrl(recognizedCard.recognition.cardId)}
                alt={recognizedCard.info.name ?? recognizedCard.info.cardId}
                className="h-32 w-auto rounded"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs text-slate-400">{recognizedCard.info.cardId}</p>
              {recognizedCard.recognition.cardId !== recognizedCard.info.cardId && (
                <p className="text-xs text-slate-400">
                  Impresión detectada: {recognizedCard.recognition.cardId} · se guardará como la
                  carta base {recognizedCard.info.cardId}
                </p>
              )}
              <h3 className="font-semibold">
                {recognizedCard.info.name ?? "Carta sin nombre en el catálogo"}
              </h3>
              <p className="mt-2 text-sm">
                En tu colección antes del escaneo: <strong>{ownedBefore}</strong>
              </p>
              {newOwnedCount !== null && (
                <p className="text-sm text-saber-green">
                  Ahora tienes <strong>{newOwnedCount}</strong>{" "}
                  {newOwnedCount === 1 ? "copia" : "copias"}.
                </p>
              )}
            </div>
          </div>

          {newOwnedCount === null && (
            <>
              <div className="flex items-center justify-between rounded-lg border border-space-700 p-2">
                <span className="text-sm">Copias que quieres añadir</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="btn-secondary min-h-9 min-w-9 p-2"
                    aria-label="Restar una copia"
                    disabled={(quantity ?? 1) <= 1}
                    onClick={() => setQuantityInput(String(Math.max(1, (quantity ?? 1) - 1)))}
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    type="number"
                    min="1"
                    max={MAX_QUANTITY_PER_SCAN}
                    step="1"
                    inputMode="numeric"
                    aria-label="Cantidad de copias"
                    aria-invalid={quantity === null}
                    className="h-10 w-16 rounded-lg border border-space-600 bg-space-950 px-2 text-center font-semibold"
                    value={quantityInput}
                    onChange={(event) => {
                      const nextValue = event.currentTarget.value;
                      if (nextValue === "" || /^\d{1,2}$/.test(nextValue)) {
                        setQuantityInput(nextValue);
                      }
                    }}
                    onBlur={() => {
                      setQuantityInput(String(quantity ?? 1));
                    }}
                  />
                  <button
                    type="button"
                    className="btn-secondary min-h-9 min-w-9 p-2"
                    aria-label="Añadir una copia"
                    disabled={(quantity ?? 1) >= MAX_QUANTITY_PER_SCAN}
                    onClick={() =>
                      setQuantityInput(String(Math.min(MAX_QUANTITY_PER_SCAN, (quantity ?? 1) + 1)))
                    }
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {quantity === null && (
                <p role="alert" className="text-xs text-saber-red">
                  Introduce una cantidad entre 1 y {MAX_QUANTITY_PER_SCAN}.
                </p>
              )}

              <button
                type="button"
                className="btn-primary w-full"
                disabled={saving || quantity === null}
                onClick={() => void saveCard()}
              >
                {saving ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={18} />
                )}
                {saving
                  ? "Guardando…"
                  : quantity === null
                    ? "Indica una cantidad válida"
                    : `Añadir ${quantity} copia${quantity === 1 ? "" : "s"} a mi colección`}
              </button>
            </>
          )}

          <button
            type="button"
            className="btn-secondary w-full"
            disabled={saving}
            onClick={() => {
              resetResult();
              void openCamera();
            }}
          >
            <RotateCcw size={17} />
            {newOwnedCount === null ? "Volver a escanear" : "Escanear otra carta"}
          </button>
        </section>
      )}

      {error && (
        <div role="alert" className="card space-y-3 border-saber-red/50 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-saber-red" />
            <p>{error}</p>
          </div>
          {!busy && (
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => void openCamera()}
            >
              <RotateCcw size={17} />
              Intentar otra vez
            </button>
          )}
        </div>
      )}

      {message && (
        <div role="status" className="card flex items-start gap-2 border-saber-green/50 text-sm">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-saber-green" />
          <p>{message}</p>
        </div>
      )}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          handleImageFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          handleImageFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}

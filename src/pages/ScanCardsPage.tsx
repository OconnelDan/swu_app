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
  disposeCardScanner,
  recognizeCardCode,
  type CardCodeRecognition,
  type CardScanProgress
} from "@/lib/cardScanner";
import { tryGetCardImageUrl } from "@/lib/cardImageUrl";
import { SwUnlimitedDbCardProvider } from "@/providers/cardProvider/SwUnlimitedDbCardProvider";
import type { CardInfo } from "@/types/card";

const CARD_ASPECT_RATIO = 1100 / 1536;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

interface RecognizedCard {
  recognition: CardCodeRecognition;
  info: CardInfo;
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

export function ScanCardsPage() {
  const { mode, collection, addCollectionCard } = useDataSource();
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recognizedCard, setRecognizedCard] = useState<RecognizedCard | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [ownedBefore, setOwnedBefore] = useState(0);
  const [newOwnedCount, setNewOwnedCount] = useState<number | null>(null);
  const [scanProgress, setScanProgress] = useState<CardScanProgress>({
    status: "",
    progress: 0
  });

  const replacePreview = useCallback((nextUrl: string | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
  }, []);

  const stopCamera = useCallback(() => {
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
    setQuantity(1);
    setOwnedBefore(0);
    setNewOwnedCount(null);
    setScanProgress({ status: "", progress: 0 });
    replacePreview(null);
  }, [replacePreview]);

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
        const info = await new SwUnlimitedDbCardProvider().getCard(recognition.cardId);
        if (!info || info.cardId !== recognition.cardId) {
          throw new Error(
            `Se ha leído ${recognition.cardId}, pero no se ha podido confirmar en el catálogo. Vuelve a escanearla.`
          );
        }

        setOwnedBefore(
          collection?.cards.find((card) => card.cardId === info.cardId)?.ownedCount ?? 0
        );
        setRecognizedCard({ recognition, info });
      } catch (cause) {
        setError(getErrorMessage(cause, "No se ha podido reconocer la carta."));
      } finally {
        setBusy(false);
      }
    },
    [collection?.cards, replacePreview, resetResult]
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
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      setError(
        "No se ha podido abrir la cámara. Revisa el permiso del navegador o utiliza «Hacer una foto»."
      );
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setError("La cámara todavía se está preparando. Espera un instante.");
      return;
    }

    let sourceWidth = video.videoWidth;
    let sourceHeight = sourceWidth / CARD_ASPECT_RATIO;
    if (sourceHeight > video.videoHeight) {
      sourceHeight = video.videoHeight;
      sourceWidth = sourceHeight * CARD_ASPECT_RATIO;
    }

    const sourceX = (video.videoWidth - sourceWidth) / 2;
    const sourceY = (video.videoHeight - sourceHeight) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth));
    canvas.height = Math.max(1, Math.round(sourceHeight));
    const context = canvas.getContext("2d");

    if (!context) {
      setError("El navegador no permite capturar la imagen de la cámara.");
      return;
    }

    context.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("No se ha podido crear la fotografía.");
          return;
        }
        stopCamera();
        void analyzeImage(blob);
      },
      "image/jpeg",
      0.92
    );
  };

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
    if (!recognizedCard || mode !== "account") return;
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
    ? (recognizedCard.info.imageUrl ?? tryGetCardImageUrl(recognizedCard.info.cardId))
    : undefined;

  return (
    <div className="space-y-4">
      <section className="card space-y-2">
        <h2 className="font-display text-base">Añadir cartas con la cámara</h2>
        <p className="text-sm text-slate-300">
          Coloca una carta ocupando el marco. Leeremos la colección y el número de la parte
          inferior, confirmaremos el nombre y te enseñaremos el resultado antes de guardarlo.
        </p>
        <p className="text-xs text-slate-400">
          La fotografía se procesa en tu dispositivo y no se guarda en tu cuenta.
        </p>
      </section>

      {!cameraOpen && !busy && !recognizedCard && (
        <section className="card grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn-primary" onClick={() => void openCamera()}>
            <Camera size={18} />
            Abrir escáner
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
            <div className="pointer-events-none absolute inset-3 rounded-lg border-2 border-saber-blue shadow-[0_0_0_999px_rgba(0,0,0,0.2)]" />
            <p className="pointer-events-none absolute inset-x-4 bottom-5 rounded bg-black/70 px-2 py-1 text-center text-xs">
              Haz que los cuatro bordes de la carta queden dentro del marco
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-primary" onClick={captureFrame}>
              <Camera size={18} />
              Capturar
            </button>
            <button type="button" className="btn-secondary" onClick={stopCamera}>
              <X size={18} />
              Cancelar
            </button>
          </div>
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
                alt={recognizedCard.info.name ?? recognizedCard.info.cardId}
                className="h-32 w-auto rounded"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs text-slate-400">{recognizedCard.info.cardId}</p>
              <h3 className="font-semibold">
                {recognizedCard.info.name ?? "Carta sin nombre en el catálogo"}
              </h3>
              <p className="mt-2 text-sm">
                En tu colección antes del escaneo: <strong>{ownedBefore}</strong>
              </p>
              {newOwnedCount !== null && (
                <p className="text-sm text-saber-green">
                  Ahora tienes <strong>{newOwnedCount}</strong> copia(s).
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
                    disabled={quantity <= 1}
                    onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                  >
                    <Minus size={16} />
                  </button>
                  <strong className="min-w-5 text-center">{quantity}</strong>
                  <button
                    type="button"
                    className="btn-secondary min-h-9 min-w-9 p-2"
                    aria-label="Añadir una copia"
                    disabled={quantity >= 9}
                    onClick={() => setQuantity((current) => Math.min(9, current + 1))}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="btn-primary w-full"
                disabled={saving}
                onClick={() => void saveCard()}
              >
                {saving ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={18} />
                )}
                {saving
                  ? "Guardando…"
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

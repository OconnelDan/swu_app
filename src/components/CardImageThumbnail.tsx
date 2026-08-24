import { useEffect, useMemo, useState } from "react";

interface CardImageThumbnailProps {
  src: string;
  fallbackSrc?: string;
  alt?: string;
  className?: string;
  zoomOnClick?: boolean;
}

/**
 * Miniatura de carta con recuperación automática.
 *
 * La URL oficial se intenta primero. Si el CDN la rechaza o el dispositivo
 * conserva una ruta antigua, se prueba el espejo antes de ocultar la imagen.
 * Por compatibilidad, puede ampliarse durante 2 segundos. Las pantallas con
 * modal de detalles desactivan este comportamiento con `zoomOnClick={false}`.
 */
export function CardImageThumbnail({
  src,
  fallbackSrc,
  alt = "",
  className,
  zoomOnClick = true
}: CardImageThumbnailProps) {
  const [zoomed, setZoomed] = useState(false);
  const [broken, setBroken] = useState(false);
  const [sourceIndex, setSourceIndex] = useState(0);
  const sources = useMemo(
    () => [...new Set([src, fallbackSrc].filter((value): value is string => Boolean(value)))],
    [fallbackSrc, src]
  );
  const activeSrc = sources[sourceIndex];

  useEffect(() => {
    setSourceIndex(0);
    setBroken(false);
    setZoomed(false);
  }, [fallbackSrc, src]);

  useEffect(() => {
    if (!zoomed) return;
    const timer = setTimeout(() => setZoomed(false), 2000);
    return () => clearTimeout(timer);
  }, [zoomed]);

  if (broken || !activeSrc) return null;

  const handleError = () => {
    if (sourceIndex + 1 < sources.length) {
      setSourceIndex(sourceIndex + 1);
      return;
    }
    setBroken(true);
  };

  return (
    <>
      <img
        src={activeSrc}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        className={`${className ?? ""} ${zoomOnClick ? "cursor-zoom-in" : ""}`}
        onClick={zoomOnClick ? () => setZoomed(true) : undefined}
        onError={handleError}
      />
      {zoomed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setZoomed(false)}
          role="button"
          tabIndex={-1}
          aria-label="Cerrar vista ampliada de la carta"
        >
          <img
            src={activeSrc}
            alt={alt}
            referrerPolicy="no-referrer"
            className="max-h-[80vh] max-w-full rounded-lg shadow-xl"
          />
        </div>
      )}
    </>
  );
}

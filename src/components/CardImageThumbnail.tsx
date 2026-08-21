import { useEffect, useMemo, useState } from "react";

interface CardImageThumbnailProps {
  src: string;
  fallbackSrc?: string;
  alt?: string;
  className?: string;
}

/**
 * Miniatura de carta con recuperación automática.
 *
 * La URL oficial se intenta primero. Si el CDN la rechaza o el dispositivo
 * conserva una ruta antigua, se prueba el espejo antes de ocultar la imagen.
 * Al pulsarla (clic o toque) se amplía durante 2 segundos.
 */
export function CardImageThumbnail({
  src,
  fallbackSrc,
  alt = "",
  className
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
        className={`${className ?? ""} cursor-zoom-in`}
        onClick={() => setZoomed(true)}
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

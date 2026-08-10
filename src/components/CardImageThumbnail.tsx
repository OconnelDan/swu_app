import { useEffect, useState } from "react";

interface CardImageThumbnailProps {
  src: string;
  alt?: string;
  className?: string;
}

/** Miniatura de carta: al pulsarla (clic o toque) se amplía 2 segundos. */
export function CardImageThumbnail({ src, alt = "", className }: CardImageThumbnailProps) {
  const [zoomed, setZoomed] = useState(false);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (!zoomed) return;
    const timer = setTimeout(() => setZoomed(false), 2000);
    return () => clearTimeout(timer);
  }, [zoomed]);

  if (broken) return null;

  return (
    <>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={`${className ?? ""} cursor-zoom-in`}
        onClick={() => setZoomed(true)}
        onError={() => setBroken(true)}
      />
      {zoomed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setZoomed(false)}
          role="button"
          tabIndex={-1}
          aria-label="Cerrar vista ampliada de la carta"
        >
          <img src={src} alt={alt} className="max-h-[80vh] max-w-full rounded-lg shadow-xl" />
        </div>
      )}
    </>
  );
}

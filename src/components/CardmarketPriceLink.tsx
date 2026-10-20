import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { getCardmarketPrice, type CardmarketPrice } from "@/lib/cardmarketPrice";

const euroFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR"
});

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

function formattedDate(value: string): string | undefined {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : dateFormatter.format(date);
}

interface CardmarketPriceLinkProps {
  cardId: string;
  compact?: boolean;
}

export function CardmarketPriceLink({ cardId, compact = false }: CardmarketPriceLinkProps) {
  const [price, setPrice] = useState<CardmarketPrice | null>();

  useEffect(() => {
    let active = true;
    setPrice(undefined);

    void getCardmarketPrice(cardId)
      .then((result) => {
        if (active) setPrice(result ?? null);
      })
      .catch(() => {
        if (active) setPrice(null);
      });

    return () => {
      active = false;
    };
  }, [cardId]);

  if (price === undefined) {
    return <span className="text-xs text-slate-400">Consultando precio…</span>;
  }

  if (price === null) {
    return <span className="text-xs text-slate-400">Precio no disponible</span>;
  }

  const updatedAt = formattedDate(price.updatedAt);
  const priceLabel =
    price.lowPrice === null ? "Ver en Cardmarket" : `Desde ${euroFormatter.format(price.lowPrice)}`;

  return (
    <div className={compact ? "text-xs" : "rounded-lg border border-space-700 bg-space-950/60 p-3"}>
      {!compact && (
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Cardmarket
        </p>
      )}
      <a
        href={price.productUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-semibold text-saber-blue underline decoration-saber-blue/40 underline-offset-2 hover:text-blue-300"
        aria-label={`${priceLabel} en Cardmarket para ${cardId}`}
      >
        {priceLabel}
        <ExternalLink size={compact ? 12 : 14} aria-hidden="true" />
      </a>
      {!compact && (
        <p className="mt-1 text-xs text-slate-400">
          {price.lowPrice === null
            ? "Cardmarket todavía no publica un precio mínimo para esta impresión."
            : "Precio mínimo por copia normal; no incluye gastos de envío."}
          {updatedAt ? ` Actualizado el ${updatedAt}.` : ""}
        </p>
      )}
    </div>
  );
}

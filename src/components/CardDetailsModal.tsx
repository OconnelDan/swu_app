import { useEffect, useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { CardImageThumbnail } from "@/components/CardImageThumbnail";
import { tryGetCardImageUrl } from "@/lib/cardImageUrl";
import type { CardInfo } from "@/types/card";

const ASPECT_LABELS: Record<string, string> = {
  Aggression: "Agresividad",
  Command: "Mando",
  Cunning: "Astucia",
  Heroism: "Heroísmo",
  Vigilance: "Vigilancia",
  Villainy: "Villanía"
};

const TYPE_LABELS: Record<string, string> = {
  Base: "Base",
  Event: "Evento",
  Leader: "Líder",
  Token: "Ficha",
  Unit: "Unidad",
  Upgrade: "Mejora"
};

const RARITY_LABELS: Record<string, string> = {
  Common: "Común",
  Legendary: "Legendaria",
  Rare: "Rara",
  Special: "Especial",
  Uncommon: "Infrecuente"
};

const KEYWORD_LABELS: Record<string, string> = {
  Ambush: "Emboscada",
  Bounty: "Recompensa",
  Coordinate: "Coordinación",
  Exploit: "Explotar",
  Grit: "Tenacidad",
  Hidden: "Oculto",
  Overwhelm: "Formidable",
  Piloting: "Pilotaje",
  Raid: "Incursión",
  Restore: "Recuperación",
  Saboteur: "Sabotaje",
  Sentinel: "Centinela",
  Shielded: "Escudado",
  Smuggle: "Contrabando",
  Support: "Apoyo"
};

function displayName(card: CardInfo | undefined, cardId: string): string {
  return card?.localizedName ?? card?.name ?? cardId;
}

function listValue(values: string[] | undefined, labels?: Record<string, string>): string {
  if (!values?.length) return "—";
  return values.map((value) => labels?.[value] ?? value).join(", ");
}

function valueOrDash(value: string | number | undefined): string | number {
  return value ?? "—";
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-sm text-slate-100">{value}</dd>
    </div>
  );
}

interface CardDetailsModalProps {
  cardId: string;
  card?: CardInfo;
  imageUrl?: string;
  onClose: () => void;
  closeDisabled?: boolean;
  showImage?: boolean;
  children?: ReactNode;
}

/** Modal común de consulta. Los controles opcionales de cada pantalla se pasan como children. */
export function CardDetailsModal({
  cardId,
  card,
  imageUrl,
  onClose,
  closeDisabled = false,
  showImage = true,
  children
}: CardDetailsModalProps) {
  const titleId = useId();
  const name = displayName(card, cardId);
  const activeImageUrl = showImage
    ? (imageUrl ?? card?.imageUrl ?? tryGetCardImageUrl(cardId))
    : undefined;
  const rulesText = card?.localizedText ?? card?.text;

  useEffect(() => {
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !closeDisabled) onClose();
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [closeDisabled, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-3 sm:items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose();
      }}
    >
      <section className="card max-h-[92dvh] w-full max-w-5xl overflow-y-auto border-space-600 bg-space-900 shadow-2xl">
        <header className="sticky top-0 z-10 -mx-4 -mt-4 flex items-start justify-between gap-3 border-b border-space-700 bg-space-900/95 px-4 py-4 backdrop-blur sm:-mx-5 sm:-mt-5 sm:px-5">
          <div>
            <p className="font-mono text-xs text-slate-400">{cardId}</p>
            <h2 id={titleId} className="font-display text-lg">
              {name}
            </h2>
            {card?.localizedName && card.name && card.localizedName !== card.name && (
              <p className="mt-1 text-xs italic text-slate-400">{card.name}</p>
            )}
          </div>
          <button
            type="button"
            className="btn-secondary shrink-0 px-3"
            aria-label="Cerrar detalles de la carta"
            disabled={closeDisabled}
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>

        <div
          className={`mt-4 grid gap-5 ${showImage ? "md:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]" : ""}`}
        >
          {showImage && (
            <div>
              {activeImageUrl ? (
                <CardImageThumbnail
                  src={activeImageUrl}
                  fallbackSrc={tryGetCardImageUrl(cardId)}
                  alt={name}
                  className="mx-auto max-h-[65dvh] w-auto max-w-full rounded-lg shadow-xl md:max-h-[70dvh]"
                  zoomOnClick={false}
                />
              ) : (
                <div className="flex min-h-64 items-center justify-center rounded-lg bg-space-950 px-4 text-center text-sm text-slate-400">
                  No hay una imagen disponible para esta impresión.
                </div>
              )}
            </div>
          )}

          <div className="min-w-0">
            <section aria-label="Texto de la carta">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Texto
              </h3>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-200">
                {rulesText || "Esta carta no tiene texto de reglas."}
              </p>
            </section>

            <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
              <Detail label="Aspecto(s)" value={listValue(card?.aspects, ASPECT_LABELS)} />
              <Detail
                label="Tipo"
                value={valueOrDash(TYPE_LABELS[card?.type ?? ""] ?? card?.type)}
              />
              <Detail
                label="Campo de batalla"
                value={
                  card?.arena === "Ground"
                    ? "Terrestre"
                    : card?.arena === "Space"
                      ? "Espacial"
                      : "—"
                }
              />
              <Detail label="Palabra(s) clave" value={listValue(card?.keywords, KEYWORD_LABELS)} />
              <Detail label="Coste" value={valueOrDash(card?.cost)} />
              <Detail label="Rasgo(s)" value={listValue(card?.traits)} />
              <Detail label="Poder" value={valueOrDash(card?.power)} />
              <Detail
                label="Rareza"
                value={valueOrDash(RARITY_LABELS[card?.rarity ?? ""] ?? card?.rarity)}
              />
              <Detail label="PG" value={valueOrDash(card?.hp)} />
              <Detail label="Colección" value={card?.setName ?? card?.setCode ?? "—"} />
              <Detail label="Mejora de Poder" value={valueOrDash(card?.upgradePower)} />
              <Detail label="Número de carta" value={card?.cardNumber ?? "—"} />
              <Detail label="Mejora de PG" value={valueOrDash(card?.upgradeHp)} />
            </dl>

            {children && <div className="mt-5 border-t border-space-700 pt-5">{children}</div>}
          </div>
        </div>
      </section>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Minus, Search, X } from "lucide-react";
import { CardImageThumbnail } from "@/components/CardImageThumbnail";
import { SkeletonLines } from "@/components/Skeleton";
import { useDataSource } from "@/contexts/DataSourceContext";
import { useCollection } from "@/hooks/useCollection";
import { useFavorites } from "@/hooks/useFavorites";
import { useSettings } from "@/hooks/useSettings";
import { computeCardAllocations, getCardLocationStatus } from "@/lib/cardAllocation";
import { tryGetCardImageUrl } from "@/lib/cardImageUrl";
import { searchCards } from "@/lib/cardSearch";
import { SwUnlimitedDbCardProvider } from "@/providers/cardProvider/SwUnlimitedDbCardProvider";
import type { CardInfo } from "@/types/card";

interface CardCandidate {
  cardId: string;
  name?: string;
}

function displayName(info: CardInfo | undefined, fallback?: string): string {
  return info?.localizedName ?? info?.name ?? fallback ?? "Carta sin nombre en el catálogo";
}

/** Incluye el catálogo completo y conserva cualquier ID antiguo de colección o mazo. */
function buildCandidates(
  catalogCards: CardInfo[],
  collectionCards: { cardId: string; name?: string }[],
  favorites: { normalizedDeck: { allRequiredCards: { cardId: string }[] } }[],
  cardInfos: Map<string, CardInfo>
): CardCandidate[] {
  const candidates = new Map<string, CardCandidate>();

  for (const info of catalogCards) {
    candidates.set(info.cardId, {
      cardId: info.cardId,
      name: [info.localizedName, info.name].filter(Boolean).join(" ")
    });
  }
  for (const card of collectionCards) {
    if (!candidates.has(card.cardId)) {
      candidates.set(card.cardId, {
        cardId: card.cardId,
        name: card.name ?? displayName(cardInfos.get(card.cardId))
      });
    }
  }
  for (const favorite of favorites) {
    for (const card of favorite.normalizedDeck.allRequiredCards) {
      if (!candidates.has(card.cardId)) {
        candidates.set(card.cardId, {
          cardId: card.cardId,
          name: displayName(cardInfos.get(card.cardId))
        });
      }
    }
  }
  return [...candidates.values()];
}

export function CardFinderPage() {
  const [query, setQuery] = useState("");
  const [catalogCards, setCatalogCards] = useState<CardInfo[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const collection = useCollection();
  const favorites = useFavorites();
  const { settings } = useSettings();
  const { removeCollectionCard } = useDataSource();

  const allocations = useMemo(
    () => computeCardAllocations(collection?.cards ?? [], favorites ?? []),
    [collection?.cards, favorites]
  );

  useEffect(() => {
    let active = true;
    const provider = new SwUnlimitedDbCardProvider();
    void provider
      .getAllCards()
      .then((cards) => {
        if (active) setCatalogCards(cards);
      })
      .catch((cause) => {
        if (active) {
          setCatalogError(
            cause instanceof Error ? cause.message : "No se ha podido abrir el catálogo oficial."
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [selectedId]);

  const cardInfos = useMemo(
    () => new Map((catalogCards ?? []).map((card) => [card.cardId, card])),
    [catalogCards]
  );
  const candidates = useMemo(
    () => buildCandidates(catalogCards ?? [], collection?.cards ?? [], favorites ?? [], cardInfos),
    [cardInfos, catalogCards, collection?.cards, favorites]
  );
  const hasQuery = query.trim().length > 0;
  const results = useMemo(
    () => (hasQuery ? searchCards(candidates, query) : []),
    [candidates, hasQuery, query]
  );
  const selectedInfo = selectedId ? cardInfos.get(selectedId) : undefined;
  const selectedAllocation = selectedId ? allocations.get(selectedId) : undefined;

  const handleRemove = async () => {
    if (!selectedId || !selectedAllocation || selectedAllocation.ownedCount <= 0) return;

    if (selectedAllocation.freeCount <= 0 && selectedAllocation.allocations.length > 0) {
      const affected = selectedAllocation.allocations.at(-1)!;
      const confirmed = confirm(
        `No hay copias libres de «${displayName(selectedInfo, selectedId)}».\n\n` +
          `Si restas una copia, el mazo montado «${affected.favoriteName}» perderá una copia asignada y puede quedar incompleto.\n\n¿Quieres continuar?`
      );
      if (!confirmed) return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const ownedCount = await removeCollectionCard(selectedId, 1);
      setMessage(
        ownedCount > 0
          ? `Se ha restado una copia. Ahora tienes ${ownedCount}.`
          : "Se ha restado la última copia de tu colección."
      );
      setSelectedId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se ha podido restar la carta.");
    } finally {
      setBusy(false);
    }
  };

  if (collection === undefined || favorites === undefined || catalogCards === null) {
    if (catalogError) {
      return <p className="card border-saber-red/50 text-sm text-saber-red">{catalogError}</p>;
    }
    return <SkeletonLines count={5} />;
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-2">
        <h2 className="font-display text-base">Buscar una carta</h2>
        <p className="text-xs text-slate-400">
          Busca en todo el catálogo oficial. Pulsa una carta para ver dónde está usada y, si la
          posees, restar una copia de tu colección.
        </p>
        <label htmlFor="card-search" className="sr-only">
          Buscar carta
        </label>
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            id="card-search"
            type="text"
            className="w-full rounded-lg border border-space-600 bg-space-950 py-2 pl-9 pr-3 text-sm"
            placeholder="Nombre o código, por ejemplo ASH_001..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </section>

      {message && (
        <p role="status" className="card border-saber-green/50 text-sm text-saber-green">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="card border-saber-red/50 text-sm text-saber-red">
          {error}
        </p>
      )}

      {hasQuery && results.length === 0 && (
        <p className="card text-center text-sm text-slate-300">
          No se ha encontrado ninguna carta que coincida con tu búsqueda.
        </p>
      )}

      <ul className="space-y-2">
        {results.map((candidate) => {
          const allocation = allocations.get(candidate.cardId);
          const status = getCardLocationStatus(allocation);
          const info = cardInfos.get(candidate.cardId);
          const imageUrl = info?.imageUrl ?? tryGetCardImageUrl(candidate.cardId);
          return (
            <li key={candidate.cardId}>
              <button
                type="button"
                className="card w-full text-left transition-colors hover:border-saber-blue/70 hover:bg-space-800"
                onClick={() => {
                  setError(null);
                  setSelectedId(candidate.cardId);
                }}
              >
                <div className="flex items-start gap-3">
                  {settings.showImages && imageUrl && (
                    <CardImageThumbnail
                      src={imageUrl}
                      fallbackSrc={tryGetCardImageUrl(candidate.cardId)}
                      className="h-20 w-auto rounded"
                    />
                  )}
                  <div className="flex-1">
                    <p className="font-mono text-xs text-slate-400">{candidate.cardId}</p>
                    <p className="font-semibold">{displayName(info)}</p>
                    {status === "not_owned" ? (
                      <span className="badge-missing mt-1 inline-block">
                        No está en tu colección
                      </span>
                    ) : (
                      <p className="mt-1 text-sm">
                        Tienes <strong>{allocation!.ownedCount}</strong> copia(s), de las cuales{" "}
                        <strong
                          className={
                            allocation!.freeCount > 0 ? "text-saber-green" : "text-saber-red"
                          }
                        >
                          {allocation!.freeCount}
                        </strong>{" "}
                        libre(s).
                      </p>
                    )}
                    {allocation && allocation.allocations.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs text-slate-400">
                        {allocation.allocations.map((item) => (
                          <li key={item.favoriteId}>
                            {item.usedCount}x usada en «{item.favoriteName}»
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {selectedId && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="card-quantity-title"
        >
          <section className="card max-h-[90dvh] w-full max-w-md overflow-y-auto border-space-600 bg-space-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-slate-400">{selectedId}</p>
                <h2 id="card-quantity-title" className="font-display text-base">
                  {displayName(selectedInfo, selectedId)}
                </h2>
              </div>
              <button
                type="button"
                className="btn-secondary px-3"
                aria-label="Cerrar"
                disabled={busy}
                onClick={() => setSelectedId(null)}
              >
                <X size={17} />
              </button>
            </div>

            {settings.showImages && selectedInfo?.imageUrl && (
              <CardImageThumbnail
                src={selectedInfo.imageUrl}
                fallbackSrc={tryGetCardImageUrl(selectedId)}
                className="mx-auto mt-3 max-h-72 w-auto rounded-lg"
              />
            )}

            <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-space-950 p-2">
                <dt className="text-slate-400">Tienes</dt>
                <dd className="text-lg font-semibold">{selectedAllocation?.ownedCount ?? 0}</dd>
              </div>
              <div className="rounded-lg bg-space-950 p-2">
                <dt className="text-slate-400">Libres</dt>
                <dd className="text-lg font-semibold">{selectedAllocation?.freeCount ?? 0}</dd>
              </div>
              <div className="rounded-lg bg-space-950 p-2">
                <dt className="text-slate-400">En mazos</dt>
                <dd className="text-lg font-semibold">{selectedAllocation?.allocatedCount ?? 0}</dd>
              </div>
            </dl>

            {selectedAllocation && selectedAllocation.allocations.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-slate-300">
                {selectedAllocation.allocations.map((item) => (
                  <li key={item.favoriteId} className="rounded-lg bg-space-950 px-3 py-2">
                    {item.usedCount}x en el mazo montado «{item.favoriteName}»
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              className="btn-danger mt-4 w-full"
              disabled={busy || !selectedAllocation?.ownedCount}
              onClick={() => void handleRemove()}
            >
              <Minus size={16} /> {busy ? "Restando..." : "Restar una copia"}
            </button>
            {!selectedAllocation?.ownedCount && (
              <p className="mt-2 text-center text-xs text-slate-400">
                No puedes restarla porque no está en tu colección.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useCollection } from "@/hooks/useCollection";
import { useFavorites } from "@/hooks/useFavorites";
import { useSettings } from "@/hooks/useSettings";
import { computeCardAllocations, getCardLocationStatus } from "@/lib/cardAllocation";
import { tryGetCardImageUrl } from "@/lib/cardImageUrl";
import { searchCards } from "@/lib/cardSearch";
import { CardImageThumbnail } from "@/components/CardImageThumbnail";
import { SkeletonLines } from "@/components/Skeleton";
import { SwUnlimitedDbCardProvider } from "@/providers/cardProvider/SwUnlimitedDbCardProvider";
import type { CardInfo } from "@/types/card";

interface CardCandidate {
  cardId: string;
  name?: string;
}

/** Reúne todos los cardId conocidos: los de tu colección y los mazos guardados. */
function buildCandidates(
  collectionCards: { cardId: string; name?: string }[],
  favorites: {
    normalizedDeck: {
      allRequiredCards: { cardId: string }[];
    };
  }[],
  cardInfos: Map<string, CardInfo>
): CardCandidate[] {
  const candidates = new Map<string, CardCandidate>();

  for (const card of collectionCards) {
    candidates.set(card.cardId, {
      cardId: card.cardId,
      name: card.name ?? cardInfos.get(card.cardId)?.name
    });
  }

  for (const favorite of favorites) {
    for (const card of favorite.normalizedDeck.allRequiredCards) {
      if (!candidates.has(card.cardId)) {
        candidates.set(card.cardId, {
          cardId: card.cardId,
          name: cardInfos.get(card.cardId)?.name
        });
      }
    }
  }

  return [...candidates.values()];
}

export function CardFinderPage() {
  const [query, setQuery] = useState("");
  const [cardInfos, setCardInfos] = useState<Map<string, CardInfo>>(new Map());

  const collection = useCollection();
  const favorites = useFavorites();
  const { settings } = useSettings();

  const allocations = useMemo(
    () => computeCardAllocations(collection?.cards ?? [], favorites ?? []),
    [collection?.cards, favorites]
  );

  useEffect(() => {
    let active = true;
    const cardIds = new Set<string>();

    for (const card of collection?.cards ?? []) {
      cardIds.add(card.cardId);
    }

    for (const favorite of favorites ?? []) {
      for (const card of favorite.normalizedDeck.allRequiredCards) {
        cardIds.add(card.cardId);
      }
    }

    if (cardIds.size === 0) {
      setCardInfos(new Map());
      return;
    }

    const cardProvider = new SwUnlimitedDbCardProvider();

    void cardProvider
      .getCards([...cardIds])
      .then((infos) => {
        if (active) {
          setCardInfos(infos);
        }
      })
      .catch(() => {
        // La búsqueda local por código y nombre debe seguir disponible aunque
        // un proveedor remoto rechace un identificador o no haya conexión.
        if (active) {
          setCardInfos(new Map());
        }
      });

    return () => {
      active = false;
    };
  }, [collection?.cards, favorites]);

  const candidates = useMemo(
    () => buildCandidates(collection?.cards ?? [], favorites ?? [], cardInfos),
    [collection?.cards, favorites, cardInfos]
  );

  const hasQuery = query.trim().length > 0;

  const results = useMemo(
    () => (hasQuery ? searchCards(candidates, query) : []),
    [candidates, hasQuery, query]
  );

  if (collection === undefined || favorites === undefined) {
    return <SkeletonLines count={5} />;
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-2">
        <h2 className="font-display text-base">Buscar una carta</h2>

        <p className="text-xs text-slate-400">
          Busca por nombre, colección o código (p. ej. ASH_001, ASH 1 o ASH_256) para saber si
          tienes la carta libre, en qué mazo montado está usada, o si no la tienes en tu colección.
        </p>

        <label htmlFor="card-search" className="sr-only">
          Buscar carta
        </label>

        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
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
            <li key={candidate.cardId} className="card">
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

                  <p className="font-semibold">{candidate.name ?? "Carta sin nombre en caché"}</p>

                  {status === "not_owned" ? (
                    <span className="badge-missing mt-1 inline-block">No está en tu colección</span>
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
                      {allocation.allocations.map((allocationItem) => (
                        <li key={allocationItem.favoriteId}>
                          {allocationItem.usedCount}x usada en el mazo montado «
                          {allocationItem.favoriteName}»
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

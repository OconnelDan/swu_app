import { useEffect, useMemo, useState } from "react";
import { Filter, Minus, RotateCcw, Search } from "lucide-react";
import { CardDetailsModal } from "@/components/CardDetailsModal";
import { CardImageThumbnail } from "@/components/CardImageThumbnail";
import { PaginationControls } from "@/components/PaginationControls";
import { SkeletonLines } from "@/components/Skeleton";
import { useDataSource } from "@/contexts/DataSourceContext";
import { useCollection } from "@/hooks/useCollection";
import { useFavorites } from "@/hooks/useFavorites";
import { useSettings } from "@/hooks/useSettings";
import { computeCardAllocations, getCardLocationStatus } from "@/lib/cardAllocation";
import { tryGetCardImageUrl } from "@/lib/cardImageUrl";
import { matchesCardSearchQuery } from "@/lib/cardRulesSearch";
import { searchCards } from "@/lib/cardSearch";
import { SwUnlimitedDbCardProvider } from "@/providers/cardProvider/SwUnlimitedDbCardProvider";
import type { CardInfo } from "@/types/card";

interface CardCandidate {
  cardId: string;
  name?: string;
}

type OwnedFilter = "all" | "owned" | "free";
type CardTypeFilter = "ground-unit" | "space-unit" | "event" | "upgrade";

const SEARCH_PAGE_SIZE = 30;

const ASPECT_LABELS: Record<string, string> = {
  Aggression: "Agresividad",
  Command: "Mando",
  Cunning: "Astucia",
  Heroism: "Heroísmo",
  Vigilance: "Vigilancia",
  Villainy: "Villanía"
};

const CARD_TYPE_FILTERS: { value: CardTypeFilter; label: string }[] = [
  { value: "ground-unit", label: "Unidades terrestres" },
  { value: "space-unit", label: "Unidades espaciales" },
  { value: "event", label: "Eventos" },
  { value: "upgrade", label: "Mejoras" }
];

const RARITY_LABELS: Record<string, string> = {
  Common: "Común",
  Uncommon: "Infrecuente",
  Rare: "Rara",
  Legendary: "Legendaria",
  Special: "Especial"
};

function displayName(info: CardInfo | undefined, fallback?: string): string {
  return info?.localizedName ?? info?.name ?? fallback ?? "Carta sin nombre en el catálogo";
}

function toggleSelection<T extends string>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function getCardTypeFilter(card: CardInfo): CardTypeFilter | undefined {
  if (card.type === "Event") return "event";
  if (card.type === "Upgrade") return "upgrade";
  if (card.type !== "Unit") return undefined;
  if (card.arena === "Ground") return "ground-unit";
  if (card.arena === "Space") return "space-unit";
  return undefined;
}

function FilterChip({
  label,
  pressed,
  onClick,
  title
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={`min-h-9 rounded-full border px-3 py-1.5 text-xs transition ${
        pressed
          ? "border-saber-blue bg-saber-blue/20 text-saber-blue"
          : "border-space-600 bg-space-900 text-slate-300"
      }`}
      title={title}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** Conserva los alias históricos de código y añade la búsqueda avanzada del creador. */
function matchesFinderSearchQuery(
  candidate: CardCandidate,
  card: CardInfo | undefined,
  query: string
): boolean {
  const conditions = query
    .split("/")
    .map((condition) => condition.trim())
    .filter(Boolean);

  return conditions.every((condition) => {
    if (/^\d+$/.test(condition)) return card?.cost === Number(condition);
    if (card && matchesCardSearchQuery(card, condition)) return true;
    return searchCards([candidate], condition).length > 0;
  });
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
  const [selectedAspects, setSelectedAspects] = useState<string[]>([]);
  const [includeColorless, setIncludeColorless] = useState(true);
  const [selectedTypes, setSelectedTypes] = useState<CardTypeFilter[]>([]);
  const [selectedSetCodes, setSelectedSetCodes] = useState<string[]>([]);
  const [selectedRarities, setSelectedRarities] = useState<string[]>([]);
  const [maximumCost, setMaximumCost] = useState("all");
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>("all");
  const [resultPage, setResultPage] = useState(1);

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

  const cardInfos = useMemo(
    () => new Map((catalogCards ?? []).map((card) => [card.cardId, card])),
    [catalogCards]
  );
  const candidates = useMemo(
    () => buildCandidates(catalogCards ?? [], collection?.cards ?? [], favorites ?? [], cardInfos),
    [cardInfos, catalogCards, collection?.cards, favorites]
  );
  const setOptions = useMemo(
    () =>
      [...new Map((catalogCards ?? []).map((card) => [card.setCode, card.setName])).entries()].sort(
        ([left], [right]) => left.localeCompare(right)
      ),
    [catalogCards]
  );
  const rarityOptions = useMemo(
    () =>
      [
        ...new Set((catalogCards ?? []).map((card) => card.rarity).filter(Boolean) as string[])
      ].sort(
        (left, right) =>
          (Object.keys(RARITY_LABELS).indexOf(left) === -1
            ? Number.MAX_SAFE_INTEGER
            : Object.keys(RARITY_LABELS).indexOf(left)) -
            (Object.keys(RARITY_LABELS).indexOf(right) === -1
              ? Number.MAX_SAFE_INTEGER
              : Object.keys(RARITY_LABELS).indexOf(right)) || left.localeCompare(right, "es")
      ),
    [catalogCards]
  );
  const results = useMemo(
    () =>
      candidates
        .filter((candidate) => {
          const card = cardInfos.get(candidate.cardId);
          const cardAspects = card?.aspects ?? [];

          if (!includeColorless && cardAspects.length === 0) return false;
          if (selectedAspects.length > 0) {
            if (cardAspects.length === 0) {
              if (!includeColorless) return false;
            } else if (!cardAspects.some((aspect) => selectedAspects.includes(aspect))) {
              return false;
            }
          }
          if (
            selectedTypes.length > 0 &&
            (!card || !selectedTypes.includes(getCardTypeFilter(card) as CardTypeFilter))
          ) {
            return false;
          }
          const setCode = card?.setCode ?? candidate.cardId.split("_")[0];
          if (selectedSetCodes.length > 0 && !selectedSetCodes.includes(setCode)) return false;
          if (
            selectedRarities.length > 0 &&
            (!card?.rarity || !selectedRarities.includes(card.rarity))
          ) {
            return false;
          }
          if (maximumCost !== "all" && (card?.cost ?? Infinity) > Number(maximumCost)) return false;
          const allocation = allocations.get(candidate.cardId);
          if (ownedFilter === "owned" && !allocation?.ownedCount) return false;
          if (ownedFilter === "free" && !allocation?.freeCount) return false;
          if (!query.trim()) return true;
          return matchesFinderSearchQuery(candidate, card, query);
        })
        .sort((left, right) => {
          const leftCard = cardInfos.get(left.cardId);
          const rightCard = cardInfos.get(right.cardId);
          return (
            (leftCard?.cost ?? -1) - (rightCard?.cost ?? -1) ||
            displayName(leftCard, left.name).localeCompare(displayName(rightCard, right.name), "es")
          );
        }),
    [
      allocations,
      candidates,
      cardInfos,
      includeColorless,
      maximumCost,
      ownedFilter,
      query,
      selectedAspects,
      selectedRarities,
      selectedSetCodes,
      selectedTypes
    ]
  );
  useEffect(
    () => setResultPage(1),
    [
      includeColorless,
      maximumCost,
      ownedFilter,
      query,
      selectedAspects,
      selectedRarities,
      selectedSetCodes,
      selectedTypes
    ]
  );
  const resultPageCount = Math.max(1, Math.ceil(results.length / SEARCH_PAGE_SIZE));
  useEffect(() => {
    setResultPage((page) => Math.min(page, resultPageCount));
  }, [resultPageCount]);
  const firstResult = (resultPage - 1) * SEARCH_PAGE_SIZE;
  const visibleResults = results.slice(firstResult, firstResult + SEARCH_PAGE_SIZE);
  const selectedInfo = selectedId ? cardInfos.get(selectedId) : undefined;
  const selectedAllocation = selectedId ? allocations.get(selectedId) : undefined;

  const activeFilterCount =
    (selectedAspects.length > 0 ? 1 : 0) +
    (!includeColorless ? 1 : 0) +
    (selectedTypes.length > 0 ? 1 : 0) +
    (selectedSetCodes.length > 0 ? 1 : 0) +
    (selectedRarities.length > 0 ? 1 : 0) +
    (maximumCost !== "all" ? 1 : 0) +
    (ownedFilter !== "all" ? 1 : 0);

  const resetFilters = () => {
    setSelectedAspects([]);
    setIncludeColorless(true);
    setSelectedTypes([]);
    setSelectedSetCodes([]);
    setSelectedRarities([]);
    setMaximumCost("all");
    setOwnedFilter("all");
  };

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
          Busca en todo el catálogo oficial por nombre, código, texto, rasgo o palabra clave.
          Combina varias condiciones con <strong>/</strong>; un número aislado representa el coste
          exacto. Pulsa una carta para consultar su información y gestionar tu copia.
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
            placeholder="Busca y combina con / · un número indica el coste"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <details className="rounded-lg border border-space-700 bg-space-950/50 p-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
            <Filter size={15} /> Filtros
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-saber-blue/20 px-2 py-0.5 text-[11px] text-saber-blue">
                {activeFilterCount} activo(s)
              </span>
            )}
          </summary>

          <div className="mt-4 space-y-5">
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold text-slate-200">Aspectos</legend>
              <p className="text-[11px] text-slate-400">
                No hay aspectos automáticos: selecciona los que quieras combinar. Las incoloras se
                incluyen mientras su filtro esté activo.
              </p>
              <div className="flex flex-wrap gap-2">
                <FilterChip
                  label="Todos los aspectos"
                  pressed={selectedAspects.length === 0}
                  onClick={() => setSelectedAspects([])}
                />
                {Object.entries(ASPECT_LABELS).map(([value, label]) => (
                  <FilterChip
                    key={value}
                    label={label}
                    pressed={selectedAspects.includes(value)}
                    onClick={() => setSelectedAspects((current) => toggleSelection(current, value))}
                  />
                ))}
                <FilterChip
                  label="Incoloras"
                  pressed={includeColorless}
                  onClick={() => setIncludeColorless((current) => !current)}
                />
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold text-slate-200">Tipos</legend>
              <div className="flex flex-wrap gap-2">
                <FilterChip
                  label="Todos los tipos"
                  pressed={selectedTypes.length === 0}
                  onClick={() => setSelectedTypes([])}
                />
                {CARD_TYPE_FILTERS.map((option) => (
                  <FilterChip
                    key={option.value}
                    label={option.label}
                    pressed={selectedTypes.includes(option.value)}
                    onClick={() =>
                      setSelectedTypes((current) => toggleSelection(current, option.value))
                    }
                  />
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold text-slate-200">Colecciones</legend>
              <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto pr-1">
                <FilterChip
                  label="Todas"
                  pressed={selectedSetCodes.length === 0}
                  onClick={() => setSelectedSetCodes([])}
                />
                {setOptions.map(([code, setName]) => (
                  <FilterChip
                    key={code}
                    label={code}
                    title={setName ?? code}
                    pressed={selectedSetCodes.includes(code)}
                    onClick={() => setSelectedSetCodes((current) => toggleSelection(current, code))}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold text-slate-200">Rarezas</legend>
              <div className="flex flex-wrap gap-2">
                <FilterChip
                  label="Todas"
                  pressed={selectedRarities.length === 0}
                  onClick={() => setSelectedRarities([])}
                />
                {rarityOptions.map((value) => (
                  <FilterChip
                    key={value}
                    label={RARITY_LABELS[value] ?? value}
                    pressed={selectedRarities.includes(value)}
                    onClick={() =>
                      setSelectedRarities((current) => toggleSelection(current, value))
                    }
                  />
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <select
                aria-label="Coste máximo"
                value={maximumCost}
                onChange={(event) => setMaximumCost(event.target.value)}
              >
                <option value="all">Cualquier coste</option>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((value) => (
                  <option key={value} value={value}>
                    Coste máximo {value}
                  </option>
                ))}
              </select>
              <select
                aria-label="Disponibilidad en la colección"
                value={ownedFilter}
                onChange={(event) => setOwnedFilter(event.target.value as OwnedFilter)}
              >
                <option value="all">Poseídas y no poseídas</option>
                <option value="owned">Solo las que tengo</option>
                <option value="free">Solo copias libres</option>
              </select>
            </div>

            <button type="button" className="btn-secondary w-full" onClick={resetFilters}>
              <RotateCcw size={14} /> Restablecer filtros
            </button>
          </div>
        </details>
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

      {results.length === 0 && (
        <p className="card text-center text-sm text-slate-300">
          No se ha encontrado ninguna carta que coincida con tu búsqueda.
        </p>
      )}

      {results.length > 0 && (
        <p id="card-finder-results" className="scroll-mt-20 text-xs text-slate-400">
          {results.length} resultado(s) · mostrando {firstResult + 1}–
          {firstResult + visibleResults.length}
        </p>
      )}

      <ul className="space-y-2">
        {visibleResults.map((candidate) => {
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
                      zoomOnClick={false}
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

      <PaginationControls
        currentPage={resultPage}
        pageSize={SEARCH_PAGE_SIZE}
        totalItems={results.length}
        label="resultados de búsqueda"
        onPageChange={(page) => {
          setResultPage(page);
          requestAnimationFrame(() =>
            document.getElementById("card-finder-results")?.scrollIntoView({
              behavior: "smooth",
              block: "start"
            })
          );
        }}
      />

      {selectedId && (
        <CardDetailsModal
          cardId={selectedId}
          card={selectedInfo}
          imageUrl={selectedInfo?.imageUrl ?? tryGetCardImageUrl(selectedId)}
          closeDisabled={busy}
          showImage={settings.showImages}
          onClose={() => setSelectedId(null)}
        >
          <dl className="grid grid-cols-3 gap-2 text-center text-xs">
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
        </CardDetailsModal>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Filter,
  Minus,
  Plus,
  RotateCcw,
  Save,
  Search
} from "lucide-react";
import { CardImageThumbnail } from "@/components/CardImageThumbnail";
import { SkeletonLines } from "@/components/Skeleton";
import { useDataSource } from "@/contexts/DataSourceContext";
import { useCollection } from "@/hooks/useCollection";
import { useFavorites } from "@/hooks/useFavorites";
import { computeCardAllocations } from "@/lib/cardAllocation";
import { compareDeckWithCollection } from "@/lib/compareDeckWithCollection";
import {
  buildDeckJson,
  validateDeck,
  type DeckBuilderComposition,
  type DeckBuilderSubdeckComposition
} from "@/lib/deckBuilder";
import {
  buildCardLegalityIndex,
  DECK_FORMAT_DESCRIPTIONS,
  DECK_FORMAT_LABELS,
  DECK_FORMATS,
  getCardCopyLimit,
  getCardLegality,
  getMinimumMainDeckSize,
  getSideboardLimit
} from "@/lib/deckFormats";
import { tryGetCardImageUrl } from "@/lib/cardImageUrl";
import { normalizeDeckJson } from "@/lib/normalizeDeckJson";
import { matchesCardSearchQuery } from "@/lib/cardRulesSearch";
import { SwUnlimitedDbCardProvider } from "@/providers/cardProvider/SwUnlimitedDbCardProvider";
import type { CardInfo } from "@/types/card";
import type { DeckFormat, TrilogyCardPool } from "@/types/deck";

type BuilderTab = "leader" | "base" | "cards";
type OwnedFilter = "all" | "owned" | "free";
type CardTypeFilter = "ground-unit" | "space-unit" | "event" | "upgrade";

const ASPECT_LABELS: Record<string, string> = {
  Aggression: "Agresividad",
  Command: "Mando",
  Cunning: "Astucia",
  Heroism: "Heroísmo",
  Vigilance: "Vigilancia",
  Villainy: "Villanía"
};

const TYPE_LABELS: Record<string, string> = {
  Unit: "Unidad",
  Event: "Evento",
  Upgrade: "Mejora",
  Leader: "Líder",
  Base: "Base"
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

function emptyDeck(name: string): DeckBuilderSubdeckComposition {
  return { name, leaderIds: [], mainCounts: {}, sideboardCounts: {} };
}

function displayName(card: CardInfo | undefined, fallback = "Carta desconocida"): string {
  return card?.localizedName ?? card?.name ?? fallback;
}

function hasNoAspectPenalty(card: CardInfo, leaders: CardInfo[], base?: CardInfo): boolean {
  const available = new Map<string, number>();
  for (const aspect of [
    ...leaders.flatMap((leader) => leader.aspects ?? []),
    ...(base?.aspects ?? [])
  ]) {
    available.set(aspect, (available.get(aspect) ?? 0) + 1);
  }
  const needed = new Map<string, number>();
  for (const aspect of card.aspects ?? []) needed.set(aspect, (needed.get(aspect) ?? 0) + 1);
  return [...needed].every(([aspect, count]) => count <= (available.get(aspect) ?? 0));
}

function totalCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((total, count) => total + Math.max(count, 0), 0);
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

function QuantityButton({
  label,
  onClick,
  disabled,
  children
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-space-600 bg-space-800 text-slate-100 disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function FormatChoice({
  choosingTrilogy,
  onChoose,
  onChooseTrilogy,
  onCancelTrilogy
}: {
  choosingTrilogy: boolean;
  onChoose: (format: DeckFormat, pool?: TrilogyCardPool) => void;
  onChooseTrilogy: () => void;
  onCancelTrilogy: () => void;
}) {
  if (choosingTrilogy) {
    return (
      <div className="space-y-4">
        <button type="button" className="text-xs text-slate-400" onClick={onCancelTrilogy}>
          <ArrowLeft size={14} className="inline" /> Volver a formatos
        </button>
        <section className="card space-y-2">
          <h1 className="font-display text-xl">¿Qué reserva de cartas usará Trilogy?</h1>
          <p className="text-sm text-slate-400">
            Trilogy no tiene una legalidad independiente. Sus tres mazos deben usar Premier o
            Eternal.
          </p>
        </section>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["premier", "eternal"] as TrilogyCardPool[]).map((pool) => (
            <button
              key={pool}
              type="button"
              className="card min-h-36 text-left transition hover:border-saber-blue"
              onClick={() => onChoose("trilogy", pool)}
            >
              <span className="font-display text-lg">Trilogy · {DECK_FORMAT_LABELS[pool]}</span>
              <span className="mt-2 block text-sm text-slate-400">
                {pool === "premier"
                  ? "Los tres mazos respetarán la rotación Premier vigente."
                  : "Los tres mazos admitirán todas las colecciones salvo cartas inhabilitadas en Eternal."}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link to="/favoritos" className="inline-flex items-center gap-1 text-xs text-slate-400">
        <ArrowLeft size={14} /> Volver a Mazos
      </Link>
      <section className="card space-y-2">
        <h1 className="font-display text-xl">Elige el formato del nuevo mazo</h1>
        <p className="text-sm text-slate-400">
          La pantalla y las validaciones se adaptarán automáticamente a sus reglas oficiales.
        </p>
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        {DECK_FORMATS.map((format) => (
          <button
            key={format}
            type="button"
            className="card min-h-40 text-left transition hover:border-saber-blue"
            onClick={() => (format === "trilogy" ? onChooseTrilogy() : onChoose(format))}
          >
            <span className="font-display text-lg">{DECK_FORMAT_LABELS[format]}</span>
            <span className="mt-2 block text-sm text-slate-400">
              {DECK_FORMAT_DESCRIPTIONS[format]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function DeckBuilderPage() {
  const navigate = useNavigate();
  const collection = useCollection();
  const favorites = useFavorites();
  const { saveFavoriteDeck } = useDataSource();
  const [allCards, setAllCards] = useState<CardInfo[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [format, setFormat] = useState<DeckFormat | null>(null);
  const [choosingTrilogy, setChoosingTrilogy] = useState(false);
  const [trilogyCardPool, setTrilogyCardPool] = useState<TrilogyCardPool>("premier");
  const [name, setName] = useState("");
  const [decks, setDecks] = useState<DeckBuilderSubdeckComposition[]>([]);
  const [activeDeckIndex, setActiveDeckIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<BuilderTab>("leader");
  const [query, setQuery] = useState("");
  const [manualAspects, setManualAspects] = useState<string[] | null>(null);
  const [includeColorless, setIncludeColorless] = useState(true);
  const [selectedTypes, setSelectedTypes] = useState<CardTypeFilter[]>([]);
  const [selectedSetCodes, setSelectedSetCodes] = useState<string[]>([]);
  const [selectedRarities, setSelectedRarities] = useState<string[]>([]);
  const [maximumCost, setMaximumCost] = useState("all");
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetFilters = () => {
    setManualAspects(null);
    setIncludeColorless(true);
    setSelectedTypes([]);
    setSelectedSetCodes([]);
    setSelectedRarities([]);
    setMaximumCost("all");
    setOwnedFilter("all");
  };

  useEffect(() => {
    let active = true;
    const provider = new SwUnlimitedDbCardProvider();
    void provider
      .getAllCards()
      .then((cards) => {
        if (active) setAllCards(cards);
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

  const initializeFormat = (nextFormat: DeckFormat, pool: TrilogyCardPool = "premier") => {
    setFormat(nextFormat);
    setTrilogyCardPool(pool);
    setName(
      nextFormat === "trilogy"
        ? `Mi conjunto Trilogy ${DECK_FORMAT_LABELS[pool]}`
        : `Mi mazo ${DECK_FORMAT_LABELS[nextFormat]}`
    );
    setDecks(
      nextFormat === "trilogy"
        ? [emptyDeck("Mazo 1"), emptyDeck("Mazo 2"), emptyDeck("Mazo 3")]
        : [emptyDeck("Mazo")]
    );
    setActiveDeckIndex(0);
    setActiveTab("leader");
    setQuery("");
    resetFilters();
    setChoosingTrilogy(false);
    setError(null);
  };

  const resetFormat = () => {
    const hasCards = decks.some(
      (deck) =>
        (deck.leaderIds?.length ?? 0) > 0 ||
        Boolean(deck.baseId) ||
        totalCounts(deck.mainCounts) > 0 ||
        totalCounts(deck.sideboardCounts) > 0
    );
    if (hasCards && !confirm("Cambiar de formato descartará la composición actual. ¿Continuar?")) {
      return;
    }
    setFormat(null);
    setDecks([]);
    setName("");
    setQuery("");
    resetFilters();
    setChoosingTrilogy(false);
  };

  const cardsById = useMemo(
    () => new Map((allCards ?? []).map((card) => [card.cardId, card])),
    [allCards]
  );
  const legalityIndex = useMemo(() => buildCardLegalityIndex(allCards ?? []), [allCards]);
  const allocations = useMemo(
    () => computeCardAllocations(collection?.cards ?? [], favorites ?? []),
    [collection?.cards, favorites]
  );
  const currentDeck = decks[activeDeckIndex] ?? emptyDeck("Mazo");
  const leaderIds = currentDeck.leaderIds ?? [];
  const leaders = leaderIds
    .map((leaderId) => cardsById.get(leaderId))
    .filter((card): card is CardInfo => Boolean(card));
  const base = currentDeck.baseId ? cardsById.get(currentDeck.baseId) : undefined;
  const requiredLeaderCount = format === "twin-suns" ? 2 : 1;
  const automaticAspects = [
    ...new Set([...leaders.flatMap((leader) => leader.aspects ?? []), ...(base?.aspects ?? [])])
  ];
  const automaticAspectReady = leaders.length === requiredLeaderCount && Boolean(base);
  const sideboardLimit = format ? getSideboardLimit(format) : 0;
  const minimumMainCount = format ? getMinimumMainDeckSize(format, base) : 50;
  const currentMainCount = totalCounts(currentDeck.mainCounts);
  const currentSideboardCount = totalCounts(currentDeck.sideboardCounts);

  const composition = useMemo<DeckBuilderComposition>(
    () => ({
      ...currentDeck,
      name,
      format: format ?? "premier",
      trilogyCardPool,
      trilogyDecks: format === "trilogy" ? decks : undefined
    }),
    [currentDeck, decks, format, name, trilogyCardPool]
  );
  const validation = useMemo(
    () => validateDeck(composition, cardsById, legalityIndex),
    [cardsById, composition, legalityIndex]
  );

  const selectedCopiesByKey = useMemo(() => {
    const counts = new Map<string, number>();
    const relevantDecks = format === "trilogy" ? decks : [currentDeck];
    for (const deck of relevantDecks) {
      for (const zone of [deck.mainCounts, deck.sideboardCounts]) {
        for (const [cardId, count] of Object.entries(zone)) {
          const key = cardsById.get(cardId)?.cardKey ?? cardId;
          counts.set(key, (counts.get(key) ?? 0) + count);
        }
      }
    }
    return counts;
  }, [cardsById, currentDeck, decks, format]);

  const deckStatistics = useMemo(() => {
    const types = new Map<string, number>();
    const costs = new Map<number, number>();
    for (const [cardId, count] of Object.entries(currentDeck.mainCounts)) {
      if (count <= 0) continue;
      const card = cardsById.get(cardId);
      const cardType = card?.type ?? "Otra";
      types.set(cardType, (types.get(cardType) ?? 0) + count);
      if (card?.cost !== undefined) costs.set(card.cost, (costs.get(card.cost) ?? 0) + count);
    }
    return {
      types: [...types.entries()].sort(([left], [right]) => left.localeCompare(right)),
      costs: [...costs.entries()].sort(([left], [right]) => left - right)
    };
  }, [cardsById, currentDeck.mainCounts]);

  const setOptions = useMemo(
    () =>
      [...new Map((allCards ?? []).map((card) => [card.setCode, card.setName])).entries()].sort(
        ([left], [right]) => left.localeCompare(right)
      ),
    [allCards]
  );
  const rarityOptions = useMemo(
    () =>
      [...new Set((allCards ?? []).map((card) => card.rarity).filter(Boolean) as string[])].sort(
        (left, right) =>
          (Object.keys(RARITY_LABELS).indexOf(left) === -1
            ? Number.MAX_SAFE_INTEGER
            : Object.keys(RARITY_LABELS).indexOf(left)) -
            (Object.keys(RARITY_LABELS).indexOf(right) === -1
              ? Number.MAX_SAFE_INTEGER
              : Object.keys(RARITY_LABELS).indexOf(right)) || left.localeCompare(right, "es")
      ),
    [allCards]
  );

  const roleConflictReason = (card: CardInfo): string | undefined => {
    if (format !== "trilogy" || (activeTab !== "leader" && activeTab !== "base")) return undefined;
    const cardKey = card.cardKey ?? card.cardId;
    const usedElsewhere = decks.some((deck, index) => {
      if (index === activeDeckIndex) return false;
      const roleIds =
        activeTab === "leader" ? (deck.leaderIds ?? []) : deck.baseId ? [deck.baseId] : [];
      return roleIds.some((cardId) => (cardsById.get(cardId)?.cardKey ?? cardId) === cardKey);
    });
    return usedElsewhere
      ? `Esta ${activeTab === "leader" ? "identidad de líder" : "base"} ya se utiliza en otro mazo de Trilogy.`
      : undefined;
  };

  const cardSelectionReason = (card: CardInfo): string | undefined => {
    if (!format) return undefined;
    const legality = getCardLegality(card, format, legalityIndex, trilogyCardPool);
    return legality.legal ? roleConflictReason(card) : legality.reason;
  };

  const filteredCards = useMemo(() => {
    const hasQuery = query.trim().length > 0;
    return (allCards ?? [])
      .filter((card) => {
        if (activeTab === "leader" && card.type !== "Leader") return false;
        if (activeTab === "base" && card.type !== "Base") return false;
        if (activeTab === "cards" && !["Unit", "Event", "Upgrade"].includes(card.type ?? "")) {
          return false;
        }
        if (
          activeTab === "cards" &&
          selectedTypes.length > 0 &&
          !selectedTypes.includes(getCardTypeFilter(card) as CardTypeFilter)
        ) {
          return false;
        }
        if (activeTab === "cards") {
          const cardAspects = card.aspects ?? [];
          if (cardAspects.length === 0) {
            if (!includeColorless) return false;
          } else if (manualAspects !== null) {
            if (!cardAspects.some((item) => manualAspects.includes(item))) return false;
          } else if (automaticAspectReady && !hasNoAspectPenalty(card, leaders, base)) {
            return false;
          }
        }
        if (selectedSetCodes.length > 0 && !selectedSetCodes.includes(card.setCode)) return false;
        if (
          selectedRarities.length > 0 &&
          (!card.rarity || !selectedRarities.includes(card.rarity))
        ) {
          return false;
        }
        if (maximumCost !== "all" && (card.cost ?? Infinity) > Number(maximumCost)) return false;
        const allocation = allocations.get(card.cardId);
        if (ownedFilter === "owned" && !allocation?.ownedCount) return false;
        if (ownedFilter === "free" && !allocation?.freeCount) return false;
        if (!hasQuery) return true;
        return matchesCardSearchQuery(card, query);
      })
      .sort(
        (left, right) =>
          (left.cost ?? -1) - (right.cost ?? -1) ||
          displayName(left).localeCompare(displayName(right), "es")
      );
  }, [
    activeTab,
    allCards,
    allocations,
    automaticAspectReady,
    base,
    includeColorless,
    leaders,
    manualAspects,
    maximumCost,
    ownedFilter,
    query,
    selectedRarities,
    selectedSetCodes,
    selectedTypes
  ]);

  const activeFilterCount =
    (manualAspects !== null ? 1 : 0) +
    (!includeColorless ? 1 : 0) +
    (selectedTypes.length > 0 ? 1 : 0) +
    (selectedSetCodes.length > 0 ? 1 : 0) +
    (selectedRarities.length > 0 ? 1 : 0) +
    (maximumCost !== "all" ? 1 : 0) +
    (ownedFilter !== "all" ? 1 : 0);

  const updateCurrentDeck = (
    updater: (current: DeckBuilderSubdeckComposition) => DeckBuilderSubdeckComposition
  ) => {
    setDecks((current) =>
      current.map((deck, index) => (index === activeDeckIndex ? updater(deck) : deck))
    );
  };

  const changeCount = (zone: "main" | "sideboard", cardId: string, delta: number) => {
    if (!format) return;
    const card = cardsById.get(cardId);
    if (!card || cardSelectionReason(card)) return;
    const copyKey = card.cardKey ?? cardId;
    const limit = getCardCopyLimit(format, card);
    if (delta > 0 && (selectedCopiesByKey.get(copyKey) ?? 0) >= limit) return;
    if (delta > 0 && zone === "sideboard" && currentSideboardCount >= sideboardLimit) return;

    updateCurrentDeck((current) => {
      const key = zone === "main" ? "mainCounts" : "sideboardCounts";
      const counts = current[key];
      const nextCount = Math.max(0, Math.min(99, (counts[cardId] ?? 0) + delta));
      const nextCounts = { ...counts };
      if (nextCount === 0) delete nextCounts[cardId];
      else nextCounts[cardId] = nextCount;
      return { ...current, [key]: nextCounts };
    });
  };

  const selectCard = (card: CardInfo) => {
    if (!format || cardSelectionReason(card)) return;
    if (activeTab === "leader") {
      updateCurrentDeck((current) => {
        const selected = current.leaderIds ?? [];
        if (format === "twin-suns") {
          const next = selected.includes(card.cardId)
            ? selected.filter((cardId) => cardId !== card.cardId)
            : selected.length < 2
              ? [...selected, card.cardId]
              : selected;
          if (next.length === 2) setActiveTab("base");
          return { ...current, leaderIds: next };
        }
        setActiveTab("base");
        return { ...current, leaderIds: [card.cardId] };
      });
      return;
    }
    if (activeTab === "base") {
      updateCurrentDeck((current) => ({ ...current, baseId: card.cardId }));
      setActiveTab("cards");
      return;
    }
    changeCount("main", card.cardId, 1);
  };

  const handleSave = async () => {
    if (!validation.valid || !collection || !favorites) return;
    setBusy(true);
    setError(null);
    try {
      const normalizedDeck = normalizeDeckJson(buildDeckJson(composition));
      const result = compareDeckWithCollection(
        normalizedDeck,
        collection.cards,
        cardsById,
        allocations
      );
      await saveFavoriteDeck(normalizedDeck, result);
      navigate("/favoritos");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se ha podido guardar el mazo.");
    } finally {
      setBusy(false);
    }
  };

  if (!format) {
    return (
      <FormatChoice
        choosingTrilogy={choosingTrilogy}
        onChoose={initializeFormat}
        onChooseTrilogy={() => setChoosingTrilogy(true)}
        onCancelTrilogy={() => setChoosingTrilogy(false)}
      />
    );
  }
  if (collection === undefined || favorites === undefined || allCards === null) {
    if (catalogError) {
      return <p className="card border-saber-red/50 text-sm text-saber-red">{catalogError}</p>;
    }
    return <SkeletonLines count={7} />;
  }

  const shownCards = filteredCards.slice(0, 80);
  const selectedMain = Object.entries(currentDeck.mainCounts).filter(([, count]) => count > 0);
  const selectedSideboard = Object.entries(currentDeck.sideboardCounts).filter(
    ([, count]) => count > 0
  );
  const formatLabel =
    format === "trilogy"
      ? `Trilogy · ${DECK_FORMAT_LABELS[trilogyCardPool]}`
      : DECK_FORMAT_LABELS[format];

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <Link
            to="/favoritos"
            className="mb-2 inline-flex items-center gap-1 text-xs text-slate-400"
          >
            <ArrowLeft size={14} /> Volver a Mazos
          </Link>
          <h1 className="font-display text-lg">Crear mazo · {formatLabel}</h1>
          <p className="text-xs text-slate-400">
            Se guardará en Favoritos y no reservará cartas hasta que lo montes.
          </p>
        </div>
        <button type="button" className="btn-secondary shrink-0" onClick={resetFormat}>
          <RotateCcw size={14} /> Cambiar
        </button>
      </header>

      <section className="card space-y-2">
        <label htmlFor="deck-name" className="text-sm font-semibold">
          {format === "trilogy" ? "Nombre del conjunto Trilogy" : "Nombre del mazo"}
        </label>
        <input
          id="deck-name"
          className="w-full rounded-lg border border-space-600 bg-space-950 px-3 py-2 text-sm"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
        />
      </section>

      {format === "trilogy" && (
        <section className="card space-y-3">
          <div>
            <h2 className="font-display text-base">Tres mazos del conjunto</h2>
            <p className="text-xs text-slate-400">
              Los límites de copias, líderes y bases se calculan sumando los tres.
            </p>
          </div>
          <nav className="grid grid-cols-3 gap-2" aria-label="Mazo de Trilogy que estás editando">
            {decks.map((deck, index) => {
              const deckBase = deck.baseId ? cardsById.get(deck.baseId) : undefined;
              const minimum = getMinimumMainDeckSize("trilogy", deckBase);
              return (
                <button
                  key={index}
                  type="button"
                  className={activeDeckIndex === index ? "btn-primary px-2" : "btn-secondary px-2"}
                  onClick={() => {
                    setActiveDeckIndex(index);
                    setActiveTab("leader");
                  }}
                >
                  Mazo {index + 1} · {totalCounts(deck.mainCounts)}/{minimum}
                </button>
              );
            })}
          </nav>
          <label className="text-xs text-slate-300">
            Nombre interno del mazo {activeDeckIndex + 1}
            <input
              className="mt-1 w-full rounded-lg border border-space-600 bg-space-950 px-3 py-2 text-sm"
              value={currentDeck.name ?? `Mazo ${activeDeckIndex + 1}`}
              maxLength={80}
              onChange={(event) =>
                updateCurrentDeck((current) => ({ ...current, name: event.target.value }))
              }
            />
          </label>
        </section>
      )}

      <section className="card space-y-3">
        <nav aria-label="Zona que estás construyendo" className="grid grid-cols-3 gap-1">
          {(
            [
              [
                "leader",
                `1. ${requiredLeaderCount === 1 ? "Líder" : "Líderes"} ${leaderIds.length}/${requiredLeaderCount}`
              ],
              ["base", `2. Base${base ? " ✓" : ""}`],
              ["cards", `3. Cartas ${currentMainCount}/${minimumMainCount}`]
            ] as [BuilderTab, string][]
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? "btn-primary px-2" : "btn-secondary px-2"}
              onClick={() => setActiveTab(tab)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            aria-label="Buscar en el catálogo"
            className="w-full rounded-lg border border-space-600 bg-space-950 py-2 pl-9 pr-3 text-sm"
            placeholder="Busca y combina con / · un número indica el coste"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <details className="rounded-lg border border-space-700 bg-space-950/50 p-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
            <Filter size={15} /> Filtros
            {activeTab === "cards" && manualAspects === null && automaticAspectReady && (
              <span className="rounded-full bg-saber-green/15 px-2 py-0.5 text-[11px] text-saber-green">
                Aspectos automáticos
              </span>
            )}
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-saber-blue/20 px-2 py-0.5 text-[11px] text-saber-blue">
                {activeFilterCount} activo(s)
              </span>
            )}
          </summary>
          <div className="mt-4 space-y-5">
            <fieldset className="space-y-2" disabled={activeTab !== "cards"}>
              <legend className="text-xs font-semibold text-slate-200">Aspectos</legend>
              <p className="text-[11px] text-slate-400">
                {manualAspects === null
                  ? automaticAspectReady
                    ? `Automático: ${automaticAspects.map((item) => ASPECT_LABELS[item] ?? item).join(" · ") || "sin aspectos"}${includeColorless ? " + incoloras" : ""}.`
                    : "El filtro automático se aplicará al completar el líder y la base."
                  : `Manual: ${manualAspects.map((item) => ASPECT_LABELS[item] ?? item).join(" · ") || "ningún aspecto"}${includeColorless ? " + incoloras" : ""}.`}
              </p>
              <div className="flex flex-wrap gap-2">
                <FilterChip
                  label="Líder + base (automático)"
                  pressed={manualAspects === null}
                  onClick={() => setManualAspects(null)}
                />
                {Object.entries(ASPECT_LABELS).map(([value, label]) => (
                  <FilterChip
                    key={value}
                    label={label}
                    pressed={manualAspects?.includes(value) ?? false}
                    onClick={() =>
                      setManualAspects((current) =>
                        current === null ? [value] : toggleSelection(current, value)
                      )
                    }
                  />
                ))}
                <FilterChip
                  label="Incoloras"
                  pressed={includeColorless}
                  onClick={() => setIncludeColorless((current) => !current)}
                />
              </div>
            </fieldset>

            <fieldset className="space-y-2" disabled={activeTab !== "cards"}>
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
              <select value={maximumCost} onChange={(event) => setMaximumCost(event.target.value)}>
                <option value="all">Cualquier coste</option>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((value) => (
                  <option key={value} value={value}>
                    Coste máximo {value}
                  </option>
                ))}
              </select>
              <select
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

        <p className="text-xs text-slate-400">
          {filteredCards.length} resultado(s)
          {filteredCards.length > shownCards.length
            ? ` · mostrando los primeros ${shownCards.length}`
            : ""}
        </p>

        <ul className="grid gap-2 sm:grid-cols-2">
          {shownCards.map((card) => {
            const allocation = allocations.get(card.cardId);
            const mainCount = currentDeck.mainCounts[card.cardId] ?? 0;
            const sideCount = currentDeck.sideboardCounts[card.cardId] ?? 0;
            const selected = leaderIds.includes(card.cardId) || card.cardId === currentDeck.baseId;
            const selectedCopies = selectedCopiesByKey.get(card.cardKey ?? card.cardId) ?? 0;
            const copyLimit = getCardCopyLimit(format, card);
            const copyLimitReached = selectedCopies >= copyLimit;
            const blockedReason = cardSelectionReason(card);
            return (
              <li
                key={card.cardId}
                className={`rounded-xl border p-3 ${blockedReason ? "border-saber-red/40 bg-space-950 opacity-75" : selected ? "border-saber-blue bg-space-800" : "border-space-700 bg-space-900"}`}
              >
                <div className="flex gap-3">
                  {card.imageUrl && (
                    <div className="shrink-0">
                      <CardImageThumbnail
                        src={card.imageUrl}
                        fallbackSrc={tryGetCardImageUrl(card.cardId)}
                        alt={displayName(card)}
                        className="h-28 w-auto rounded"
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] text-slate-400">{card.cardId}</p>
                    <p className="text-sm font-semibold leading-tight">{displayName(card)}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {TYPE_LABELS[card.type ?? ""] ?? card.type ?? "Carta"}
                      {card.cost !== undefined ? ` · Coste ${card.cost}` : ""}
                      {card.arena ? ` · ${card.arena === "Ground" ? "Terrestre" : "Espacial"}` : ""}
                    </p>
                    <p className="mt-1 text-xs">
                      Tienes <strong>{allocation?.ownedCount ?? 0}</strong> · libres{" "}
                      <strong
                        className={
                          (allocation?.freeCount ?? 0) > 0 ? "text-saber-green" : "text-saber-red"
                        }
                      >
                        {allocation?.freeCount ?? 0}
                      </strong>
                    </p>
                    {(card.aspects?.length ?? 0) > 0 && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        {card.aspects!.map((item) => ASPECT_LABELS[item] ?? item).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>

                {blockedReason && (
                  <p className="mt-2 flex items-start gap-1 text-xs text-saber-red">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {blockedReason}
                  </p>
                )}

                {activeTab === "leader" || activeTab === "base" ? (
                  <button
                    type="button"
                    className="btn-secondary mt-2 w-full"
                    disabled={Boolean(blockedReason)}
                    onClick={() => selectCard(card)}
                  >
                    {selected ? <CheckCircle2 size={15} /> : <Plus size={15} />}
                    {format === "twin-suns" && activeTab === "leader" && selected
                      ? "Quitar selección"
                      : selected
                        ? "Seleccionada"
                        : "Elegir"}
                  </button>
                ) : (
                  <div
                    className={`mt-2 grid ${sideboardLimit > 0 ? "grid-cols-2" : "grid-cols-1"} gap-2 text-xs`}
                  >
                    <div className="rounded-lg bg-space-950 p-2 text-center">
                      <p className="mb-1 text-slate-400">Mazo · máximo {copyLimit}</p>
                      <div className="flex items-center justify-center gap-2">
                        <QuantityButton
                          label={`Restar ${displayName(card)} del mazo`}
                          disabled={mainCount === 0}
                          onClick={() => changeCount("main", card.cardId, -1)}
                        >
                          <Minus size={14} />
                        </QuantityButton>
                        <strong className="min-w-4">{mainCount}</strong>
                        <QuantityButton
                          label={`Añadir ${displayName(card)} al mazo`}
                          disabled={Boolean(blockedReason) || copyLimitReached}
                          onClick={() => changeCount("main", card.cardId, 1)}
                        >
                          <Plus size={14} />
                        </QuantityButton>
                      </div>
                    </div>
                    {sideboardLimit > 0 && (
                      <div className="rounded-lg bg-space-950 p-2 text-center">
                        <p className="mb-1 text-slate-400">Banquillo</p>
                        <div className="flex items-center justify-center gap-2">
                          <QuantityButton
                            label={`Restar ${displayName(card)} del banquillo`}
                            disabled={sideCount === 0}
                            onClick={() => changeCount("sideboard", card.cardId, -1)}
                          >
                            <Minus size={14} />
                          </QuantityButton>
                          <strong className="min-w-4">{sideCount}</strong>
                          <QuantityButton
                            label={`Añadir ${displayName(card)} al banquillo`}
                            disabled={
                              Boolean(blockedReason) ||
                              copyLimitReached ||
                              currentSideboardCount >= sideboardLimit
                            }
                            onClick={() => changeCount("sideboard", card.cardId, 1)}
                          >
                            <Plus size={14} />
                          </QuantityButton>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-base">
          {format === "trilogy" ? `Lista del mazo ${activeDeckIndex + 1}` : "Lista del mazo"}
        </h2>
        <dl
          className={`grid ${sideboardLimit > 0 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"} gap-2 text-xs`}
        >
          <div>
            <dt className="text-slate-400">{requiredLeaderCount === 1 ? "Líder" : "Líderes"}</dt>
            <dd className="font-semibold">
              {leaders.length
                ? leaders.map((leader) => displayName(leader)).join(" · ")
                : "Sin elegir"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Base</dt>
            <dd className="font-semibold">{displayName(base, "Sin elegir")}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Mazo</dt>
            <dd className="font-semibold">
              {currentMainCount}/{minimumMainCount}
            </dd>
          </div>
          {sideboardLimit > 0 && (
            <div>
              <dt className="text-slate-400">Banquillo</dt>
              <dd className="font-semibold">
                {currentSideboardCount}/{sideboardLimit}
              </dd>
            </div>
          )}
        </dl>

        {currentMainCount > 0 && (
          <div className="grid gap-2 rounded-lg bg-space-950 p-3 text-xs sm:grid-cols-2">
            <p>
              <span className="text-slate-400">Tipos: </span>
              {deckStatistics.types
                .map(([cardType, count]) => `${TYPE_LABELS[cardType] ?? cardType} ${count}`)
                .join(" · ")}
            </p>
            <p>
              <span className="text-slate-400">Curva de coste: </span>
              {deckStatistics.costs.map(([cost, count]) => `${cost}: ${count}`).join(" · ") ||
                "sin costes publicados"}
            </p>
          </div>
        )}

        {selectedMain.length > 0 && (
          <div>
            <h3 className="mb-1 text-sm font-semibold">Mazo principal</h3>
            <ul className="space-y-1 text-xs">
              {selectedMain
                .sort(([left], [right]) =>
                  displayName(cardsById.get(left)).localeCompare(
                    displayName(cardsById.get(right)),
                    "es"
                  )
                )
                .map(([cardId, count]) => (
                  <li
                    key={cardId}
                    className="flex items-center justify-between gap-2 rounded-lg bg-space-950 px-3 py-2"
                  >
                    <span>
                      <strong>{count}x</strong> {displayName(cardsById.get(cardId), cardId)}
                    </span>
                    <QuantityButton
                      label={`Restar ${displayName(cardsById.get(cardId), cardId)}`}
                      onClick={() => changeCount("main", cardId, -1)}
                    >
                      <Minus size={14} />
                    </QuantityButton>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {sideboardLimit > 0 && selectedSideboard.length > 0 && (
          <div>
            <h3 className="mb-1 text-sm font-semibold">Banquillo</h3>
            <ul className="space-y-1 text-xs">
              {selectedSideboard.map(([cardId, count]) => (
                <li
                  key={cardId}
                  className="flex items-center justify-between gap-2 rounded-lg bg-space-950 px-3 py-2"
                >
                  <span>
                    <strong>{count}x</strong> {displayName(cardsById.get(cardId), cardId)}
                  </span>
                  <QuantityButton
                    label={`Restar ${displayName(cardsById.get(cardId), cardId)} del banquillo`}
                    onClick={() => changeCount("sideboard", cardId, -1)}
                  >
                    <Minus size={14} />
                  </QuantityButton>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card space-y-2">
        <h2 className="font-display text-base">Validación {formatLabel}</h2>
        {validation.valid ? (
          <p className="flex items-center gap-2 text-sm text-saber-green">
            <CheckCircle2 size={17} /> La estructura y la legalidad del mazo son válidas.
          </p>
        ) : (
          <ul className="space-y-1 text-sm text-saber-red">
            {validation.errors.map((message, index) => (
              <li key={`${message}-${index}`}>• {message}</li>
            ))}
          </ul>
        )}
        {validation.warnings.map((message) => (
          <p key={message} className="flex items-start gap-2 text-xs text-saber-yellow">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {message}
          </p>
        ))}
        <p className="text-xs text-slate-500">
          Se comprueban tamaño modificado por la base, líderes, base, copias, aspectos, rotación y
          cartas inhabilitadas. La penalización de aspecto solo genera un aviso.
        </p>
      </section>

      {error && (
        <p role="alert" className="card border-saber-red/50 text-sm text-saber-red">
          {error}
        </p>
      )}

      <button
        type="button"
        className="btn-primary w-full"
        disabled={busy || !validation.valid}
        onClick={() => void handleSave()}
      >
        <Save size={16} /> {busy ? "Guardando..." : "Guardar en Favoritos"}
      </button>
    </div>
  );
}

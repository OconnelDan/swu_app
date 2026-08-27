import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Filter,
  Minus,
  MoveRight,
  Plus,
  RotateCcw,
  Save,
  Search
} from "lucide-react";
import { CardImageThumbnail } from "@/components/CardImageThumbnail";
import { CardDetailsModal } from "@/components/CardDetailsModal";
import { PaginationControls } from "@/components/PaginationControls";
import { SkeletonLines } from "@/components/Skeleton";
import { useDataSource } from "@/contexts/DataSourceContext";
import { useCollection } from "@/hooks/useCollection";
import { useFavorites } from "@/hooks/useFavorites";
import { useAuth } from "@/hooks/useAuth";
import { computeCardAllocations } from "@/lib/cardAllocation";
import { compareCardsByCollection, compareSetCodesByRelease } from "@/lib/cardCollectionOrder";
import { compareDeckWithCollection } from "@/lib/compareDeckWithCollection";
import {
  clearDeckBuilderDraft,
  loadDeckBuilderDraft,
  saveDeckBuilderDraft,
  type DeckBuilderDraft
} from "@/lib/deckBuilderDraft";
import {
  buildDeckJson,
  compositionFromNormalizedDeck,
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
type CardSort = "cost" | "collection";

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

const CARD_PAGE_SIZE = 80;

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

function BuilderCardItem({
  card,
  ownedCount,
  freeCount,
  blockedReason,
  selected = false,
  onOpenDetails,
  children
}: {
  card: CardInfo;
  ownedCount: number;
  freeCount: number;
  blockedReason?: string;
  selected?: boolean;
  onOpenDetails: () => void;
  children: ReactNode;
}) {
  return (
    <li
      className={`rounded-xl border p-3 ${
        blockedReason
          ? "border-saber-red/40 bg-space-950"
          : selected
            ? "border-saber-blue bg-space-800"
            : "border-space-700 bg-space-900"
      }`}
    >
      <div className="flex gap-3">
        {(card.imageUrl ?? tryGetCardImageUrl(card.cardId)) && (
          <button
            type="button"
            className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saber-blue"
            aria-label={`Ver detalles de ${displayName(card)}`}
            onClick={onOpenDetails}
          >
            <CardImageThumbnail
              src={card.imageUrl ?? tryGetCardImageUrl(card.cardId)!}
              fallbackSrc={tryGetCardImageUrl(card.cardId)}
              alt={displayName(card)}
              className="h-28 w-auto rounded"
              zoomOnClick={false}
            />
          </button>
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
            Tienes <strong>{ownedCount}</strong> · libres{" "}
            <strong className={freeCount > 0 ? "text-saber-green" : "text-saber-red"}>
              {freeCount}
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

      {children}
    </li>
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
        <ArrowLeft size={14} /> Salir al listado de mazos
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
  const { favoriteId } = useParams<{ favoriteId: string }>();
  const collection = useCollection();
  const favorites = useFavorites();
  const { session, loading: authLoading } = useAuth();
  const { saveFavoriteDeck, updateFavoriteDeck } = useDataSource();
  const draftScope = session?.user.id ?? "guest";
  const draftTargetKey = `${draftScope}:${favoriteId ?? "new"}`;
  const latestDraftRef = useRef<DeckBuilderDraft | null>(null);
  const currentDraftStateRef = useRef<DeckBuilderDraft | null>(null);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const skipNextAutosaveRef = useRef(false);
  const skipNextPageResetRef = useRef(false);
  const ignoreDraftWritesRef = useRef(false);
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
  const [cardPage, setCardPage] = useState(1);
  const [selectedCardPage, setSelectedCardPage] = useState(1);
  const [cardSorts, setCardSorts] = useState<CardSort[]>(["cost"]);
  const [selectedCardsExpanded, setSelectedCardsExpanded] = useState(true);
  const [availableCardsExpanded, setAvailableCardsExpanded] = useState(true);
  const [sideboardMoveQuantities, setSideboardMoveQuantities] = useState<Record<string, string>>(
    {}
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailsCard, setDetailsCard] = useState<CardInfo | null>(null);
  const [initializedDraftKey, setInitializedDraftKey] = useState<string | null>(null);
  const [recoveredDraft, setRecoveredDraft] = useState(false);
  const [autoSavedAt, setAutoSavedAt] = useState<string | null>(null);
  const [autoSaveError, setAutoSaveError] = useState(false);
  const editingFavorite = favoriteId
    ? favorites?.find((favorite) => favorite.id === favoriteId)
    : undefined;

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

  useEffect(() => {
    if (authLoading || favorites === undefined || initializedDraftKey === draftTargetKey) return;
    if (favoriteId && !editingFavorite) return;

    ignoreDraftWritesRef.current = false;
    const draft = loadDeckBuilderDraft(draftScope, favoriteId);
    if (draft) {
      setFormat(draft.format);
      setTrilogyCardPool(draft.trilogyCardPool);
      setName(draft.name);
      setDecks(draft.decks);
      setActiveDeckIndex(Math.min(draft.activeDeckIndex, draft.decks.length - 1));
      setActiveTab(draft.activeTab);
      setQuery(draft.query);
      setManualAspects(draft.manualAspects);
      setIncludeColorless(draft.includeColorless);
      setSelectedTypes(draft.selectedTypes);
      setSelectedSetCodes(draft.selectedSetCodes);
      setSelectedRarities(draft.selectedRarities);
      setMaximumCost(draft.maximumCost);
      setOwnedFilter(draft.ownedFilter);
      setCardPage(draft.cardPage);
      setSelectedCardPage(draft.selectedCardPage ?? 1);
      setCardSorts(draft.cardSorts ?? ["cost"]);
      setSelectedCardsExpanded(draft.selectedCardsExpanded ?? true);
      setAvailableCardsExpanded(draft.availableCardsExpanded ?? true);
      setSideboardMoveQuantities({});
      setRecoveredDraft(true);
      setAutoSavedAt(draft.savedAt);
      setAutoSaveError(false);
      latestDraftRef.current = draft;
      pendingScrollRestoreRef.current = draft.scrollY ?? 0;
      if (!saveDeckBuilderDraft(draftScope, favoriteId, draft)) setAutoSaveError(true);
      skipNextAutosaveRef.current = true;
      skipNextPageResetRef.current = true;
    } else if (editingFavorite) {
      const saved = compositionFromNormalizedDeck(editingFavorite.normalizedDeck);
      const savedFormat = saved.format ?? "premier";
      setFormat(savedFormat);
      setTrilogyCardPool(saved.trilogyCardPool ?? "premier");
      setName(saved.name);
      setDecks(
        savedFormat === "trilogy"
          ? (saved.trilogyDecks ?? [emptyDeck("Mazo 1"), emptyDeck("Mazo 2"), emptyDeck("Mazo 3")])
          : [
              {
                name: saved.name,
                leaderIds: saved.leaderIds ?? [],
                baseId: saved.baseId,
                mainCounts: saved.mainCounts,
                sideboardCounts: saved.sideboardCounts
              }
            ]
      );
      setActiveDeckIndex(0);
      setActiveTab("cards");
      setQuery("");
      setManualAspects(null);
      setIncludeColorless(true);
      setSelectedTypes([]);
      setSelectedSetCodes([]);
      setSelectedRarities([]);
      setMaximumCost("all");
      setOwnedFilter("all");
      setCardPage(1);
      setSelectedCardPage(1);
      setCardSorts(["cost"]);
      setSelectedCardsExpanded(true);
      setAvailableCardsExpanded(true);
      setSideboardMoveQuantities({});
      setRecoveredDraft(false);
      setAutoSavedAt(null);
      setAutoSaveError(false);
      latestDraftRef.current = null;
      pendingScrollRestoreRef.current = null;
      skipNextAutosaveRef.current = true;
      skipNextPageResetRef.current = true;
    } else {
      setFormat(null);
      setChoosingTrilogy(false);
      setTrilogyCardPool("premier");
      setName("");
      setDecks([]);
      setActiveDeckIndex(0);
      setActiveTab("leader");
      setQuery("");
      setManualAspects(null);
      setIncludeColorless(true);
      setSelectedTypes([]);
      setSelectedSetCodes([]);
      setSelectedRarities([]);
      setMaximumCost("all");
      setOwnedFilter("all");
      setCardPage(1);
      setSelectedCardPage(1);
      setCardSorts(["cost"]);
      setSelectedCardsExpanded(true);
      setAvailableCardsExpanded(true);
      setSideboardMoveQuantities({});
      setRecoveredDraft(false);
      setAutoSavedAt(null);
      setAutoSaveError(false);
      latestDraftRef.current = null;
      pendingScrollRestoreRef.current = null;
      skipNextAutosaveRef.current = false;
      skipNextPageResetRef.current = false;
    }
    setError(null);
    setInitializedDraftKey(draftTargetKey);
  }, [
    authLoading,
    draftScope,
    draftTargetKey,
    editingFavorite,
    favoriteId,
    favorites,
    initializedDraftKey
  ]);

  useLayoutEffect(() => {
    if (initializedDraftKey !== draftTargetKey || !format || ignoreDraftWritesRef.current) {
      currentDraftStateRef.current = null;
      return;
    }

    currentDraftStateRef.current = {
      version: 1,
      savedAt: latestDraftRef.current?.savedAt ?? new Date().toISOString(),
      sourceFavoriteUpdatedAt: editingFavorite?.updatedAt,
      format,
      trilogyCardPool,
      name,
      decks,
      activeDeckIndex,
      activeTab,
      query,
      manualAspects,
      includeColorless,
      selectedTypes,
      selectedSetCodes,
      selectedRarities,
      maximumCost,
      ownedFilter,
      cardPage,
      selectedCardPage,
      cardSorts,
      selectedCardsExpanded,
      availableCardsExpanded,
      scrollY: window.scrollY
    };
  }, [
    activeDeckIndex,
    activeTab,
    availableCardsExpanded,
    cardPage,
    cardSorts,
    decks,
    draftTargetKey,
    editingFavorite?.updatedAt,
    format,
    includeColorless,
    initializedDraftKey,
    manualAspects,
    maximumCost,
    name,
    ownedFilter,
    query,
    selectedCardPage,
    selectedCardsExpanded,
    selectedRarities,
    selectedSetCodes,
    selectedTypes,
    trilogyCardPool
  ]);

  useEffect(() => {
    if (initializedDraftKey !== draftTargetKey) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }
    if (!format || ignoreDraftWritesRef.current) {
      latestDraftRef.current = null;
      return;
    }

    const draft: DeckBuilderDraft = {
      version: 1,
      savedAt: new Date().toISOString(),
      sourceFavoriteUpdatedAt: editingFavorite?.updatedAt,
      format,
      trilogyCardPool,
      name,
      decks,
      activeDeckIndex,
      activeTab,
      query,
      manualAspects,
      includeColorless,
      selectedTypes,
      selectedSetCodes,
      selectedRarities,
      maximumCost,
      ownedFilter,
      cardPage,
      selectedCardPage,
      cardSorts,
      selectedCardsExpanded,
      availableCardsExpanded,
      scrollY: window.scrollY
    };
    latestDraftRef.current = draft;
    if (saveDeckBuilderDraft(draftScope, favoriteId, draft)) {
      setAutoSavedAt(draft.savedAt);
      setAutoSaveError(false);
    } else {
      setAutoSaveError(true);
    }
  }, [
    activeDeckIndex,
    activeTab,
    availableCardsExpanded,
    cardPage,
    cardSorts,
    decks,
    draftScope,
    draftTargetKey,
    editingFavorite?.updatedAt,
    favoriteId,
    format,
    includeColorless,
    initializedDraftKey,
    manualAspects,
    maximumCost,
    name,
    ownedFilter,
    query,
    selectedCardPage,
    selectedCardsExpanded,
    selectedRarities,
    selectedSetCodes,
    selectedTypes,
    trilogyCardPool
  ]);

  useEffect(() => {
    const saveBeforeLeaving = () => {
      if (!currentDraftStateRef.current || ignoreDraftWritesRef.current) return;
      const draft = {
        ...currentDraftStateRef.current,
        savedAt: new Date().toISOString(),
        scrollY: pendingScrollRestoreRef.current ?? window.scrollY
      };
      latestDraftRef.current = draft;
      saveDeckBuilderDraft(draftScope, favoriteId, draft);
    };
    window.addEventListener("pagehide", saveBeforeLeaving);
    return () => {
      window.removeEventListener("pagehide", saveBeforeLeaving);
      saveBeforeLeaving();
    };
  }, [draftScope, favoriteId]);

  useEffect(() => {
    if (
      initializedDraftKey !== draftTargetKey ||
      pendingScrollRestoreRef.current === null ||
      !format ||
      allCards === null
    ) {
      return;
    }

    const scrollY = pendingScrollRestoreRef.current;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        window.scrollTo({ top: scrollY });
        pendingScrollRestoreRef.current = null;
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [allCards, draftTargetKey, format, initializedDraftKey]);

  const initializeFormat = (nextFormat: DeckFormat, pool: TrilogyCardPool = "premier") => {
    ignoreDraftWritesRef.current = false;
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
    setCardPage(1);
    setSelectedCardPage(1);
    setCardSorts(["cost"]);
    setSelectedCardsExpanded(true);
    setAvailableCardsExpanded(true);
    setSideboardMoveQuantities({});
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
    ignoreDraftWritesRef.current = true;
    latestDraftRef.current = null;
    currentDraftStateRef.current = null;
    pendingScrollRestoreRef.current = null;
    clearDeckBuilderDraft(draftScope, favoriteId);
    setFormat(null);
    setDecks([]);
    setName("");
    setQuery("");
    resetFilters();
    setCardPage(1);
    setSelectedCardPage(1);
    setCardSorts(["cost"]);
    setSelectedCardsExpanded(true);
    setAvailableCardsExpanded(true);
    setSideboardMoveQuantities({});
    setChoosingTrilogy(false);
    setRecoveredDraft(false);
    setAutoSavedAt(null);
    setAutoSaveError(false);
    ignoreDraftWritesRef.current = false;
  };

  const discardRecoveredDraft = () => {
    if (!confirm("Se descartarán los cambios recuperados y no se podrán deshacer. ¿Continuar?")) {
      return;
    }

    ignoreDraftWritesRef.current = true;
    latestDraftRef.current = null;
    currentDraftStateRef.current = null;
    pendingScrollRestoreRef.current = null;
    clearDeckBuilderDraft(draftScope, favoriteId);
    setRecoveredDraft(false);
    setAutoSavedAt(null);
    setAutoSaveError(false);
    setError(null);

    if (editingFavorite) {
      const saved = compositionFromNormalizedDeck(editingFavorite.normalizedDeck);
      const savedFormat = saved.format ?? "premier";
      setFormat(savedFormat);
      setTrilogyCardPool(saved.trilogyCardPool ?? "premier");
      setName(saved.name);
      setDecks(
        savedFormat === "trilogy"
          ? (saved.trilogyDecks ?? [emptyDeck("Mazo 1"), emptyDeck("Mazo 2"), emptyDeck("Mazo 3")])
          : [
              {
                name: saved.name,
                leaderIds: saved.leaderIds ?? [],
                baseId: saved.baseId,
                mainCounts: saved.mainCounts,
                sideboardCounts: saved.sideboardCounts
              }
            ]
      );
      setActiveDeckIndex(0);
      setActiveTab("cards");
      setQuery("");
      setManualAspects(null);
      setIncludeColorless(true);
      setSelectedTypes([]);
      setSelectedSetCodes([]);
      setSelectedRarities([]);
      setMaximumCost("all");
      setOwnedFilter("all");
      setCardPage(1);
      setSelectedCardPage(1);
      setCardSorts(["cost"]);
      setSelectedCardsExpanded(true);
      setAvailableCardsExpanded(true);
      setSideboardMoveQuantities({});
      skipNextAutosaveRef.current = true;
      skipNextPageResetRef.current = true;
    } else {
      setFormat(null);
      setChoosingTrilogy(false);
      setTrilogyCardPool("premier");
      setName("");
      setDecks([]);
      setActiveDeckIndex(0);
      setActiveTab("leader");
      setQuery("");
      setManualAspects(null);
      setIncludeColorless(true);
      setSelectedTypes([]);
      setSelectedSetCodes([]);
      setSelectedRarities([]);
      setMaximumCost("all");
      setOwnedFilter("all");
      setCardPage(1);
      setSelectedCardPage(1);
      setCardSorts(["cost"]);
      setSelectedCardsExpanded(true);
      setAvailableCardsExpanded(true);
      setSideboardMoveQuantities({});
    }

    ignoreDraftWritesRef.current = false;
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
  const storedLeaderIds = currentDeck.leaderIds;
  const leaderIds = useMemo(() => storedLeaderIds ?? [], [storedLeaderIds]);
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
        ([left], [right]) => compareSetCodesByRelease(left, right)
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

  const compareCardOrder = useCallback(
    (left: CardInfo, right: CardInfo) => {
      if (cardSorts.includes("cost")) {
        const byCost =
          (left.cost ?? Number.MAX_SAFE_INTEGER) - (right.cost ?? Number.MAX_SAFE_INTEGER);
        if (byCost !== 0) return byCost;
      }
      if (cardSorts.includes("collection")) {
        const byCollection = compareCardsByCollection(left, right);
        if (byCollection !== 0) return byCollection;
      }
      return displayName(left).localeCompare(displayName(right), "es", {
        numeric: true,
        sensitivity: "base"
      });
    },
    [cardSorts]
  );

  const cardMatchesFilters = useCallback(
    (card: CardInfo) => {
      const hasQuery = query.trim().length > 0;
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
      return !hasQuery || matchesCardSearchQuery(card, query);
    },
    [
      activeTab,
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
    ]
  );

  const selectedRegularCardIds = useMemo(
    () =>
      new Set([
        ...Object.entries(currentDeck.mainCounts)
          .filter(([, count]) => count > 0)
          .map(([cardId]) => cardId),
        ...Object.entries(currentDeck.sideboardCounts)
          .filter(([, count]) => count > 0)
          .map(([cardId]) => cardId)
      ]),
    [currentDeck.mainCounts, currentDeck.sideboardCounts]
  );

  const filteredCards = useMemo(() => {
    const matchingCards = (allCards ?? []).filter(cardMatchesFilters).sort(compareCardOrder);
    if (activeTab === "cards") {
      return matchingCards.filter((card) => !selectedRegularCardIds.has(card.cardId));
    }

    const pinnedIds =
      activeTab === "leader" ? leaderIds : currentDeck.baseId ? [currentDeck.baseId] : [];
    const pinnedCards = pinnedIds
      .map((cardId) => cardsById.get(cardId))
      .filter((card): card is CardInfo => Boolean(card));
    const pinnedSet = new Set(pinnedCards.map((card) => card.cardId));
    return [...pinnedCards, ...matchingCards.filter((card) => !pinnedSet.has(card.cardId))];
  }, [
    activeTab,
    allCards,
    cardMatchesFilters,
    cardsById,
    compareCardOrder,
    currentDeck.baseId,
    leaderIds,
    selectedRegularCardIds
  ]);

  const filteredSelectedCards = useMemo(
    () =>
      [...selectedRegularCardIds]
        .map((cardId) => cardsById.get(cardId))
        .filter((card): card is CardInfo => Boolean(card))
        .filter(cardMatchesFilters)
        .sort(compareCardOrder),
    [cardMatchesFilters, cardsById, compareCardOrder, selectedRegularCardIds]
  );

  useEffect(() => {
    if (initializedDraftKey !== draftTargetKey) return;
    if (skipNextPageResetRef.current) {
      skipNextPageResetRef.current = false;
      return;
    }
    setCardPage(1);
    setSelectedCardPage(1);
  }, [
    activeDeckIndex,
    activeTab,
    cardSorts,
    draftTargetKey,
    includeColorless,
    initializedDraftKey,
    manualAspects,
    maximumCost,
    ownedFilter,
    query,
    selectedRarities,
    selectedSetCodes,
    selectedTypes
  ]);

  const cardPageCount = Math.max(1, Math.ceil(filteredCards.length / CARD_PAGE_SIZE));
  useEffect(() => {
    setCardPage((page) => Math.min(page, cardPageCount));
  }, [cardPageCount]);

  const selectedCardPageCount = Math.max(
    1,
    Math.ceil(filteredSelectedCards.length / CARD_PAGE_SIZE)
  );
  useEffect(() => {
    setSelectedCardPage((page) => Math.min(page, selectedCardPageCount));
  }, [selectedCardPageCount]);

  const activeFilterCount =
    (manualAspects !== null ? 1 : 0) +
    (!includeColorless ? 1 : 0) +
    (selectedTypes.length > 0 ? 1 : 0) +
    (selectedSetCodes.length > 0 ? 1 : 0) +
    (selectedRarities.length > 0 ? 1 : 0) +
    (maximumCost !== "all" ? 1 : 0) +
    (ownedFilter !== "all" ? 1 : 0);

  const toggleCardSort = (sort: CardSort) => {
    setCardSorts((current) => {
      if (!current.includes(sort)) return [...current, sort];
      return current.length === 1 ? current : current.filter((item) => item !== sort);
    });
  };

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
    if (!card || (delta > 0 && cardSelectionReason(card))) return;
    const copyKey = card.cardKey ?? cardId;
    const limit = getCardCopyLimit(format, card);
    if (delta > 0 && (selectedCopiesByKey.get(copyKey) ?? 0) >= limit) return;
    if (delta > 0 && zone === "sideboard" && currentSideboardCount >= sideboardLimit) return;
    if (delta > 0 && currentMainCount + currentSideboardCount === 0) {
      setSelectedCardsExpanded(true);
      setSelectedCardPage(1);
    }

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

  const moveMainCopiesToSideboard = (cardId: string) => {
    if (sideboardLimit <= 0) return;
    const requested = Number.parseInt(sideboardMoveQuantities[cardId] ?? "1", 10);
    if (!Number.isFinite(requested) || requested < 1) return;

    updateCurrentDeck((current) => {
      const mainCount = current.mainCounts[cardId] ?? 0;
      const room = Math.max(0, sideboardLimit - totalCounts(current.sideboardCounts));
      const amount = Math.min(requested, mainCount, room);
      if (amount <= 0) return current;

      const mainCounts = { ...current.mainCounts };
      const nextMain = mainCount - amount;
      if (nextMain > 0) mainCounts[cardId] = nextMain;
      else delete mainCounts[cardId];

      return {
        ...current,
        mainCounts,
        sideboardCounts: {
          ...current.sideboardCounts,
          [cardId]: (current.sideboardCounts[cardId] ?? 0) + amount
        }
      };
    });
    setSideboardMoveQuantities((current) => ({ ...current, [cardId]: "1" }));
  };

  const selectCard = (card: CardInfo) => {
    if (!format) return;
    const selectedRole =
      (activeTab === "leader" && leaderIds.includes(card.cardId)) ||
      (activeTab === "base" && currentDeck.baseId === card.cardId);
    if (cardSelectionReason(card) && !selectedRole) return;
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
        if (selected.includes(card.cardId)) return { ...current, leaderIds: [] };
        setActiveTab("base");
        return { ...current, leaderIds: [card.cardId] };
      });
      return;
    }
    if (activeTab === "base") {
      updateCurrentDeck((current) => {
        if (current.baseId === card.cardId) return { ...current, baseId: undefined };
        setActiveTab("cards");
        return { ...current, baseId: card.cardId };
      });
      return;
    }
    changeCount("main", card.cardId, 1);
  };

  const handleSave = async () => {
    if (!name.trim() || !collection || !favorites) return;
    setBusy(true);
    setError(null);
    try {
      const normalizedDeck = normalizeDeckJson(buildDeckJson(composition));
      const comparisonAllocations = favoriteId
        ? computeCardAllocations(collection.cards, favorites, favoriteId)
        : allocations;
      const result = compareDeckWithCollection(
        normalizedDeck,
        collection.cards,
        cardsById,
        comparisonAllocations
      );
      if (favoriteId) await updateFavoriteDeck(favoriteId, normalizedDeck, result);
      else await saveFavoriteDeck(normalizedDeck, result);
      ignoreDraftWritesRef.current = true;
      latestDraftRef.current = null;
      currentDraftStateRef.current = null;
      clearDeckBuilderDraft(draftScope, favoriteId);
      navigate(editingFavorite?.isMounted ? "/montados" : "/favoritos");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se ha podido guardar el mazo.");
    } finally {
      setBusy(false);
    }
  };

  if (favoriteId && favorites === undefined) return <SkeletonLines count={7} />;
  if (favoriteId && favorites !== undefined && !editingFavorite) {
    return (
      <p className="card border-saber-red/50 text-sm text-saber-red">
        El mazo que quieres editar ya no existe en Favoritos.
      </p>
    );
  }
  if (authLoading || initializedDraftKey !== draftTargetKey) {
    return <SkeletonLines count={7} />;
  }
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

  const firstShownCard = (cardPage - 1) * CARD_PAGE_SIZE;
  const shownCards = filteredCards.slice(firstShownCard, firstShownCard + CARD_PAGE_SIZE);
  const firstShownSelectedCard = (selectedCardPage - 1) * CARD_PAGE_SIZE;
  const shownSelectedCards = filteredSelectedCards.slice(
    firstShownSelectedCard,
    firstShownSelectedCard + CARD_PAGE_SIZE
  );
  const hasSelectedRegularCards = selectedRegularCardIds.size > 0;
  const formatLabel =
    format === "trilogy"
      ? `Trilogy · ${DECK_FORMAT_LABELS[trilogyCardPool]}`
      : DECK_FORMAT_LABELS[format];

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <Link
            to={editingFavorite?.isMounted ? "/montados" : "/favoritos"}
            className="mb-2 inline-flex items-center gap-1 text-xs text-slate-400"
          >
            <ArrowLeft size={14} /> Salir al listado de mazos
          </Link>
          <h1 className="font-display text-lg">
            {favoriteId ? "Editar mazo" : "Crear mazo"} · {formatLabel}
          </h1>
          <p className="text-xs text-slate-400">
            {editingFavorite?.isMounted
              ? "Seguirá montado al guardar y se recalcularán las copias que tiene reservadas."
              : "Puedes guardarlo aunque esté inacabado. No reservará cartas hasta que lo montes."}
          </p>
        </div>
        <button type="button" className="btn-secondary shrink-0" onClick={resetFormat}>
          <RotateCcw size={14} /> Cambiar
        </button>
      </header>

      {recoveredDraft && (
        <section
          role="status"
          className="card flex flex-col gap-3 border-saber-green/50 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-semibold text-saber-green">Borrador automático recuperado</p>
            <p className="mt-1 text-xs text-slate-400">
              Hemos restaurado los cambios que estaban sin guardar en este dispositivo.
            </p>
          </div>
          <button type="button" className="btn-secondary shrink-0" onClick={discardRecoveredDraft}>
            Descartar cambios recuperados
          </button>
        </section>
      )}

      {autoSavedAt && (
        <p className="text-right text-[11px] text-slate-500" aria-live="polite">
          Borrador automático guardado en este dispositivo a las{" "}
          {new Date(autoSavedAt).toLocaleTimeString("es-ES", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          })}
          .
        </p>
      )}

      {autoSaveError && (
        <p role="alert" className="card border-saber-yellow/50 text-xs text-saber-yellow">
          El navegador no ha permitido actualizar el borrador automático. Guarda el mazo en
          Favoritos antes de salir de esta pantalla.
        </p>
      )}

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

            <fieldset className="space-y-2" disabled={activeTab !== "cards"}>
              <legend className="text-xs font-semibold text-slate-200">Ordenar cartas</legend>
              <p className="text-[11px] text-slate-400">
                Puedes activar los dos. En ese caso se ordenará primero por coste y después por
                colección.
              </p>
              <div className="flex flex-wrap gap-2">
                <FilterChip
                  label="Ordenar por coste"
                  pressed={cardSorts.includes("cost")}
                  onClick={() => toggleCardSort("cost")}
                />
                <FilterChip
                  label="Ordenar por colección"
                  pressed={cardSorts.includes("collection")}
                  onClick={() => toggleCardSort("collection")}
                />
              </div>
            </fieldset>

            <button type="button" className="btn-secondary w-full" onClick={resetFilters}>
              <RotateCcw size={14} /> Restablecer filtros
            </button>
          </div>
        </details>

        {activeTab === "cards" ? (
          <div className="space-y-3">
            {hasSelectedRegularCards && (
              <section className="rounded-xl border border-saber-blue/60 bg-space-900 p-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 text-left"
                  aria-expanded={selectedCardsExpanded}
                  aria-controls="deck-builder-selected-cards"
                  onClick={() => setSelectedCardsExpanded((current) => !current)}
                >
                  <span>
                    <span className="block font-display text-sm text-saber-blue">
                      Cartas seleccionadas
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {currentMainCount} en el mazo
                      {sideboardLimit > 0 ? ` · ${currentSideboardCount} en el banquillo` : ""}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-300">
                    {selectedCardsExpanded ? "Minimizar" : "Maximizar"}
                    {selectedCardsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </span>
                </button>

                {selectedCardsExpanded && (
                  <div id="deck-builder-selected-cards" className="mt-3 space-y-3">
                    <p
                      id="deck-builder-selected-results"
                      className="scroll-mt-20 text-xs text-slate-400"
                    >
                      {filteredSelectedCards.length} seleccionada(s) coinciden con los filtros
                      {shownSelectedCards.length > 0
                        ? ` · mostrando ${firstShownSelectedCard + 1}–${firstShownSelectedCard + shownSelectedCards.length}`
                        : ""}
                    </p>

                    {shownSelectedCards.length > 0 ? (
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {shownSelectedCards.map((card) => {
                          const allocation = allocations.get(card.cardId);
                          const mainCount = currentDeck.mainCounts[card.cardId] ?? 0;
                          const sideCount = currentDeck.sideboardCounts[card.cardId] ?? 0;
                          const selectedCopies =
                            selectedCopiesByKey.get(card.cardKey ?? card.cardId) ?? 0;
                          const copyLimit = getCardCopyLimit(format, card);
                          const copyLimitReached = selectedCopies >= copyLimit;
                          const blockedReason = cardSelectionReason(card);
                          const sideboardRoom = Math.max(0, sideboardLimit - currentSideboardCount);
                          const maximumMove = Math.min(mainCount, sideboardRoom);
                          return (
                            <BuilderCardItem
                              key={card.cardId}
                              card={card}
                              ownedCount={allocation?.ownedCount ?? 0}
                              freeCount={allocation?.freeCount ?? 0}
                              blockedReason={blockedReason}
                              selected
                              onOpenDetails={() => setDetailsCard(card)}
                            >
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
                                      label={`Añadir otra copia de ${displayName(card)} al mazo`}
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
                                    </div>
                                  </div>
                                )}
                              </div>

                              {sideboardLimit > 0 && mainCount > 0 && (
                                <div className="mt-2 flex items-end gap-2 rounded-lg bg-space-950 p-2">
                                  <label className="min-w-0 flex-1 text-[11px] text-slate-400">
                                    Copias al banquillo
                                    <input
                                      type="number"
                                      min="1"
                                      max={Math.max(maximumMove, 1)}
                                      inputMode="numeric"
                                      aria-label={`Cantidad de ${displayName(card)} para llevar al banquillo`}
                                      className="mt-1 w-full rounded-lg border border-space-600 bg-space-900 px-3 py-2 text-sm text-slate-100"
                                      value={sideboardMoveQuantities[card.cardId] ?? "1"}
                                      onChange={(event) => {
                                        const value = event.target.value;
                                        if (value === "" || /^\d+$/.test(value)) {
                                          setSideboardMoveQuantities((current) => ({
                                            ...current,
                                            [card.cardId]: value
                                          }));
                                        }
                                      }}
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    className="btn-secondary min-h-10 shrink-0 px-3 text-xs"
                                    aria-label={`Llevar ${displayName(card)} al banquillo`}
                                    disabled={maximumMove === 0}
                                    onClick={() => moveMainCopiesToSideboard(card.cardId)}
                                  >
                                    <MoveRight size={15} /> Llevar al banquillo
                                  </button>
                                </div>
                              )}
                            </BuilderCardItem>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="rounded-lg bg-space-950 p-3 text-xs text-slate-400">
                        Ninguna carta seleccionada coincide con la búsqueda y los filtros actuales.
                      </p>
                    )}

                    <PaginationControls
                      currentPage={selectedCardPage}
                      pageSize={CARD_PAGE_SIZE}
                      totalItems={filteredSelectedCards.length}
                      label="cartas seleccionadas"
                      onPageChange={(page) => {
                        setSelectedCardPage(page);
                        requestAnimationFrame(() =>
                          document.getElementById("deck-builder-selected-results")?.scrollIntoView({
                            behavior: "smooth",
                            block: "start"
                          })
                        );
                      }}
                    />
                  </div>
                )}
              </section>
            )}

            <section className="rounded-xl border border-space-700 bg-space-900 p-3">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
                aria-expanded={availableCardsExpanded}
                aria-controls="deck-builder-available-cards"
                onClick={() => setAvailableCardsExpanded((current) => !current)}
              >
                <span>
                  <span className="block font-display text-sm">Cartas disponibles</span>
                  <span className="block text-[11px] text-slate-400">
                    {filteredCards.length} carta(s) sin seleccionar coinciden con los filtros
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-slate-300">
                  {availableCardsExpanded ? "Minimizar" : "Maximizar"}
                  {availableCardsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </span>
              </button>

              {availableCardsExpanded && (
                <div id="deck-builder-available-cards" className="mt-3 space-y-3">
                  <p id="deck-builder-results" className="scroll-mt-20 text-xs text-slate-400">
                    {filteredCards.length} disponible(s)
                    {shownCards.length > 0
                      ? ` · mostrando ${firstShownCard + 1}–${firstShownCard + shownCards.length}`
                      : ""}
                  </p>

                  {shownCards.length > 0 ? (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {shownCards.map((card) => {
                        const allocation = allocations.get(card.cardId);
                        const selectedCopies =
                          selectedCopiesByKey.get(card.cardKey ?? card.cardId) ?? 0;
                        const copyLimit = getCardCopyLimit(format, card);
                        const copyLimitReached = selectedCopies >= copyLimit;
                        const blockedReason = cardSelectionReason(card);
                        return (
                          <BuilderCardItem
                            key={card.cardId}
                            card={card}
                            ownedCount={allocation?.ownedCount ?? 0}
                            freeCount={allocation?.freeCount ?? 0}
                            blockedReason={blockedReason}
                            onOpenDetails={() => setDetailsCard(card)}
                          >
                            <button
                              type="button"
                              className="btn-secondary mt-2 w-full"
                              disabled={Boolean(blockedReason) || copyLimitReached}
                              aria-label={`Añadir ${displayName(card)} al mazo`}
                              onClick={() => selectCard(card)}
                            >
                              <Plus size={15} /> Añadir al mazo · máximo {copyLimit}
                            </button>
                          </BuilderCardItem>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="rounded-lg bg-space-950 p-3 text-xs text-slate-400">
                      No hay cartas disponibles que coincidan con la búsqueda y los filtros.
                    </p>
                  )}

                  <PaginationControls
                    currentPage={cardPage}
                    pageSize={CARD_PAGE_SIZE}
                    totalItems={filteredCards.length}
                    label="cartas disponibles"
                    onPageChange={(page) => {
                      setCardPage(page);
                      requestAnimationFrame(() =>
                        document.getElementById("deck-builder-results")?.scrollIntoView({
                          behavior: "smooth",
                          block: "start"
                        })
                      );
                    }}
                  />
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="space-y-3">
            <p id="deck-builder-results" className="scroll-mt-20 text-xs text-slate-400">
              {filteredCards.length} resultado(s)
              {shownCards.length > 0
                ? ` · mostrando ${firstShownCard + 1}–${firstShownCard + shownCards.length}`
                : ""}
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {shownCards.map((card) => {
                const allocation = allocations.get(card.cardId);
                const selected =
                  leaderIds.includes(card.cardId) || card.cardId === currentDeck.baseId;
                const blockedReason = cardSelectionReason(card);
                return (
                  <BuilderCardItem
                    key={card.cardId}
                    card={card}
                    ownedCount={allocation?.ownedCount ?? 0}
                    freeCount={allocation?.freeCount ?? 0}
                    blockedReason={blockedReason}
                    selected={selected}
                    onOpenDetails={() => setDetailsCard(card)}
                  >
                    <button
                      type="button"
                      className="btn-secondary mt-2 w-full"
                      disabled={Boolean(blockedReason) && !selected}
                      onClick={() => selectCard(card)}
                    >
                      {selected ? <Minus size={15} /> : <Plus size={15} />}
                      {selected ? "Quitar selección" : "Elegir"}
                    </button>
                  </BuilderCardItem>
                );
              })}
            </ul>
            <PaginationControls
              currentPage={cardPage}
              pageSize={CARD_PAGE_SIZE}
              totalItems={filteredCards.length}
              label={activeTab === "leader" ? "líderes" : "bases"}
              onPageChange={(page) => {
                setCardPage(page);
                requestAnimationFrame(() =>
                  document.getElementById("deck-builder-results")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                  })
                );
              }}
            />
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-base">
          {format === "trilogy" ? `Resumen del mazo ${activeDeckIndex + 1}` : "Resumen del mazo"}
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
        {!validation.valid && (
          <p className="text-xs text-saber-yellow">
            Puedes guardar este trabajo como borrador y continuar editándolo más adelante. Solo los
            mazos válidos pueden montarse.
          </p>
        )}
      </section>

      {error && (
        <p role="alert" className="card border-saber-red/50 text-sm text-saber-red">
          {error}
        </p>
      )}

      <button
        type="button"
        className="btn-primary w-full"
        disabled={busy || !name.trim()}
        onClick={() => void handleSave()}
      >
        <Save size={16} />{" "}
        {busy
          ? "Guardando..."
          : favoriteId
            ? "Guardar cambios"
            : validation.valid
              ? "Guardar mazo en Favoritos"
              : "Guardar borrador en Favoritos"}
      </button>

      {detailsCard && (
        <CardDetailsModal
          cardId={detailsCard.cardId}
          card={detailsCard}
          imageUrl={detailsCard.imageUrl}
          onClose={() => setDetailsCard(null)}
        />
      )}
    </div>
  );
}

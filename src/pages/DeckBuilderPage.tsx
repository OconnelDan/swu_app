import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Filter,
  Minus,
  Plus,
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
import { buildDeckJson, validatePremierDeck, type DeckBuilderComposition } from "@/lib/deckBuilder";
import { tryGetCardImageUrl } from "@/lib/cardImageUrl";
import { normalizeDeckJson } from "@/lib/normalizeDeckJson";
import { SwUnlimitedDbCardProvider } from "@/providers/cardProvider/SwUnlimitedDbCardProvider";
import type { CardInfo } from "@/types/card";

type BuilderTab = "leader" | "base" | "cards";
type OwnedFilter = "all" | "owned" | "free";

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

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");
}

function displayName(card: CardInfo | undefined, fallback = "Carta desconocida"): string {
  return card?.localizedName ?? card?.name ?? fallback;
}

function hasNoAspectPenalty(card: CardInfo, leader?: CardInfo, base?: CardInfo): boolean {
  const available = new Map<string, number>();
  for (const aspect of [...(leader?.aspects ?? []), ...(base?.aspects ?? [])]) {
    available.set(aspect, (available.get(aspect) ?? 0) + 1);
  }
  const needed = new Map<string, number>();
  for (const aspect of card.aspects ?? []) needed.set(aspect, (needed.get(aspect) ?? 0) + 1);
  return [...needed].every(([aspect, count]) => count <= (available.get(aspect) ?? 0));
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

export function DeckBuilderPage() {
  const navigate = useNavigate();
  const collection = useCollection();
  const favorites = useFavorites();
  const { saveFavoriteDeck } = useDataSource();
  const [allCards, setAllCards] = useState<CardInfo[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<BuilderTab>("leader");
  const [name, setName] = useState("Mi mazo Premier");
  const [leaderId, setLeaderId] = useState<string>();
  const [baseId, setBaseId] = useState<string>();
  const [mainCounts, setMainCounts] = useState<Record<string, number>>({});
  const [sideboardCounts, setSideboardCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [aspect, setAspect] = useState("all");
  const [type, setType] = useState("all");
  const [arena, setArena] = useState("all");
  const [setCode, setSetCode] = useState("all");
  const [rarity, setRarity] = useState("all");
  const [maximumCost, setMaximumCost] = useState("all");
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>("all");
  const [onlyInAspect, setOnlyInAspect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const cardsById = useMemo(
    () => new Map((allCards ?? []).map((card) => [card.cardId, card])),
    [allCards]
  );
  const allocations = useMemo(
    () => computeCardAllocations(collection?.cards ?? [], favorites ?? []),
    [collection?.cards, favorites]
  );
  const leader = leaderId ? cardsById.get(leaderId) : undefined;
  const base = baseId ? cardsById.get(baseId) : undefined;

  const composition = useMemo<DeckBuilderComposition>(
    () => ({ name, leaderId, baseId, mainCounts, sideboardCounts }),
    [baseId, leaderId, mainCounts, name, sideboardCounts]
  );
  const validation = useMemo(
    () => validatePremierDeck(composition, cardsById),
    [cardsById, composition]
  );
  const selectedCopiesByKey = useMemo(() => {
    const counts = new Map<string, number>();
    for (const zone of [mainCounts, sideboardCounts]) {
      for (const [cardId, count] of Object.entries(zone)) {
        const key = cardsById.get(cardId)?.cardKey ?? cardId;
        counts.set(key, (counts.get(key) ?? 0) + count);
      }
    }
    return counts;
  }, [cardsById, mainCounts, sideboardCounts]);

  const deckStatistics = useMemo(() => {
    const types = new Map<string, number>();
    const costs = new Map<number, number>();
    for (const [cardId, count] of Object.entries(mainCounts)) {
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
  }, [cardsById, mainCounts]);

  const setOptions = useMemo(
    () =>
      [...new Map((allCards ?? []).map((card) => [card.setCode, card.setName])).entries()].sort(
        ([left], [right]) => left.localeCompare(right)
      ),
    [allCards]
  );

  const filteredCards = useMemo(() => {
    const foldedQuery = fold(query.trim());
    return (allCards ?? [])
      .filter((card) => {
        if (activeTab === "leader" && card.type !== "Leader") return false;
        if (activeTab === "base" && card.type !== "Base") return false;
        if (activeTab === "cards" && !["Unit", "Event", "Upgrade"].includes(card.type ?? "")) {
          return false;
        }
        if (activeTab === "cards" && type !== "all" && card.type !== type) return false;
        if (aspect !== "all" && !(card.aspects ?? []).includes(aspect)) return false;
        if (activeTab === "cards" && arena !== "all" && card.arena !== arena) return false;
        if (setCode !== "all" && card.setCode !== setCode) return false;
        if (rarity !== "all" && card.rarity !== rarity) return false;
        if (
          maximumCost !== "all" &&
          (card.cost ?? Number.POSITIVE_INFINITY) > Number(maximumCost)
        ) {
          return false;
        }
        const allocation = allocations.get(card.cardId);
        if (ownedFilter === "owned" && !allocation?.ownedCount) return false;
        if (ownedFilter === "free" && !allocation?.freeCount) return false;
        if (
          activeTab === "cards" &&
          onlyInAspect &&
          leader &&
          base &&
          !hasNoAspectPenalty(card, leader, base)
        ) {
          return false;
        }
        if (!foldedQuery) return true;
        const searchable = fold(
          [
            card.cardId,
            card.name,
            card.localizedName,
            card.text,
            card.localizedText,
            ...(card.traits ?? []),
            ...(card.keywords ?? [])
          ]
            .filter(Boolean)
            .join(" ")
        );
        return searchable.includes(foldedQuery);
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
    arena,
    aspect,
    base,
    leader,
    maximumCost,
    onlyInAspect,
    ownedFilter,
    query,
    rarity,
    setCode,
    type
  ]);

  const changeCount = (zone: "main" | "sideboard", cardId: string, delta: number) => {
    const setter = zone === "main" ? setMainCounts : setSideboardCounts;
    const otherZone = zone === "main" ? sideboardCounts : mainCounts;
    setter((current) => {
      if (delta > 0) {
        const card = cardsById.get(cardId);
        const copyKey = card?.cardKey ?? cardId;
        const countForKey = (counts: Record<string, number>) =>
          Object.entries(counts).reduce(
            (total, [candidateId, count]) =>
              (cardsById.get(candidateId)?.cardKey ?? candidateId) === copyKey
                ? total + count
                : total,
            0
          );

        if (countForKey(current) + countForKey(otherZone) >= (card?.deckLimit ?? 3)) {
          return current;
        }
        if (zone === "sideboard" && Object.values(current).reduce((a, b) => a + b, 0) >= 10) {
          return current;
        }
      }

      const next = Math.max(0, Math.min(99, (current[cardId] ?? 0) + delta));
      if (next === 0) {
        const remaining = { ...current };
        delete remaining[cardId];
        return remaining;
      }
      return { ...current, [cardId]: next };
    });
  };

  const selectCard = (card: CardInfo) => {
    if (activeTab === "leader") {
      setLeaderId(card.cardId);
      setActiveTab("base");
      return;
    }
    if (activeTab === "base") {
      setBaseId(card.cardId);
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

  if (collection === undefined || favorites === undefined || allCards === null) {
    if (catalogError) {
      return <p className="card border-saber-red/50 text-sm text-saber-red">{catalogError}</p>;
    }
    return <SkeletonLines count={7} />;
  }

  const shownCards = filteredCards.slice(0, 80);
  const selectedMain = Object.entries(mainCounts).filter(([, count]) => count > 0);
  const selectedSideboard = Object.entries(sideboardCounts).filter(([, count]) => count > 0);

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
          <h1 className="font-display text-lg">Crear mazo</h1>
          <p className="text-xs text-slate-400">
            Formato Premier · se guardará en Favoritos y no reservará cartas hasta que lo montes.
          </p>
        </div>
      </header>

      <section className="card space-y-2">
        <label htmlFor="deck-name" className="text-sm font-semibold">
          Nombre del mazo
        </label>
        <input
          id="deck-name"
          className="w-full rounded-lg border border-space-600 bg-space-950 px-3 py-2 text-sm"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
        />
      </section>

      <section className="card space-y-3">
        <nav aria-label="Zona que estás construyendo" className="grid grid-cols-3 gap-1">
          {(
            [
              ["leader", `1. Líder${leader ? " ✓" : ""}`],
              ["base", `2. Base${base ? " ✓" : ""}`],
              ["cards", `3. Cartas ${validation.mainCount}/50`]
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
            placeholder="Nombre, código, texto, rasgo o palabra clave..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <details className="rounded-lg border border-space-700 bg-space-950/50 p-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
            <Filter size={15} /> Filtros
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <select value={aspect} onChange={(event) => setAspect(event.target.value)}>
              <option value="all">Todos los aspectos</option>
              {Object.entries(ASPECT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={type}
              disabled={activeTab !== "cards"}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="all">Todos los tipos</option>
              <option value="Unit">Unidades</option>
              <option value="Event">Eventos</option>
              <option value="Upgrade">Mejoras</option>
            </select>
            <select value={arena} onChange={(event) => setArena(event.target.value)}>
              <option value="all">Todas las arenas</option>
              <option value="Ground">Terrestre</option>
              <option value="Space">Espacial</option>
            </select>
            <select value={setCode} onChange={(event) => setSetCode(event.target.value)}>
              <option value="all">Todas las colecciones</option>
              {setOptions.map(([code, setName]) => (
                <option key={code} value={code}>
                  {code} · {setName ?? code}
                </option>
              ))}
            </select>
            <select value={rarity} onChange={(event) => setRarity(event.target.value)}>
              <option value="all">Todas las rarezas</option>
              {["Common", "Uncommon", "Rare", "Legendary", "Special"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
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
          <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={onlyInAspect}
              disabled={!leader || !base}
              onChange={(event) => setOnlyInAspect(event.target.checked)}
            />
            Solo cartas sin penalización de aspecto
          </label>
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
            const mainCount = mainCounts[card.cardId] ?? 0;
            const sideCount = sideboardCounts[card.cardId] ?? 0;
            const selected = card.cardId === leaderId || card.cardId === baseId;
            const selectedCopies = selectedCopiesByKey.get(card.cardKey ?? card.cardId) ?? 0;
            const copyLimitReached = selectedCopies >= (card.deckLimit ?? 3);
            return (
              <li
                key={card.cardId}
                className={`rounded-xl border p-3 ${selected ? "border-saber-blue bg-space-800" : "border-space-700 bg-space-900"}`}
              >
                <div className="flex gap-3">
                  {card.imageUrl && (
                    <button type="button" className="shrink-0" onClick={() => selectCard(card)}>
                      <CardImageThumbnail
                        src={card.imageUrl}
                        fallbackSrc={tryGetCardImageUrl(card.cardId)}
                        className="h-28 w-auto rounded"
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

                {activeTab === "leader" || activeTab === "base" ? (
                  <button
                    type="button"
                    className="btn-secondary mt-2 w-full"
                    onClick={() => selectCard(card)}
                  >
                    {selected ? <CheckCircle2 size={15} /> : <Plus size={15} />}
                    {selected ? "Seleccionada" : "Elegir"}
                  </button>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-space-950 p-2 text-center">
                      <p className="mb-1 text-slate-400">Mazo</p>
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
                          disabled={copyLimitReached}
                          onClick={() => changeCount("main", card.cardId, 1)}
                        >
                          <Plus size={14} />
                        </QuantityButton>
                      </div>
                    </div>
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
                          disabled={copyLimitReached || validation.sideboardCount >= 10}
                          onClick={() => changeCount("sideboard", card.cardId, 1)}
                        >
                          <Plus size={14} />
                        </QuantityButton>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="font-display text-base">Lista del mazo</h2>
        <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-slate-400">Líder</dt>
            <dd className="font-semibold">{displayName(leader, "Sin elegir")}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Base</dt>
            <dd className="font-semibold">{displayName(base, "Sin elegir")}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Mazo</dt>
            <dd className="font-semibold">{validation.mainCount}/50</dd>
          </div>
          <div>
            <dt className="text-slate-400">Banquillo</dt>
            <dd className="font-semibold">{validation.sideboardCount}/10</dd>
          </div>
        </dl>

        {validation.mainCount > 0 && (
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
                .sort(([a], [b]) =>
                  displayName(cardsById.get(a)).localeCompare(displayName(cardsById.get(b)), "es")
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

        {selectedSideboard.length > 0 && (
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
        <h2 className="font-display text-base">Validación Premier</h2>
        {validation.valid ? (
          <p className="flex items-center gap-2 text-sm text-saber-green">
            <CheckCircle2 size={17} /> La estructura del mazo es válida.
          </p>
        ) : (
          <ul className="space-y-1 text-sm text-saber-red">
            {validation.errors.map((message) => (
              <li key={message}>• {message}</li>
            ))}
          </ul>
        )}
        {validation.warnings.map((message) => (
          <p key={message} className="flex items-start gap-2 text-xs text-saber-yellow">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            {message}
          </p>
        ))}
        <p className="text-xs text-slate-500">
          La validación comprueba líder, base, tamaño, banquillo, tipos y límite de copias. La
          penalización de aspecto se avisa, pero no hace ilegal una carta. Todavía no bloquea
          rotaciones, suspensiones ni cartas prohibidas del torneo vigente.
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

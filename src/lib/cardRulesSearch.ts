import type { CardInfo } from "@/types/card";

const LOCALIZED_KEYWORD_LABELS: Readonly<Record<string, readonly string[]>> = {
  Ambush: ["Ambush", "Emboscada"],
  Bounty: ["Bounty", "Recompensa"],
  Coordinate: ["Coordinate", "Coordinación"],
  Exploit: ["Exploit", "Sacrificio"],
  Grit: ["Grit", "Temple"],
  Hidden: ["Hidden", "Ocultación"],
  Overwhelm: ["Overwhelm", "Formidable"],
  Piloting: ["Piloting", "Pilotaje"],
  Plot: ["Plot", "Treta"],
  Raid: ["Raid", "Incursión"],
  Restore: ["Restore", "Recuperación"],
  Saboteur: ["Saboteur", "Sabotaje", "Saboteador"],
  Sentinel: ["Sentinel", "Centinela"],
  Shielded: ["Shielded", "Escudado"],
  Smuggle: ["Smuggle", "Contrabando"],
  Support: ["Support", "Apoyo"]
};

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordLabels(keywords: string[] | undefined): string[] {
  return [
    ...new Set(
      (keywords ?? []).flatMap((keyword) => LOCALIZED_KEYWORD_LABELS[keyword] ?? [keyword])
    )
  ];
}

/**
 * Indica si un paréntesis es el recordatorio que explica una palabra clave.
 * Se exige que aparezca inmediatamente después del nombre de una keyword (o
 * de «para este ataque/fase»), para no eliminar condiciones de reglas reales
 * como «no puede ser atacada (a menos que tenga Centinela)».
 */
function followsKeyword(textBeforeParenthesis: string, labels: string[]): boolean {
  const ending = fold(textBeforeParenthesis.slice(-120));
  return labels.some((label) => {
    const keyword = escapeRegExp(fold(label));
    return new RegExp(
      `(?:^|[^a-z0-9])${keyword}(?:\\s+\\d+)?` +
        `(?:\\s+(?:for|para)\\s+(?:this|the|este|esta)\\s+[a-z]+)?[.:;]?\\s*$`,
      "u"
    ).test(ending);
  });
}

/**
 * Retira solo los textos recordatorios de keywords del texto que se indexa
 * para buscar. Conserva el resto de paréntesis y admite grupos anidados.
 */
export function stripKeywordReminderText(
  rulesText: string | undefined,
  keywords: string[] | undefined
): string {
  if (!rulesText) return "";
  const labels = keywordLabels(keywords);
  if (labels.length === 0 || !rulesText.includes("(")) return rulesText;

  let result = "";
  let cursor = 0;
  let index = 0;
  while (index < rulesText.length) {
    if (rulesText[index] !== "(") {
      index += 1;
      continue;
    }

    let depth = 1;
    let closingIndex = index + 1;
    while (closingIndex < rulesText.length && depth > 0) {
      if (rulesText[closingIndex] === "(") depth += 1;
      if (rulesText[closingIndex] === ")") depth -= 1;
      closingIndex += 1;
    }
    if (depth !== 0) break;

    const beforeParenthesis = result + rulesText.slice(cursor, index);
    if (followsKeyword(beforeParenthesis, labels)) {
      result = beforeParenthesis;
      cursor = closingIndex;
    }
    index = closingIndex;
  }

  return result + rulesText.slice(cursor);
}

/** Construye el texto buscable sin contaminarlo con definiciones de keywords. */
export function buildCardRulesSearchText(card: CardInfo): string {
  return [
    stripKeywordReminderText(card.text, card.keywords),
    stripKeywordReminderText(card.localizedText, card.keywords),
    ...(card.traits ?? []),
    ...(card.keywords ?? [])
  ]
    .filter(Boolean)
    .join(" ");
}

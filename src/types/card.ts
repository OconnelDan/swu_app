/**
 * Modelo de una carta según la responsabilidad del CardProvider.
 * No todos los campos estarán siempre disponibles (p.ej. si solo
 * tenemos el código porque no hay catálogo remoto activo).
 */
export interface CardInfo {
  /** Identificador canónico SET_NUMERO, p.ej. "LAW_038" */
  cardId: string;
  setCode: string;
  cardNumber: string;
  name?: string;
  /** Nombre oficial en español, cuando la API lo publica. */
  localizedName?: string;
  type?: string;
  rarity?: string;
  imageUrl?: string;
  /** Imagen oficial del reverso de un líder. */
  leaderUnitImageUrl?: string;
  /** Distingue los líderes que cambian entre dos caras horizontales. */
  leaderBackHorizontal?: boolean;
  setName?: string;
  cost?: number;
  aspects?: string[];
  traits?: string[];
  arena?: string;
  text?: string;
  localizedText?: string;
  /** Acción épica impresa en la cara horizontal del líder. */
  leaderEpicAction?: string;
  localizedLeaderEpicAction?: string;
  /** Texto de reglas de la cara desplegada del líder. */
  leaderUnitText?: string;
  localizedLeaderUnitText?: string;
  power?: number;
  hp?: number;
  upgradePower?: number;
  upgradeHp?: number;
  unique?: boolean;
  keywords?: string[];
  /** Identidad de reglas compartida por reimpresiones de la misma carta. */
  cardKey?: string;
  /** Límite oficial de copias entre mazo principal y banquillo. */
  deckLimit?: number;
}

/** Interfaz desacoplada para obtener información de cartas. */
export interface CardProvider {
  /** Nombre identificativo del proveedor, útil para ajustes/depuración. */
  readonly id: string;
  getCard(cardId: string): Promise<CardInfo | undefined>;
  getCards(cardIds: string[]): Promise<Map<string, CardInfo>>;
}

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
  type?: string;
  rarity?: string;
  imageUrl?: string;
}

/** Interfaz desacoplada para obtener información de cartas. */
export interface CardProvider {
  /** Nombre identificativo del proveedor, útil para ajustes/depuración. */
  readonly id: string;
  getCard(cardId: string): Promise<CardInfo | undefined>;
  getCards(cardIds: string[]): Promise<Map<string, CardInfo>>;
}

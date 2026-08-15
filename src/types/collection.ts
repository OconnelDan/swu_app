/** Una fila normalizada de la colección del usuario. */
export interface CollectionCard {
  /** SET_NUMERO */
  cardId: string;
  setCode: string;
  cardNumber: string;
  /** Nombre tal y como aparece en el origen de datos, si existe */
  name?: string;
  /** Suma de todas las variantes (D:X en el Excel) */
  ownedCount: number;
}

/** Datos mínimos necesarios para añadir una copia reconocida a la colección. */
export type CollectionCardIdentity = Omit<CollectionCard, "ownedCount">;

/** Advertencia no bloqueante generada durante la importación. */
export interface ImportWarning {
  type:
    | "duplicate_row"
    | "invalid_number"
    | "unknown_set"
    | "unrecognized_columns"
    | "empty_row"
    | "other";
  message: string;
  rowRef?: string | number;
}

export interface CollectionImportResult {
  source: "excel" | "csv" | "json" | "remote";
  fileName?: string;
  sheetName?: string;
  importedAt: string;
  rowsProcessed: number;
  cardsRecognized: number;
  rowsIgnored: number;
  invalidValues: number;
  totalCopies: number;
  setsFound: string[];
  warnings: ImportWarning[];
  cards: CollectionCard[];
}

/** Interfaz desacoplada para obtener la colección del usuario. */
export interface CollectionProvider {
  readonly id: string;
  importFromSource(input: unknown): Promise<CollectionImportResult>;
}

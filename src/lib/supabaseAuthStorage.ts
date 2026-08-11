import type { SupportedStorage } from "@supabase/supabase-js";

const DATABASE_NAME = "swu-deck-vault-auth";
const STORE_NAME = "sessions";
const DATABASE_VERSION = 1;
const memoryFallback = new Map<string, string>();

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir IndexedDB."));
  });

  return databasePromise;
}

async function readValue(key: string): Promise<string | null> {
  if (typeof indexedDB === "undefined") return memoryFallback.get(key) ?? null;
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
    request.onerror = () => reject(request.error ?? new Error("No se pudo leer la sesión."));
  });
}

async function writeValue(key: string, value: string): Promise<void> {
  if (typeof indexedDB === "undefined") {
    memoryFallback.set(key, value);
    return;
  }

  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("No se pudo guardar la sesión."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Se canceló el guardado de la sesión."));
  });
}

async function removeValue(key: string): Promise<void> {
  if (typeof indexedDB === "undefined") {
    memoryFallback.delete(key);
    return;
  }

  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("No se pudo eliminar la sesión."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Se canceló la eliminación de la sesión."));
  });
}

/**
 * Almacén de sesión de Supabase separado de los datos exportables de la app.
 * Permite compartir el verificador PKCE entre pestañas del mismo navegador sin
 * colocar credenciales en localStorage ni dentro de las copias de seguridad.
 */
export const indexedDbAuthStorage: SupportedStorage = {
  getItem: readValue,
  setItem: writeValue,
  removeItem: removeValue
};

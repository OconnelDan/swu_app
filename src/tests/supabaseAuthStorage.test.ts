import { beforeEach, describe, expect, it } from "vitest";
import { indexedDbAuthStorage } from "@/lib/supabaseAuthStorage";

describe("almacén IndexedDB de la sesión de Supabase", () => {
  const key = "supabase-session-test";

  beforeEach(async () => {
    await indexedDbAuthStorage.removeItem(key);
  });

  it("guarda, recupera y elimina una sesión fuera de localStorage", async () => {
    await indexedDbAuthStorage.setItem(key, "sesión de prueba");

    expect(await indexedDbAuthStorage.getItem(key)).toBe("sesión de prueba");
    expect(localStorage.getItem(key)).toBeNull();

    await indexedDbAuthStorage.removeItem(key);
    expect(await indexedDbAuthStorage.getItem(key)).toBeNull();
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260821_restar_cartas_coleccion.sql"),
  "utf8"
);

describe("migración para restar cartas", () => {
  it("mantiene la operación atómica y recalcula las copias libres", () => {
    expect(migration).toContain("create or replace function public.remove_my_collection_card");
    expect(migration).toContain("for update");
    expect(migration).toContain("perform private.refresh_my_free_counts_impl()");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("grant execute on function public.remove_my_collection_card");
  });
});

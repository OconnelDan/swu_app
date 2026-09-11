import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911_seleccionar_origen_reasignacion.sql"),
  "utf8"
);

describe("migración del origen de las cartas reasignadas", () => {
  it("añade el reparto persistente y una operación atómica protegida por usuario", () => {
    expect(migration).toContain("add column if not exists card_allocation_overrides jsonb");
    expect(migration).toContain(
      "create or replace function public.set_my_mounted_card_allocations"
    );
    expect(migration).toContain("where user_id = v_user_id\n  for update");
    expect(migration).toContain("v_total_assigned <> least(v_owned_count, v_total_required)");
    expect(migration).toContain("deck.user_id = v_user_id");
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });
});

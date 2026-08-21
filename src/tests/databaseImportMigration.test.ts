import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260821_optimizar_importacion_coleccion.sql"),
  "utf8"
);
const schema = readFileSync(resolve(process.cwd(), "supabase/schema.sql"), "utf8");

describe("migración de importaciones grandes", () => {
  it("desactiva el historial por fila sin eliminar su tabla ni sus datos", () => {
    expect(migration).toContain(
      "drop trigger if exists collection_backup_log_row on public.collection_cards"
    );
    expect(migration).not.toContain("create trigger collection_backup_log_row");
    expect(migration).not.toMatch(/drop\s+table[^;]*collection_change_log/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.collection_change_log/i);
  });

  it("expande una sola vez las necesidades de los mazos montados", () => {
    expect(migration).toContain("with mounted_requirements as materialized");
    expect(migration).toContain("desired_counts as materialized");
    expect(migration).toContain("collection.free_count is distinct from desired.free_count");
    expect(migration).not.toContain('required_card."cardId" = collection.card_id');
  });

  it("mantiene el esquema base alineado con el recálculo optimizado", () => {
    expect(schema).toContain("with mounted_requirements as materialized");
    expect(schema).toContain("collection.free_count is distinct from desired.free_count");
  });

  it("amplía el timeout únicamente en las importaciones masivas", () => {
    expect(migration).toContain("alter function public.replace_my_collection(jsonb)");
    expect(migration).toContain("alter function public.replace_my_data(jsonb, jsonb)");
    expect(migration.match(/set statement_timeout = '30s'/g)).toHaveLength(2);
    expect(schema.match(/set statement_timeout = '30s'/g)).toHaveLength(2);
  });
});

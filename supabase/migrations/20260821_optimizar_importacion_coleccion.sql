-- Reduce el trabajo realizado al sustituir colecciones grandes.
--
-- La importación se ejecuta mediante PostgREST con el rol authenticated, cuyo
-- tiempo disponible es reducido. Esta migración mantiene la operación
-- atómica, pero evita expandir el JSON de los mazos una vez por cada carta y
-- desactiva la escritura de un historial por fila que no interviene en los
-- correos de backup.

begin;

-- El correo calcula los cambios comparando la instantánea anterior con la
-- actual. collection_change_log no participa en ese cálculo, así que dejamos
-- de crear miles de filas durante una importación. La tabla y sus datos se
-- conservan para no realizar ninguna eliminación destructiva.
drop trigger if exists collection_backup_log_row on public.collection_cards;

-- Calcula una sola vez las necesidades de todos los mazos montados. Cuando no
-- hay ninguno, únicamente corrige las cartas cuyo free_count sea diferente de
-- owned_count; una importación nueva no provoca así una segunda actualización
-- de toda la colección.
create or replace function private.refresh_my_free_counts_impl()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  if not exists (
    select 1
    from public.favorite_decks as deck
    where deck.user_id = v_user_id
      and deck.is_mounted
  ) then
    update public.collection_cards as collection
    set
      free_count = collection.owned_count,
      updated_at = v_now
    where collection.user_id = v_user_id
      and collection.free_count is distinct from collection.owned_count;

    return;
  end if;

  with mounted_requirements as materialized (
    select
      required_card."cardId" as card_id,
      sum(required_card."requiredCount")::integer as required_count
    from public.favorite_decks as deck
    cross join lateral jsonb_to_recordset(
      case
        when jsonb_typeof(deck.normalized_deck -> 'allRequiredCards') = 'array'
          then deck.normalized_deck -> 'allRequiredCards'
        else '[]'::jsonb
      end
    ) as required_card("cardId" text, "requiredCount" integer)
    where deck.user_id = v_user_id
      and deck.is_mounted
      and required_card."cardId" is not null
      and required_card."requiredCount" > 0
    group by required_card."cardId"
  ),
  desired_counts as materialized (
    select
      collection.card_id,
      greatest(
        collection.owned_count - coalesce(requirement.required_count, 0),
        0
      ) as free_count
    from public.collection_cards as collection
    left join mounted_requirements as requirement
      on requirement.card_id = collection.card_id
    where collection.user_id = v_user_id
  )
  update public.collection_cards as collection
  set
    free_count = desired.free_count,
    updated_at = v_now
  from desired_counts as desired
  where collection.user_id = v_user_id
    and collection.card_id = desired.card_id
    and collection.free_count is distinct from desired.free_count;
end;
$$;

revoke all on function private.refresh_my_free_counts_impl()
  from public, anon, authenticated;
grant execute on function private.refresh_my_free_counts_impl() to authenticated;

-- Las funciones siguientes reciben tablas de transición. Primero obtienen los
-- usuarios distintos y solo construyen una instantánea cuando todavía no
-- existe su fila de configuración. En el caso normal se limita a marcar la
-- cuenta como modificada.
create or replace function private.mark_collection_backup_dirty_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_user_id uuid;
begin
  for v_user_id in
    select distinct inserted.user_id
    from new_rows as inserted
    join public.profiles as profile on profile.id = inserted.user_id
  loop
    update public.collection_backup_settings as settings
    set
      last_change_at = v_now,
      updated_at = v_now
    where settings.user_id = v_user_id;

    if not found then
      insert into public.collection_backup_settings (
        user_id,
        email_enabled,
        last_change_at,
        last_backed_up_change_at,
        baseline_snapshot,
        updated_at
      )
      values (
        v_user_id,
        false,
        v_now,
        v_now,
        private.build_collection_backup_snapshot(v_user_id),
        v_now
      )
      on conflict (user_id)
      do update set
        last_change_at = excluded.last_change_at,
        updated_at = excluded.updated_at;
    end if;
  end loop;

  return null;
end;
$$;

create or replace function private.mark_collection_backup_dirty_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_user_id uuid;
begin
  for v_user_id in
    select distinct deleted.user_id
    from old_rows as deleted
    join public.profiles as profile on profile.id = deleted.user_id
  loop
    update public.collection_backup_settings as settings
    set
      last_change_at = v_now,
      updated_at = v_now
    where settings.user_id = v_user_id;

    if not found then
      insert into public.collection_backup_settings (
        user_id,
        email_enabled,
        last_change_at,
        last_backed_up_change_at,
        baseline_snapshot,
        updated_at
      )
      values (
        v_user_id,
        false,
        v_now,
        v_now,
        private.build_collection_backup_snapshot(v_user_id),
        v_now
      )
      on conflict (user_id)
      do update set
        last_change_at = excluded.last_change_at,
        updated_at = excluded.updated_at;
    end if;
  end loop;

  return null;
end;
$$;

create or replace function private.mark_collection_backup_dirty_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_user_id uuid;
begin
  for v_user_id in
    select distinct changed.user_id
    from (
      select coalesce(inserted.user_id, previous.user_id) as user_id
      from new_rows as inserted
      full join old_rows as previous
        on previous.user_id = inserted.user_id
        and previous.card_id = inserted.card_id
      where inserted.user_id is null
        or previous.user_id is null
        or inserted.card_id is distinct from previous.card_id
        or inserted.set_code is distinct from previous.set_code
        or inserted.card_number is distinct from previous.card_number
        or inserted.name is distinct from previous.name
        or inserted.owned_count is distinct from previous.owned_count
    ) as changed
    join public.profiles as profile on profile.id = changed.user_id
  loop
    update public.collection_backup_settings as settings
    set
      last_change_at = v_now,
      updated_at = v_now
    where settings.user_id = v_user_id;

    if not found then
      insert into public.collection_backup_settings (
        user_id,
        email_enabled,
        last_change_at,
        last_backed_up_change_at,
        baseline_snapshot,
        updated_at
      )
      values (
        v_user_id,
        false,
        v_now,
        v_now,
        private.build_collection_backup_snapshot(v_user_id),
        v_now
      )
      on conflict (user_id)
      do update set
        last_change_at = excluded.last_change_at,
        updated_at = excluded.updated_at;
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function private.mark_collection_backup_dirty_after_insert()
  from public, anon, authenticated;
revoke all on function private.mark_collection_backup_dirty_after_delete()
  from public, anon, authenticated;
revoke all on function private.mark_collection_backup_dirty_after_update()
  from public, anon, authenticated;

-- El límite sigue siendo acotado y solo se amplía para las dos operaciones de
-- importación masiva. El resto de las llamadas authenticated conserva el
-- timeout general del proyecto.
alter function public.replace_my_collection(jsonb)
  set statement_timeout = '30s';
alter function public.replace_my_data(jsonb, jsonb)
  set statement_timeout = '30s';

notify pgrst, 'reload schema';

commit;

select
  to_regprocedure('private.refresh_my_free_counts_impl()') as recalcular_libres,
  not exists (
    select 1
    from pg_trigger as trigger
    where trigger.tgrelid = 'public.collection_cards'::regclass
      and trigger.tgname = 'collection_backup_log_row'
      and not trigger.tgisinternal
  ) as historial_por_fila_desactivado,
  coalesce((
    select procedure.proconfig @> array['statement_timeout=30s']::text[]
    from pg_proc as procedure
    where procedure.oid = to_regprocedure('public.replace_my_collection(jsonb)')
  ), false) as timeout_importacion_ampliado;

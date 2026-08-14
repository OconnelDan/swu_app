-- Separa las ideas guardadas en Favoritos de los mazos físicamente montados.
-- Es segura para los datos existentes: todos los mazos actuales permanecen
-- guardados como favoritos y ninguna carta queda reservada automáticamente.

begin;

alter table public.favorite_decks
  add column if not exists is_mounted boolean;
alter table public.favorite_decks
  add column if not exists mounted_at timestamptz;
alter table public.favorite_decks
  add column if not exists allocation_priority bigint;

update public.favorite_decks
set
  is_mounted = false,
  mounted_at = null,
  allocation_priority = null
where is_mounted is null;

alter table public.favorite_decks
  alter column is_mounted set default false;
alter table public.favorite_decks
  alter column is_mounted set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.favorite_decks'::regclass
      and conname = 'favorite_decks_mount_state_valid'
  ) then
    alter table public.favorite_decks
      add constraint favorite_decks_mount_state_valid
      check (
        (
          is_mounted
          and mounted_at is not null
          and allocation_priority is not null
          and allocation_priority > 0
        )
        or (
          not is_mounted
          and mounted_at is null
          and allocation_priority is null
        )
      );
  end if;
end;
$$;

create unique index if not exists favorite_decks_user_allocation_priority_idx
  on public.favorite_decks (user_id, allocation_priority)
  where is_mounted;

-- Las copias libres solo descuentan los mazos que el usuario ha montado de
-- forma explícita. Los favoritos no afectan a la disponibilidad ni a amigos.
create or replace function private.refresh_my_free_counts_impl()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  update public.collection_cards as collection
  set
    free_count = greatest(
      collection.owned_count - coalesce((
        select sum(required_card."requiredCount")::integer
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
          and required_card."cardId" = collection.card_id
          and required_card."requiredCount" > 0
      ), 0),
      0
    ),
    updated_at = clock_timestamp()
  where collection.user_id = v_user_id;
end;
$$;

revoke all on function private.refresh_my_free_counts_impl()
  from public, anon, authenticated;
grant execute on function private.refresh_my_free_counts_impl() to authenticated;

create or replace function public.mount_my_favorite_deck(p_id uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_priority bigint;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  if not exists (
    select 1
    from public.favorite_decks
    where user_id = v_user_id and id = p_id
  ) then
    raise exception 'El mazo no existe';
  end if;

  -- La fila de sincronización actúa como bloqueo por usuario para que dos
  -- dispositivos no asignen la misma prioridad al montar simultáneamente.
  insert into public.user_sync_state (user_id, updated_at)
  values (v_user_id, v_now)
  on conflict (user_id) do nothing;

  perform 1
  from public.user_sync_state
  where user_id = v_user_id
  for update;

  select coalesce(max(allocation_priority), 0) + 1
  into v_priority
  from public.favorite_decks
  where user_id = v_user_id and is_mounted;

  update public.favorite_decks
  set
    is_mounted = true,
    mounted_at = v_now,
    allocation_priority = v_priority,
    updated_at = v_now
  where user_id = v_user_id
    and id = p_id
    and not is_mounted;

  if found then
    perform private.refresh_my_free_counts_impl();

    update public.user_sync_state
    set updated_at = v_now
    where user_id = v_user_id;
  end if;

  return v_now;
end;
$$;

revoke all on function public.mount_my_favorite_deck(uuid) from public, anon;
grant execute on function public.mount_my_favorite_deck(uuid) to authenticated;

create or replace function public.unmount_my_favorite_deck(p_id uuid)
returns timestamptz
language plpgsql
security invoker
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
    from public.favorite_decks
    where user_id = v_user_id and id = p_id
  ) then
    raise exception 'El mazo no existe';
  end if;

  update public.favorite_decks
  set
    is_mounted = false,
    mounted_at = null,
    allocation_priority = null,
    updated_at = v_now
  where user_id = v_user_id
    and id = p_id
    and is_mounted;

  if found then
    perform private.refresh_my_free_counts_impl();

    insert into public.user_sync_state (user_id, updated_at)
    values (v_user_id, v_now)
    on conflict (user_id)
    do update set updated_at = excluded.updated_at;
  end if;

  return v_now;
end;
$$;

revoke all on function public.unmount_my_favorite_deck(uuid) from public, anon;
grant execute on function public.unmount_my_favorite_deck(uuid) to authenticated;

-- Recalcula inmediatamente el estado actual: al migrar, todos los antiguos
-- favoritos dejan de consumir cartas.
do $$
declare
  v_user_id uuid;
begin
  for v_user_id in select id from public.profiles loop
    update public.collection_cards as collection
    set
      free_count = greatest(
        collection.owned_count - coalesce((
          select sum(required_card."requiredCount")::integer
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
            and required_card."cardId" = collection.card_id
            and required_card."requiredCount" > 0
        ), 0),
        0
      ),
      updated_at = clock_timestamp()
    where collection.user_id = v_user_id;
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;

select
  to_regprocedure('public.mount_my_favorite_deck(uuid)') as montar_mazo,
  to_regprocedure('public.unmount_my_favorite_deck(uuid)') as desmontar_mazo,
  count(*) filter (where is_mounted) as mazos_montados,
  count(*) filter (where not is_mounted) as favoritos
from public.favorite_decks;

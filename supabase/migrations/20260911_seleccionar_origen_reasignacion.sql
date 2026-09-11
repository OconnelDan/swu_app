-- Permite elegir exactamente de qué mazo o mazos se retiran las copias de una
-- carta al reasignarla. Las listas no cambian: solo se guarda el reparto físico.

begin;

alter table public.favorite_decks
  add column if not exists card_allocation_overrides jsonb not null default '{}'::jsonb;

update public.favorite_decks
set card_allocation_overrides = '{}'::jsonb
where card_allocation_overrides is null;

alter table public.favorite_decks
  alter column card_allocation_overrides set default '{}'::jsonb;
alter table public.favorite_decks
  alter column card_allocation_overrides set not null;

-- Protege también las llamadas antiguas de desmontaje: un favorito que deja de
-- estar montado nunca conserva repartos físicos obsoletos.
create or replace function private.clear_unmounted_card_allocations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.is_mounted then
    new.card_allocation_overrides := '{}'::jsonb;
  end if;
  return new;
end;
$$;

revoke all on function private.clear_unmounted_card_allocations()
  from public, anon, authenticated;

drop trigger if exists favorite_decks_clear_unmounted_card_allocations
  on public.favorite_decks;
create trigger favorite_decks_clear_unmounted_card_allocations
  before insert or update of is_mounted, card_allocation_overrides
  on public.favorite_decks
  for each row execute function private.clear_unmounted_card_allocations();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.favorite_decks'::regclass
      and conname = 'favorite_decks_card_allocations_valid'
  ) then
    alter table public.favorite_decks
      add constraint favorite_decks_card_allocations_valid
      check (
        jsonb_typeof(card_allocation_overrides) = 'object'
        and (is_mounted or card_allocation_overrides = '{}'::jsonb)
      );
  end if;
end;
$$;

-- Conserva los repartos válidos cuando se modifica la composición de un mazo
-- montado. El cliente elimina antes las cartas que ya no forman parte de él.
create or replace function public.upsert_my_favorite_deck(p_favorite_deck jsonb)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_id uuid;
  v_name text;
  v_created_at timestamptz;
  v_normalized_deck jsonb;
  v_card_allocation_overrides jsonb;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  if p_favorite_deck is null or jsonb_typeof(p_favorite_deck) <> 'object' then
    raise exception 'Formato de mazo inválido';
  end if;

  v_id := nullif(p_favorite_deck ->> 'id', '')::uuid;
  v_name := btrim(p_favorite_deck ->> 'name');
  v_created_at := (p_favorite_deck ->> 'created_at')::timestamptz;
  v_normalized_deck := p_favorite_deck -> 'normalized_deck';
  v_card_allocation_overrides := coalesce(
    p_favorite_deck -> 'card_allocation_overrides',
    '{}'::jsonb
  );

  if v_id is null
    or nullif(v_name, '') is null
    or char_length(v_name) > 200
    or p_favorite_deck -> 'original_json' is null
    or p_favorite_deck -> 'original_json' = 'null'::jsonb
    or v_normalized_deck is null
    or jsonb_typeof(v_normalized_deck) <> 'object'
    or jsonb_typeof(v_normalized_deck -> 'allRequiredCards') is distinct from 'array'
    or jsonb_typeof(v_card_allocation_overrides) <> 'object'
    or v_created_at is null then
    raise exception 'El mazo contiene un registro inválido';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_normalized_deck -> 'allRequiredCards')
      as required_card("cardId" text, "requiredCount" integer)
    where required_card."cardId" is null
      or required_card."requiredCount" is null
      or required_card."requiredCount" < 0
  ) then
    raise exception 'El mazo contiene una carta inválida';
  end if;

  if exists (
    select 1
    from jsonb_each(v_card_allocation_overrides)
      as allocation_override(card_id, assigned_count)
    where allocation_override.card_id !~ '^[A-Z][A-Z0-9]{1,9}_[A-Z]{0,3}[0-9]{1,4}$'
      or jsonb_typeof(allocation_override.assigned_count) <> 'number'
      or (allocation_override.assigned_count #>> '{}') !~ '^[0-9]+$'
  ) then
    raise exception 'El reparto manual del mazo es inválido';
  end if;

  insert into public.favorite_decks (
    user_id,
    id,
    name,
    author,
    original_json,
    normalized_deck,
    created_at,
    updated_at,
    last_result,
    last_result_fingerprint,
    card_allocation_overrides
  )
  values (
    v_user_id,
    v_id,
    v_name,
    nullif(btrim(p_favorite_deck ->> 'author'), ''),
    p_favorite_deck -> 'original_json',
    v_normalized_deck,
    v_created_at,
    v_now,
    case
      when p_favorite_deck -> 'last_result' is null
        or p_favorite_deck -> 'last_result' = 'null'::jsonb then null
      else p_favorite_deck -> 'last_result'
    end,
    nullif(p_favorite_deck ->> 'last_result_fingerprint', ''),
    v_card_allocation_overrides
  )
  on conflict (user_id, id)
  do update set
    name = excluded.name,
    author = excluded.author,
    original_json = excluded.original_json,
    normalized_deck = excluded.normalized_deck,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    last_result = excluded.last_result,
    last_result_fingerprint = excluded.last_result_fingerprint,
    card_allocation_overrides = case
      when public.favorite_decks.is_mounted then excluded.card_allocation_overrides
      else '{}'::jsonb
    end;

  perform private.refresh_my_free_counts_impl();

  insert into public.user_sync_state (user_id, updated_at)
  values (v_user_id, v_now)
  on conflict (user_id)
  do update set updated_at = excluded.updated_at;

  return v_now;
end;
$$;

revoke all on function public.upsert_my_favorite_deck(jsonb) from public, anon;
grant execute on function public.upsert_my_favorite_deck(jsonb) to authenticated;

create or replace function public.set_my_mounted_card_allocations(
  p_card_id text,
  p_allocations jsonb
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_card_id text := upper(btrim(p_card_id));
  v_owned_count integer;
  v_total_required integer;
  v_total_assigned integer;
  v_required_decks integer;
  v_input_decks integer;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  if p_card_id is null
    or v_card_id !~ '^[A-Z][A-Z0-9]{1,9}_[A-Z]{0,3}[0-9]{1,4}$'
    or p_allocations is null
    or jsonb_typeof(p_allocations) <> 'array'
    or jsonb_array_length(p_allocations) = 0 then
    raise exception 'Reparto de carta inválido';
  end if;

  insert into public.user_sync_state (user_id, updated_at)
  values (v_user_id, v_now)
  on conflict (user_id) do nothing;

  perform 1
  from public.user_sync_state
  where user_id = v_user_id
  for update;

  with required_decks as (
    select
      deck.id,
      max(required_card."requiredCount")::integer as required_count
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
      and required_card."cardId" = v_card_id
      and required_card."requiredCount" > 0
    group by deck.id
  ),
  submitted as (
    select allocation.favorite_id, allocation.assigned_count
    from jsonb_to_recordset(p_allocations)
      as allocation(favorite_id uuid, assigned_count integer)
  )
  select
    (select count(*) from required_decks),
    (select count(*) from submitted),
    (select coalesce(sum(required_count), 0) from required_decks),
    (select coalesce(sum(assigned_count), 0) from submitted)
  into v_required_decks, v_input_decks, v_total_required, v_total_assigned;

  if v_required_decks = 0
    or v_input_decks <> v_required_decks
    or (
      select count(distinct allocation.favorite_id)
      from jsonb_to_recordset(p_allocations)
        as allocation(favorite_id uuid, assigned_count integer)
    ) <> v_input_decks then
    raise exception 'Debes indicar una vez todos los mazos que necesitan esta carta';
  end if;

  if exists (
    with required_decks as (
      select
        deck.id,
        max(required_card."requiredCount")::integer as required_count
      from public.favorite_decks as deck
      cross join lateral jsonb_to_recordset(deck.normalized_deck -> 'allRequiredCards')
        as required_card("cardId" text, "requiredCount" integer)
      where deck.user_id = v_user_id
        and deck.is_mounted
        and required_card."cardId" = v_card_id
      group by deck.id
    )
    select 1
    from jsonb_to_recordset(p_allocations)
      as allocation(favorite_id uuid, assigned_count integer)
    left join required_decks on required_decks.id = allocation.favorite_id
    where required_decks.id is null
      or allocation.assigned_count is null
      or allocation.assigned_count < 0
      or allocation.assigned_count > required_decks.required_count
  ) then
    raise exception 'El reparto contiene un mazo o una cantidad inválidos';
  end if;

  select coalesce(collection.owned_count, 0)
  into v_owned_count
  from (select 1) as singleton
  left join public.collection_cards as collection
    on collection.user_id = v_user_id
    and collection.card_id = v_card_id;

  if v_total_assigned <> least(v_owned_count, v_total_required) then
    raise exception 'El reparto debe asignar todas las copias disponibles sin superar la colección';
  end if;

  with submitted as (
    select allocation.favorite_id, allocation.assigned_count
    from jsonb_to_recordset(p_allocations)
      as allocation(favorite_id uuid, assigned_count integer)
  )
  update public.favorite_decks as deck
  set
    card_allocation_overrides = jsonb_set(
      coalesce(deck.card_allocation_overrides, '{}'::jsonb),
      array[v_card_id],
      to_jsonb(submitted.assigned_count),
      true
    ),
    preferred_card_ids = coalesce((
      select jsonb_agg(to_jsonb(preferred.card_id))
      from jsonb_array_elements_text(deck.preferred_card_ids) as preferred(card_id)
      where preferred.card_id <> v_card_id
    ), '[]'::jsonb),
    updated_at = v_now
  from submitted
  where deck.user_id = v_user_id
    and deck.id = submitted.favorite_id
    and deck.is_mounted;

  update public.user_sync_state
  set updated_at = v_now
  where user_id = v_user_id;

  return v_now;
end;
$$;

revoke all on function public.set_my_mounted_card_allocations(text, jsonb)
  from public, anon;
grant execute on function public.set_my_mounted_card_allocations(text, jsonb)
  to authenticated;

notify pgrst, 'reload schema';

commit;

select
  to_regprocedure('public.set_my_mounted_card_allocations(text,jsonb)') as reasignar_carta,
  count(*) filter (where is_mounted) as mazos_montados,
  count(*) filter (where not is_mounted) as favoritos
from public.favorite_decks;

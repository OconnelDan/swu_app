-- Permite reasignar una carta concreta entre mazos montados sin modificar la
-- composición ni el JSON de ninguno de ellos. Es segura para los datos
-- existentes: todos los mazos conservan inicialmente su reparto actual.

begin;

alter table public.favorite_decks
  add column if not exists preferred_card_ids jsonb not null default '[]'::jsonb;

update public.favorite_decks
set preferred_card_ids = '[]'::jsonb
where preferred_card_ids is null;

alter table public.favorite_decks
  alter column preferred_card_ids set default '[]'::jsonb;
alter table public.favorite_decks
  alter column preferred_card_ids set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.favorite_decks'::regclass
      and conname = 'favorite_decks_preferred_cards_valid'
  ) then
    alter table public.favorite_decks
      add constraint favorite_decks_preferred_cards_valid
      check (
        jsonb_typeof(preferred_card_ids) = 'array'
        and (is_mounted or jsonb_array_length(preferred_card_ids) = 0)
      );
  end if;
end;
$$;

-- Montar de nuevo un favorito siempre empieza sin prioridades específicas.
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
    preferred_card_ids = '[]'::jsonb,
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

-- Desmontar libera las copias y elimina preferencias que ya no tendrían
-- sentido fuera de la sección de Mazos montados.
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

  insert into public.user_sync_state (user_id, updated_at)
  values (v_user_id, v_now)
  on conflict (user_id) do nothing;

  perform 1
  from public.user_sync_state
  where user_id = v_user_id
  for update;

  update public.favorite_decks
  set
    is_mounted = false,
    mounted_at = null,
    allocation_priority = null,
    preferred_card_ids = '[]'::jsonb,
    updated_at = v_now
  where user_id = v_user_id
    and id = p_id
    and is_mounted;

  if found then
    perform private.refresh_my_free_counts_impl();

    update public.user_sync_state
    set updated_at = v_now
    where user_id = v_user_id;
  end if;

  return v_now;
end;
$$;

revoke all on function public.unmount_my_favorite_deck(uuid) from public, anon;
grant execute on function public.unmount_my_favorite_deck(uuid) to authenticated;

-- Solo el mazo objetivo conserva la preferencia para p_card_id. Al calcular
-- el reparto, recibirá primero las copias de esa carta y los otros mazos
-- seguirán guardados con su composición intacta, aunque puedan quedar
-- físicamente incompletos.
create or replace function public.prioritize_my_mounted_deck_card(
  p_id uuid,
  p_card_id text
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
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  if p_card_id is null
    or v_card_id !~ '^[A-Z][A-Z0-9]{1,9}_[A-Z]{0,3}[0-9]{1,4}$' then
    raise exception 'Código de carta inválido';
  end if;

  -- El bloqueo por usuario serializa movimientos, montajes y desmontajes que
  -- lleguen casi a la vez desde distintos dispositivos.
  insert into public.user_sync_state (user_id, updated_at)
  values (v_user_id, v_now)
  on conflict (user_id) do nothing;

  perform 1
  from public.user_sync_state
  where user_id = v_user_id
  for update;

  if not exists (
    select 1
    from public.favorite_decks
    where user_id = v_user_id
      and id = p_id
      and is_mounted
  ) then
    raise exception 'El mazo no existe o no está montado';
  end if;

  if not exists (
    select 1
    from public.favorite_decks as deck
    cross join lateral jsonb_to_recordset(
      case
        when jsonb_typeof(deck.normalized_deck -> 'allRequiredCards') = 'array'
          then deck.normalized_deck -> 'allRequiredCards'
        else '[]'::jsonb
      end
    ) as required_card("cardId" text, "requiredCount" integer)
    where deck.user_id = v_user_id
      and deck.id = p_id
      and deck.is_mounted
      and required_card."cardId" = v_card_id
      and required_card."requiredCount" > 0
  ) then
    raise exception 'La carta no forma parte de este mazo';
  end if;

  update public.favorite_decks as deck
  set
    preferred_card_ids = coalesce((
      select jsonb_agg(to_jsonb(preferred.card_id))
      from jsonb_array_elements_text(deck.preferred_card_ids)
        as preferred(card_id)
      where preferred.card_id <> v_card_id
    ), '[]'::jsonb),
    updated_at = v_now
  where deck.user_id = v_user_id
    and deck.preferred_card_ids ? v_card_id;

  update public.favorite_decks
  set
    preferred_card_ids = preferred_card_ids || jsonb_build_array(v_card_id),
    updated_at = v_now
  where user_id = v_user_id
    and id = p_id
    and is_mounted;

  if not found then
    raise exception 'El mazo ya no está montado';
  end if;

  update public.user_sync_state
  set updated_at = v_now
  where user_id = v_user_id;

  return v_now;
end;
$$;

revoke all on function public.prioritize_my_mounted_deck_card(uuid, text)
  from public, anon;
grant execute on function public.prioritize_my_mounted_deck_card(uuid, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;

select
  to_regprocedure('public.mount_my_favorite_deck(uuid)') as montar_mazo,
  to_regprocedure('public.unmount_my_favorite_deck(uuid)') as desmontar_mazo,
  to_regprocedure('public.prioritize_my_mounted_deck_card(uuid,text)') as mover_carta,
  count(*) filter (where is_mounted) as mazos_montados,
  count(*) filter (where not is_mounted) as favoritos
from public.favorite_decks;

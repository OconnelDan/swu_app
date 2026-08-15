-- Añade copias individuales a la colección de una cuenta sin sustituir la
-- colección completa. La operación está serializada por usuario para que dos
-- dispositivos no pierdan incrementos concurrentes.

begin;

create or replace function public.add_my_collection_card(
  p_card_id text,
  p_set_code text,
  p_card_number text,
  p_name text default null,
  p_quantity integer default 1
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_card_id text := upper(btrim(p_card_id));
  v_set_code text := upper(btrim(p_set_code));
  v_card_number text := upper(btrim(p_card_number));
  v_name text := nullif(btrim(p_name), '');
  v_owned_count integer;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 99 then
    raise exception 'La cantidad debe estar entre 1 y 99';
  end if;

  if p_card_id is null
    or p_set_code is null
    or p_card_number is null
    or v_set_code !~ '^[A-Z][A-Z0-9]{1,9}$'
    or v_card_number !~ '^[A-Z]{0,3}[0-9]{1,4}$'
    or v_card_id !~ '^[A-Z][A-Z0-9]{1,9}_[A-Z]{0,3}[0-9]{1,4}$'
    or v_card_id <> v_set_code || '_' || v_card_number then
    raise exception 'Código de carta inválido';
  end if;

  if v_name is not null and char_length(v_name) > 200 then
    raise exception 'El nombre de la carta es demasiado largo';
  end if;

  insert into public.user_sync_state (user_id, updated_at)
  values (v_user_id, v_now)
  on conflict (user_id) do nothing;

  perform 1
  from public.user_sync_state
  where user_id = v_user_id
  for update;

  insert into public.collection_cards as existing (
    user_id,
    card_id,
    set_code,
    card_number,
    name,
    owned_count,
    free_count,
    updated_at
  )
  values (
    v_user_id,
    v_card_id,
    v_set_code,
    v_card_number,
    v_name,
    p_quantity,
    p_quantity,
    v_now
  )
  on conflict (user_id, card_id)
  do update set
    set_code = excluded.set_code,
    card_number = excluded.card_number,
    name = coalesce(excluded.name, existing.name),
    owned_count = existing.owned_count + excluded.owned_count,
    updated_at = excluded.updated_at;

  perform private.refresh_my_free_counts_impl();

  update public.user_sync_state
  set updated_at = v_now
  where user_id = v_user_id;

  select card.owned_count
  into v_owned_count
  from public.collection_cards as card
  where card.user_id = v_user_id
    and card.card_id = v_card_id;

  return v_owned_count;
end;
$$;

revoke all on function public.add_my_collection_card(text, text, text, text, integer)
  from public, anon;
grant execute on function public.add_my_collection_card(text, text, text, text, integer)
  to authenticated;

notify pgrst, 'reload schema';

commit;

select
  to_regprocedure(
    'public.add_my_collection_card(text,text,text,text,integer)'
  ) as anadir_carta;

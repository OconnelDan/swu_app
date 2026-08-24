-- Permite reducir una carta desde el buscador sin carreras entre dispositivos.
-- Si la cantidad llega a cero se elimina la fila; los triggers del backup
-- diario siguen marcando la colección como modificada.

begin;

create or replace function public.remove_my_collection_card(
  p_card_id text,
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
  v_owned_count integer;
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 99 then
    raise exception 'La cantidad debe estar entre 1 y 99';
  end if;

  if p_card_id is null
    or v_card_id !~ '^[A-Z][A-Z0-9]{1,9}_[A-Z]{0,3}[0-9]{1,4}$' then
    raise exception 'Código de carta inválido';
  end if;

  insert into public.user_sync_state (user_id, updated_at)
  values (v_user_id, v_now)
  on conflict (user_id) do nothing;

  perform 1
  from public.user_sync_state
  where user_id = v_user_id
  for update;

  select card.owned_count
  into v_owned_count
  from public.collection_cards as card
  where card.user_id = v_user_id
    and card.card_id = v_card_id
  for update;

  if v_owned_count is null then
    raise exception 'La carta no está en tu colección';
  end if;

  v_owned_count := greatest(v_owned_count - p_quantity, 0);

  if v_owned_count = 0 then
    delete from public.collection_cards
    where user_id = v_user_id
      and card_id = v_card_id;
  else
    update public.collection_cards
    set
      owned_count = v_owned_count,
      updated_at = v_now
    where user_id = v_user_id
      and card_id = v_card_id;
  end if;

  perform private.refresh_my_free_counts_impl();

  update public.user_sync_state
  set updated_at = v_now
  where user_id = v_user_id;

  return v_owned_count;
end;
$$;

revoke all on function public.remove_my_collection_card(text, integer)
  from public, anon;
grant execute on function public.remove_my_collection_card(text, integer)
  to authenticated;

notify pgrst, 'reload schema';

commit;

select to_regprocedure('public.remove_my_collection_card(text,integer)') as restar_carta;

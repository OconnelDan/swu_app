-- Copia diaria de la colección por correo.
--
-- Cada cambio real en collection_cards marca la cuenta como pendiente. Una
-- Edge Function reclama los trabajos después del tiempo de inactividad,
-- envía como máximo un correo por día local y confirma la instantánea enviada.

begin;

-- ---------------------------------------------------------------------------
-- 1) Preferencias, historial de cambios e instantáneas enviadas
-- ---------------------------------------------------------------------------

create table if not exists public.collection_backup_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  email_enabled boolean not null default false,
  inactivity_minutes smallint not null default 15,
  timezone text not null default 'Europe/Madrid',
  last_change_at timestamptz,
  last_backed_up_change_at timestamptz,
  last_email_sent_at timestamptz,
  baseline_snapshot jsonb not null default '[]'::jsonb,
  pending_delivery_id uuid,
  processing_started_at timestamptz,
  retry_after timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collection_backup_inactivity_valid
    check (inactivity_minutes in (15, 30, 60)),
  constraint collection_backup_baseline_valid
    check (jsonb_typeof(baseline_snapshot) = 'array')
);

create table if not exists public.collection_backup_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  change_through_at timestamptz not null,
  timezone text not null,
  snapshot jsonb not null,
  previous_snapshot jsonb not null,
  status text not null default 'processing',
  attempt_count integer not null default 0,
  provider_message_id text,
  changed_card_count integer,
  card_count integer,
  total_copies integer,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint collection_backup_delivery_status_valid
    check (status in ('processing', 'sent', 'failed', 'skipped')),
  constraint collection_backup_delivery_snapshot_valid
    check (
      jsonb_typeof(snapshot) = 'array'
      and jsonb_typeof(previous_snapshot) = 'array'
    )
);

create index if not exists collection_backup_deliveries_user_created_idx
  on public.collection_backup_deliveries (user_id, created_at desc);

create table if not exists public.collection_change_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_id text not null,
  operation text not null,
  previous_owned_count integer,
  new_owned_count integer,
  changed_at timestamptz not null default now(),
  constraint collection_change_operation_valid
    check (operation in ('insert', 'update', 'delete'))
);

create index if not exists collection_change_log_user_changed_idx
  on public.collection_change_log (user_id, changed_at desc);

alter table public.collection_backup_settings enable row level security;
alter table public.collection_backup_deliveries enable row level security;
alter table public.collection_change_log enable row level security;

drop policy if exists collection_backup_settings_select_own
  on public.collection_backup_settings;
create policy collection_backup_settings_select_own
  on public.collection_backup_settings for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists collection_backup_deliveries_select_own
  on public.collection_backup_deliveries;
create policy collection_backup_deliveries_select_own
  on public.collection_backup_deliveries for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists collection_change_log_select_own
  on public.collection_change_log;
create policy collection_change_log_select_own
  on public.collection_change_log for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.collection_backup_settings from public, anon, authenticated;
revoke all on public.collection_backup_deliveries from public, anon, authenticated;
revoke all on public.collection_change_log from public, anon, authenticated;
grant select on public.collection_backup_settings to authenticated;
grant select on public.collection_backup_deliveries to authenticated;
grant select on public.collection_change_log to authenticated;
grant select on public.collection_backup_settings to service_role;

-- ---------------------------------------------------------------------------
-- 2) Instantánea canónica restaurable
-- ---------------------------------------------------------------------------

create or replace function private.build_collection_backup_snapshot(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'cardId', card.card_id,
          'setCode', card.set_code,
          'cardNumber', card.card_number,
          'name', card.name,
          'ownedCount', card.owned_count
        )
      )
      order by card.card_id
    ),
    '[]'::jsonb
  )
  from public.collection_cards as card
  where card.user_id = p_user_id
    and card.owned_count > 0;
$$;

revoke all on function private.build_collection_backup_snapshot(uuid)
  from public, anon, authenticated;

-- Crea una línea de historial por carta. Los cambios de free_count provocados
-- por montar/desmontar mazos no modifican la colección física y se ignoran.
create or replace function private.log_collection_card_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_card_id text;
  v_previous integer;
  v_current integer;
  v_log_id bigint;
begin
  if tg_op = 'UPDATE'
    and new.card_id is not distinct from old.card_id
    and new.set_code is not distinct from old.set_code
    and new.card_number is not distinct from old.card_number
    and new.name is not distinct from old.name
    and new.owned_count is not distinct from old.owned_count then
    return null;
  end if;

  v_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  v_card_id := case when tg_op = 'DELETE' then old.card_id else new.card_id end;
  v_previous := case when tg_op = 'INSERT' then null else old.owned_count end;
  v_current := case when tg_op = 'DELETE' then null else new.owned_count end;

  -- Al borrar una cuenta, el cascade elimina también collection_cards. En ese
  -- caso no se crea un historial nuevo para un perfil que ya está desapareciendo.
  if not exists (
    select 1 from public.profiles as profile where profile.id = v_user_id
  ) then
    return null;
  end if;

  insert into public.collection_change_log (
    user_id,
    card_id,
    operation,
    previous_owned_count,
    new_owned_count,
    changed_at
  )
  values (
    v_user_id,
    v_card_id,
    lower(tg_op),
    v_previous,
    v_current,
    clock_timestamp()
  )
  returning id into v_log_id;

  -- Evita que una cuenta que nunca active el correo acumule un historial
  -- ilimitado. La limpieza se hace solo una vez por cada 500 cambios globales.
  if mod(v_log_id, 500) = 0 then
    delete from public.collection_change_log as old_change
    where old_change.user_id = v_user_id
      and (
        old_change.changed_at < clock_timestamp() - interval '90 days'
        or old_change.id in (
          select change.id
          from public.collection_change_log as change
          where change.user_id = v_user_id
          order by change.changed_at desc, change.id desc
          offset 20000
        )
      );
  end if;

  return null;
end;
$$;

revoke all on function private.log_collection_card_change()
  from public, anon, authenticated;

drop trigger if exists collection_backup_log_row on public.collection_cards;
create trigger collection_backup_log_row
  after insert or update or delete on public.collection_cards
  for each row execute function private.log_collection_card_change();

-- Un disparador por sentencia marca solo una vez cada usuario aunque una
-- importación sustituya miles de cartas.
create or replace function private.mark_collection_backup_dirty_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  insert into public.collection_backup_settings (
    user_id,
    email_enabled,
    last_change_at,
    last_backed_up_change_at,
    baseline_snapshot,
    updated_at
  )
  select distinct
    inserted.user_id,
    false,
    v_now,
    v_now,
    private.build_collection_backup_snapshot(inserted.user_id),
    v_now
  from new_rows as inserted
  join public.profiles as profile on profile.id = inserted.user_id
  on conflict (user_id)
  do update set
    last_change_at = excluded.last_change_at,
    updated_at = excluded.updated_at;

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
begin
  insert into public.collection_backup_settings (
    user_id,
    email_enabled,
    last_change_at,
    last_backed_up_change_at,
    baseline_snapshot,
    updated_at
  )
  select distinct
    deleted.user_id,
    false,
    v_now,
    v_now,
    private.build_collection_backup_snapshot(deleted.user_id),
    v_now
  from old_rows as deleted
  join public.profiles as profile on profile.id = deleted.user_id
  on conflict (user_id)
  do update set
    last_change_at = excluded.last_change_at,
    updated_at = excluded.updated_at;

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
begin
  insert into public.collection_backup_settings (
    user_id,
    email_enabled,
    last_change_at,
    last_backed_up_change_at,
    baseline_snapshot,
    updated_at
  )
  select distinct
    changed.user_id,
    false,
    v_now,
    v_now,
    private.build_collection_backup_snapshot(changed.user_id),
    v_now
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
  on conflict (user_id)
  do update set
    last_change_at = excluded.last_change_at,
    updated_at = excluded.updated_at;

  return null;
end;
$$;

revoke all on function private.mark_collection_backup_dirty_after_insert()
  from public, anon, authenticated;
revoke all on function private.mark_collection_backup_dirty_after_delete()
  from public, anon, authenticated;
revoke all on function private.mark_collection_backup_dirty_after_update()
  from public, anon, authenticated;

drop trigger if exists collection_backup_dirty_insert on public.collection_cards;
create trigger collection_backup_dirty_insert
  after insert on public.collection_cards
  referencing new table as new_rows
  for each statement execute function private.mark_collection_backup_dirty_after_insert();

drop trigger if exists collection_backup_dirty_delete on public.collection_cards;
create trigger collection_backup_dirty_delete
  after delete on public.collection_cards
  referencing old table as old_rows
  for each statement execute function private.mark_collection_backup_dirty_after_delete();

drop trigger if exists collection_backup_dirty_update on public.collection_cards;
create trigger collection_backup_dirty_update
  after update on public.collection_cards
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.mark_collection_backup_dirty_after_update();

-- Los datos anteriores a esta migración se toman como línea base. No se envía
-- un correo al instalar la función; solo después de que el usuario la active y
-- realice un cambio nuevo.
insert into public.collection_backup_settings (
  user_id,
  email_enabled,
  inactivity_minutes,
  timezone,
  baseline_snapshot
)
select
  profile.id,
  false,
  15,
  'Europe/Madrid',
  private.build_collection_backup_snapshot(profile.id)
from public.profiles as profile
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3) Preferencias disponibles para Mi cuenta
-- ---------------------------------------------------------------------------

create or replace function public.get_my_collection_backup_settings()
returns table (
  email_enabled boolean,
  inactivity_minutes smallint,
  timezone text,
  last_change_at timestamptz,
  last_backed_up_change_at timestamptz,
  last_email_sent_at timestamptz,
  has_pending_changes boolean,
  last_error text
)
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

  insert into public.collection_backup_settings (
    user_id,
    baseline_snapshot
  )
  values (
    v_user_id,
    private.build_collection_backup_snapshot(v_user_id)
  )
  on conflict (user_id) do nothing;

  return query
  select
    settings.email_enabled,
    settings.inactivity_minutes,
    settings.timezone,
    settings.last_change_at,
    settings.last_backed_up_change_at,
    settings.last_email_sent_at,
    settings.email_enabled
      and settings.last_change_at is not null
      and (
        settings.last_backed_up_change_at is null
        or settings.last_change_at > settings.last_backed_up_change_at
      ),
    settings.last_error
  from public.collection_backup_settings as settings
  where settings.user_id = v_user_id;
end;
$$;

revoke all on function public.get_my_collection_backup_settings()
  from public, anon;
grant execute on function public.get_my_collection_backup_settings()
  to authenticated;

create or replace function public.update_my_collection_backup_settings(
  p_email_enabled boolean,
  p_inactivity_minutes integer,
  p_timezone text
)
returns table (
  email_enabled boolean,
  inactivity_minutes smallint,
  timezone text,
  last_change_at timestamptz,
  last_backed_up_change_at timestamptz,
  last_email_sent_at timestamptz,
  has_pending_changes boolean,
  last_error text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_was_enabled boolean;
  v_pending_delivery_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;
  if p_email_enabled is null then
    raise exception 'Debes indicar si las copias están activadas';
  end if;
  if p_inactivity_minutes is null or p_inactivity_minutes not in (15, 30, 60) then
    raise exception 'El tiempo de inactividad debe ser 15, 30 o 60 minutos';
  end if;
  if p_timezone is null
    or not exists (
      select 1
      from pg_catalog.pg_timezone_names as zone
      where zone.name = p_timezone
    ) then
    raise exception 'Zona horaria inválida';
  end if;

  insert into public.collection_backup_settings (
    user_id,
    baseline_snapshot
  )
  values (
    v_user_id,
    private.build_collection_backup_snapshot(v_user_id)
  )
  on conflict (user_id) do nothing;

  select settings.email_enabled, settings.pending_delivery_id
  into v_was_enabled, v_pending_delivery_id
  from public.collection_backup_settings as settings
  where settings.user_id = v_user_id
  for update;

  if not p_email_enabled and v_was_enabled and v_pending_delivery_id is not null then
    update public.collection_backup_deliveries as delivery
    set
      status = 'skipped',
      error_message = 'El usuario desactivó la copia antes del envío.',
      updated_at = v_now
    where delivery.id = v_pending_delivery_id
      and delivery.user_id = v_user_id
      and delivery.status in ('processing', 'failed');
  end if;

  update public.collection_backup_settings as settings
  set
    email_enabled = p_email_enabled,
    inactivity_minutes = p_inactivity_minutes,
    timezone = p_timezone,
    baseline_snapshot = case
      when p_email_enabled and not v_was_enabled
        then private.build_collection_backup_snapshot(v_user_id)
      else settings.baseline_snapshot
    end,
    last_backed_up_change_at = case
      when p_email_enabled and not v_was_enabled then settings.last_change_at
      else settings.last_backed_up_change_at
    end,
    pending_delivery_id = case
      when p_email_enabled and v_was_enabled then settings.pending_delivery_id
      else null
    end,
    processing_started_at = case
      when p_email_enabled and v_was_enabled then settings.processing_started_at
      else null
    end,
    retry_after = case
      when p_email_enabled and v_was_enabled then settings.retry_after
      else null
    end,
    last_error = case
      when p_email_enabled and v_was_enabled then settings.last_error
      else null
    end,
    updated_at = v_now
  where settings.user_id = v_user_id;

  return query
  select * from public.get_my_collection_backup_settings();
end;
$$;

revoke all on function public.update_my_collection_backup_settings(boolean, integer, text)
  from public, anon;
grant execute on function public.update_my_collection_backup_settings(boolean, integer, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Cola atómica consumida únicamente por la Edge Function
-- ---------------------------------------------------------------------------

create or replace function public.claim_due_collection_backups(p_limit integer default 10)
returns table (
  delivery_id uuid,
  user_id uuid,
  change_through_at timestamptz,
  timezone text,
  current_snapshot jsonb,
  previous_snapshot jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_candidate record;
  v_delivery public.collection_backup_deliveries%rowtype;
  v_delivery_id uuid;
  v_snapshot jsonb;
  v_previous_snapshot jsonb;
  v_change_through_at timestamptz;
begin
  p_limit := greatest(1, least(coalesce(p_limit, 10), 50));

  for v_candidate in
    select settings.*
    from public.collection_backup_settings as settings
    where settings.email_enabled
      and settings.last_change_at is not null
      and (
        settings.last_backed_up_change_at is null
        or settings.last_change_at > settings.last_backed_up_change_at
      )
      and settings.last_change_at
        <= v_now - make_interval(mins => settings.inactivity_minutes)
      and (
        settings.last_email_sent_at is null
        or (settings.last_email_sent_at at time zone settings.timezone)::date
          < (v_now at time zone settings.timezone)::date
      )
      and (
        settings.processing_started_at is null
        or settings.processing_started_at < v_now - interval '30 minutes'
      )
      and (settings.retry_after is null or settings.retry_after <= v_now)
    order by settings.last_change_at
    for update skip locked
    limit p_limit
  loop
    v_delivery := null;

    if v_candidate.pending_delivery_id is not null then
      select delivery.*
      into v_delivery
      from public.collection_backup_deliveries as delivery
      where delivery.id = v_candidate.pending_delivery_id
        and delivery.user_id = v_candidate.user_id
        and delivery.status in ('processing', 'failed');
    end if;

    if v_delivery.id is not null then
      v_delivery_id := v_delivery.id;
      v_snapshot := v_delivery.snapshot;
      v_previous_snapshot := v_delivery.previous_snapshot;
      v_change_through_at := v_delivery.change_through_at;
    else
      v_delivery_id := gen_random_uuid();
      v_snapshot := private.build_collection_backup_snapshot(v_candidate.user_id);
      v_previous_snapshot := v_candidate.baseline_snapshot;
      v_change_through_at := v_candidate.last_change_at;

      insert into public.collection_backup_deliveries (
        id,
        user_id,
        change_through_at,
        timezone,
        snapshot,
        previous_snapshot,
        status,
        attempt_count,
        created_at,
        updated_at
      )
      values (
        v_delivery_id,
        v_candidate.user_id,
        v_change_through_at,
        v_candidate.timezone,
        v_snapshot,
        v_previous_snapshot,
        'processing',
        0,
        v_now,
        v_now
      );
    end if;

    update public.collection_backup_deliveries as delivery
    set
      status = 'processing',
      attempt_count = delivery.attempt_count + 1,
      error_message = null,
      updated_at = v_now
    where delivery.id = v_delivery_id;

    update public.collection_backup_settings as settings
    set
      pending_delivery_id = v_delivery_id,
      processing_started_at = v_now,
      retry_after = null,
      updated_at = v_now
    where settings.user_id = v_candidate.user_id;

    delivery_id := v_delivery_id;
    user_id := v_candidate.user_id;
    change_through_at := v_change_through_at;
    timezone := v_candidate.timezone;
    current_snapshot := v_snapshot;
    previous_snapshot := v_previous_snapshot;
    return next;
  end loop;
end;
$$;

revoke all on function public.claim_due_collection_backups(integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_collection_backups(integer)
  to service_role;

create or replace function public.complete_collection_backup_delivery(
  p_delivery_id uuid,
  p_provider_message_id text,
  p_changed_card_count integer,
  p_card_count integer,
  p_total_copies integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_delivery public.collection_backup_deliveries%rowtype;
begin
  select delivery.*
  into v_delivery
  from public.collection_backup_deliveries as delivery
  where delivery.id = p_delivery_id
  for update;

  if v_delivery.id is null then
    raise exception 'Envío de copia inexistente';
  end if;
  if v_delivery.status = 'sent' then
    return;
  end if;
  if p_changed_card_count is null or p_changed_card_count < 1
    or p_card_count is null or p_card_count < 0
    or p_total_copies is null or p_total_copies < 0 then
    raise exception 'Resumen de la copia inválido';
  end if;

  update public.collection_backup_deliveries as delivery
  set
    status = 'sent',
    provider_message_id = nullif(btrim(p_provider_message_id), ''),
    changed_card_count = p_changed_card_count,
    card_count = p_card_count,
    total_copies = p_total_copies,
    error_message = null,
    sent_at = v_now,
    updated_at = v_now
  where delivery.id = p_delivery_id;

  update public.collection_backup_settings as settings
  set
    baseline_snapshot = v_delivery.snapshot,
    last_backed_up_change_at = v_delivery.change_through_at,
    last_email_sent_at = v_now,
    pending_delivery_id = null,
    processing_started_at = null,
    retry_after = null,
    last_error = null,
    updated_at = v_now
  where settings.user_id = v_delivery.user_id
    and settings.pending_delivery_id = p_delivery_id;

  delete from public.collection_backup_deliveries as old_delivery
  where old_delivery.id in (
    select delivery.id
    from public.collection_backup_deliveries as delivery
    where delivery.user_id = v_delivery.user_id
      and delivery.status in ('sent', 'skipped')
    order by delivery.created_at desc
    offset 30
  );

  delete from public.collection_change_log as change
  where change.user_id = v_delivery.user_id
    and change.changed_at < v_now - interval '90 days';
end;
$$;

revoke all on function public.complete_collection_backup_delivery(
  uuid, text, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.complete_collection_backup_delivery(
  uuid, text, integer, integer, integer
) to service_role;

create or replace function public.skip_collection_backup_delivery(
  p_delivery_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_delivery public.collection_backup_deliveries%rowtype;
begin
  select delivery.*
  into v_delivery
  from public.collection_backup_deliveries as delivery
  where delivery.id = p_delivery_id
  for update;

  if v_delivery.id is null then
    raise exception 'Envío de copia inexistente';
  end if;
  if v_delivery.status in ('sent', 'skipped') then
    return;
  end if;

  update public.collection_backup_deliveries as delivery
  set
    status = 'skipped',
    error_message = left(coalesce(p_reason, 'Sin cambios netos'), 1000),
    updated_at = v_now
  where delivery.id = p_delivery_id;

  update public.collection_backup_settings as settings
  set
    baseline_snapshot = v_delivery.snapshot,
    last_backed_up_change_at = v_delivery.change_through_at,
    pending_delivery_id = null,
    processing_started_at = null,
    retry_after = null,
    last_error = null,
    updated_at = v_now
  where settings.user_id = v_delivery.user_id
    and settings.pending_delivery_id = p_delivery_id;
end;
$$;

revoke all on function public.skip_collection_backup_delivery(uuid, text)
  from public, anon, authenticated;
grant execute on function public.skip_collection_backup_delivery(uuid, text)
  to service_role;

create or replace function public.fail_collection_backup_delivery(
  p_delivery_id uuid,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_error text := left(coalesce(nullif(btrim(p_error), ''), 'Error de envío desconocido'), 1000);
  v_user_id uuid;
begin
  update public.collection_backup_deliveries as delivery
  set
    status = 'failed',
    error_message = v_error,
    updated_at = v_now
  where delivery.id = p_delivery_id
  returning delivery.user_id into v_user_id;

  if v_user_id is null then
    return;
  end if;

  update public.collection_backup_settings as settings
  set
    processing_started_at = null,
    retry_after = v_now + interval '30 minutes',
    last_error = v_error,
    updated_at = v_now
  where settings.user_id = v_user_id
    and settings.pending_delivery_id = p_delivery_id;
end;
$$;

revoke all on function public.fail_collection_backup_delivery(uuid, text)
  from public, anon, authenticated;
grant execute on function public.fail_collection_backup_delivery(uuid, text)
  to service_role;

notify pgrst, 'reload schema';

commit;

select
  to_regprocedure('public.get_my_collection_backup_settings()') as leer_ajustes,
  to_regprocedure(
    'public.update_my_collection_backup_settings(boolean,integer,text)'
  ) as guardar_ajustes,
  to_regprocedure('public.claim_due_collection_backups(integer)') as reclamar_copias;

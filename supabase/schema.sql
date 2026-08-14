-- Backend opcional de SWU Deck Vault: cuentas, copia en la nube y amigos.
--
-- Este archivo sirve tanto para una instalación nueva como para actualizar el
-- esquema inicial. Ejecútalo completo desde Supabase -> SQL Editor.
-- La aplicación continúa funcionando solo con IndexedDB si Supabase no está
-- configurado.

-- Las funciones que necesitan atravesar RLS viven en un esquema no expuesto
-- por la API. En public solo se publican envoltorios SECURITY INVOKER.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- 1) Perfiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username));

alter table public.profiles enable row level security;

drop policy if exists "los perfiles son visibles por cualquier usuario autenticado"
  on public.profiles;
drop policy if exists "cada usuario crea su propio perfil" on public.profiles;
drop policy if exists "cada usuario edita su propio perfil" on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- El perfil se crea desde la base de datos, también cuando el usuario confirma
-- un enlace mágico y todavía no existe una sesión en el navegador.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text;
begin
  v_username := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'username'), ''),
    'Jugador-' || upper(substr(replace(new.id::text, '-', ''), 1, 8))
  );

  insert into public.profiles (id, username)
  values (new.id, v_username)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Cubre usuarios creados antes de instalar esta versión del esquema.
insert into public.profiles (id, username)
select
  users.id,
  'Jugador-' || upper(substr(replace(users.id::text, '-', ''), 1, 8))
from auth.users as users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2) Invitaciones y amistades
-- ---------------------------------------------------------------------------

create table if not exists public.friend_invite_codes (
  code text primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_by uuid references public.profiles (id),
  used_at timestamptz
);

alter table public.friend_invite_codes
  alter column expires_at set default (now() + interval '7 days');
update public.friend_invite_codes
set expires_at = created_at + interval '7 days'
where expires_at is null;
alter table public.friend_invite_codes alter column expires_at set not null;

alter table public.friend_invite_codes enable row level security;

drop policy if exists "el dueño gestiona sus propios códigos"
  on public.friend_invite_codes;
drop policy if exists friend_codes_manage_own on public.friend_invite_codes;

create policy friend_codes_manage_own
  on public.friend_invite_codes for all
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references public.profiles (id) on delete cascade,
  user_b_id uuid not null references public.profiles (id) on delete cascade,
  share_full_collection_a_to_b boolean not null default false,
  share_full_collection_b_to_a boolean not null default false,
  created_at timestamptz not null default now(),
  constraint different_users check (user_a_id <> user_b_id),
  constraint ordered_pair check (user_a_id < user_b_id),
  unique (user_a_id, user_b_id)
);

create index if not exists friendships_user_a_idx on public.friendships (user_a_id);
create index if not exists friendships_user_b_idx on public.friendships (user_b_id);

alter table public.friendships enable row level security;

drop policy if exists "cada usuario ve sus propias amistades" on public.friendships;
drop policy if exists "cada usuario ajusta su propia preferencia de compartir"
  on public.friendships;
drop policy if exists friendships_select_own on public.friendships;
drop policy if exists friendships_delete_own on public.friendships;

create policy friendships_select_own
  on public.friendships for select
  to authenticated
  using ((select auth.uid()) = user_a_id or (select auth.uid()) = user_b_id);

create policy friendships_delete_own
  on public.friendships for delete
  to authenticated
  using ((select auth.uid()) = user_a_id or (select auth.uid()) = user_b_id);

-- ---------------------------------------------------------------------------
-- 3) Copia de la colección y los mazos por usuario
-- ---------------------------------------------------------------------------

create table if not exists public.collection_cards (
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_id text not null,
  set_code text not null,
  card_number text not null,
  name text,
  owned_count integer not null default 0,
  free_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id),
  constraint collection_owned_nonnegative check (owned_count >= 0),
  constraint collection_free_valid check (free_count >= 0 and free_count <= owned_count)
);

-- Migración desde el primer prototipo, que solo tenía card_id y owned_count.
alter table public.collection_cards add column if not exists set_code text;
alter table public.collection_cards add column if not exists card_number text;
alter table public.collection_cards add column if not exists name text;
alter table public.collection_cards add column if not exists free_count integer;

update public.collection_cards
set
  set_code = coalesce(set_code, split_part(card_id, '_', 1)),
  card_number = coalesce(card_number, split_part(card_id, '_', 2)),
  free_count = coalesce(free_count, owned_count)
where set_code is null or card_number is null or free_count is null;

alter table public.collection_cards alter column set_code set not null;
alter table public.collection_cards alter column card_number set not null;
alter table public.collection_cards alter column free_count set default 0;
alter table public.collection_cards alter column free_count set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.collection_cards'::regclass
      and conname = 'collection_owned_nonnegative'
  ) then
    alter table public.collection_cards
      add constraint collection_owned_nonnegative check (owned_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.collection_cards'::regclass
      and conname = 'collection_free_valid'
  ) then
    alter table public.collection_cards
      add constraint collection_free_valid
      check (free_count >= 0 and free_count <= owned_count);
  end if;
end;
$$;

create index if not exists collection_cards_card_id_idx
  on public.collection_cards (card_id);

alter table public.collection_cards enable row level security;

drop policy if exists "cada usuario gestiona solo su propia colección en la nube"
  on public.collection_cards;
drop policy if exists collection_cards_manage_own on public.collection_cards;

create policy collection_cards_manage_own
  on public.collection_cards for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists public.favorite_decks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  id uuid not null,
  name text not null,
  author text,
  original_json jsonb not null,
  normalized_deck jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  last_result jsonb,
  last_result_fingerprint text,
  is_mounted boolean not null default false,
  mounted_at timestamptz,
  allocation_priority bigint,
  constraint favorite_decks_mount_state_valid check (
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
  ),
  primary key (user_id, id)
);

-- Migración desde la versión donde todo favorito consumía cartas.
alter table public.favorite_decks add column if not exists is_mounted boolean;
alter table public.favorite_decks add column if not exists mounted_at timestamptz;
alter table public.favorite_decks add column if not exists allocation_priority bigint;

update public.favorite_decks
set
  is_mounted = false,
  mounted_at = null,
  allocation_priority = null
where is_mounted is null;

alter table public.favorite_decks alter column is_mounted set default false;
alter table public.favorite_decks alter column is_mounted set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
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

create index if not exists favorite_decks_user_updated_idx
  on public.favorite_decks (user_id, updated_at desc);

create unique index if not exists favorite_decks_user_allocation_priority_idx
  on public.favorite_decks (user_id, allocation_priority)
  where is_mounted;

alter table public.favorite_decks enable row level security;

drop policy if exists favorite_decks_manage_own on public.favorite_decks;
create policy favorite_decks_manage_own
  on public.favorite_decks for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists public.user_sync_state (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table public.user_sync_state enable row level security;

drop policy if exists user_sync_state_manage_own on public.user_sync_state;
create policy user_sync_state_manage_own
  on public.user_sync_state for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Privilegios mínimos para el cliente web. RLS sigue filtrando cada fila.
revoke all on public.profiles from anon;
revoke all on public.friend_invite_codes from anon;
revoke all on public.friendships from anon;
revoke all on public.collection_cards from anon;
revoke all on public.favorite_decks from anon;
revoke all on public.user_sync_state from anon;

revoke all on public.profiles from authenticated;
revoke all on public.friend_invite_codes from authenticated;
revoke all on public.friendships from authenticated;
revoke all on public.collection_cards from authenticated;
revoke all on public.favorite_decks from authenticated;
revoke all on public.user_sync_state from authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.friend_invite_codes to authenticated;
grant select, delete on public.friendships to authenticated;
grant select, insert, update, delete on public.collection_cards to authenticated;
grant select, insert, update, delete on public.favorite_decks to authenticated;
grant select, insert, update, delete on public.user_sync_state to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Funciones de cuenta y sincronización
-- ---------------------------------------------------------------------------

-- Sustituye colección y mazos juntos. Si cualquier fila es inválida, Postgres
-- revierte toda la llamada y la copia anterior permanece intacta.
create or replace function public.replace_my_data(
  p_collection jsonb,
  p_favorite_decks jsonb
)
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

  if p_collection is null
    or p_favorite_decks is null
    or jsonb_typeof(p_collection) <> 'array'
    or jsonb_typeof(p_favorite_decks) <> 'array' then
    raise exception 'Formato de sincronización inválido';
  end if;

  if jsonb_array_length(p_collection) > 5000 then
    raise exception 'La colección supera el límite permitido';
  end if;

  if jsonb_array_length(p_favorite_decks) > 500 then
    raise exception 'El número de mazos supera el límite permitido';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_collection) as card(
      card_id text,
      set_code text,
      card_number text,
      name text,
      owned_count integer,
      free_count integer
    )
    where card.card_id is null
      or card.set_code is null
      or card.card_number is null
      or card.card_id <> card.set_code || '_' || card.card_number
      or card.card_id !~ '^[A-Z][A-Z0-9]{1,9}_[A-Z]{0,3}[0-9]{1,4}$'
      or card.owned_count is null
      or card.owned_count < 0
      or card.free_count is null
      or card.free_count < 0
      or card.free_count > card.owned_count
  ) then
    raise exception 'La colección contiene una carta inválida';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_favorite_decks) as deck(
      id uuid,
      name text,
      author text,
      original_json jsonb,
      normalized_deck jsonb,
      created_at timestamptz,
      updated_at timestamptz,
      last_result jsonb,
      last_result_fingerprint text,
      is_mounted boolean,
      mounted_at timestamptz,
      allocation_priority bigint
    )
    where deck.id is null
      or nullif(btrim(deck.name), '') is null
      or char_length(deck.name) > 200
      or deck.original_json is null
      or deck.normalized_deck is null
      or jsonb_typeof(deck.normalized_deck) <> 'object'
      or deck.created_at is null
      or deck.updated_at is null
      or (
        coalesce(deck.is_mounted, false)
        and (
          deck.mounted_at is null
          or deck.allocation_priority is null
          or deck.allocation_priority <= 0
        )
      )
      or (
        not coalesce(deck.is_mounted, false)
        and (deck.mounted_at is not null or deck.allocation_priority is not null)
      )
  ) then
    raise exception 'Los mazos contienen un registro inválido';
  end if;

  delete from public.collection_cards where user_id = v_user_id;

  insert into public.collection_cards (
    user_id,
    card_id,
    set_code,
    card_number,
    name,
    owned_count,
    free_count,
    updated_at
  )
  select
    v_user_id,
    card.card_id,
    card.set_code,
    card.card_number,
    nullif(btrim(card.name), ''),
    card.owned_count,
    card.free_count,
    v_now
  from jsonb_to_recordset(p_collection) as card(
    card_id text,
    set_code text,
    card_number text,
    name text,
    owned_count integer,
    free_count integer
  );

  delete from public.favorite_decks where user_id = v_user_id;

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
    is_mounted,
    mounted_at,
    allocation_priority
  )
  select
    v_user_id,
    deck.id,
    btrim(deck.name),
    nullif(btrim(deck.author), ''),
    deck.original_json,
    deck.normalized_deck,
    deck.created_at,
    deck.updated_at,
    deck.last_result,
    deck.last_result_fingerprint,
    coalesce(deck.is_mounted, false),
    deck.mounted_at,
    deck.allocation_priority
  from jsonb_to_recordset(p_favorite_decks) as deck(
    id uuid,
    name text,
    author text,
    original_json jsonb,
    normalized_deck jsonb,
    created_at timestamptz,
    updated_at timestamptz,
    last_result jsonb,
    last_result_fingerprint text,
    is_mounted boolean,
    mounted_at timestamptz,
    allocation_priority bigint
  );

  perform private.refresh_my_free_counts_impl();

  insert into public.user_sync_state (user_id, updated_at)
  values (v_user_id, v_now)
  on conflict (user_id)
  do update set updated_at = excluded.updated_at;

  return v_now;
end;
$$;

revoke all on function public.replace_my_data(jsonb, jsonb) from public, anon;
grant execute on function public.replace_my_data(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Escritura directa: Supabase es la fuente de verdad de las cuentas
-- ---------------------------------------------------------------------------

-- Recalcula las copias libres usando exclusivamente los mazos montados. Los
-- favoritos son ideas guardadas y no consumen colección. Solo actúa sobre
-- auth.uid(), incluso si se invoca directamente.
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

-- Una nueva importación sustituye únicamente la colección. Los mazos que se
-- hayan creado desde otro navegador permanecen intactos.
create or replace function public.replace_my_collection(p_collection jsonb)
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

  if p_collection is null or jsonb_typeof(p_collection) <> 'array' then
    raise exception 'Formato de colección inválido';
  end if;

  if jsonb_array_length(p_collection) > 5000 then
    raise exception 'La colección supera el límite permitido';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_collection) as card(
      card_id text,
      set_code text,
      card_number text,
      name text,
      owned_count integer
    )
    where card.card_id is null
      or card.set_code is null
      or card.card_number is null
      or card.card_id <> card.set_code || '_' || card.card_number
      or card.card_id !~ '^[A-Z][A-Z0-9]{1,9}_[A-Z]{0,3}[0-9]{1,4}$'
      or card.owned_count is null
      or card.owned_count < 0
  ) then
    raise exception 'La colección contiene una carta inválida';
  end if;

  delete from public.collection_cards where user_id = v_user_id;

  insert into public.collection_cards (
    user_id,
    card_id,
    set_code,
    card_number,
    name,
    owned_count,
    free_count,
    updated_at
  )
  select
    v_user_id,
    card.card_id,
    card.set_code,
    card.card_number,
    nullif(btrim(card.name), ''),
    card.owned_count,
    card.owned_count,
    v_now
  from jsonb_to_recordset(p_collection) as card(
    card_id text,
    set_code text,
    card_number text,
    name text,
    owned_count integer
  );

  perform private.refresh_my_free_counts_impl();

  insert into public.user_sync_state (user_id, updated_at)
  values (v_user_id, v_now)
  on conflict (user_id)
  do update set updated_at = excluded.updated_at;

  return v_now;
end;
$$;

revoke all on function public.replace_my_collection(jsonb) from public, anon;
grant execute on function public.replace_my_collection(jsonb) to authenticated;

-- Inserta o actualiza un único mazo. No sustituye los demás favoritos y
-- recalcula las copias libres de la colección en la misma transacción.
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

  if v_id is null
    or nullif(v_name, '') is null
    or char_length(v_name) > 200
    or p_favorite_deck -> 'original_json' is null
    or p_favorite_deck -> 'original_json' = 'null'::jsonb
    or v_normalized_deck is null
    or jsonb_typeof(v_normalized_deck) <> 'object'
    or jsonb_typeof(v_normalized_deck -> 'allRequiredCards') is distinct from 'array'
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
    last_result_fingerprint
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
    nullif(p_favorite_deck ->> 'last_result_fingerprint', '')
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
    last_result_fingerprint = excluded.last_result_fingerprint;

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

-- Elimina solo el mazo indicado y libera sus cartas para las consultas de
-- amigos sin alterar ningún otro mazo.
create or replace function public.delete_my_favorite_deck(p_id uuid)
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

  delete from public.favorite_decks
  where user_id = v_user_id and id = p_id;

  perform private.refresh_my_free_counts_impl();

  insert into public.user_sync_state (user_id, updated_at)
  values (v_user_id, v_now)
  on conflict (user_id)
  do update set updated_at = excluded.updated_at;

  return v_now;
end;
$$;

revoke all on function public.delete_my_favorite_deck(uuid) from public, anon;
grant execute on function public.delete_my_favorite_deck(uuid) to authenticated;

-- Convierte una idea guardada en un mazo físico. Se añade al final de la
-- prioridad para utilizar copias libres sin quitar cartas a los mazos que ya
-- estaban montados.
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

-- Libera las cartas del mazo y lo devuelve a Favoritos sin borrar su JSON ni
-- su última comprobación.
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

-- ---------------------------------------------------------------------------
-- 6) Funciones de amistad
-- ---------------------------------------------------------------------------

-- El UPDATE con condición hace que el canje sea atómico: dos personas no
-- pueden utilizar a la vez el mismo código.
create or replace function private.redeem_friend_invite_code_impl(p_code text)
returns public.friendships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_caller_id uuid := auth.uid();
  v_user_a uuid;
  v_user_b uuid;
  v_friendship public.friendships;
begin
  if v_caller_id is null then
    raise exception 'No autenticado';
  end if;

  update public.friend_invite_codes
  set used_by = v_caller_id, used_at = now()
  where code = upper(btrim(p_code))
    and owner_id <> v_caller_id
    and used_by is null
    and expires_at > now()
  returning owner_id into v_owner_id;

  if v_owner_id is null then
    raise exception 'Código inválido, caducado o ya utilizado';
  end if;

  if v_owner_id < v_caller_id then
    v_user_a := v_owner_id;
    v_user_b := v_caller_id;
  else
    v_user_a := v_caller_id;
    v_user_b := v_owner_id;
  end if;

  insert into public.friendships (user_a_id, user_b_id)
  values (v_user_a, v_user_b)
  on conflict (user_a_id, user_b_id) do nothing;

  select friendship.* into v_friendship
  from public.friendships as friendship
  where friendship.user_a_id = v_user_a
    and friendship.user_b_id = v_user_b;

  return v_friendship;
end;
$$;

revoke all on function private.redeem_friend_invite_code_impl(text)
  from public, anon, authenticated;
grant execute on function private.redeem_friend_invite_code_impl(text) to authenticated;

create or replace function public.redeem_friend_invite_code(p_code text)
returns public.friendships
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return private.redeem_friend_invite_code_impl(p_code);
end;
$$;

revoke all on function public.redeem_friend_invite_code(text) from public, anon;
grant execute on function public.redeem_friend_invite_code(text) to authenticated;

create or replace function private.list_my_friends_impl()
returns table (
  friendship_id uuid,
  friend_id uuid,
  friend_username text
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    friendship.id,
    profile.id,
    profile.username
  from public.friendships as friendship
  join public.profiles as profile
    on profile.id = case
      when friendship.user_a_id = auth.uid() then friendship.user_b_id
      else friendship.user_a_id
    end
  where auth.uid() is not null
    and (friendship.user_a_id = auth.uid() or friendship.user_b_id = auth.uid())
  order by lower(profile.username);
$$;

revoke all on function private.list_my_friends_impl()
  from public, anon, authenticated;
grant execute on function private.list_my_friends_impl() to authenticated;

create or replace function public.list_my_friends()
returns table (
  friendship_id uuid,
  friend_id uuid,
  friend_username text
)
language sql
security invoker
set search_path = ''
stable
as $$
  select * from private.list_my_friends_impl();
$$;

revoke all on function public.list_my_friends() from public, anon;
grant execute on function public.list_my_friends() to authenticated;

-- Un amigo nunca puede listar la colección completa de otra persona. Solo
-- pregunta por los card_id concretos que faltan en el mazo que está revisando.
create or replace function private.get_friends_card_availability_impl(p_card_ids text[])
returns table (
  friend_id uuid,
  friend_username text,
  card_id text,
  owned_count integer,
  free_count integer
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if coalesce(cardinality(p_card_ids), 0) > 500 then
    raise exception 'Demasiadas cartas en una sola consulta';
  end if;

  return query
  select
    profile.id,
    profile.username,
    card.card_id,
    card.owned_count,
    card.free_count
  from public.friendships as friendship
  join public.profiles as profile
    on profile.id = case
      when friendship.user_a_id = auth.uid() then friendship.user_b_id
      else friendship.user_a_id
    end
  join public.collection_cards as card on card.user_id = profile.id
  where (friendship.user_a_id = auth.uid() or friendship.user_b_id = auth.uid())
    and card.card_id = any (p_card_ids)
    and card.owned_count > 0
  order by card.card_id, lower(profile.username);
end;
$$;

revoke all on function private.get_friends_card_availability_impl(text[])
  from public, anon, authenticated;
grant execute on function private.get_friends_card_availability_impl(text[])
  to authenticated;

-- La primera versión pública devolvía cuatro columnas. PostgreSQL no permite
-- añadir free_count mediante CREATE OR REPLACE porque cambia el tipo de fila
-- definido por los parámetros OUT. Eliminar solo la función (no sus datos)
-- permite recrearla con la firma actual y mantiene este script reutilizable.
drop function if exists public.get_friends_card_availability(text[]);

create or replace function public.get_friends_card_availability(p_card_ids text[])
returns table (
  friend_id uuid,
  friend_username text,
  card_id text,
  owned_count integer,
  free_count integer
)
language sql
security invoker
set search_path = ''
stable
as $$
  select * from private.get_friends_card_availability_impl(p_card_ids);
$$;

revoke all on function public.get_friends_card_availability(text[]) from public, anon;
grant execute on function public.get_friends_card_availability(text[]) to authenticated;

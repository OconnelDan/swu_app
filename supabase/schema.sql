-- Esquema para la sincronización opcional de amigos y colección compartida.
-- Pega este archivo completo en Supabase → SQL Editor → New query → Run.
--
-- Modelo de privacidad (ver conversación de diseño):
--   - Por defecto, un amigo aceptado solo puede saber "¿tienes esta carta
--     puntual y cuántas copias?" a través de get_friends_card_availability,
--     nunca listar tu colección completa sin más.
--   - share_full_collection_a_to_b / _b_to_a quedan reservadas para una
--     futura función de "ver la colección completa de un amigo", que debe
--     activarse explícitamente por cada usuario, por amigo.

-- 1) Perfiles (uno por usuario autenticado)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "los perfiles son visibles por cualquier usuario autenticado"
  on public.profiles for select
  to authenticated
  using (true);

create policy "cada usuario crea su propio perfil"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "cada usuario edita su propio perfil"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- 2) Códigos de invitación de amistad
create table if not exists public.friend_invite_codes (
  code text primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_by uuid references public.profiles (id),
  used_at timestamptz
);

alter table public.friend_invite_codes enable row level security;

create policy "el dueño gestiona sus propios códigos"
  on public.friend_invite_codes for all
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- 3) Amistades (una fila por pareja, orden estable user_a_id < user_b_id)
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

alter table public.friendships enable row level security;

create policy "cada usuario ve sus propias amistades"
  on public.friendships for select
  to authenticated
  using (auth.uid() = user_a_id or auth.uid() = user_b_id);

create policy "cada usuario ajusta su propia preferencia de compartir"
  on public.friendships for update
  to authenticated
  using (auth.uid() = user_a_id or auth.uid() = user_b_id);

-- 4) Espejo en la nube de la colección local (solo lo necesario para
--    responder consultas de amigos; el origen de verdad sigue siendo
--    IndexedDB en el dispositivo).
create table if not exists public.collection_cards (
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_id text not null,
  owned_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

alter table public.collection_cards enable row level security;

create policy "cada usuario gestiona solo su propia colección en la nube"
  on public.collection_cards for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 5) Canjear un código de invitación: crea la amistad si el código es
--    válido y no ha sido usado. SECURITY DEFINER porque el código
--    pertenece a otro usuario (RLS normal no dejaría verlo).
create or replace function public.redeem_friend_invite_code(p_code text)
returns public.friendships
language plpgsql
security definer
set search_path = public
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

  select owner_id into v_owner_id
  from public.friend_invite_codes
  where code = p_code
    and used_by is null
    and (expires_at is null or expires_at > now());

  if v_owner_id is null then
    raise exception 'Código inválido o ya usado';
  end if;

  if v_owner_id = v_caller_id then
    raise exception 'No puedes usar tu propio código';
  end if;

  update public.friend_invite_codes
    set used_by = v_caller_id, used_at = now()
    where code = p_code;

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

  select * into v_friendship
  from public.friendships
  where user_a_id = v_user_a and user_b_id = v_user_b;

  return v_friendship;
end;
$$;

grant execute on function public.redeem_friend_invite_code(text) to authenticated;

-- 6) Consultar, entre tus amigos aceptados, quién tiene copias de unas
--    cartas concretas y cuántas. SECURITY DEFINER: cada amigo solo expone
--    las cartas puntuales que se piden, nunca su colección entera.
create or replace function public.get_friends_card_availability(p_card_ids text[])
returns table (
  friend_id uuid,
  friend_username text,
  card_id text,
  owned_count integer
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id as friend_id,
    p.username as friend_username,
    cc.card_id,
    cc.owned_count
  from public.friendships f
  join public.profiles p
    on p.id = (case when f.user_a_id = auth.uid() then f.user_b_id else f.user_a_id end)
  join public.collection_cards cc
    on cc.user_id = p.id
  where (f.user_a_id = auth.uid() or f.user_b_id = auth.uid())
    and cc.card_id = any (p_card_ids)
    and cc.owned_count > 0;
$$;

grant execute on function public.get_friends_card_availability(text[]) to authenticated;

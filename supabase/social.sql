-- NASstudy: друзья, переписка и достижения.
-- Запустить один раз: Supabase → SQL Editor → вставить весь файл → Run.
-- Безопасно запускать повторно.
--
-- Правила безопасности (пользователи — школьники):
--  • найти человека можно только по его коду друга, публичного поиска нет;
--  • дружба взаимная: заявка → принять;
--  • писать можно только друзьям — это проверяет сама база (RLS);
--  • друзья видят только имя, класс и учебную статистику, без email.

-- ─── Публичная карточка ученика ──────────────────────────────────────────
create table if not exists public.users_public (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default '',
  grade       int,
  friend_code text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
  stats       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ─── Дружба ──────────────────────────────────────────────────────────────
create table if not exists public.friendships (
  id         bigint generated always as identity primary key,
  requester  uuid not null references auth.users (id) on delete cascade,
  addressee  uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester, addressee),
  check (requester <> addressee)
);

-- ─── Сообщения ───────────────────────────────────────────────────────────
create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  sender     uuid not null references auth.users (id) on delete cascade,
  recipient  uuid not null references auth.users (id) on delete cascade,
  kind       text not null default 'text' check (kind in ('text', 'achievement', 'explain', 'thanks')),
  body       text not null check (char_length(body) between 1 and 500),
  payload    jsonb,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists messages_recipient_idx on public.messages (recipient, created_at);
create index if not exists messages_sender_idx on public.messages (sender, created_at);

-- ─── Вспомогательные функции ─────────────────────────────────────────────
create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from friendships
    where status = 'accepted'
      and ((requester = a and addressee = b) or (requester = b and addressee = a))
  );
$$;

-- Есть ли между людьми хоть какая-то заявка (чтобы видеть имя того, кто позвал)
create or replace function public.has_link(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from friendships
    where (requester = a and addressee = b) or (requester = b and addressee = a)
  );
$$;

-- Найти ученика по точному коду друга (без перечисления всех пользователей)
create or replace function public.find_by_code(code text)
returns table (id uuid, name text, grade int)
language sql stable security definer set search_path = public as $$
  select u.id, u.name, u.grade from users_public u
  where u.friend_code = upper(trim(code)) and u.id <> auth.uid()
  limit 1;
$$;

-- ─── Права и RLS ─────────────────────────────────────────────────────────
alter table public.users_public enable row level security;
alter table public.friendships  enable row level security;
alter table public.messages     enable row level security;

drop policy if exists "up: read self, friends, requests" on public.users_public;
create policy "up: read self, friends, requests" on public.users_public
  for select using (id = auth.uid() or public.has_link(auth.uid(), id));
drop policy if exists "up: insert own" on public.users_public;
create policy "up: insert own" on public.users_public for insert with check (id = auth.uid());
drop policy if exists "up: update own" on public.users_public;
create policy "up: update own" on public.users_public for update using (id = auth.uid());

drop policy if exists "fr: read own" on public.friendships;
create policy "fr: read own" on public.friendships
  for select using (auth.uid() in (requester, addressee));
drop policy if exists "fr: send request" on public.friendships;
create policy "fr: send request" on public.friendships
  for insert with check (requester = auth.uid() and status = 'pending');
drop policy if exists "fr: accept" on public.friendships;
create policy "fr: accept" on public.friendships
  for update using (addressee = auth.uid()) with check (status = 'accepted');
drop policy if exists "fr: remove" on public.friendships;
create policy "fr: remove" on public.friendships
  for delete using (auth.uid() in (requester, addressee));

drop policy if exists "msg: read own" on public.messages;
create policy "msg: read own" on public.messages
  for select using (auth.uid() in (sender, recipient));
drop policy if exists "msg: send to friends" on public.messages;
create policy "msg: send to friends" on public.messages
  for insert with check (sender = auth.uid() and public.are_friends(sender, recipient));
drop policy if exists "msg: mark read" on public.messages;
create policy "msg: mark read" on public.messages
  for update using (recipient = auth.uid());

grant select, insert, update on public.users_public to authenticated;
grant select, insert, update, delete on public.friendships to authenticated;
grant select, insert, update on public.messages to authenticated;
-- По умолчанию Supabase даёт вызывать функции всем, включая гостей (anon): закрываем
revoke execute on function public.find_by_code(text), public.are_friends(uuid, uuid), public.has_link(uuid, uuid) from anon, public;
grant execute on function public.find_by_code(text) to authenticated;
grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.has_link(uuid, uuid) to authenticated;

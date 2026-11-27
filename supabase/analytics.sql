-- NASstudy: статистика для главного админа (кто заходил, какие страницы, что нажимали).
-- Запустить один раз: Supabase → SQL Editor → вставить весь файл → Run. Безопасно запускать повторно.
--
-- ВАЖНО: впишите почту главного админа в последней строке файла.
--
-- Что записывается: заход на сайт, открытая страница, название нажатой кнопки,
-- роль (гость / ученик / жюри), тип устройства, язык. НЕ записывается: текст
-- сообщений, ответы, всё, что вводят в поля. Ученик может отключить статистику
-- в Настройках → Приватность.

create table if not exists public.super_admins (
  email text primary key
);
alter table public.super_admins enable row level security; -- политик нет: читать список может только сама база

create table if not exists public.events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  session_id text not null check (char_length(session_id) between 6 and 40),
  user_id    uuid default auth.uid() references auth.users (id) on delete set null,
  role       text not null default 'guest' check (role in ('guest', 'user', 'jury')),
  kind       text not null check (kind in ('visit', 'page', 'action')),
  name       text not null check (char_length(name) between 1 and 60),
  device     text check (device is null or char_length(device) <= 12),
  lang       text check (lang is null or char_length(lang) <= 5)
);
create index if not exists events_created_idx on public.events (created_at desc);
create index if not exists events_session_idx on public.events (session_id);
alter table public.events enable row level security;

-- Главный админ = вошедший пользователь, чья почта есть в super_admins
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.super_admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- Писать события может любой посетитель (и гость), но только от своего имени
drop policy if exists "events: insert own" on public.events;
create policy "events: insert own" on public.events
  for insert to anon, authenticated
  with check (user_id is not distinct from auth.uid());
-- Читать — только главный админ
drop policy if exists "events: admin reads" on public.events;
create policy "events: admin reads" on public.events
  for select to authenticated using (public.is_super_admin());

grant insert on public.events to anon, authenticated;
grant select on public.events to authenticated;

-- Сводка за период
create or replace function public.admin_stats(p_days int default 7)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 90)));
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'sessions', (select count(distinct session_id) from events where created_at >= since),
    'users',    (select count(distinct user_id) from events where created_at >= since and user_id is not null),
    'guests',   (select count(distinct session_id) from events where created_at >= since and role = 'guest'),
    'jury',     (select count(distinct session_id) from events where created_at >= since and role = 'jury'),
    'pages',    (select count(*) from events where created_at >= since and kind = 'page'),
    'actions',  (select count(*) from events where created_at >= since and kind = 'action'),
    'signups',  (select count(*) from auth.users where created_at >= since),
    'topPages',   (select coalesce(jsonb_agg(x), '[]') from (select name, count(*) as c from events where created_at >= since and kind = 'page' group by name order by c desc limit 10) x),
    'topActions', (select coalesce(jsonb_agg(x), '[]') from (select name, count(*) as c from events where created_at >= since and kind = 'action' group by name order by c desc limit 12) x),
    'byDay',      (select coalesce(jsonb_agg(x order by x.d), '[]') from (select (created_at at time zone 'Asia/Almaty')::date as d, count(distinct session_id) as s, count(*) as e from events where created_at >= since group by 1) x),
    'roles',      (select coalesce(jsonb_agg(x), '[]') from (select role, count(distinct session_id) as c from events where created_at >= since group by role) x),
    'devices',    (select coalesce(jsonb_agg(x), '[]') from (select coalesce(device, '?') as device, count(distinct session_id) as c from events where created_at >= since group by 1) x)
  );
end;
$$;

-- Живая лента последних событий (с почтой, если человек вошёл)
create or replace function public.admin_feed(p_limit int default 60)
returns table (created_at timestamptz, role text, kind text, name text, email text, session_id text, device text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  return query
    select e.created_at, e.role, e.kind, e.name, u.email::text, e.session_id, e.device
    from public.events e left join auth.users u on u.id = e.user_id
    order by e.created_at desc
    limit least(greatest(coalesce(p_limit, 60), 1), 200);
end;
$$;

revoke execute on function public.admin_stats(int), public.admin_feed(int) from anon, public;
grant execute on function public.is_super_admin() to anon, authenticated;
grant execute on function public.admin_stats(int), public.admin_feed(int) to authenticated;

-- ▼ Впишите сюда почту главного админа (ту, с которой вы входите на сайт) и запустите файл
insert into public.super_admins (email) values ('ВАША_ПОЧТА@gmail.com') on conflict do nothing;

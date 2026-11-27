-- NASstudy: статистика для главного админа (кто заходил, какие страницы, что нажимали).
-- Запустить один раз: Supabase → SQL Editor → вставить весь файл → Run. Безопасно запускать повторно.
--
-- Главный админ уже добавлен. Добавить ещё одного — строка в самом конце файла.
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
    'visitors', (select count(distinct coalesce(device_id, session_id)) from events where created_at >= since),
    'totalSecs', (select coalesce(sum(secs), 0) from events where created_at >= since and kind = 'time'),
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


-- ─── v2: постоянный номер устройства и время на сайте ───────────────────
alter table public.events add column if not exists device_id text check (device_id is null or char_length(device_id) between 6 and 40);
alter table public.events add column if not exists secs int check (secs is null or secs between 0 and 600);
alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check check (kind in ('visit', 'page', 'action', 'time'));
create index if not exists events_device_idx on public.events (device_id);

-- Каждый посетитель = устройство (+ аккаунт, если вошёл). Жюри или гость с другого устройства — новый посетитель.
create or replace function public.admin_users(p_days int default 30)
returns table (visitor text, user_id uuid, email text, role text, device text, first_seen timestamptz, last_seen timestamptz,
               total_secs bigint, sessions bigint, pages bigint, actions bigint)
language plpgsql stable security definer set search_path = public, auth as $$
declare since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  return query
    select coalesce(e.device_id, e.session_id) as visitor,
           e.user_id,
           max(u.email)::text,
           (array_agg(e.role order by e.created_at desc))[1],
           (array_agg(e.device order by e.created_at desc))[1],
           min(e.created_at), max(e.created_at),
           coalesce(sum(e.secs) filter (where e.kind = 'time'), 0)::bigint,
           count(distinct e.session_id)::bigint,
           count(*) filter (where e.kind = 'page')::bigint,
           count(*) filter (where e.kind = 'action')::bigint
    from public.events e left join auth.users u on u.id = e.user_id
    where e.created_at >= since
    group by 1, 2
    order by max(e.created_at) desc
    limit 500;
end;
$$;
revoke execute on function public.admin_users(int) from anon, public;
grant execute on function public.admin_users(int) to authenticated;

-- ─── v3: примерное место посетителя (по IP, округлено до ~1 км) ───────
alter table public.events add column if not exists city text check (city is null or char_length(city) <= 40);
alter table public.events add column if not exists country text check (country is null or char_length(country) <= 4);
alter table public.events add column if not exists lat numeric(5,2) check (lat is null or lat between -90 and 90);
alter table public.events add column if not exists lon numeric(5,2) check (lon is null or lon between -180 and 180);

-- Отчёт по посетителям теперь с местом первого захода / регистрации
drop function if exists public.admin_users(int);
create or replace function public.admin_users(p_days int default 30)
returns table (visitor text, user_id uuid, email text, role text, device text, first_seen timestamptz, last_seen timestamptz,
               total_secs bigint, sessions bigint, pages bigint, actions bigint, city text, country text, lat numeric, lon numeric)
language plpgsql stable security definer set search_path = public, auth as $$
declare since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  return query
    select coalesce(e.device_id, e.session_id) as visitor,
           e.user_id,
           max(u.email)::text,
           (array_agg(e.role order by e.created_at desc))[1],
           (array_agg(e.device order by e.created_at desc))[1],
           min(e.created_at), max(e.created_at),
           coalesce(sum(e.secs) filter (where e.kind = 'time'), 0)::bigint,
           count(distinct e.session_id)::bigint,
           count(*) filter (where e.kind = 'page')::bigint,
           count(*) filter (where e.kind = 'action')::bigint,
           (array_agg(e.city order by e.created_at) filter (where e.city is not null))[1],
           (array_agg(e.country order by e.created_at) filter (where e.country is not null))[1],
           (array_agg(e.lat order by e.created_at) filter (where e.lat is not null))[1],
           (array_agg(e.lon order by e.created_at) filter (where e.lon is not null))[1]
    from public.events e left join auth.users u on u.id = e.user_id
    where e.created_at >= since
    group by 1, 2
    order by max(e.created_at) desc
    limit 500;
end;
$$;
revoke execute on function public.admin_users(int) from anon, public;
grant execute on function public.admin_users(int) to authenticated;

-- Главный админ уже добавлен при первом запуске. Чтобы добавить ещё одного,
-- уберите «--» в начале строки ниже, впишите почту и запустите только эту строку:
-- insert into public.super_admins (email) values ('почта@gmail.com') on conflict do nothing;

-- Таблица прогресса учеников (восстановлено по клиенту src/cloud/supabase.js).
-- Нужна, только если создаёте НОВЫЙ проект Supabase. Если остаётесь на старом
-- проекте брата — там всё уже есть, ничего запускать не надо.

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Каждый видит и меняет только свою строку.
create policy "own profile: select" on public.profiles
  for select using (auth.uid() = id);
create policy "own profile: insert" on public.profiles
  for insert with check (auth.uid() = id);
create policy "own profile: update" on public.profiles
  for update using (auth.uid() = id);

-- Права для вошедших пользователей (RLS выше всё равно пускает только к своей строке).
-- Если проект создан без автоматической выдачи прав, без этой строки прогресс
-- не сохранится в облако. Безопасно запускать повторно.
grant select, insert, update on public.profiles to authenticated;

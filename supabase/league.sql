-- NASstudy: «Объясни другу» и фото профиля (лига и серия вдвоём работают без этого файла).
-- Запустить один раз после social.sql: Supabase → SQL Editor → вставить → Run.
-- Разрешаем в сообщениях два новых вида: объяснение задания и «понял, решил».
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'achievement', 'explain', 'thanks'));

-- Фото профиля: маленький JPEG (data URL), видят только друзья (те же правила RLS, что у карточки).
alter table public.users_public add column if not exists avatar text;
alter table public.users_public drop constraint if exists users_public_avatar_check;
alter table public.users_public add constraint users_public_avatar_check
  check (avatar is null or (char_length(avatar) < 60000 and avatar like 'data:image/jpeg;base64,%'));

-- ─── Общий рейтинг недели (все ученики) ─────────────────────────────────
-- Возвращает только имя, класс и очки недели: без email, фото и кода друга.
create or replace function public.weekly_top(wk text, lim int default 10)
returns table (id uuid, name text, grade int, pts int, place bigint)
language sql stable security definer set search_path = public as $$
  select id, name, grade, pts, rank() over (order by pts desc) as place
  from (
    select id, name, grade,
      case when stats->>'week' = wk then coalesce((stats->>'wpts')::int, 0)
           when stats->>'pw'   = wk then coalesce((stats->>'ppts')::int, 0)
           else 0 end as pts
    from users_public
  ) s
  where pts > 0
  order by pts desc
  limit least(greatest(lim, 1), 50);
$$;

-- Моё место в общем рейтинге и сколько всего участников
create or replace function public.my_weekly_rank(wk text)
returns table (place bigint, total bigint, pts int)
language sql stable security definer set search_path = public as $$
  with s as (
    select id,
      case when stats->>'week' = wk then coalesce((stats->>'wpts')::int, 0)
           when stats->>'pw'   = wk then coalesce((stats->>'ppts')::int, 0)
           else 0 end as pts
    from users_public
  ), r as (select id, pts, rank() over (order by pts desc) as place from s where pts > 0)
  select (select place from r where id = auth.uid()),
         (select count(*) from r),
         coalesce((select pts from r where id = auth.uid()), 0);
$$;

revoke execute on function public.weekly_top(text, int), public.my_weekly_rank(text) from anon, public;
grant execute on function public.weekly_top(text, int), public.my_weekly_rank(text) to authenticated;

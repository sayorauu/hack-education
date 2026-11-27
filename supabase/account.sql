-- NASstudy: полное удаление аккаунта самим учеником (Настройки → Опасная зона).
-- Запустить один раз: Supabase → SQL Editor → вставить → Run. Безопасно запускать повторно.
-- Удаляет только СВОЙ аккаунт (auth.uid()): переписку, дружбу, карточку, прогресс и сам вход.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;
  delete from public.messages     where sender = me or recipient = me;
  delete from public.friendships  where requester = me or addressee = me;
  delete from public.users_public where id = me;
  delete from public.profiles     where id = me;
  delete from auth.users          where id = me;  -- вход (email / Google) удаляется навсегда
end;
$$;

revoke execute on function public.delete_my_account() from anon, public;
grant execute on function public.delete_my_account() to authenticated;

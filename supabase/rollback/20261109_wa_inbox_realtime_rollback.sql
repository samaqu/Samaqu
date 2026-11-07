-- Rollback Realtime broadcast wa_inbox.

drop trigger if exists wa_inbox_notify_realtime on public.wa_inbox;
drop function if exists public.wa_inbox_notify_realtime();

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'wa_inbox'
  ) then
    alter publication supabase_realtime drop table public.wa_inbox;
  end if;
end $$;

notify pgrst, 'reload schema';

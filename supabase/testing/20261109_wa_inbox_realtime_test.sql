-- Verifikasi objek Realtime wa_inbox. Read-only.

select 'publication' as check_name,
       exists(
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = 'wa_inbox'
       ) as ok
union all
select 'trigger' as check_name,
       exists(
         select 1 from pg_trigger
         where tgname = 'wa_inbox_notify_realtime'
           and tgrelid = 'public.wa_inbox'::regclass
       ) as ok
union all
select 'function' as check_name,
       exists(
         select 1
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = 'wa_inbox_notify_realtime'
       ) as ok;

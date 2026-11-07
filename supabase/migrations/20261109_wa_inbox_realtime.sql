-- Realtime broadcast untuk wa_inbox.
-- Additive: tidak mengubah kolom/data. RLS tetap aktif tanpa policy SELECT.
-- Payload sengaja hanya penanda tabel (tanpa isi pesan / nomor HP).

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'wa_inbox'
  ) then
    alter publication supabase_realtime add table public.wa_inbox;
  end if;
end $$;

create or replace function public.wa_inbox_notify_realtime()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
begin
  if tg_op = 'UPDATE'
     and new.status      is not distinct from old.status
     and new.reply_text  is not distinct from old.reply_text
     and new.replied_at  is not distinct from old.replied_at
     and new.claimed_at  is not distinct from old.claimed_at then
    return null;
  end if;

  begin
    perform realtime.send(
      jsonb_build_object('table', 'wa_inbox'),
      'wa_inbox_change',
      'wa-inbox-admin',
      false
    );
  exception
    when others then
      -- Jangan pernah menggagalkan INSERT/UPDATE wa_inbox karena Realtime error.
      raise warning 'wa_inbox_notify_realtime: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists wa_inbox_notify_realtime on public.wa_inbox;
create trigger wa_inbox_notify_realtime
after insert or update on public.wa_inbox
for each row execute function public.wa_inbox_notify_realtime();

notify pgrst, 'reload schema';

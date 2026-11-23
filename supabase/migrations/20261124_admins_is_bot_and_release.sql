-- 1) Penanda akun bot di tabel admins. Akun bot (yang dipakai wa-agent) tidak boleh muncul di Absensi, tidak ikut
--    pembagian PIC, dan tidak bisa dinonaktifkan/diubah dari Tim Admin. Default false: tidak ada akun yang berubah.
alter table public.admins
  add column if not exists is_bot boolean not null default false;

comment on column public.admins.is_bot is 'Akun bot (wa-agent). Dikecualikan dari Absensi, pembagian PIC chat, dan pengelolaan Tim Admin.';

-- 2) Lepas PIC otomatis yang SALAH: PIC dibagi otomatis ('auto') lalu ternyata bot yang menjawab sesudahnya, tanpa balasan
--    admin, tanpa penandaan "dibalas di HP", tanpa pesan yang masih menunggu, dan tanpa pesan gagal terkirim.
--    Atomik (satu pernyataan) dan hanya menyentuh wa_chat_owner (+ catatan di wa_chat_owner_log). Mengembalikan jumlah yang dilepas.
create or replace function public.wa_release_bot_answered_owners()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  released integer := 0;
begin
  with gone as (
    delete from public.wa_chat_owner o
    where o.assigned_by = 'auto'
      and exists (select 1 from public.wa_inbox i where i.sender = o.sender and i.status = 'sent' and i.replied_at > o.assigned_at)
      and not exists (select 1 from public.wa_admin_replies r where r.sender = o.sender and r.sent_at > o.assigned_at)
      and not exists (select 1 from public.wa_inbox i where i.sender = o.sender and i.status in ('pending', 'processing'))
      and not exists (select 1 from public.wa_inbox i where i.sender = o.sender and i.status = 'failed' and i.created_at > o.assigned_at - interval '15 minutes')
      and not exists (select 1 from public.wa_inbox i where i.sender = o.sender and i.status = 'skipped' and i.error like 'dibalas di HP%' and i.updated_at > o.assigned_at)
    returning o.sender, o.owner_user_id
  ), logged as (
    insert into public.wa_chat_owner_log (sender, from_user_id, to_user_id, reason)
    select sender, owner_user_id, null, 'dilepas: bot menjawab' from gone
    returning 1
  )
  select count(*) into released from gone;
  return released;
end;
$$;

revoke all on function public.wa_release_bot_answered_owners() from public, anon, authenticated;
grant execute on function public.wa_release_bot_answered_owners() to service_role;

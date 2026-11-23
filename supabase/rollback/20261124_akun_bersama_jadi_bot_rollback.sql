-- PEMBATALAN tahap 2: kembalikan akun bersama menjadi akun biasa (nama Lea) dan pulihkan PIC yang dilepas.
-- Memakai cadangan bot_flip_backup_20261124 yang dibuat skrip apply. Aman dijalankan ulang.

begin;

update public.admins a
   set display_name = (b.payload ->> 'display_name'),
       title = (b.payload ->> 'title'),
       is_bot = coalesce((b.payload ->> 'is_bot')::boolean, false),
       status = coalesce(b.payload ->> 'status', 'pulang')
  from public.bot_flip_backup_20261124 b
 where b.kind = 'admin' and a.id = (b.payload ->> 'id')::uuid;

-- Pulihkan PIC yang dilepas (hanya yang chat-nya belum punya pemilik lain sekarang).
insert into public.wa_chat_owner (sender, owner_user_id, assigned_at, assigned_by)
  select (b.payload ->> 'sender'), (b.payload ->> 'owner_user_id')::uuid, (b.payload ->> 'assigned_at')::timestamptz, (b.payload ->> 'assigned_by')
    from public.bot_flip_backup_20261124 b
   where b.kind = 'owner'
  on conflict (sender) do nothing;

select email, role, display_name, title, is_bot, status from public.admins order by created_at;

commit;

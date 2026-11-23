-- TAHAP 2: ubah akun bersama (yang dipakai wa-agent) menjadi AKUN BOT RESMI. JANGAN dijalankan sebelum:
--   (a) akun Lea sendiri sudah dibuat (undangan Tim Admin) dan Lea sudah login dengan akun itu, dan
--   (b) ada minimal satu akun MANUSIA berperan owner/leader (pengaman di bawah menolak kalau tidak ada).
-- Yang diubah: SATU baris admins (nama, jabatan, penanda bot, status) + PIC yang dimiliki akun itu dilepas (dicadangkan dulu).
-- Peran akun (owner) TIDAK diubah, login bot TIDAK disentuh (secret Academy tetap), sehingga bot tidak kehilangan akses.
-- Dijalankan di dalam satu transaksi; kalau pengaman gagal, tidak ada yang berubah. Pembatalan: 20261124_akun_bersama_jadi_bot_rollback.sql

begin;

-- Cadangan baris akun dan PIC-nya (dipakai skrip pembatalan).
create table if not exists public.bot_flip_backup_20261124 (
  kind text not null,
  payload jsonb not null,
  taken_at timestamptz not null default now()
);
insert into public.bot_flip_backup_20261124 (kind, payload)
  select 'admin', to_jsonb(a) from public.admins a where lower(a.email) = 'officialsamaqu@gmail.com';
insert into public.bot_flip_backup_20261124 (kind, payload)
  select 'owner', to_jsonb(o) from public.wa_chat_owner o
  where o.owner_user_id = (select user_id from public.admins where lower(email) = 'officialsamaqu@gmail.com');

-- Lepas PIC yang dimiliki akun ini (chat yang masih menunggu akan dibagi ulang ke admin aktif oleh pembagian otomatis).
with gone as (
  delete from public.wa_chat_owner
  where owner_user_id = (select user_id from public.admins where lower(email) = 'officialsamaqu@gmail.com')
  returning sender, owner_user_id
)
insert into public.wa_chat_owner_log (sender, from_user_id, to_user_id, reason)
  select sender, owner_user_id, null, 'dilepas: akun jadi akun bot' from gone;

-- Jadikan akun bot.
update public.admins
   set display_name = 'Bot', title = 'Asisten AI', is_bot = true, status = 'pulang', status_at = now()
 where lower(email) = 'officialsamaqu@gmail.com';

-- PENGAMAN: harus ada manusia (bukan bot) yang aktif dan berperan owner/leader, kalau tidak, batalkan semuanya.
do $$
begin
  if (select count(*) from public.admins where is_bot is not true and active is not false and role in ('owner', 'leader')) < 1 then
    raise exception 'DIBATALKAN: tidak ada akun manusia berperan owner/leader. Naikkan satu akun (mis. Surya) ke leader dulu.';
  end if;
  if (select count(*) from public.admins where is_bot is not true and active is not false) < 2 then
    raise exception 'DIBATALKAN: akun Lea (admin manusia kedua) belum ada.';
  end if;
end $$;

select email, role, display_name, title, is_bot, status from public.admins order by created_at;

commit;

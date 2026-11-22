-- Tim Admin: nama tampil, label jabatan, status aktif. Hanya MENAMBAH kolom; baris lama tidak berubah.
alter table public.admins
  add column if not exists display_name text,
  add column if not exists title        text,
  add column if not exists active       boolean not null default true,
  add column if not exists invited_by   text;

-- Akun bersama yang ada sekarang: isi nama tampil sama dengan yang tertulis di panel saat ini,
-- supaya tampilannya tidak berubah. Bisa diganti kapan saja dari halaman Tim Admin.
update public.admins
   set display_name = 'Lea'
 where display_name is null
   and lower(email) = 'officialsamaqu@gmail.com';

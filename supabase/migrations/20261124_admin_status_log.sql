-- Riwayat perubahan status kerja admin (dasar absensi: jam masuk, istirahat, pulang).
-- Hanya MENAMBAH tabel baru; tidak ada tabel lama yang diubah. Bot (wa-agent) tidak membaca tabel ini.
-- RLS aktif TANPA policy: hanya server (service role) yang bisa membaca/menulis.
-- Tidak memakai foreign key ke auth.users supaya riwayat tetap ada walau akun dihapus.

create table if not exists public.admin_status_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  status text not null check (status in ('aktif', 'istirahat', 'pulang')),
  at timestamptz not null default now()
);

create index if not exists admin_status_log_user_at_idx on public.admin_status_log (user_id, at desc);
create index if not exists admin_status_log_at_idx on public.admin_status_log (at desc);

alter table public.admin_status_log enable row level security;

comment on table public.admin_status_log is 'Satu baris per perubahan status kerja admin. Dasar absensi dan pembagian chat.';

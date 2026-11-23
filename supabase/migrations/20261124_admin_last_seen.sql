-- "Terakhir terlihat" admin: diperbarui panel tiap beberapa menit selama tab panel terbuka dan terlihat.
-- Hanya MENAMBAH satu kolom di tabel `admins`; tidak ada data yang diubah. Bot (wa-agent) tidak membaca kolom ini.
-- Nilai kosong (null) = belum pernah terlihat sejak fitur ini aktif.

alter table public.admins
  add column if not exists last_seen_at timestamptz;

comment on column public.admins.last_seen_at is 'Terakhir kali tab panel admin ini terlihat terbuka (sinyal tiap ~2 menit). Dasar "terakhir terlihat" dan batas jam kerja bila lupa klik Pulang.';

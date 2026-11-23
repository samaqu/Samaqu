-- Dasar Absensi (Fase 2): jam terakhir terlihat PER HARI + penanda log Pulang otomatis.
-- Hanya MENAMBAH (satu tabel baru + satu kolom baru dengan default); tidak ada data lama yang diubah atau dihapus.
-- Bot (wa-agent) tidak membaca tabel/kolom ini.

-- 1) Penanda sumber catatan status: 'manual' = diklik admin, 'auto' = ditutup sistem karena lupa klik Pulang.
alter table public.admin_status_log
  add column if not exists source text not null default 'manual';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'admin_status_log_source_check') then
    alter table public.admin_status_log
      add constraint admin_status_log_source_check check (source in ('manual', 'auto'));
  end if;
end $$;

-- 2) Pertama & terakhir terlihat per admin per hari (hari menurut WIB, diisi panel lewat sinyal tiap ±2 menit).
create table if not exists public.admin_seen_daily (
  user_id uuid not null,
  day date not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, day)
);

create index if not exists admin_seen_daily_day_idx on public.admin_seen_daily (day desc);

-- RLS aktif TANPA policy: hanya server (service role) yang bisa membaca/menulis.
alter table public.admin_seen_daily enable row level security;

comment on table public.admin_seen_daily is 'Jam pertama & terakhir admin terlihat membuka panel, per hari WIB. Batas jam kerja bila lupa klik Pulang.';

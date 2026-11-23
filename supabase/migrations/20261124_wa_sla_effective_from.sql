-- Tanggal mulai berlaku aturan Performa Admin (SLA). Chat yang MULAI sebelum tanggal ini tidak dihitung dalam
-- statistik admin (ditangani, menunggu, terlambat, SLA); statistik bot tetap memakai seluruh periode.
-- Hanya MENAMBAH satu kolom pada tabel wa_sla_config (satu baris); baris yang ada otomatis mendapat nilai awal 24 Nov 2026
-- (WIB), yaitu "mulai besok" dari pengumuman aturan. Tidak ada tabel atau data lain yang diubah.

alter table public.wa_sla_config
  add column if not exists effective_from date not null default date '2026-11-24';

comment on column public.wa_sla_config.effective_from is 'Tanggal (WIB) mulai berlaku perhitungan performa admin. Chat yang mulai sebelum tanggal ini tidak dihitung untuk admin.';

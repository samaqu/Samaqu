-- ─────────────────────────────────────────────────────────────────────────────
-- Stok Opname — mencocokkan stok sistem dengan hitungan fisik di gudang.
--
-- Alur: draft → menunggu persetujuan → disetujui / ditolak.
--  • Saat sesi dibuat, stok sistem di-SNAPSHOT ke `stock_opname_lines.system_stock`.
--  • Hitungan fisik (`counted_stock`) TIDAK mengubah stok; penyesuaian hanya saat
--    disetujui, dan dihitung dari stok TERKINI (bukan snapshot) supaya transaksi
--    yang masuk selama proses hitung tidak tertimpa.
--  • Baris stok sharing (`product_variants.base_product_id`) hanya info — hitung
--    dan penyesuaian hanya di baris induk (`is_derived = true`).
--  • Penyesuaian TIDAK membuat tabel riwayat baru: memakai `stock_movements` yang
--    sudah ada (dipakai retur & alur stok lain), ditambah kolom sebelum/sesudah.
--  • Baris utama stok tetap `product_variants` — tidak ada struktur stok kedua.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.stock_opname_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'draft'
    check (status in ('draft', 'menunggu', 'disetujui', 'ditolak')),
  notes text,
  created_by text,
  created_by_name text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by text,
  reviewed_by_name text,
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_opname_sessions_status on public.stock_opname_sessions(status, created_at desc);

create table if not exists public.stock_opname_lines (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.stock_opname_sessions(id) on delete cascade,
  product_id text not null,
  product_name text,
  sku text,
  category text,
  jenis_kain text,
  series text,
  color text not null default 'default',
  size text not null,
  system_stock integer not null default 0,
  counted_stock integer,
  reason text,
  reason_note text,
  price integer not null default 0,
  is_derived boolean not null default false,
  base_product_id text,
  base_product_name text,
  applied boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, product_id, color, size)
);

create index if not exists idx_opname_lines_session on public.stock_opname_lines(session_id);

-- Riwayat stok bersama (sudah dipakai retur/tukar size): cukup tambah kolom
-- sebelum/sesudah + nama admin yang menyetujui.
alter table public.stock_movements add column if not exists before_stock integer;
alter table public.stock_movements add column if not exists after_stock integer;
alter table public.stock_movements add column if not exists actor_name text;

-- Tabel riwayat khusus opname batal dipakai (dulu sempat dibuat) — satu sumber saja.
drop table if exists public.stock_opname_movements;

-- Hanya service role yang menyentuh tabel ini (pola sama dengan jnt_settings):
-- RLS aktif tanpa policy → anon/authenticated tidak bisa baca/tulis.
alter table public.stock_opname_sessions enable row level security;
alter table public.stock_opname_lines enable row level security;

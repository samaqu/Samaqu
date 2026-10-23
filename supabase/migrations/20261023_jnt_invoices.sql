-- Tagihan J&T Express + rincian per resi (menu Ops → Keuangan → Ongkir J&T).
--
-- DIJALANKAN MANUAL di SQL Editor Supabase (sandbox tidak punya jalur DDL, sama
-- seperti migration lain di folder ini). Selama belum dijalankan, halaman
-- /ops/ongkir-jnt menampilkan peringatan dan endpoint-nya membalas `tableReady: false`.
--
-- Sumber angka:
--   jnt_invoices        = header tagihan bulanan (angka dari invoice PDF J&T)
--   jnt_invoice_items   = baris per resi (dari ekspor "Resi Saya" portal J&T)
--
-- ATURAN UANG (jangan diubah tanpa membahas ulang):
--   * Diskon J&T BUKAN pendapatan — ia pengurang biaya. Karena itu beban ongkir
--     yang dibukukan adalah `net_cost` = biaya kirim setelah diskon, dan itulah
--     angka yang dipakai untuk margin ongkir.
--   * Beban masuk ke bulan TANGGAL PENGIRIMAN (`delivery_date`), bukan bulan bayar.
--   * `awb_no` unik → upload ulang file yang sama tidak pernah menggandakan beban.

create table if not exists jnt_invoices (
  id uuid primary key default gen_random_uuid(),
  -- Bulan tagihan, 'YYYY-MM'. Satu baris per bulan.
  period text not null unique,
  invoice_number text,
  invoice_date date,
  due_date date,
  -- Delivery Fee yang ditagih J&T sebelum diskon (angka invoice).
  gross_total numeric(14, 2) not null default 0,
  -- Potongan/diskon dari J&T (pengurang biaya, bukan pendapatan).
  discount_total numeric(14, 2) not null default 0,
  -- PPN dari invoice — baris sendiri, sengaja tidak digabung ke biaya ongkir.
  ppn_total numeric(14, 2) not null default 0,
  -- Total yang benar-benar dibayar (DPP + PPN).
  paid_total numeric(14, 2) not null default 0,
  status text not null default 'unpaid', -- 'unpaid' (belum bayar) | 'paid' (lunas)
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists jnt_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references jnt_invoices (id) on delete cascade,
  -- KUNCI IDEMPOTEN: satu nomor resi = satu baris, di bulan mana pun.
  -- Upload ulang bulan yang sama melewati baris yang sudah ada.
  awb_no text not null unique,
  -- Tanggal pengiriman = dasar pembebanan bulan (bukan tanggal bayar).
  delivery_date date,
  city text,
  district text,
  service text,
  weight numeric(6, 2),
  gross_cost numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  -- Beban yang dibukukan = gross_cost - discount.
  net_cost numeric(14, 2) not null default 0,
  -- J&T menandai baris tertentu "Tanpa Diskon" — penanda untuk dicek ke J&T.
  has_discount boolean not null default true,
  -- Hasil pencocokan resi → pesanan sistem (diisi ulang setiap kali baca data).
  order_number text,
  -- Ongkir yang dibayar customer (orders.shipping_cost) untuk resi ini.
  shipping_cost numeric(14, 2),
  created_at timestamptz not null default now()
);

create index if not exists idx_jnt_invoice_items_invoice on jnt_invoice_items (invoice_id);
create index if not exists idx_jnt_invoice_items_delivery on jnt_invoice_items (delivery_date);
create index if not exists idx_jnt_invoice_items_order on jnt_invoice_items (order_number);

-- Data keuangan: tidak ada policy RLS → hanya service role (route /api/ops/*) yang
-- bisa membaca/menulis, anon client tidak melihat apa pun.
alter table jnt_invoices enable row level security;
alter table jnt_invoice_items enable row level security;

comment on table jnt_invoices is
  'Header tagihan bulanan J&T (angka dari invoice). Diskon = pengurang biaya, bukan pendapatan.';
comment on table jnt_invoice_items is
  'Rincian per resi dari ekspor "Resi Saya" portal J&T. awb_no unik = upload ulang tidak menggandakan beban.';
comment on column jnt_invoice_items.net_cost is
  'Beban ongkir yang dibukukan = gross_cost - discount. Ini yang dipakai untuk margin ongkir.';

-- SATU sumber beban ongkir J&T per bulan (net setelah diskon).
-- Menu Pengeluaran & Laporan Keuangan nanti WAJIB membaca dari sini — jangan mencatat
-- beban ongkir J&T sebagai pengeluaran manual, supaya tidak terhitung dua kali.
create or replace view jnt_ongkir_expense with (security_invoker = true) as
select
  i.period,
  count(ad.id)::int as shipments,
  coalesce(sum(ad.gross_cost), 0) as gross_cost,
  coalesce(sum(ad.discount), 0) as discount,
  coalesce(sum(ad.net_cost), 0) as net_cost
from jnt_invoices i
join jnt_invoice_items ad on ad.invoice_id = i.id
group by i.period;

comment on view jnt_ongkir_expense is
  'Beban ongkir J&T per bulan (net setelah diskon, basis tanggal pengiriman) — satu sumber untuk Pengeluaran & Laporan Keuangan.';

-- Leads: nominal closing = HARGA PRODUK saja (total setelah diskon, tanpa ongkir).
-- Aturan yang sama dengan Omzet di Transaksi/Laporan: orderRevenue = total - ongkir.
--
-- BAGIAN A (lead tertaut order): nominal lead diganti total - ongkir dari pesanannya.
--   Dicadangkan dulu ke public.leads_nominal_backup_20261125 supaya bisa dibatalkan.
--   Dipakai bersama dry-run: hitung dulu lewat SELECT, baru jalankan skrip ini.
-- Pembatalan: 20261125_leads_nominal_produk_rollback.sql
--
-- Tidak menyentuh: lead tanpa order (isian manual), lead yang bukan closing, tabel orders, bot.

begin;

create table if not exists public.leads_nominal_backup_20261125 (
  lead_id uuid primary key,
  status_lama text,
  nominal_lama integer,
  order_id uuid,
  backed_at timestamptz not null default now()
);
alter table public.leads_nominal_backup_20261125 enable row level security;

-- 1. Cadangkan lead yang nominalnya akan berubah.
insert into public.leads_nominal_backup_20261125 (lead_id, status_lama, nominal_lama, order_id)
select l.id, l.status, l.nominal, l.order_id
from public.leads l
join public.orders o on o.id::text = l.order_id::text
where l.status = 'closing'
  and l.nominal <> greatest(0, coalesce(o.total, 0) - coalesce(o.shipping_cost, 0))
on conflict (lead_id) do nothing;

-- 2. Ganti nominal dengan harga produk saja.
update public.leads l
set nominal = greatest(0, coalesce(o.total, 0) - coalesce(o.shipping_cost, 0)),
    updated_at = now()
from public.orders o
where o.id::text = l.order_id::text
  and l.status = 'closing'
  and l.nominal <> greatest(0, coalesce(o.total, 0) - coalesce(o.shipping_cost, 0));

-- 3. Catat di riwayat lead (hanya yang baru dicadangkan).
insert into public.lead_activities (lead_id, actor, action, note)
select b.lead_id, 'system', 'order_updated',
       'Backfill nominal produk saja (tanpa ongkir): Rp ' || b.nominal_lama::text || ' -> Rp ' || l.nominal::text
from public.leads_nominal_backup_20261125 b
join public.leads l on l.id = b.lead_id;

commit;

-- Leads: closing yang pesanannya SUDAH TIDAK ADA di tabel orders (dihapus) ditandai Batal, nominal 0.
-- JALANKAN HANYA SETELAH disetujui pemilik (menolkan closing). Dicadangkan ke tabel yang sama dengan
-- 20261125_leads_nominal_produk_apply.sql (jalankan skrip itu dulu supaya tabelnya ada).
-- Pembatalan: 20261125_leads_nominal_produk_rollback.sql

begin;

insert into public.leads_nominal_backup_20261125 (lead_id, status_lama, nominal_lama, order_id)
select l.id, l.status, l.nominal, l.order_id
from public.leads l
where l.status = 'closing'
  and l.order_id is not null
  and not exists (select 1 from public.orders o where o.id::text = l.order_id::text)
on conflict (lead_id) do nothing;

update public.leads l
set status = 'batal', nominal = 0, updated_at = now()
where l.status = 'closing'
  and l.order_id is not null
  and not exists (select 1 from public.orders o where o.id::text = l.order_id::text);

insert into public.lead_activities (lead_id, actor, action, note)
select b.lead_id, 'system', 'order_cancelled',
       'Backfill: order sudah tidak ada - lead ditandai Batal, nominal 0 (sebelumnya Rp ' || b.nominal_lama::text || ')'
from public.leads_nominal_backup_20261125 b
join public.leads l on l.id = b.lead_id
where l.status = 'batal' and b.status_lama = 'closing';

commit;

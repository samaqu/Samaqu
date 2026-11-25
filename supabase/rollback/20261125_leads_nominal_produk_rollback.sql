-- Membatalkan 20261125_leads_nominal_produk_apply.sql (dan 20261125_leads_yatim_batal_apply.sql
-- bila sudah dijalankan): kembalikan nominal dan status lead dari tabel cadangan.

begin;

update public.leads l
set nominal = b.nominal_lama,
    status = b.status_lama,
    updated_at = now()
from public.leads_nominal_backup_20261125 b
where b.lead_id = l.id;

-- Hapus catatan riwayat yang dibuat oleh backfill.
delete from public.lead_activities a
using public.leads_nominal_backup_20261125 b
where a.lead_id = b.lead_id
  and a.action in ('order_updated', 'order_cancelled')
  and (a.note like 'Backfill nominal produk saja%' or a.note like 'Backfill: order sudah tidak ada%');

-- Tabel cadangan dibiarkan (hapus manual kalau sudah tidak perlu):
--   drop table public.leads_nominal_backup_20261125;

commit;

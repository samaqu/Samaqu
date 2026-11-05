-- Rollback untuk 20261107_cover_sku_fix.sql
--
-- Urutan wajib: index unik dihapus DULU, baru SKU dikembalikan ke CVH-CSO.
-- Kalau dibalik, dua baris CVH-CSO akan ditolak index unik.

begin;

drop index if exists public.products_sku_uidx;
drop index if exists public.product_variants_sku_uidx;

update public.products set sku = 'CVH-CSO'
 where id = 'cover-thobe' and sku = 'CVH-CTO';

update public.products set sku = 'CVH-CSO'
 where id = 'cover-koko' and sku = 'CVH-CKO';

update public.product_variants set sku = 'CVH-CSO'
 where product_id = 'cover-thobe' and sku = 'CVH-CTO';

update public.product_variants set sku = 'CVH-CSO'
 where product_id = 'cover-koko' and sku = 'CVH-CKO';

commit;

notify pgrst, 'reload schema';

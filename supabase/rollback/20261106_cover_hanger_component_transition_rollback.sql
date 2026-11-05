-- Rollback untuk 20261106_cover_hanger_component_transition.sql
--
-- Menghapus dua varian baru beserta komponennya, lalu mengembalikan varian lama
-- "Set Hanger + Cover" ke daftar jual.
--
-- PENTING: jalankan hanya setelah pesanan uji dengan varian baru sudah dibatalkan /
-- dihapus. Kalau `order_items` masih mereferensikan varian baru, penghapusan ini akan
-- ditolak database — itu disengaja, supaya riwayat pesanan tidak rusak.
--
-- Stok komponen (cover-thobe, cover-koko, hanger) TIDAK dikembalikan: pemotongan yang
-- sudah terjadi tetap tercatat di stock_movements.

begin;

delete from public.product_components
 where product_id = 'cover-hanger'
   and lower(coalesce(product_color, '')) in ('cover thobe + hanger', 'cover koko + hanger');

delete from public.product_variants
 where product_id = 'cover-hanger'
   and color in ('Cover Thobe + Hanger', 'Cover Koko + Hanger');

update public.product_variants
   set is_sellable = true
 where product_id = 'cover-hanger'
   and color = 'Set Hanger + Cover';

commit;

notify pgrst, 'reload schema';

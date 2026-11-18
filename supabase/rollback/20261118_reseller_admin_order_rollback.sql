-- Rollback 20261118_reseller_admin_order.sql
-- Urutan: fungsi dulu, lalu indeks, lalu kolom.
-- PERINGATAN: menghapus kolom ikut menghapus isinya (penanda "ongkir menyusul", admin pembuat,
-- awal jam kekurangan). Pesanan yang masih berstatus menunggu ongkir harus diselesaikan/dibatalkan
-- dulu supaya tidak ada pesanan reseller tanpa ongkir yang tertinggal.

drop function if exists public.samaqu_reseller_set_shipping(text, text, integer, text);
drop function if exists public.samaqu_reseller_admin_create_order(uuid, text, jsonb, text, text, text, text, text, text, text, text, text, integer, integer, integer, integer, boolean, text, boolean);

drop index if exists public.idx_orders_shipping_pending;

alter table public.orders drop column if exists shipping_pending;
alter table public.orders drop column if exists created_by_admin;
alter table public.orders drop column if exists shortfall_started_at;

notify pgrst, 'reload schema';

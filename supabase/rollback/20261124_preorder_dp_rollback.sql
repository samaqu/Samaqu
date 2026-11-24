-- Rollback untuk 20261124_preorder_dp.sql
--
-- Menghapus indeks pelunasan, tiga aturan CHECK, dan dua kolom DP.
--
-- PERHATIAN: kolom preorder_dp_amount / preorder_settled_at ikut hilang. PO yang tercatat ber-DP
-- kembali terbaca sebagai PO Lunas penuh (sisa tagihan tidak lagi dicatat sistem) dan tidak lagi
-- diblokir resinya. Jalankan rollback ini hanya selama BELUM ada PO ber-DP sungguhan; kalau sudah
-- ada, catat dulu:
--   select order_number, total, preorder_dp_amount, preorder_settled_at
--     from public.orders where preorder_dp_amount is not null;
-- Kode aplikasi yang membaca kolom ini juga harus dikembalikan lebih dulu (kalau tidak, daftar
-- Transaksi gagal dimuat).

begin;

drop index if exists public.idx_orders_preorder_dp_unsettled;

alter table public.orders
  drop constraint if exists orders_preorder_dp_only_preorder,
  drop constraint if exists orders_preorder_dp_settled_needs_dp,
  drop constraint if exists orders_preorder_dp_range;

alter table public.orders
  drop column if exists preorder_settled_at,
  drop column if exists preorder_dp_amount;

notify pgrst, 'reload schema';

commit;

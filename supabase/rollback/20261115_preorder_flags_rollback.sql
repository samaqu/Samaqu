-- Rollback untuk 20261115_preorder_flags.sql
--
-- Menghapus fungsi edit PO, indeks antrean PO, dan tiga kolom penanda PO.
--
-- PERHATIAN: kolom is_preorder / preorder_estimate / preorder_ready_at ikut hilang.
-- Pesanan yang sudah ditandai PO kembali terbaca sebagai pesanan reguler (stok TIDAK
-- disentuh). Jalankan rollback ini hanya selama BELUM ada PO sungguhan yang dicatat; kalau
-- sudah ada, periksa dulu:
--   select order_number, status, preorder_estimate, preorder_ready_at
--     from public.orders where is_preorder = true;

begin;

drop function if exists public.samaqu_edit_preorder_items(text, text, jsonb, jsonb, numeric, integer, jsonb, text);
drop index if exists public.idx_orders_preorder_waiting;

alter table public.orders
  drop column if exists preorder_ready_at,
  drop column if exists preorder_estimate,
  drop column if exists is_preorder;

commit;

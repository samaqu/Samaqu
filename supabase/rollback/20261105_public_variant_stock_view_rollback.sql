-- Rollback untuk 20261105_public_variant_stock_view.sql
--
-- Menghapus view, fungsi publik, dan kolom is_sellable.
-- Jalankan hanya kalau tahap 3.1 (pembacaan view) sudah dibatalkan lebih dulu,
-- karena halaman customer akan gagal bila view hilang tapi kode masih memanggilnya.

drop view if exists public.product_variant_stock;
drop function if exists public.samaqu_public_variant_stock(text, text, text);

alter table public.product_variants
  drop column if exists is_sellable;

notify pgrst, 'reload schema';

-- Stok efektif SEMUA varian dalam satu panggilan.
--
-- Fungsi per-varian `samaqu_variant_effective_stock` sudah ada, tetapi dua halaman ops
-- (Daftar Produk & Laporan Stok) butuh ratusan baris sekaligus. Memanggil RPC per baris
-- berarti ratusan round-trip. Fungsi ini mengembalikan satu baris per varian dengan angka
-- yang PERSIS SAMA (memanggil fungsi yang sama, bukan menyalin logikanya).
--
-- READ-ONLY: tidak mengubah data apa pun.

create or replace function public.samaqu_effective_stock_map(p_product_ids text[] default null)
returns table(product_id text, color text, size text, effective_stock integer)
language sql
stable
security definer
set search_path = 'public'
as $$
  select v.product_id,
         v.color,
         v.size,
         public.samaqu_variant_effective_stock(v.product_id, v.color, v.size) as effective_stock
  from public.product_variants v
  where p_product_ids is null
     or v.product_id = any(p_product_ids);
$$;

comment on function public.samaqu_effective_stock_map(text[]) is
  'Stok efektif semua varian (stok sendiri / induk sharing / min komponen). Read-only, untuk halaman ops.';

revoke all on function public.samaqu_effective_stock_map(text[]) from public;
grant execute on function public.samaqu_effective_stock_map(text[]) to service_role;

notify pgrst, 'reload schema';

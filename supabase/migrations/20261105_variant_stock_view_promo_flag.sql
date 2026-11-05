-- Bagian 1 — view `product_variant_stock` kurang kolom `promo_fch_enabled`.
--
-- Dampak nyata: PromoOrderWizard memilih kolom itu, PostgREST menolak seluruh query
-- ("column does not exist"), stok tidak pernah termuat, dan semua produk tampil
-- "Sold Out" di /promo/free-cover-hanger/pesan padahal promo berjalan.
--
-- Perbaikan: tambah kolom. Tetap security_invoker = true dan tetap hanya produk
-- published. Tidak ada informasi komponen.

drop view if exists public.product_variant_stock;

create view public.product_variant_stock
with (security_invoker = true)
as
select
  v.product_id,
  v.color,
  v.size,
  v.stock,
  v.price_override,
  v.weight,
  v.sku,
  v.hex,
  v.display_order,
  v.base_product_id,
  v.base_size,
  v.is_sellable,
  v.promo_fch_enabled,
  public.samaqu_public_variant_stock(v.product_id, v.color, v.size) as effective_stock
from public.product_variants v
join public.products p on p.id = v.product_id
where p.is_published = true;

comment on view public.product_variant_stock is
  'Stok varian yang boleh dibaca halaman customer. Hanya produk is_published. effective_stock = angka stok yang benar (varian sendiri, induk sharing, atau komponen). promo_fch_enabled = sakelar promo per ukuran.';

revoke all on public.product_variant_stock from public;
grant select on public.product_variant_stock to anon, authenticated, service_role;

notify pgrst, 'reload schema';

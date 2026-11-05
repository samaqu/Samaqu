-- Rollback untuk 20261105_variant_stock_view_promo_flag.sql
-- Mengembalikan view ke bentuk tanpa `promo_fch_enabled` (kondisi sebelum Bagian 1).

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
  public.samaqu_public_variant_stock(v.product_id, v.color, v.size) as effective_stock
from public.product_variants v
join public.products p on p.id = v.product_id
where p.is_published = true;

revoke all on public.product_variant_stock from public;
grant select on public.product_variant_stock to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- TAHAP 3.0 — is_sellable, fungsi stok efektif untuk publik, dan view baca-saja.
--
-- Belum ada perilaku yang berubah:
--   - `is_sellable` default TRUE (belum ada varian yang di-set false)
--   - belum ada varian `track_stock = false` di data nyata
--
-- Yang disiapkan:
--   - varian bisa disembunyikan dari penjualan tanpa dihapus (dipakai tahap 3.5)
--   - halaman customer bisa membaca stok efektif lewat view, tanpa akses ke komponen

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Penanda varian masih boleh dijual
--
--    Dipakai untuk menyembunyikan varian lama "Set Hanger + Cover" nanti TANPA
--    menghapusnya: add-on, promo, dan pesanan lama tetap membutuhkannya.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.product_variants
  add column if not exists is_sellable boolean not null default true;

comment on column public.product_variants.is_sellable is
  'FALSE = varian tidak ditawarkan ke customer (katalog, keranjang, checkout, add-on, bonus). Datanya tetap ada untuk pesanan lama, edit, pembatalan, dan retur.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Fungsi stok efektif yang aman dipanggil publik
--
--    View dengan security_invoker = true akan gagal bila ia mencoba membaca
--    `product_components` — tabel itu sudah dicabut dari anon/authenticated.
--    Karena itu perhitungan stok efektif dipindah ke fungsi SECURITY DEFINER:
--    ia hanya MENGEMBALIKAN ANGKA, tidak pernah membuka isi komponen.
--
--    Fungsi lama `samaqu_variant_effective_stock` tetap ada untuk service_role
--    (dipakai admin/ops). Versi publik ini menambahkan pemecahan stok sharing
--    agar hasilnya sama dari mana pun dipanggil.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.samaqu_public_variant_stock(
  p_product_id text,
  p_color text,
  p_size text
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select v.track_stock, v.stock, v.base_product_id, v.base_size
    from public.product_variants v
    where v.product_id = p_product_id
      and lower(coalesce(v.color, '')) = lower(coalesce(p_color, ''))
      and lower(coalesce(v.size, '')) = lower(coalesce(p_size, ''))
    limit 1
  ),
  -- Varian turunan (stok sharing) memakai stok induknya.
  base as (
    select pv.stock
    from target t
    join public.product_variants pv
      on pv.product_id = t.base_product_id
     and lower(coalesce(pv.size, '')) = lower(coalesce(t.base_size, ''))
    where t.base_product_id is not null and t.base_size is not null
    limit 1
  ),
  -- Varian tanpa stok sendiri: stok terkecil komponennya.
  comp as (
    select min(coalesce(pv.stock, 0)) as min_stock
    from target t
    join public.product_components c
      on c.product_id = p_product_id
     and c.is_active
     and (c.product_color is null or lower(c.product_color) = lower(coalesce(p_color, '')))
     and (c.product_size is null or lower(c.product_size) = lower(coalesce(p_size, '')))
    join public.product_variants pv
      on pv.product_id = c.component_product_id
     and lower(coalesce(pv.color, '')) = lower(coalesce(c.component_color, ''))
     and lower(coalesce(pv.size, '')) = lower(coalesce(c.component_size, ''))
    where coalesce(t.track_stock, true) = false
  )
  select case
    when not exists (select 1 from target) then null
    when (select base_product_id from target) is not null then
      coalesce((select stock from base), 0)
    when coalesce((select track_stock from target), true) then
      coalesce((select stock from target), 0)
    else
      coalesce((select min_stock from comp), 0)
  end;
$$;

revoke all on function public.samaqu_public_variant_stock(text, text, text) from public;
grant execute on function public.samaqu_public_variant_stock(text, text, text) to anon, authenticated, service_role;

comment on function public.samaqu_public_variant_stock(text, text, text) is
  'Stok efektif satu varian untuk halaman publik. Hanya mengembalikan ANGKA — tidak membuka isi product_components.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. View baca-saja untuk halaman customer
--
--    security_invoker = true  → tetap tunduk pada RLS pemanggil (produk & varian),
--                               tidak melewati proteksi apa pun.
--    is_published = true      → lapis kedua: produk unpublished (cover-thobe,
--                               cover-koko, hanger, box-kabak) tidak pernah ikut,
--                               walau RLS-nya longgar.
--
--    Kolom: yang memang sudah dibaca customer + effective_stock + is_sellable.
--    TIDAK ada track_stock, TIDAK ada informasi komponen.
-- ═══════════════════════════════════════════════════════════════════════════
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

comment on view public.product_variant_stock is
  'Stok varian yang boleh dibaca halaman customer. Hanya produk is_published dan varian yang boleh dijual. effective_stock = angka stok yang benar (varian sendiri, induk sharing, atau komponen).';

revoke all on public.product_variant_stock from public;
grant select on public.product_variant_stock to anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Reload skema
-- ═══════════════════════════════════════════════════════════════════════════
notify pgrst, 'reload schema';

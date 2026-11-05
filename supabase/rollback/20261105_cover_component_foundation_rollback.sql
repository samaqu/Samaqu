-- Rollback untuk 20261105_cover_component_foundation.sql
--
-- Mengembalikan SEMUA ke keadaan sebelum tahap 1:
--   - product_components tanpa product_color/product_size
--   - product_variants tanpa track_stock
--   - samaqu_component_plan kembali 2 argumen
--   - decrement/restore tidak meneruskan p_color/p_size
--
-- Catatan: `track_stock` DIHAPUS, jadi kalau tahap 2 sudah pernah dijalankan
-- (ada varian track_stock=false), rollback ini menghapus penandanya.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Kembalikan decrement/restore ke pemanggilan 2 argumen
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_decrement_stock';

  if v_src is not null then
    v_src := replace(
      v_src,
      'select * from public.samaqu_component_plan(p_product_id, p_qty, p_color, p_size)',
      'select * from public.samaqu_component_plan(p_product_id, p_qty)'
    );
    execute v_src;
  end if;

  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_restore_stock';

  if v_src is not null then
    v_src := replace(
      v_src,
      'select * from public.samaqu_component_plan(p_product_id, p_qty, p_color, p_size)',
      'select * from public.samaqu_component_plan(p_product_id, p_qty)'
    );
    execute v_src;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Kembalikan samaqu_component_plan versi 2 argumen
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.samaqu_component_plan(text, integer, text, text);

create or replace function public.samaqu_component_plan(p_product_id text, p_qty integer)
returns table (component_product_id text, component_color text, component_size text, qty integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.component_product_id,
         coalesce(c.component_color, ''),
         coalesce(c.component_size, ''),
         c.qty * greatest(1, coalesce(p_qty, 1))
  from public.product_components c
  where c.product_id = p_product_id and c.is_active;
$$;

revoke all on function public.samaqu_component_plan(text, integer) from public, anon, authenticated;
grant execute on function public.samaqu_component_plan(text, integer) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Hapus helper stok efektif
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.samaqu_variant_effective_stock(text, text, text);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Hapus kolom baru
-- ═══════════════════════════════════════════════════════════════════════════
drop index if exists public.product_components_variant_idx;
drop index if exists public.product_components_uniq_v2;

alter table public.product_components
  drop column if exists product_color,
  drop column if exists product_size;

-- Kembalikan unique lama (produk, komponen, warna, ukuran komponen) sebagai CONSTRAINT,
-- sama bentuknya dengan sebelum tahap 1.
alter table public.product_components
  add constraint product_components_uniq unique (product_id, component_product_id, component_color, component_size);

alter table public.product_variants
  drop column if exists track_stock;

notify pgrst, 'reload schema';

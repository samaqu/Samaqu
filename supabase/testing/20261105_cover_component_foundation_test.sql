-- Test 20261105_cover_component_foundation.
--
-- Semua di dalam transaksi yang di-ROLLBACK: stok, komponen, dan data tidak berubah.
-- Fokus: membuktikan TAHAP 1 tidak mengubah perilaku kabak → box-kabak.

begin;

-- ── 0. Skema baru ada ──────────────────────────────────────────────────────
select 'kolom_product_color' as cek,
       exists(select 1 from information_schema.columns
              where table_schema='public' and table_name='product_components' and column_name='product_color') as ada;
select 'kolom_track_stock' as cek,
       exists(select 1 from information_schema.columns
              where table_schema='public' and table_name='product_variants' and column_name='track_stock') as ada;

-- ── 1. Semua varian masih track_stock = true (belum ada yang false) ────────
select 'varian_track_stock_false' as cek, count(*) as n
from public.product_variants where track_stock = false;

-- ── 2. Baris komponen kabak tetap 1 dan tidak terikat varian ───────────────
select 'komponen_kabak' as cek, count(*) as n,
       count(*) filter (where product_color is null) as tanpa_varian
from public.product_components where product_id = 'kabak';

-- ── 3. Rencana komponen untuk varian kabak apa pun tetap 1 box ────────────
select 'plan_kabak_01' as cek, component_product_id, qty
from public.samaqu_component_plan('kabak', 1, 'Kabak 01', 'ALL SIZE');
select 'plan_kabak_12' as cek, component_product_id, qty
from public.samaqu_component_plan('kabak', 1, 'Kabak 12', 'ALL SIZE');
select 'plan_kabak_qty3' as cek, component_product_id, qty
from public.samaqu_component_plan('kabak', 3, 'Kabak 02', 'ALL SIZE');

-- ── 4. Stok efektif: varian normal = stoknya sendiri ──────────────────────
select 'efektif_box' as cek,
       samaqu_variant_effective_stock('box-kabak', 'Box', 'ALL SIZE') as stok;
select 'efektif_kabak_01' as cek,
       samaqu_variant_effective_stock('kabak', 'Kabak 01', 'ALL SIZE') as stok;
select 'efektif_thobe_m' as cek,
       samaqu_variant_effective_stock('thobe-superblack-jiharkah', 'default', 'M') as stok;
select 'efektif_cover' as cek,
       samaqu_variant_effective_stock('cover-hanger', 'Set Hanger + Cover', 'ALL SIZE') as stok;

-- ── 5. Stok sharing tetap: turunan = stok induk ───────────────────────────
select 'efektif_imron_m' as cek,
       samaqu_variant_effective_stock('thobe-superblack-imron', 'default', 'M') as stok,
       (select stock from product_variants where product_id='thobe-superblack-jiharkah' and size='M') as induk;

-- ── 6. Perilaku jual kabak TIDAK berubah (box ikut terpotong) ─────────────
create temp table uji (tahap text, kabak int, box int);
insert into uji values ('awal',
  (select stock from product_variants where product_id='kabak' and color='Kabak 01'),
  (select stock from product_variants where product_id='box-kabak'));

select samaqu_decrement_stock('kabak','Kabak 01','ALL SIZE',1,'component','99999999-9999-9999-9999-999999999999');
insert into uji values ('jual_1',
  (select stock from product_variants where product_id='kabak' and color='Kabak 01'),
  (select stock from product_variants where product_id='box-kabak'));

select samaqu_restore_stock('kabak','Kabak 01','ALL SIZE',1,'component','99999999-9999-9999-9999-999999999999');
insert into uji values ('batal',
  (select stock from product_variants where product_id='kabak' and color='Kabak 01'),
  (select stock from product_variants where product_id='box-kabak'));

select string_agg(tahap || ': kabak=' || kabak || ' box=' || box, ' | ' order by tahap) as alur_kabak
from uji;

-- ── 7. Movement komponen tetap memakai ref_type 'component' ───────────────
select 'movement_component' as cek, count(*) as n
from public.stock_movements
where ref_type = 'component' and ref_id = '99999999-9999-9999-9999-999999999999';

rollback;

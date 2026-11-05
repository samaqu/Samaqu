-- Test 20261105_component_stock_path (TAHAP 2).
--
-- Semua di dalam transaksi yang di-ROLLBACK: varian percobaan, komponen, stok, dan
-- movement tidak ada yang tertinggal.
--
-- Varian percobaan dibuat di dalam transaksi (bukan data nyata) karena tahap 3 baru
-- akan membuat varian Cover & Hanger yang sebenarnya.

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. Belum ada varian nyata ber-track_stock = false
-- ═══════════════════════════════════════════════════════════════════════════
select 'varian_track_false_nyata' as cek, count(*) as n
from public.product_variants where track_stock = false;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Varian percobaan: tanpa stok sendiri, 2 komponen (cover-thobe + hanger)
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.product_variants (product_id, color, size, stock, sku, track_stock)
values ('cover-hanger', 'UJI Thobe + Hanger', 'ALL SIZE', 0, 'UJI-CTH', false);

insert into public.product_components
  (product_id, product_color, product_size, component_product_id, component_color, component_size, qty)
values
  ('cover-hanger', 'UJI Thobe + Hanger', 'ALL SIZE', 'cover-thobe', 'Cover saja', 'ALL SIZE', 1),
  ('cover-hanger', 'UJI Thobe + Hanger', 'ALL SIZE', 'hanger', 'Hanger saja', 'ALL SIZE', 1);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Stok efektif = minimum komponen
-- ═══════════════════════════════════════════════════════════════════════════
select 'efektif' as cek,
       samaqu_variant_effective_stock('cover-hanger', 'UJI Thobe + Hanger', 'ALL SIZE') as stok_efektif,
       (select stock from public.product_variants where product_id = 'cover-thobe') as cover_thobe,
       (select stock from public.product_variants where product_id = 'hanger') as hanger;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Jual → kedua komponen turun, stok varian sendiri tetap 0
-- ═══════════════════════════════════════════════════════════════════════════
create temp table uji (tahap text, thobe int, hanger int, varian int, mv int);
insert into uji values ('awal',
  (select stock from public.product_variants where product_id = 'cover-thobe'),
  (select stock from public.product_variants where product_id = 'hanger'),
  (select stock from public.product_variants where product_id = 'cover-hanger' and color = 'UJI Thobe + Hanger'),
  0);

select samaqu_decrement_stock('cover-hanger', 'UJI Thobe + Hanger', 'ALL SIZE', 1, 'component',
  'aaaaaaaa-1111-1111-1111-111111111111');

insert into uji values ('jual',
  (select stock from public.product_variants where product_id = 'cover-thobe'),
  (select stock from public.product_variants where product_id = 'hanger'),
  (select stock from public.product_variants where product_id = 'cover-hanger' and color = 'UJI Thobe + Hanger'),
  (select count(*) from public.stock_movements where ref_id = 'aaaaaaaa-1111-1111-1111-111111111111'));

select samaqu_restore_stock('cover-hanger', 'UJI Thobe + Hanger', 'ALL SIZE', 1, 'component',
  'aaaaaaaa-1111-1111-1111-111111111111');

insert into uji values ('batal',
  (select stock from public.product_variants where product_id = 'cover-thobe'),
  (select stock from public.product_variants where product_id = 'hanger'),
  (select stock from public.product_variants where product_id = 'cover-hanger' and color = 'UJI Thobe + Hanger'),
  (select count(*) from public.stock_movements where ref_id = 'aaaaaaaa-1111-1111-1111-111111111111'));

select string_agg(tahap || ': thobe=' || thobe || ' hanger=' || hanger || ' varian=' || varian || ' mv=' || mv, ' | ' order by tahap) as alur_jual
from uji;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Atomik: satu komponen kurang → SEMUA batal, tidak ada movement
-- ═══════════════════════════════════════════════════════════════════════════
update public.product_variants set stock = 0 where product_id = 'hanger';
delete from public.stock_anomaly_log;

select 'atomik_gagal' as cek,
       samaqu_decrement_stock('cover-hanger', 'UJI Thobe + Hanger', 'ALL SIZE', 1, 'component',
         'bbbbbbbb-2222-2222-2222-222222222222') as hasil_harus_false;

select 'atomik_tidak_terpotong' as cek,
       (select stock from public.product_variants where product_id = 'cover-thobe') as cover_thobe_tetap,
       (select count(*) from public.stock_movements where ref_id = 'bbbbbbbb-2222-2222-2222-222222222222') as movement_tetap_0,
       (select string_agg(distinct reason, ',') from public.stock_anomaly_log) as anomali;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Penyebab gagal disebut komponennya, bukan "stok varian kurang"
-- ═══════════════════════════════════════════════════════════════════════════
select 'alasan_gagal' as cek,
       samaqu_stock_failure_reason('cover-hanger', 'UJI Thobe + Hanger', 'ALL SIZE') as alasan;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Varian tanpa komponen sama sekali → ditolak, anomali tercatat
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.product_variants (product_id, color, size, stock, sku, track_stock)
values ('cover-hanger', 'UJI Tanpa Komponen', 'ALL SIZE', 0, 'UJI-NONE', false);
delete from public.stock_anomaly_log;

select 'tanpa_komponen' as cek,
       samaqu_decrement_stock('cover-hanger', 'UJI Tanpa Komponen', 'ALL SIZE', 1, 'component',
         'cccccccc-3333-3333-3333-333333333333') as hasil_harus_false,
       (select string_agg(distinct reason, ',') from public.stock_anomaly_log) as anomali;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Kabak & varian lama TIDAK berubah
-- ═══════════════════════════════════════════════════════════════════════════
update public.product_variants set stock = 263 where product_id = 'hanger';
create temp table uji2 (tahap text, kabak int, box int, lama int);
insert into uji2 values ('awal',
  (select stock from public.product_variants where product_id = 'kabak' and color = 'Kabak 01'),
  (select stock from public.product_variants where product_id = 'box-kabak'),
  (select stock from public.product_variants where product_id = 'cover-hanger' and color = 'Set Hanger + Cover'));

select samaqu_decrement_stock('kabak', 'Kabak 01', 'ALL SIZE', 1, 'component',
  'dddddddd-4444-4444-4444-444444444444');
insert into uji2 values ('jual_kabak',
  (select stock from public.product_variants where product_id = 'kabak' and color = 'Kabak 01'),
  (select stock from public.product_variants where product_id = 'box-kabak'),
  (select stock from public.product_variants where product_id = 'cover-hanger' and color = 'Set Hanger + Cover'));

select samaqu_restore_stock('kabak', 'Kabak 01', 'ALL SIZE', 1, 'component',
  'dddddddd-4444-4444-4444-444444444444');
insert into uji2 values ('batal_kabak',
  (select stock from public.product_variants where product_id = 'kabak' and color = 'Kabak 01'),
  (select stock from public.product_variants where product_id = 'box-kabak'),
  (select stock from public.product_variants where product_id = 'cover-hanger' and color = 'Set Hanger + Cover'));

select samaqu_decrement_stock('cover-hanger', 'Set Hanger + Cover', 'ALL SIZE', 1, 'component',
  'eeeeeeee-5555-5555-5555-555555555555');
insert into uji2 values ('jual_varian_lama',
  (select stock from public.product_variants where product_id = 'kabak' and color = 'Kabak 01'),
  (select stock from public.product_variants where product_id = 'box-kabak'),
  (select stock from public.product_variants where product_id = 'cover-hanger' and color = 'Set Hanger + Cover'));

select string_agg(tahap || ': kabak=' || kabak || ' box=' || box || ' lama=' || lama, ' | ' order by tahap) as alur_lain
from uji2;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Stok sharing tetap ke induk
-- ═══════════════════════════════════════════════════════════════════════════
select 'sharing' as cek,
       samaqu_variant_effective_stock('thobe-superblack-imron', 'default', 'M') as turunan,
       (select stock from public.product_variants where product_id = 'thobe-superblack-jiharkah' and size = 'M') as induk;

rollback;

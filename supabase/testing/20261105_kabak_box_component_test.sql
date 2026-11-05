-- Test 20261105_kabak_box_component.
--
-- Semua di dalam transaksi yang di-ROLLBACK: stok, movement, dan log tidak berubah.
-- Jalankan setelah migration.

\set ON_ERROR_STOP off

begin;

-- Data uji: kabak Kabak 01 (11), box 487.
select 'awal_kabak' as kasus, stock as nilai from product_variants where product_id='kabak' and color='Kabak 01';
select 'awal_box'   as kasus, stock as nilai from product_variants where product_id='box-kabak';

-- ── 1. Jual 1 kabak → kabak −1 dan box −1 ──────────────────────────────────
select samaqu_decrement_stock('kabak','Kabak 01','ALL SIZE',1,'component','11111111-1111-1111-1111-111111111111') as hasil;
select 'kabak_turun' as kasus, stock as nilai from product_variants where product_id='kabak' and color='Kabak 01';
select 'box_turun'   as kasus, stock as nilai from product_variants where product_id='box-kabak';
select 'movement_box' as kasus, qty, direction, ref_type from stock_movements
 where product_id='box-kabak' and ref_id='11111111-1111-1111-1111-111111111111';

-- ── 2. Batal order itu → kabak +1 dan box +1 ──────────────────────────────
select samaqu_restore_stock('kabak','Kabak 01','ALL SIZE',1,'component','11111111-1111-1111-1111-111111111111') as hasil;
select 'kabak_pulih' as kasus, stock as nilai from product_variants where product_id='kabak' and color='Kabak 01';
select 'box_pulih'   as kasus, stock as nilai from product_variants where product_id='box-kabak';

-- ── 3. Restore ganda → box TIDAK bertambah lagi (out − in = 0) ─────────────
select samaqu_restore_stock('kabak','Kabak 01','ALL SIZE',1,'component','11111111-1111-1111-1111-111111111111') as hasil;
select 'box_tidak_naik' as kasus, stock as nilai from product_variants where product_id='box-kabak';

-- ── 4. Order lama (tanpa ref movement) → restore tidak menambah box ────────
select samaqu_restore_stock('kabak','Kabak 01','ALL SIZE',1,'component','22222222-2222-2222-2222-222222222222') as hasil;
select 'box_order_lama' as kasus, stock as nilai from product_variants where product_id='box-kabak';

-- ── 5. Tanpa ref → tidak memotong box, dicatat component_missing_ref ───────
delete from stock_anomaly_log;
select samaqu_decrement_stock('kabak','Kabak 02','ALL SIZE',1) as hasil;
select 'box_tanpa_ref' as kasus, stock as nilai from product_variants where product_id='box-kabak';
select 'anomali_missing_ref' as kasus, reason from stock_anomaly_log order by id desc limit 1;

-- ── 6. Box habis → kabak tetap terjual, tercatat component_out_of_stock ────
-- Set stok box = 0 dulu (hanya di dalam transaksi uji ini).
update product_variants set stock = 0 where product_id='box-kabak';
delete from stock_anomaly_log;
select samaqu_decrement_stock('kabak','Kabak 04','ALL SIZE',1,'component','33333333-3333-3333-3333-333333333333') as hasil_harus_true;
select 'kabak_tetap_turun' as kasus, stock as nilai from product_variants where product_id='kabak' and color='Kabak 04';
select 'box_tetap_0' as kasus, stock as nilai from product_variants where product_id='box-kabak';
select 'reason_box_habis' as kasus, reason from stock_anomaly_log where reason='component_out_of_stock' limit 1;

-- ── 7. Box sempat 0 → restore tidak menaikkan palsu ────────────────────────
select samaqu_restore_stock('kabak','Kabak 04','ALL SIZE',1,'component','33333333-3333-3333-3333-333333333333') as hasil;
select 'box_tidak_naik_palsu' as kasus, stock as nilai from product_variants where product_id='box-kabak';

-- ── 8. Dua baris kabak beda warna; batal satu baris → box kembali 1 saja ───
update product_variants set stock = 50 where product_id='box-kabak';
select samaqu_decrement_stock('kabak','Kabak 01','ALL SIZE',1,'component','44444444-4444-4444-4444-444444444444') as d1;
select samaqu_decrement_stock('kabak','Kabak 12','ALL SIZE',1,'component','44444444-4444-4444-4444-444444444444') as d2;
select 'box_setelah_2' as kasus, stock as nilai from product_variants where product_id='box-kabak';
-- Batalkan hanya baris Kabak 01
select samaqu_restore_stock('kabak','Kabak 01','ALL SIZE',1,'component','44444444-4444-4444-4444-444444444444') as r1;
select 'box_setelah_batal_1' as kasus, stock as nilai from product_variants where product_id='box-kabak';
-- Batalkan baris kedua
select samaqu_restore_stock('kabak','Kabak 12','ALL SIZE',1,'component','44444444-4444-4444-4444-444444444444') as r2;
select 'box_setelah_batal_2' as kasus, stock as nilai from product_variants where product_id='box-kabak';

-- ── 9. Produk lain tidak terpengaruh komponen ──────────────────────────────
select samaqu_decrement_stock('cover-hanger','Set Hanger + Cover','ALL SIZE',1,'component','55555555-5555-5555-5555-555555555555') as hasil;
select 'movement_komponen_hanya_kabak' as kasus, count(*) as n
  from stock_movements where ref_type='component' and ref_id='55555555-5555-5555-5555-555555555555';

-- ── 10. Barang Masuk box tetap bisa (increment) ────────────────────────────
select samaqu_increment_stock('box-kabak','Box','ALL SIZE',10) as hasil;
select 'box_setelah_restok' as kasus, stock as nilai from product_variants where product_id='box-kabak';

rollback;

-- Test 20261104_stock_guard_tahap3.
--
-- Semua di dalam transaksi yang di-ROLLBACK: tidak ada stok/log/data yang berubah.

begin;

-- ── 1. increment: baris ADA tapi stok kurang → increment_insufficient_stock ──
delete from stock_anomaly_log;
select 'inc_stok_kurang' as kasus,
       samaqu_increment_stock('cover-hanger', 'Set Hanger + Cover', 'ALL SIZE', -999999) as hasil,
       false as harapan;
select 'reason_stok_kurang' as kasus,
       (select reason from stock_anomaly_log order by id desc limit 1) as reason,
       'increment_insufficient_stock' as harapan;

-- ── 2. increment: baris TIDAK ADA → increment_variant_not_found ──────────────
delete from stock_anomaly_log;
select 'inc_varian_hilang' as kasus,
       samaqu_increment_stock('cover-hanger', '', '', 5) as hasil,
       false as harapan;
select 'reason_varian_hilang' as kasus,
       (select reason from stock_anomaly_log order by id desc limit 1) as reason,
       'increment_variant_not_found' as harapan;

-- ── 3. unique index: varian beda kapital DITOLAK (23505) ─────────────────────
--    Dijalankan di sub-blok supaya error tertangkap dan transaksi utama tetap lanjut.
do $$
begin
  insert into public.product_variants (product_id, color, size, stock)
  values ('cover-hanger', 'set hanger + cover', 'all size', 0);
  raise notice 'GAGAL: duplikat kapital seharusnya ditolak';
exception when unique_violation then
  raise notice 'OK: duplikat kapital ditolak (23505)';
end $$;

-- ── 4. ganti nama varian yang cuma beda kapital (baris yang sama) tetap jalan ──
select 'rename_case' as kasus,
       (update public.product_variants
           set color = 'SET HANGER + COVER'
         where product_id = 'cover-hanger'
        returning color) as color_baru;
select 'rename_stok_masih_terbaca' as kasus,
       samaqu_decrement_stock('cover-hanger', 'Set Hanger + Cover', 'ALL SIZE', 1) as hasil,
       true as harapan;

-- ── 5. reseller_create_order membawa penanda STOCK_ANOMALY ───────────────────
select 'reseller_penanda' as kasus,
       (select position('STOCK_ANOMALY' in prosrc) > 0
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'samaqu_reseller_create_order') as ada,
       true as harapan;

-- ── 6. index benar-benar ada ─────────────────────────────────────────────────
select 'index_ada' as kasus,
       (select indexdef from pg_indexes
         where tablename = 'product_variants'
           and indexname = 'product_variants_identity_uidx') as definisi;

rollback;

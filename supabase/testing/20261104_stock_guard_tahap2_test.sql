-- Test 20261104_stock_guard_tahap2.
--
-- Semua di dalam transaksi yang di-ROLLBACK: tidak ada stok, log, atau data yang berubah.
-- Jalankan di Supabase SQL Editor / API query.

begin;

-- ── 1. Varian tidak ditemukan: FALSE ───────────────────────────────────────
select 'varian_hilang' as kasus,
       samaqu_decrement_stock('cover-hanger', '', '', 1) as hasil,
       false as harapan;

-- ── 2. ID bayangan: TRUE (perilaku lama dipertahankan) ─────────────────────
select 'phantom' as kasus,
       samaqu_decrement_stock('addon-cover-hanger', '', '', 1) as hasil,
       true as harapan;

-- ── 3. Normal: TRUE ────────────────────────────────────────────────────────
select 'normal' as kasus,
       samaqu_decrement_stock('cover-hanger', 'Set Hanger + Cover', 'ALL SIZE', 1) as hasil,
       true as harapan;

-- ── 4. Pencocokan case-insensitive (diseragamkan dengan increment) ─────────
select 'case_insensitive' as kasus,
       samaqu_decrement_stock('cover-hanger', 'SET HANGER + COVER', 'all size', 1) as hasil,
       true as harapan;

-- ── 5. Stok kurang: FALSE ──────────────────────────────────────────────────
select 'stok_kurang' as kasus,
       samaqu_decrement_stock('cover-hanger', 'Set Hanger + Cover', 'ALL SIZE', 999999) as hasil,
       false as harapan;

-- ── 6. Kabak (paket, warna = nama paket) ───────────────────────────────────
select 'kabak' as kasus,
       samaqu_decrement_stock('kabak', 'Kabak 01', 'ALL SIZE', 1) as hasil,
       true as harapan;

-- ── 7. Pesan dibedakan: penyebab kegagalan ─────────────────────────────────
select 'reason_varian_hilang' as kasus,
       samaqu_stock_failure_reason('cover-hanger', '', '') as alasan,
       'variant_not_found' as harapan
union all
select 'reason_stok_kurang', samaqu_stock_failure_reason('cover-hanger', 'Set Hanger + Cover', 'ALL SIZE'), 'insufficient_stock'
union all
select 'reason_phantom', samaqu_stock_failure_reason('addon-cover-hanger', '', ''), 'phantom_product';

-- ── 8. increment negatif: batas bawah ──────────────────────────────────────
select 'increment_tarik_kebanyakan' as kasus,
       samaqu_increment_stock('cover-hanger', 'Set Hanger + Cover', 'ALL SIZE', -999999) as hasil,
       false as harapan;

select 'increment_tarik_wajar' as kasus,
       samaqu_increment_stock('cover-hanger', 'Set Hanger + Cover', 'ALL SIZE', -1) as hasil,
       true as harapan;

-- ── 9. increment ke varian yang tidak ada: FALSE + tercatat ────────────────
select 'increment_varian_hilang' as kasus,
       samaqu_increment_stock('cover-hanger', '', '', 1) as hasil,
       false as harapan;

-- ── 10. Log yang tercatat selama test (ikut rollback) ──────────────────────
select reason, product_id, color, size, qty, source
from stock_anomaly_log
order by id desc
limit 20;

rollback;

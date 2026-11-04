-- UJI PERILAKU BARU — semua di dalam transaksi yang di-ROLLBACK.
-- Tidak ada stok/log yang benar-benar berubah.
begin;

-- Kasus 1: produk TIDAK terdaftar (id bayangan) → harus TRUE, tidak dicatat
select 'kasus1_id_bayangan' as kasus,
       samaqu_decrement_stock('addon-cover-hanger', '', '', 1) as hasil,
       'harap TRUE' as harapan;

-- Kasus 2: produk ADA tapi varian tidak ada → harus FALSE + tercatat
select 'kasus2_varian_hilang' as kasus,
       samaqu_decrement_stock('cover-hanger', '', '', 1) as hasil,
       'harap FALSE' as harapan;

-- Kasus 3: varian normal ada & cukup → harus TRUE
select 'kasus3_normal' as kasus,
       samaqu_decrement_stock('cover-hanger', 'Set Hanger + Cover', 'ALL SIZE', 1) as hasil,
       'harap TRUE' as harapan;

-- Kasus 4: qty melebihi stok → harus FALSE
select 'kasus4_stok_kurang' as kasus,
       samaqu_decrement_stock('cover-hanger', 'Set Hanger + Cover', 'ALL SIZE', 99999) as hasil,
       'harap FALSE' as harapan;

-- Kasus 5: restore ke baris yang tidak ada → tidak error, tercatat
select 'kasus5_restore_hilang' as kasus,
       (select count(*) from stock_anomaly_log) as log_sebelum;
select samaqu_restore_stock('cover-hanger', '', '', 1);
select 'kasus5_after' as kasus, (select count(*) from stock_anomaly_log) as log_sesudah;

-- Isi log apa saja yang tercatat selama uji
select product_id, color, size, qty, reason from stock_anomaly_log order by id;

rollback;

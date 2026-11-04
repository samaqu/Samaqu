-- Pencatatan anomali yang SELAMAT dari rollback.
--
-- Masalah: kalau `samaqu_decrement_stock` gagal di dalam fungsi SQL yang lalu `raise
-- exception` (edit order, edit reseller, reseller tahap2, retur, tukar series), baris
-- `stock_anomaly_log` ikut ter-ROLLBACK dan hilang. Padahal justru kegagalan itulah yang
-- perlu ditelusuri admin.
--
-- PILIHAN YANG DIAMBIL: catat DI LUAR transaksi, dari pemanggil, setelah transaksi gagal.
--
--   Kenapa bukan tabel antrean di transaksi yang sama?
--   Sudah diuji: tabel antrean ikut ter-ROLLBACK bersama transaksi induk, jadi tidak
--   menyelesaikan apa pun. Autonomous transaction (dblink / pg_background) tidak tersedia
--   di Supabase standar.
--
--   Karena itu:
--   - Fungsi SQL menulis anomali ke `stock_anomaly_log` seperti biasa (aman untuk pemanggil
--     yang tidak rollback, mis. checkout & ops).
--   - Pemanggil SQL yang bisa `raise exception` mengembalikan rincian gagal lewat pesan
--     error ber-penanda `STOCK_ANOMALY:<json>`. Pemanggil TS di server menangkap pesan itu
--     lalu memanggil `recordStockAnomaly()` SETELAH transaksi selesai (rollback), sehingga
--     catatannya tersimpan permanen.
--
--   Ini tidak mengubah besar fungsi stok maupun perilaku stoknya.

-- Catatan: tabel staging dihapus lagi karena tidak terpakai.
drop table if exists public.stock_anomaly_staging;

-- Helper: ambil rincian gagal untuk dipakai sebagai penanda di pesan error.
create or replace function public.samaqu_anomaly_detail(
  p_product_id text,
  p_color text,
  p_size text,
  p_qty integer
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  v_reason := public.samaqu_stock_failure_reason(p_product_id, p_color, p_size);
  return jsonb_build_object(
    'product_id', p_product_id,
    'color', p_color,
    'size', p_size,
    'qty', p_qty,
    'reason', v_reason
  );
end;
$$;

revoke all on function public.samaqu_anomaly_detail(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.samaqu_anomaly_detail(text, text, text, integer) to service_role;

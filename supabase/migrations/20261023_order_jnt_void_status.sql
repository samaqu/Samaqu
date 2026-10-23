-- Penanda resi J&T yang sudah di-void (dibatalkan).
--
-- Sebelum kolom ini ada, resi yang sudah dibatalkan di J&T tidak bisa dibedakan dari resi aktif:
-- `orders.awb_no` tetap tersimpan (memang sengaja, sebagai jejak audit), jadi label resi mati
-- masih bisa dibuka dan dicetak lewat `/admin/label/<no-pesanan>`.
--
-- Isi kolom:
--   NULL      = tidak ada resi, atau resi masih aktif
--   'voided'  = resi sudah dibatalkan di J&T
--
-- Diisi oleh `cancelOrderCompletely()` (src/lib/cancel-order.ts) setelah J&T mengonfirmasi void,
-- dan oleh sinkronisasi tracking (src/lib/jnt/tracking-sync.ts) saat riwayat J&T memuat kode
-- 162/163 — itu menangkap void yang dilakukan langsung di dashboard J&T, di luar aplikasi.
--
-- Jalankan manual di SQL Editor Supabase (sandbox tidak punya jalur DDL). Kode tetap jalan
-- sebelum SQL ini dijalankan: update pembatalan membuang kolom yang belum ada lalu mengulang,
-- hanya saja label masih memakai aturan lama (status pesanan `dibatalkan`).

ALTER TABLE orders ADD COLUMN IF NOT EXISTS jnt_void_status TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS jnt_voided_at TIMESTAMPTZ;

COMMENT ON COLUMN orders.jnt_void_status IS
  'Penanda resi J&T sudah di-void: ''voided'' = resi dibatalkan, NULL = resi aktif/tidak ada resi.';
COMMENT ON COLUMN orders.jnt_voided_at IS
  'Jam resi benar-benar di-void di J&T (WIB server). NULL = belum pernah di-void.';

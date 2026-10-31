-- Pengaturan promo "Free Cover Hanger — Pembelian Pertama".
--
-- Dipakai halaman pesan promo (/promo/free-cover-hanger/pesan) dan halaman admin "Promo":
--   * judul katalog promo
--   * jumlah kuota bonus & sisa kuota (bar "Sisa bonus")
--
-- Semua kolom opsional dan punya DEFAULT yang aman, jadi baris `store_settings` yang sudah
-- ada langsung memakai nilai bawaan tanpa UPDATE tambahan.

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS promo_fch_active        BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS promo_fch_title         TEXT,
  ADD COLUMN IF NOT EXISTS promo_fch_eyebrow       TEXT,
  ADD COLUMN IF NOT EXISTS promo_fch_description   TEXT,
  ADD COLUMN IF NOT EXISTS promo_fch_quota_total   INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS promo_fch_quota_left    INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS promo_fch_quota_note    TEXT,
  ADD COLUMN IF NOT EXISTS promo_fch_start_date    DATE,
  ADD COLUMN IF NOT EXISTS promo_fch_end_date      DATE;

COMMENT ON COLUMN store_settings.promo_fch_active      IS 'Promo Free Cover Hanger ditampilkan/dimatikan.';
COMMENT ON COLUMN store_settings.promo_fch_title       IS 'Judul besar di halaman katalog promo.';
COMMENT ON COLUMN store_settings.promo_fch_eyebrow     IS 'Teks kecil di atas judul.';
COMMENT ON COLUMN store_settings.promo_fch_quota_total IS 'Total bonus yang disediakan program.';
COMMENT ON COLUMN store_settings.promo_fch_quota_left  IS 'Sisa bonus — angka yang tampil di bar.';
COMMENT ON COLUMN store_settings.promo_fch_quota_note  IS 'Kalimat di bawah bar bonus.';

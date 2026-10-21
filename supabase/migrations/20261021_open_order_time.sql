-- Jam buka & jam tutup jendela Open Order (WIB).
--
-- Catatan: kolom jam opsional. Kalau kosong:
--   - open_order_start_time -> mulai 00:00 WIB
--   - open_order_end_time   -> tutup  23:59:59 WIB
-- jadi perilaku lama (cuma pakai tanggal) tetap berlaku selama kolomnya kosong.
--
-- Jalankan manual di SQL Editor Supabase (sandbox tidak punya jalur DDL).

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS open_order_start_time TEXT,
  ADD COLUMN IF NOT EXISTS open_order_end_time TEXT;

COMMENT ON COLUMN store_settings.open_order_start_time IS 'Jam buka Open Order (HH:MM, WIB). Kosong = 00:00.';
COMMENT ON COLUMN store_settings.open_order_end_time IS 'Jam tutup Open Order (HH:MM, WIB). Kosong = 23:59.';

-- Kolom `email` pada tabel customers.
--
-- MASALAH: `customers` tidak punya kolom email, padahal email adalah identitas utama
-- akun (disimpan di Supabase Auth). Akibatnya penautan pesanan ke akun hanya bisa lewat
-- nomor WhatsApp — kalau pembeli memakai nomor berbeda saat checkout (mis. order promo
-- sebagai tamu), pesanannya tidak pernah muncul di dashboard akun.
--
-- Kolom ini opsional (nullable): akun lama tidak punya nilai, dan backfill-nya dilakukan
-- dari sisi aplikasi/admin (bukan dari SQL), karena sumber sebenarnya ada di Auth.
--
-- Sifat:
--  - disimpan huruf kecil & tanpa spasi (lihat `normalizeEmail` di aplikasi)
--  - unik bila terisi, supaya satu email tidak dipakai dua akun
--    (indeks parsial: akun tanpa email tetap boleh banyak)

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN customers.email IS
  'Email akun (huruf kecil). Sumber utama identitas; dipakai mencocokkan pesanan ke akun.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email_lower
  ON customers (LOWER(email))
  WHERE email IS NOT NULL AND email <> '';

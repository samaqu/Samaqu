-- Sakelar promo Free Cover Hanger PER UKURAN (varian).
--
-- MASALAH: `products.promo_fch_enabled` hanya bisa mematikan/ menyalakan seluruh produk.
-- Padahal satu series punya banyak ukuran (S/M/L/XL/XXL) dan admin perlu mengatur per ukuran
-- (mis. Thobe Black M ikut promo, XL tidak).
--
-- PENANDA disimpan di `product_variants` — baris yang memang mewakili satu kombinasi
-- (produk, warna, ukuran). `products.promo_fch_enabled` tetap dipakai sebagai sakelar INDUK:
-- produk yang dimatikan di level produk tidak tampil sama sekali.
--
-- DEFAULT true → semua ukuran yang sudah ada langsung ikut promo, jadi tidak ada yang
-- tiba-tiba hilang dari halaman promo. Admin tinggal mematikan ukuran yang tidak diinginkan.

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS promo_fch_enabled BOOLEAN DEFAULT true;

COMMENT ON COLUMN product_variants.promo_fch_enabled IS
  'Ikut promo Free Cover Hanger (per ukuran). false = ukuran ini tidak ditawarkan di halaman pesan promo.';

CREATE INDEX IF NOT EXISTS idx_variants_promo_fch
  ON product_variants(product_id)
  WHERE promo_fch_enabled = false;

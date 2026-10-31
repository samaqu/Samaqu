-- Produk yang ditampilkan di katalog promo "Free Cover Hanger".
--
-- Jalur SENDIRI, terpisah dari `open_order_enabled` (sakelar program Open Order).
-- Admin bisa memilih produk mana yang ikut promo tanpa mengubah perilaku /open-order.
--
-- DEFAULT true supaya produk yang sudah ada langsung ikut promo (perilaku sama dengan
-- saat fitur ini pertama dipakai), lalu admin mematikan yang tidak diinginkan.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS promo_fch_enabled BOOLEAN DEFAULT true;

COMMENT ON COLUMN products.promo_fch_enabled IS
  'Tampilkan produk ini di katalog promo Free Cover Hanger (/promo/free-cover-hanger/pesan).';

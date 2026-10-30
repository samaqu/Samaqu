-- =====================================================================
-- SAMAQU — Reseller: pengaturan harga per series (2026-10-30)
--
-- ADITIF. Pengaturan harga reseller pindah ke tab "Produk & Harga":
--   products.reseller_enabled            boolean default false (toggle jual ke reseller)
--   products.reseller_min_sell_price     integer nullable (batas jual KHUSUS reseller,
--                                        TERPISAH dari products.minimum_price milik CYP)
--   store_settings.reseller_default_discount_percent numeric(5,2) default 25
--   products.reseller_discount_percent   tetap = diskon KHUSUS (NULL = ikut default)
--
-- Backfill SEKALI (hanya saat kolom reseller_enabled belum ada):
--   produk yang reseller_discount_percent-nya sudah terisi → reseller_enabled = true.
--   Produk lain tetap false. products.minimum_price TIDAK disentuh.
--
-- Catatan idempotensi: backfill sengaja dibungkus pengecekan kolom supaya
-- menjalankan ulang file ini TIDAK menyalakan lagi series yang sengaja
-- dimatikan admin lewat tab Produk & Harga.
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'reseller_enabled'
  ) then
    alter table public.products
      add column reseller_enabled boolean not null default false,
      add column reseller_min_sell_price integer;

    -- Backfill sekali: diskon khusus yang sudah diisi = produk aktif untuk reseller.
    update public.products
       set reseller_enabled = true
     where reseller_discount_percent is not null;
  else
    alter table public.products add column if not exists reseller_min_sell_price integer;
  end if;
end $$;

alter table public.store_settings
  add column if not exists reseller_default_discount_percent numeric(5,2) not null default 25;

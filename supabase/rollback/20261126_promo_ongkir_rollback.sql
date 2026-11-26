-- Rollback promo ongkir (20261126_promo_ongkir.sql).
-- Menghapus kolom baru saja. Kolom lama (shipping_cost dll) tidak disentuh.
-- Catatan: angka di kolom baru pesanan yang sudah berpromo akan hilang; `shipping_cost` (yang dibayar) tetap.

alter table public.orders drop constraint if exists orders_shipping_promo_kind_valid;
alter table public.orders
  drop column if exists shipping_promo_kind,
  drop column if exists shipping_discount,
  drop column if exists shipping_cost_original;

alter table public.store_settings drop constraint if exists store_settings_promo_ongkir_luar_percent_range;
alter table public.store_settings drop constraint if exists store_settings_promo_ongkir_jnt_discount_range;
alter table public.store_settings
  drop column if exists promo_bot_fch_end,
  drop column if exists promo_bot_fch_start,
  drop column if exists promo_bot_fch_active,
  drop column if exists promo_ongkir_jnt_discount_percent,
  drop column if exists promo_ongkir_jabo_cities,
  drop column if exists promo_ongkir_luar_percent,
  drop column if exists promo_ongkir_luar_end,
  drop column if exists promo_ongkir_luar_start,
  drop column if exists promo_ongkir_luar_active,
  drop column if exists promo_ongkir_jabo_end,
  drop column if exists promo_ongkir_jabo_start,
  drop column if exists promo_ongkir_jabo_active;

notify pgrst, 'reload schema';

-- Rollback batas potongan promo ongkir (20261127_promo_ongkir_batas.sql). Hanya menghapus dua kolom baru.
-- Setelah rollback, kode website versi 27 Nov harus ikut dikembalikan (kode membaca kolom ini).

alter table public.store_settings drop constraint if exists store_settings_promo_ongkir_jabo_max_range;
alter table public.store_settings drop constraint if exists store_settings_promo_ongkir_luar_max_range;
alter table public.store_settings
  drop column if exists promo_ongkir_luar_max,
  drop column if exists promo_ongkir_jabo_max;

notify pgrst, 'reload schema';

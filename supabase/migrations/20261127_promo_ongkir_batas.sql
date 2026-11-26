-- Batas maksimal potongan promo ongkir (27 November 2026).
--
-- HANYA MENAMBAH dua kolom di store_settings (baris id = 1). Tidak ada kolom lama yang diubah dan tidak ada
-- data pesanan yang disentuh.
--   promo_ongkir_jabo_max : potongan maksimal (Rp) per order untuk Jabodetabek (default 20.000)
--   promo_ongkir_luar_max : potongan maksimal (Rp) per order untuk luar Jabodetabek (default 40.000)
-- Berlaku per order, berapa pun jumlah barangnya. Nilai 0 berarti tidak ada potongan untuk wilayah itu.

alter table public.store_settings
  add column if not exists promo_ongkir_jabo_max integer not null default 20000,
  add column if not exists promo_ongkir_luar_max integer not null default 40000;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'store_settings_promo_ongkir_jabo_max_range') then
    alter table public.store_settings
      add constraint store_settings_promo_ongkir_jabo_max_range check (promo_ongkir_jabo_max between 0 and 10000000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'store_settings_promo_ongkir_luar_max_range') then
    alter table public.store_settings
      add constraint store_settings_promo_ongkir_luar_max_range check (promo_ongkir_luar_max between 0 and 10000000);
  end if;
end $$;

comment on column public.store_settings.promo_ongkir_jabo_max is 'Potongan ongkir maksimal (Rp) per order, Jabodetabek.';
comment on column public.store_settings.promo_ongkir_luar_max is 'Potongan ongkir maksimal (Rp) per order, luar Jabodetabek.';

notify pgrst, 'reload schema';

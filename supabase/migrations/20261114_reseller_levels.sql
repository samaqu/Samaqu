-- Tingkatan reseller (Silver / Gold / Platinum) yang bisa diatur admin.
--
-- Sebelumnya batas level ditulis di kode (src/lib/reseller/level.ts: LEVELS). Dua kolom ini memindahkan
-- pengaturannya ke database tanpa mengubah perilaku sekarang:
--
--   store_settings.reseller_levels  jsonb  — batas & nama tiga level untuk SEMUA reseller.
--       NULL = pakai batas standar di kode (Silver Rp0, Gold Rp2,5 jt, Platinum Rp7,5 jt per bulan).
--       Bentuk: [{"key":"silver","label":"Silver","min":0},{"key":"gold","label":"Gold","min":2500000},
--                {"key":"platinum","label":"Platinum","min":7500000}]
--       Isinya divalidasi aplikasi (validateLevels); nilai tak valid dianggap NULL (batas standar).
--
--   resellers.level_override  text  — level manual per reseller ('silver' | 'gold' | 'platinum').
--       NULL = otomatis dari rata-rata belanja. Dipakai admin untuk menetapkan seseorang (mis. VIP).
--
-- Keduanya NULL secara bawaan, jadi tidak ada reseller yang berubah level sampai admin mengisinya.
-- Level hanya tampilan motivasi: TIDAK mengubah harga atau diskon. Perubahan ini aditif.

alter table public.store_settings
  add column if not exists reseller_levels jsonb;

alter table public.resellers
  add column if not exists level_override text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'resellers_level_override_valid'
  ) then
    alter table public.resellers
      add constraint resellers_level_override_valid
      check (level_override is null or level_override in ('silver', 'gold', 'platinum'));
  end if;
end $$;

comment on column public.store_settings.reseller_levels is
  'Batas & nama tiga level reseller (jsonb). NULL = batas standar di kode.';
comment on column public.resellers.level_override is
  'Level manual reseller (silver/gold/platinum). NULL = otomatis dari rata-rata belanja.';

notify pgrst, 'reload schema';

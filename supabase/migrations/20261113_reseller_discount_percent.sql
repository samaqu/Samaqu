-- Diskon khusus per reseller.
--
-- Sebelumnya semua reseller memakai satu diskon default (store_settings.reseller_default_discount_percent)
-- atau diskon khusus per series (products.reseller_discount_percent). Kolom ini memungkinkan tiap reseller
-- punya persen sendiri (mis. 25, 13, 17.5).
--
-- Aturan di aplikasi (src/lib/reseller/pricing.ts):
--   diskon khusus produk (jika diisi) -> diskon khusus reseller (jika diisi) -> diskon default.
--
-- NULL = ikut diskon default, jadi semua reseller yang sudah ada TIDAK berubah harganya sampai diisi.
-- Perubahan ini aditif dan hanya berlaku untuk pesanan BARU (harga pesanan lama sudah tersimpan).

alter table public.resellers
  add column if not exists discount_percent numeric(5, 2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'resellers_discount_percent_range'
  ) then
    alter table public.resellers
      add constraint resellers_discount_percent_range
      check (discount_percent is null or (discount_percent >= 0 and discount_percent <= 100));
  end if;
end $$;

comment on column public.resellers.discount_percent is
  'Diskon khusus reseller (persen, 0-100). NULL = ikut diskon default pengaturan reseller.';

notify pgrst, 'reload schema';

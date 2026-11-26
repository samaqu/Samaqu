-- Promo Ongkir customer + promo bot (26 November 2026).
--
-- HANYA MENAMBAH kolom. Tidak ada kolom lama yang diubah, tidak ada data yang diisi ulang.
--
-- 1) store_settings (baris id = 1): pengaturan promo yang dibaca website, panel admin, dan bot.
--    Prefix `promo_ongkir_*` dan `promo_bot_*` sengaja BEDA dari `promo_fch_*` (promo Free Cover
--    Hanger website untuk iklan) supaya keduanya tidak pernah saling membaca.
--      - Free ongkir Jabodetabek      : promo_ongkir_jabo_active/_start/_end  (default MATI)
--      - Potongan luar Jabodetabek    : promo_ongkir_luar_active/_start/_end + _percent (default MATI, 40%)
--      - Daftar wilayah Jabodetabek   : promo_ongkir_jabo_cities (nama kota resmi di dataset area J&T)
--      - Diskon akun VIP J&T          : promo_ongkir_jnt_discount_percent (untuk laporan, default 25)
--      - Free Cover Hanger khusus bot : promo_bot_fch_active/_start/_end (default NYALA = perilaku bot hari ini)
--    Tanggal mulai/selesai boleh kosong (= tanpa batas), dihitung dalam tanggal WIB.
--
-- 2) orders: tiga kolom pencatat promo ongkir.
--      shipping_cost          (SUDAH ADA) = ongkir yang DIBAYAR customer. Tidak berubah artinya.
--      shipping_cost_original = tarif J&T sebelum promo (NULL = pesanan tanpa promo / pesanan lama)
--      shipping_discount      = potongan ongkir dalam Rp (0 = tanpa promo)
--      shipping_promo_kind    = 'jabo' | 'luar' | NULL

alter table public.store_settings
  add column if not exists promo_ongkir_jabo_active boolean not null default false,
  add column if not exists promo_ongkir_jabo_start date,
  add column if not exists promo_ongkir_jabo_end date,
  add column if not exists promo_ongkir_luar_active boolean not null default false,
  add column if not exists promo_ongkir_luar_start date,
  add column if not exists promo_ongkir_luar_end date,
  add column if not exists promo_ongkir_luar_percent integer not null default 40,
  add column if not exists promo_ongkir_jabo_cities text[] not null default array[
    'KOTA ADM. JAKARTA PUSAT','KOTA ADM. JAKARTA UTARA','KOTA ADM. JAKARTA BARAT',
    'KOTA ADM. JAKARTA SELATAN','KOTA ADM. JAKARTA TIMUR','KAB. ADM. KEP. SERIBU',
    'KOTA BOGOR','KAB. BOGOR','KOTA DEPOK',
    'KOTA TANGERANG','KAB. TANGERANG','KOTA TANGERANG SELATAN',
    'KOTA BEKASI','KAB. BEKASI'
  ]::text[],
  add column if not exists promo_ongkir_jnt_discount_percent integer not null default 25,
  add column if not exists promo_bot_fch_active boolean not null default true,
  add column if not exists promo_bot_fch_start date,
  add column if not exists promo_bot_fch_end date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'store_settings_promo_ongkir_luar_percent_range') then
    alter table public.store_settings
      add constraint store_settings_promo_ongkir_luar_percent_range
      check (promo_ongkir_luar_percent between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'store_settings_promo_ongkir_jnt_discount_range') then
    alter table public.store_settings
      add constraint store_settings_promo_ongkir_jnt_discount_range
      check (promo_ongkir_jnt_discount_percent between 0 and 100);
  end if;
end $$;

alter table public.orders
  add column if not exists shipping_cost_original integer,
  add column if not exists shipping_discount integer not null default 0,
  add column if not exists shipping_promo_kind text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_shipping_promo_kind_valid') then
    alter table public.orders
      add constraint orders_shipping_promo_kind_valid
      check (shipping_promo_kind is null or shipping_promo_kind in ('jabo', 'luar'));
  end if;
end $$;

comment on column public.orders.shipping_cost is 'Ongkir yang DIBAYAR customer (setelah promo ongkir bila ada).';
comment on column public.orders.shipping_cost_original is 'Tarif J&T sebelum promo ongkir. NULL = tanpa promo / pesanan lama.';
comment on column public.orders.shipping_discount is 'Potongan ongkir (Rp) dari promo ongkir. 0 = tanpa promo.';
comment on column public.orders.shipping_promo_kind is 'Jenis promo ongkir: jabo (gratis Jabodetabek) atau luar (potongan luar Jabodetabek).';

notify pgrst, 'reload schema';

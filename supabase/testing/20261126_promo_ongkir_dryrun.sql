-- DRY-RUN migrasi promo ongkir (20261126_promo_ongkir.sql). Aman: seluruhnya di dalam transaksi yang di-ROLLBACK,
-- jadi tidak ada kolom yang tersisa. Jalankan di SQL Editor project SAMAQU website, lihat hasil tiap SELECT,
-- lalu (kalau sudah puas) jalankan file migrasinya sendiri.
--
-- Cara pakai: tempel ISI file migrasi di tempat bertanda "<<< tempel migrasi di sini >>>", lalu jalankan semuanya.

begin;

-- <<< tempel migrasi di sini >>> (isi supabase/migrations/20261126_promo_ongkir.sql, tanpa baris "notify")

-- 1) Kolom baru + nilai bawaan baris store_settings yang sudah ada (harus: dua promo ongkir false, persen 40,
--    14 kota, diskon J&T 25, bonus cover bot TRUE).
select promo_ongkir_jabo_active, promo_ongkir_luar_active, promo_ongkir_luar_percent,
       cardinality(promo_ongkir_jabo_cities) as jumlah_kota, promo_ongkir_jnt_discount_percent,
       promo_bot_fch_active, promo_fch_active as promo_fch_website_tidak_berubah
from public.store_settings where id = 1;

-- 2) Pesanan lama tidak berubah: kolom asli kosong, potongan 0, jenis kosong untuk SEMUA pesanan.
select count(*) as total_pesanan,
       count(*) filter (where shipping_cost_original is not null) as asli_terisi,
       count(*) filter (where shipping_discount <> 0) as potongan_bukan_nol,
       count(*) filter (where shipping_promo_kind is not null) as jenis_terisi
from public.orders;

-- 3) Batasan: persen 120 harus DITOLAK (error), jenis 'lain' harus DITOLAK.
do $$
begin
  begin
    update public.store_settings set promo_ongkir_luar_percent = 120 where id = 1;
    raise exception 'GAGAL: persen 120 seharusnya ditolak';
  exception when check_violation then
    raise notice 'OK: persen 120 ditolak';
  end;
  begin
    update public.orders set shipping_promo_kind = 'lain' where id = (select id from public.orders limit 1);
    raise notice 'OK (atau tabel kosong): jenis lain diuji';
  exception when check_violation then
    raise notice 'OK: jenis lain ditolak';
  end;
end $$;

rollback;

-- Setelah ROLLBACK, kolom baru tidak boleh ada (hasil harus 0 baris):
select column_name from information_schema.columns
where table_schema = 'public' and table_name in ('orders', 'store_settings')
  and column_name in ('shipping_cost_original', 'shipping_discount', 'shipping_promo_kind', 'promo_ongkir_jabo_active', 'promo_bot_fch_active');

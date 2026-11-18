-- Rollback 20261119_reseller_addresses.sql
-- PERINGATAN: menghapus tabel ikut menghapus SEMUA alamat tersimpan. Pesanan tidak terpengaruh
-- (tiap pesanan menyimpan salinan alamatnya sendiri).

drop function if exists public.samaqu_reseller_address_delete(uuid);
drop function if exists public.samaqu_reseller_address_set_default(uuid);
drop function if exists public.samaqu_reseller_address_save(uuid, uuid, text, text, text, text, text, text, text, text, text, boolean, text);

drop table if exists public.reseller_addresses;

notify pgrst, 'reload schema';

-- Rollback tingkatan reseller yang bisa diatur admin. Level kembali memakai batas standar di kode dan
-- otomatis dari belanja. (Batas buatan admin dan level manual yang sudah diisi akan hilang; harga & pesanan
-- tidak terpengaruh karena level hanya tampilan.)

alter table public.resellers drop constraint if exists resellers_level_override_valid;
alter table public.resellers drop column if exists level_override;
alter table public.store_settings drop column if exists reseller_levels;

notify pgrst, 'reload schema';

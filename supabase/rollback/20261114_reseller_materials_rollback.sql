-- Rollback materi reseller. Menghapus tabel beserta seluruh materi di dalamnya (video hanya tautan YouTube,
-- jadi file video di YouTube tidak ikut terhapus). Fitur lain tidak terpengaruh.

drop table if exists public.reseller_materials;

notify pgrst, 'reload schema';

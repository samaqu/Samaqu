-- Rollback untuk 20261107_stock_opname_save_rpc.sql
--
-- Menghapus fungsi `samaqu_save_stock_opname_lines`. Setelah rollback ini,
-- route simpan harus kembali memakai loop update per baris (versi lama).
--
-- Data tidak disentuh: baris opname dan stock_movements tetap apa adanya.

drop function if exists public.samaqu_save_stock_opname_lines(uuid, jsonb);

notify pgrst, 'reload schema';

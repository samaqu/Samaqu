-- Rollback untuk 20261107_effective_stock_map.sql
-- Hapus fungsi batch. `samaqu_variant_effective_stock` (dipakai API lain) TIDAK dihapus.

drop function if exists public.samaqu_effective_stock_map(text[]);

notify pgrst, 'reload schema';

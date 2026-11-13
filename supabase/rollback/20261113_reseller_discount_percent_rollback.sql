-- Rollback diskon khusus per reseller. Semua reseller kembali memakai diskon default.
-- (Nilai yang sudah diisi di kolom ini akan hilang; pesanan lama tidak terpengaruh.)

alter table public.resellers drop constraint if exists resellers_discount_percent_range;
alter table public.resellers drop column if exists discount_percent;

notify pgrst, 'reload schema';

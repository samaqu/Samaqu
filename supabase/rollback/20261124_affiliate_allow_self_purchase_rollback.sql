-- Balikan migrasi 20261124_affiliate_allow_self_purchase.sql
-- Aman dijalankan selama kode aplikasi versi lama (yang tidak membaca kolom ini) yang aktif.
alter table public.affiliates drop column if exists allow_self_purchase;

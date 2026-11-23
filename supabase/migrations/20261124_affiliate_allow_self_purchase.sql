-- =====================================================================
-- SAMAQU — Affiliate: pengecualian "pembelian sendiri" per affiliate (2026-11-24)
--
-- Aturan program: pesanan yang pembelinya sama dengan affiliate (nomor HP / email) TIDAK mendapat komisi.
-- Kolom ini mengecualikan affiliate tertentu, HANYA untuk pesanan yang dicatat admin lewat menu Transaksi
-- (isian "Kode affiliate"). Checkout website tidak membaca kolom ini.
--
-- Aditif dan idempoten: kolom baru dengan default false, tidak mengubah data yang ada.
-- Balikan: supabase/rollback/20261124_affiliate_allow_self_purchase_rollback.sql
-- =====================================================================

alter table public.affiliates
  add column if not exists allow_self_purchase boolean not null default false;

comment on column public.affiliates.allow_self_purchase is
  'true = pesanan atas data affiliate sendiri boleh dikreditkan komisi bila dicatat admin lewat menu Transaksi (bukan checkout website).';

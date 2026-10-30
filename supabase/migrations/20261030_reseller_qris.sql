-- =====================================================================
-- SAMAQU — Reseller: metode pembayaran (BSI/QRIS) + gambar QRIS (2026-10-30)
--
-- ADITIF & idempoten, tanpa menyentuh data lama:
--   1. reseller_topups.payment_method            ('bsi' | 'qris', default 'bsi')
--   2. reseller_order_payments.payment_method    ('bsi' | 'qris', default 'bsi')
--   3. store_settings.reseller_qris_image_url    gambar QRIS untuk portal reseller
--
-- QRIS customer (payment_methods.qr_image_url) TIDAK dipakai/diubah: di
-- database produksi belum ada baris QRIS aktif, jadi portal reseller memakai
-- pengaturan sendiri yang diunggah admin.
-- =====================================================================

alter table public.reseller_topups
  add column if not exists payment_method text not null default 'bsi'
  check (payment_method in ('bsi','qris'));

alter table public.reseller_order_payments
  add column if not exists payment_method text not null default 'bsi'
  check (payment_method in ('bsi','qris'));

alter table public.store_settings
  add column if not exists reseller_qris_image_url text;

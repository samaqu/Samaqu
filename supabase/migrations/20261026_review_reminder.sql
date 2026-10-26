-- 20261026_review_reminder.sql
--
-- Kolom penanda pengingat ulasan. Diisi sekali oleh cron `/api/cron/review-reminder`
-- setelah WA pengingat terkirim (klaim atomik `UPDATE … WHERE review_reminded_at IS NULL`),
-- supaya pengingat tidak pernah dikirim dobel walau cron jalan berulang.
--
-- Data lama: null (belum pernah diingatkan). Jalankan sekali di Supabase → SQL Editor.

alter table public.orders
  add column if not exists review_reminded_at timestamptz;

comment on column public.orders.review_reminded_at is
  'Waktu WA pengingat ulasan dikirim (sekali per pesanan). Kosong = belum diingatkan.';

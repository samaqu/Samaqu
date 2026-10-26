-- 20261026_order_cancel_reason.sql
--
-- Alasan pembatalan pesanan. Sebelum ini `cancelOrderCompletely()` hanya mengirim alasan
-- ke J&T & WhatsApp — tidak pernah menyimpannya, jadi riwayat pelanggan tidak bisa
-- menjelaskan kenapa pesanan batal.
--
-- Diisi otomatis oleh semua jalur pembatalan:
--   - customer  → "Dibatalkan oleh customer"
--   - admin     → "Dibatalkan oleh admin"
--   - ops       → "Dibatalkan dari menu Transaksi"
--   - cron      → "Dibatalkan otomatis (belum dibayar 24 jam)"
--
-- Data lama tetap null (alasannya tidak pernah tersimpan, tidak bisa direkonstruksi).
-- Jalankan sekali di Supabase → SQL Editor.

alter table public.orders
  add column if not exists cancel_reason text;

comment on column public.orders.cancel_reason is
  'Alasan pembatalan dari jalur batal (cancelOrderCompletely). Data lama: null.';

-- Bukti transfer private: simpan object key R2 private, bukan URL publik.
-- Additive; baris lama tetap memakai proof_url sampai dimigrasikan.

alter table public.reseller_topups
  add column if not exists proof_key text;

alter table public.reseller_order_payments
  add column if not exists proof_key text;

notify pgrst, 'reload schema';

alter table public.reseller_topups drop column if exists proof_key;
alter table public.reseller_order_payments drop column if exists proof_key;

notify pgrst, 'reload schema';

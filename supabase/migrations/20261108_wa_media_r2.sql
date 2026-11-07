alter table if exists public.wa_inbox
  add column if not exists media_key text;

alter table if exists public.order_drafts
  add column if not exists proof_key text;

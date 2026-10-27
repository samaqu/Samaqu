-- Data channel promosi affiliate (form pendaftaran).
-- Additive dan nullable: baris affiliate lama tidak berubah.
alter table public.affiliates
  add column if not exists primary_channel text,
  add column if not exists channel_handle text,
  add column if not exists content_description text;

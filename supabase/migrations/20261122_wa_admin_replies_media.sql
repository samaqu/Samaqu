-- Foto yang dikirim admin dari inbox Academy: simpan URL-nya di catatan balasan admin.
-- Additive: kolom nullable tanpa default, baris lama tidak berubah.

alter table public.wa_admin_replies
  add column if not exists media_url text;

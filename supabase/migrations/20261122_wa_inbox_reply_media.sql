-- Simpan lampiran (foto/video) yang dikirim bot atau admin sebagai balasan, supaya inbox Academy
-- menampilkan gambarnya seperti WhatsApp. Sebelumnya hanya teks balasan yang tersimpan.
-- Additive: kolom nullable tanpa default, baris lama tidak berubah, bot dan jalur kirim tidak terpengaruh.

alter table public.wa_inbox
  add column if not exists reply_media_url text;

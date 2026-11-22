-- Data mentah dari webhook Fonnte untuk tiap pesan masuk. Dipakai untuk menyelidiki field kutipan
-- (balasan berkutip dari customer) dan ID pesan sebelum fitur kutipan dibangun.
-- Additive: kolom nullable tanpa default, baris lama tidak berubah. RLS wa_inbox sudah aktif tanpa policy
-- (hanya service role). Bisa dihapus setelah selesai: alter table public.wa_inbox drop column raw_payload;

alter table public.wa_inbox
  add column if not exists raw_payload jsonb;

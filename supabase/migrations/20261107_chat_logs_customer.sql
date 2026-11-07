-- Identitas customer + gambar di log live chat.
-- Additive; baris lama tetap valid dengan kolom NULL.

alter table public.chat_logs
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists question_images text[];

create index if not exists chat_logs_session_created_idx
  on public.chat_logs (session_id, created_at);

notify pgrst, 'reload schema';

alter table public.chat_logs
  add column if not exists answer_images text[];

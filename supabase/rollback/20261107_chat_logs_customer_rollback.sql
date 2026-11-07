drop index if exists public.chat_logs_session_created_idx;

alter table public.chat_logs
  drop column if exists customer_name,
  drop column if exists customer_phone,
  drop column if exists question_images;

notify pgrst, 'reload schema';

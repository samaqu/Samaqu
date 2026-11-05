-- Kotak masuk WhatsApp dari webhook Fonnte.
-- Tabel BARU. Tidak menyentuh tabel/fungsi lain dan tidak mengubah data yang sudah ada.
-- RLS aktif tanpa policy => hanya service role yang bisa baca/tulis (sama seperti tabel `leads`).

create table if not exists public.wa_inbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null,
  device text,
  sender text not null,
  sender_name text,
  message text,
  media_url text,
  filename text,
  is_group boolean not null default false,
  inboxid text,
  fonnte_timestamp bigint,
  status text not null default 'pending',
  attempts integer not null default 0,
  claimed_at timestamptz,
  reply_text text,
  replied_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wa_inbox_dedupe_key_unique unique (dedupe_key),
  constraint wa_inbox_status_check check (status in ('pending', 'processing', 'sent', 'skipped', 'failed'))
);

create index if not exists wa_inbox_status_created_idx on public.wa_inbox (status, created_at);

alter table public.wa_inbox enable row level security;

notify pgrst, 'reload schema';

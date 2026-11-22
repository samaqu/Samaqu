-- Catatan balasan manual admin dari inbox WA (Academy /wa).
-- Dasar menghitung waktu balas pertama dan review sampel per admin.
-- Additive: tidak mengubah wa_inbox, wa_escalations, bot, atau tabel lain.
-- sender memakai format yang sama dengan wa_inbox.sender supaya gampang digabung per nomor.

create table if not exists public.wa_admin_replies (
  id uuid primary key default gen_random_uuid(),
  sender text not null,
  admin_email text not null,
  message text not null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists wa_admin_replies_sender_sent
  on public.wa_admin_replies (sender, sent_at desc);
create index if not exists wa_admin_replies_admin_sent
  on public.wa_admin_replies (admin_email, sent_at desc);

-- RLS aktif tanpa policy => hanya service role yang bisa baca/tulis (sama seperti wa_inbox).
alter table public.wa_admin_replies enable row level security;

grant select, insert on public.wa_admin_replies to service_role;

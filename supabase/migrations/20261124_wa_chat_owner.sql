-- Pemilik chat WhatsApp (tahap 5a): admin penanggung jawab tiap nomor pelanggan.
-- Hanya MENAMBAH dua tabel baru; tidak ada tabel lama yang diubah. Bot (wa-agent) dan webhook Fonnte TIDAK membaca tabel ini.
-- RLS aktif TANPA policy: hanya server (service role) yang bisa membaca/menulis.
-- Tanpa foreign key ke auth.users supaya riwayat tetap ada walau akun dihapus.

-- 1) Pemilik chat SAAT INI (satu baris per nomor).
create table if not exists public.wa_chat_owner (
  sender text primary key,
  owner_user_id uuid not null,
  assigned_at timestamptz not null default now(),
  -- auto = dibagi sistem, manual = ditugaskan orang, takeover = diambil alih Owner/Leader
  assigned_by text not null default 'auto' check (assigned_by in ('auto', 'manual', 'takeover'))
);

create index if not exists wa_chat_owner_owner_idx on public.wa_chat_owner (owner_user_id, assigned_at desc);
create index if not exists wa_chat_owner_assigned_idx on public.wa_chat_owner (assigned_at desc);

-- 2) Riwayat perpindahan pemilik (siapa, dari siapa, kenapa, kapan).
create table if not exists public.wa_chat_owner_log (
  id bigint generated always as identity primary key,
  sender text not null,
  from_user_id uuid,
  to_user_id uuid,
  reason text not null,
  by_user_id uuid,
  at timestamptz not null default now()
);

create index if not exists wa_chat_owner_log_sender_idx on public.wa_chat_owner_log (sender, at desc);

alter table public.wa_chat_owner enable row level security;
alter table public.wa_chat_owner_log enable row level security;

comment on table public.wa_chat_owner is 'Admin penanggung jawab per nomor WhatsApp pelanggan. Dibagi otomatis ke admin Aktif dan online dengan beban paling sedikit.';
comment on table public.wa_chat_owner_log is 'Riwayat perpindahan pemilik chat.';

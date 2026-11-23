-- Template chat untuk Inbox WA di panel admin (balasan manual admin). Bot (wa-agent) TIDAK membaca tabel ini.
-- Hanya MENAMBAH satu tabel baru; tidak ada tabel lama yang diubah. RLS aktif TANPA policy: hanya server (service role).
-- Dipakai: admin memilih template, isinya masuk ke kolom balasan (belum terkirim), lalu dikirim lewat alur balasan yang sama.
-- Placeholder yang diisi saat dipakai: {nama} = nama pelanggan, {admin} = nama admin yang membalas.

create table if not exists public.wa_templates (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 2 and 80),
  category text not null default 'Umum' check (char_length(category) between 1 and 40),
  content text not null check (char_length(content) between 1 and 4000),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wa_templates_category_sort_idx on public.wa_templates (category, sort_order, id);

alter table public.wa_templates enable row level security;

comment on table public.wa_templates is 'Template balasan chat untuk admin (Inbox WA panel). Dikelola Owner/Leader. Tidak dibaca bot.';

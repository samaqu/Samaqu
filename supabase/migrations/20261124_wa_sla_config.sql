-- Pengaturan SLA respons chat untuk halaman Performa Admin (panel admin) dan warna waktu tunggu di Inbox WA.
-- Hanya MENAMBAH satu tabel baru dengan SATU baris (id selalu 1); tidak ada tabel lama yang diubah.
-- RLS aktif TANPA policy: hanya server (service role) yang membaca/menulis. Perubahan hanya lewat API (Owner/Leader).
-- Bot (wa-agent) TIDAK membaca tabel ini.
--
-- Arti kolom:
--   target_response_min  target balasan pertama (menit); balasan lebih cepat dari ini = tercapai.
--   warning_min          lewat batas ini chat berstatus warning (kuning di Inbox).
--   late_min             lewat batas ini chat dianggap terlambat (merah di Inbox).
--   open_time/close_time jam operasional admin (WIB); waktu tunggu hanya dihitung di dalam jam ini.
--   op_days              hari operasional, 0 = Minggu ... 6 = Sabtu.
--   queue_alert_threshold jumlah chat menunggu sebelum alert antrean muncul.
--   count_outside_hours  true = chat di luar jam/hari operasional ikut dihitung (default mati: malam yang jawab bot).

create table if not exists public.wa_sla_config (
  id smallint primary key default 1 check (id = 1),
  name text not null default 'Standar SAMAQU' check (char_length(name) between 1 and 60),
  target_response_min integer not null default 5 check (target_response_min between 1 and 240),
  warning_min integer not null default 5 check (warning_min between 1 and 240),
  late_min integer not null default 10 check (late_min between 1 and 480),
  open_time time not null default '08:00',
  close_time time not null default '16:30',
  op_days smallint[] not null default '{1,2,3,4,5,6}',
  queue_alert_threshold integer not null default 3 check (queue_alert_threshold between 1 and 100),
  count_outside_hours boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint wa_sla_config_late_after_warning check (late_min >= warning_min),
  constraint wa_sla_config_open_before_close check (open_time < close_time),
  constraint wa_sla_config_days_valid check (cardinality(op_days) between 1 and 7 and op_days <@ array[0,1,2,3,4,5,6]::smallint[])
);

insert into public.wa_sla_config (id) values (1) on conflict (id) do nothing;

alter table public.wa_sla_config enable row level security;

comment on table public.wa_sla_config is 'Pengaturan SLA respons chat (satu baris, id = 1). Diubah Owner/Leader lewat API; dibaca halaman Performa Admin dan Inbox WA.';

-- Rate limit endpoint publik (eligibility, tracking J&T, validasi voucher).
--
-- IP disimpan sebagai hash HMAC (dihitung di server), bukan alamat mentah.
-- RLS aktif tanpa policy: hanya service role (route /api/*) yang boleh membaca/menulis.

create table if not exists public.api_rate_limits (
  id bigserial primary key,
  bucket text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_rate_limits_lookup
  on public.api_rate_limits (bucket, ip_hash, created_at desc);

alter table public.api_rate_limits enable row level security;

comment on table public.api_rate_limits is
  'Hit rate limit per IP (hashed). Tanpa policy RLS = hanya service role.';

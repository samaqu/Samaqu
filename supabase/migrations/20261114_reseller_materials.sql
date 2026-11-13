-- Materi reseller: panduan portal, kenali produk, cara jualan, teks siap pakai, foto & konten, aturan & FAQ.
--
-- Satu tabel baru. Video disimpan sebagai TAUTAN YouTube (unlisted) di `video_url`; foto sebagai daftar URL
-- (Cloudinary) di `images`. Tidak ada file video yang disimpan di database.
--
-- Isi hanya dibaca/ditulis lewat server (service role): RLS aktif TANPA policy, sama seperti tabel reseller lain.
-- Reseller hanya melihat baris berstatus 'terbit' (disaring di API portal).
--
-- Aditif dan idempoten; tidak menyentuh tabel yang sudah ada.

create table if not exists public.reseller_materials (
  id uuid primary key default gen_random_uuid(),
  category text not null
    check (category in ('panduan', 'produk', 'jualan', 'teks', 'konten', 'faq')),
  type text not null
    check (type in ('video', 'artikel', 'teks', 'galeri')),
  title text not null check (char_length(title) between 1 and 120),
  summary text check (summary is null or char_length(summary) <= 280),
  body text check (body is null or char_length(body) <= 8000),
  video_url text,
  images jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0 check (sort_order between 0 and 9999),
  status text not null default 'draft' check (status in ('draft', 'terbit')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reseller_materials_list_idx
  on public.reseller_materials (status, category, sort_order);

alter table public.reseller_materials enable row level security;

comment on table public.reseller_materials is
  'Materi untuk reseller (video YouTube unlisted, artikel, teks siap salin, foto). Hanya status terbit yang tampil di portal.';

notify pgrst, 'reload schema';

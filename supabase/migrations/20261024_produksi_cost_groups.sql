-- KELOMPOK BIAYA RESEP — daftar tetap + bisa ditambah Owner.
--
-- Baris resep lama tetap menyimpan `group_label` sebagai teks (snapshot).
-- Migration ini hanya menyediakan pilihan dropdown; data lama tidak diubah.
-- Label lama ikut dimasukkan supaya tetap bisa dipilih tanpa menghapus data.

create table if not exists production_cost_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_by text,
  created_at timestamptz not null default now()
);

alter table production_cost_groups enable row level security;

-- Daftar awal yang diminta pemilik.
insert into production_cost_groups (name) values
  ('Biaya Jahit'),
  ('Kain Keras'),
  ('Trikot & Vislin'),
  ('Potong/Finishing/QC (OPEX)'),
  ('Jasa Tarboosh'),
  ('Biaya Lain-lain')
on conflict (name) do nothing;

-- Data lama berupa teks bebas: tetap disimpan di baris resep, hanya dipetakan
-- menjadi pilihan dropdown.
insert into production_cost_groups (name)
select distinct btrim(group_label)
from production_recipe_lines
where line_type = 'biaya'
  and group_label is not null
  and btrim(group_label) <> ''
on conflict (name) do nothing;

comment on table production_cost_groups is
  'Pilihan kelompok biaya resep. Baris resep tetap menyimpan nama kelompok sebagai snapshot.';

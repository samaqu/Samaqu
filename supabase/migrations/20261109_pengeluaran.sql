-- Modul Pengeluaran (menu Keuangan > Pengeluaran di dashboard /ops).
-- Dua tabel BARU. Tidak menyentuh tabel/fungsi lain dan tidak mengubah data yang sudah ada.
-- RLS aktif tanpa policy => hanya service role yang bisa baca/tulis (sama seperti `wa_inbox`).
--
-- Jalankan manual di Supabase SQL Editor sebelum membuka menu Pengeluaran.

-- Master barang packing (dipakai sebagai pilihan di form pengeluaran packing).
create table if not exists public.expense_items (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  satuan text,
  aktif boolean not null default true,
  created_at timestamptz not null default now(),
  constraint expense_items_nama_unique unique (nama)
);

-- Satu baris = satu pengeluaran (packing atau operasional).
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null,
  tipe text not null,
  kategori text,
  deskripsi text,
  item_id uuid references public.expense_items (id),
  nama_barang text,
  qty integer,
  harga_satuan integer,
  jumlah integer not null,
  metode_bayar text,
  catatan text,
  request_id text not null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_tipe_check check (tipe in ('packing', 'operasional')),
  constraint expenses_jumlah_check check (jumlah > 0),
  constraint expenses_request_id_unique unique (request_id),
  -- Packing: barang wajib, qty > 0, harga satuan terisi. Total dihitung server.
  constraint expenses_packing_check check (
    tipe <> 'packing'
    or (
      item_id is not null
      and nama_barang is not null
      and qty is not null
      and qty > 0
      and harga_satuan is not null
      and harga_satuan >= 0
    )
  ),
  -- Operasional: kategori wajib.
  constraint expenses_operasional_check check (tipe <> 'operasional' or kategori is not null)
);

create index if not exists expenses_tanggal_idx on public.expenses (tanggal);
create index if not exists expenses_tipe_idx on public.expenses (tipe);

alter table public.expense_items enable row level security;
alter table public.expenses enable row level security;

notify pgrst, 'reload schema';

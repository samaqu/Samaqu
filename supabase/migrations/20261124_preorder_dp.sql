-- Pre-Order: DP (uang muka) 50%.
--
-- ADITIF SEMUA. Tidak mengubah baris yang ada, fungsi stok, maupun fungsi edit PO.
-- Pesanan lama dan PO lama (semua Lunas penuh) tetap persis seperti sebelumnya: kedua kolom NULL.
--
-- Konsep: PO ber-DP = baris `orders` PO biasa (status `diproses`, payment_status `paid`, DP sudah
-- masuk) + dua kolom. Status dan omset TIDAK berubah (omset = total pesanan saat dicatat).
--
--   preorder_dp_amount   nominal DP yang diterima (rupiah, bulat). NULL = PO Lunas penuh / bukan PO.
--                        Dihitung SERVER = 50% dari total saat dicatat, tidak dari angka browser.
--   preorder_settled_at  waktu admin mencatat pelunasan sisa. NULL = sisa belum dibayar.
--                        Selama NULL (dan ada DP), resi/kirim/GoSend diblokir.
--
-- Sisa tagihan = total - preorder_dp_amount selama preorder_settled_at NULL.
--
-- Rollback: supabase/rollback/20261124_preorder_dp_rollback.sql
-- Uji:      supabase/testing/20261124_preorder_dp_test.sql (selalu di-rollback)

begin;

alter table public.orders
  add column if not exists preorder_dp_amount integer,
  add column if not exists preorder_settled_at timestamptz;

-- DP harus bilangan bulat positif; kolom pelunasan hanya bermakna bila ada DP; DP hanya untuk PO.
-- Sengaja TIDAK ada batas atas "DP <= total": edit item PO (samaqu_edit_preorder_items) boleh
-- menurunkan total, dan batas itu akan membuat edit gagal. Sisa tagihan dijaga max(0, total - DP).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_preorder_dp_range' and conrelid = 'public.orders'::regclass) then
    alter table public.orders
      add constraint orders_preorder_dp_range
      check (preorder_dp_amount is null or preorder_dp_amount > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_preorder_dp_settled_needs_dp' and conrelid = 'public.orders'::regclass) then
    alter table public.orders
      add constraint orders_preorder_dp_settled_needs_dp
      check (preorder_settled_at is null or preorder_dp_amount is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_preorder_dp_only_preorder' and conrelid = 'public.orders'::regclass) then
    alter table public.orders
      add constraint orders_preorder_dp_only_preorder
      check (preorder_dp_amount is null or is_preorder = true);
  end if;
end $$;

-- PO ber-DP yang sisanya belum lunas (menu Pre-Order: antrean pelunasan). Parsial, jadi kecil.
create index if not exists idx_orders_preorder_dp_unsettled
  on public.orders (created_at)
  where is_preorder = true and preorder_dp_amount is not null and preorder_settled_at is null;

notify pgrst, 'reload schema';

commit;

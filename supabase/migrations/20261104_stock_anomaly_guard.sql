-- Stok: bedakan "produk memang tidak dilacak" dari "baris varian hilang".
--
-- Sebelumnya `samaqu_decrement_stock` mengembalikan TRUE begitu baris varian tidak
-- ditemukan (`v_stock IS NULL`). Akibatnya pemanggil membaca "boleh lanjut" padahal tidak ada
-- stok yang dipotong, dan tidak ada catatan apa pun. `samaqu_restore_stock` (RETURNS VOID)
-- juga diam saja saat barisnya tidak ada.
--
-- Sekarang:
--   - produk TIDAK ada di `products`  → tetap TRUE (id bayangan / add-on lama, memang tidak
--     memegang stok). Perilaku lama dipertahankan supaya data lama tidak berubah arti.
--   - produk ADA tapi variannya TIDAK ADA → FALSE + dicatat ke `stock_anomaly_log`.
--
-- Jalur Open Order tidak berubah: `/open-order` mengirim color/size varian yang nyata
-- (`cover-hanger` / "Set Hanger + Cover" / "ALL SIZE"), jadi barisnya selalu ketemu.

-- ── Tabel catatan anomali ───────────────────────────────────────────────────
create table if not exists public.stock_anomaly_log (
  id bigserial primary key,
  product_id text,
  color text,
  size text,
  qty integer,
  reason text not null,
  created_at timestamptz not null default now()
);

comment on table public.stock_anomaly_log is
  'Baris stok yang tidak ditemukan padahal produknya terdaftar. Tidak memblokir pesanan (keputusan pemanggil), tetapi tidak lagi hilang tanpa jejak.';

create index if not exists stock_anomaly_log_created_idx
  on public.stock_anomaly_log (created_at desc);

create index if not exists stock_anomaly_log_product_idx
  on public.stock_anomaly_log (product_id, created_at desc);

alter table public.stock_anomaly_log enable row level security;

revoke all on public.stock_anomaly_log from public, anon, authenticated;
grant select, insert on public.stock_anomaly_log to service_role;
grant usage, select on sequence public.stock_anomaly_log_id_seq to service_role;

-- ── decrement: baris hilang = FALSE (produk ada) / TRUE (produk tak dikenal) ──
create or replace function public.samaqu_decrement_stock(
  p_product_id text,
  p_color text,
  p_size text,
  p_qty integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock integer;
  v_base_product_id text;
  v_base_size text;
  v_product_exists boolean;
begin
  if p_qty is null or p_qty < 1 then
    return false;
  end if;

  -- Check if this variant has a base product (derived series)
  select base_product_id, base_size into v_base_product_id, v_base_size
  from product_variants
  where product_id = p_product_id and color = p_color and size = p_size
  limit 1;

  -- Resolve to base product if linked
  if v_base_product_id is not null and v_base_size is not null then
    p_product_id := v_base_product_id;
    p_size := v_base_size;
  end if;

  -- FOR UPDATE locks the row until transaction completes
  select stock into v_stock
  from product_variants
  where product_id = p_product_id and color = p_color and size = p_size
  for update;

  if v_stock is null then
    -- Produk tidak terdaftar sama sekali (id bayangan / add-on lama): memang tidak
    -- memegang stok → anggap tersedia, sama seperti perilaku sebelumnya.
    select exists(select 1 from products where id = p_product_id) into v_product_exists;
    if not v_product_exists then
      return true;
    end if;

    -- Produk ada tetapi baris variannya tidak ada: JANGAN bilang berhasil.
    -- Catat supaya bisa ditelusuri admin, lalu tolak supaya stok tidak "hilang" diam-diam.
    insert into stock_anomaly_log (product_id, color, size, qty, reason)
    values (p_product_id, p_color, p_size, p_qty, 'variant_not_found');
    return false;
  end if;

  if v_stock < p_qty then
    return false;
  end if;

  update product_variants
  set stock = v_stock - p_qty
  where product_id = p_product_id and color = p_color and size = p_size;

  return true;
end;
$$;

-- ── restore: catat kalau barisnya tidak ada (tetap VOID, pemanggil tak perlu berubah) ──
create or replace function public.samaqu_restore_stock(
  p_product_id text,
  p_color text,
  p_size text,
  p_qty integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_product_id text;
  v_base_size text;
  v_rows integer;
begin
  if p_qty is null or p_qty < 1 then
    return;
  end if;

  -- Check if this variant has a base product (derived series)
  select base_product_id, base_size into v_base_product_id, v_base_size
  from product_variants
  where product_id = p_product_id and color = p_color and size = p_size
  limit 1;

  -- Resolve to base product if linked
  if v_base_product_id is not null and v_base_size is not null then
    p_product_id := v_base_product_id;
    p_size := v_base_size;
  end if;

  update product_variants
  set stock = stock + p_qty
  where product_id = p_product_id and color = p_color and size = p_size;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    -- Pengembalian ke baris yang tidak ada: catat, jangan diam. Tidak raise karena
    -- pembatalan pesanan tetap harus selesai (stok lain sudah kembali).
    insert into stock_anomaly_log (product_id, color, size, qty, reason)
    values (p_product_id, p_color, p_size, p_qty, 'restore_variant_not_found');
  end if;
end;
$$;

-- Akses sama seperti sebelumnya: hanya service_role.
revoke execute on function public.samaqu_decrement_stock(text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.samaqu_restore_stock(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.samaqu_decrement_stock(text, text, text, integer) to service_role;
grant execute on function public.samaqu_restore_stock(text, text, text, integer) to service_role;

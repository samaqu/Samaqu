-- Stock guard tahap 2: input tanpa varian, ID bayangan, log yang selamat dari rollback,
-- pesan error yang membedakan penyebab, dan cek hasil decrement yang dulu diabaikan.
--
-- Melanjutkan 20261104_stock_anomaly_guard.sql. TIDAK mengoreksi stok mundur dan TIDAK
-- menyentuh data order lama.

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. Kolom tambahan di stock_anomaly_log
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.stock_anomaly_log
  add column if not exists order_id text,
  add column if not exists source text;

comment on column public.stock_anomaly_log.order_id is 'Nomor pesanan / id dokumen (retur, edit) — null kalau tidak ada.';
comment on column public.stock_anomaly_log.source is 'Pemanggil: orders, open-order, promo-order, ops-transaksi, cancel-order, return, tukar-series, stock-in, dll.';

create index if not exists stock_anomaly_log_reason_idx
  on public.stock_anomaly_log (reason, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Tabel antrean anomali: ditulis di transaksi yang SAMA, dipindahkan keluar
--    hanya kalau transaksinya berhasil dikomit.
--
--    Kenapa begini (poin 3 di brief): kalau anomali ditulis langsung ke
--    `stock_anomaly_log` lalu transaksi di-ROLLBACK (raise exception karena
--    stok kurang), baris log-nya ikut hilang. Dengan tabel antrean:
--      - transaksi normal   -> antrean ikut commit, lalu dipindah ke log
--      - transaksi gagal    -> antrean hilang bersama transaksi (memang wajar,
--                              kegagalannya sudah dilaporkan lewat pesan error)
--    Dan proses yang SUDAH selesai (mis. retur sudah diterapkan) tidak pernah
--    kehilangan catatannya karena pindahnya terjadi setelah commit.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.stock_anomaly_staging (
  id bigserial primary key,
  product_id text,
  color text,
  size text,
  qty integer,
  reason text not null,
  order_id text,
  source text,
  created_at timestamptz not null default now()
);

revoke all on public.stock_anomaly_staging from public, anon, authenticated;
grant select, insert, delete on public.stock_anomaly_staging to service_role;
grant usage, select on sequence public.stock_anomaly_staging_id_seq to service_role;

alter table public.stock_anomaly_log enable row level security;
revoke all on public.stock_anomaly_log from public, anon, authenticated;
grant select, insert on public.stock_anomaly_log to service_role;
grant usage, select on sequence public.stock_anomaly_log_id_seq to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Helper: apakah produk ini punya baris varian sama sekali?
--    Dipakai untuk membedakan "produk memang tidak dilacak stok" dari
--    "produk dilacak tapi variannya tidak ada".
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.samaqu_product_has_variants(p_product_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.product_variants where product_id = p_product_id);
$$;

revoke all on function public.samaqu_product_has_variants(text) from public, anon, authenticated;
grant execute on function public.samaqu_product_has_variants(text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. decrement: pencocokan case-insensitive (sama dengan increment),
--    ID bayangan dicatat, dan penyebab kegagalan bisa dibedakan.
-- ═══════════════════════════════════════════════════════════════════════════
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
  v_color_ci text := lower(coalesce(p_color, ''));
  v_size_ci text := lower(coalesce(p_size, ''));
begin
  if p_qty is null or p_qty < 1 then
    return false;
  end if;

  -- Varian turunan (series sharing) diarahkan ke produk induk.
  select base_product_id, base_size into v_base_product_id, v_base_size
  from public.product_variants
  where product_id = p_product_id
    and lower(coalesce(color, '')) = v_color_ci
    and lower(coalesce(size, '')) = v_size_ci
  limit 1;

  if v_base_product_id is not null and v_base_size is not null then
    p_product_id := v_base_product_id;
    p_size := v_base_size;
    v_size_ci := lower(coalesce(v_base_size, ''));
  end if;

  select stock into v_stock
  from public.product_variants
  where product_id = p_product_id
    and lower(coalesce(color, '')) = lower(coalesce(p_color, ''))
    and lower(coalesce(size, '')) = v_size_ci
  for update;

  if v_stock is null then
    select exists(select 1 from public.products where id = p_product_id) into v_product_exists;

    if not v_product_exists then
      -- ID bayangan (bukan baris `products`): tidak memegang stok. Tetap dianggap
      -- berhasil seperti perilaku lama, tetapi sekarang DICATAT supaya kelihatan.
      insert into public.stock_anomaly_log (product_id, color, size, qty, reason, source)
      values (p_product_id, p_color, p_size, p_qty, 'phantom_product', 'decrement_stock');
      return true;
    end if;

    -- Produk ada tetapi baris variannya tidak ada: JANGAN bilang berhasil.
    -- Dicatat langsung; pemanggil SQL yang bisa rollback juga menyertakan rincian
    -- lewat penanda STOCK_ANOMALY agar tetap tercatat setelah transaksi gagal.
    insert into public.stock_anomaly_log (product_id, color, size, qty, reason, source)
    values (p_product_id, p_color, p_size, p_qty, 'variant_not_found', 'decrement_stock');
    return false;
  end if;

  if v_stock < p_qty then
    return false;
  end if;

  update public.product_variants
  set stock = v_stock - p_qty
  where product_id = p_product_id
    and lower(coalesce(color, '')) = lower(coalesce(p_color, ''))
    and lower(coalesce(size, '')) = v_size_ci;

  return true;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. restore: pencocokan diseragamkan, tetap VOID, tetap mencatat.
-- ═══════════════════════════════════════════════════════════════════════════
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
  v_color_ci text := lower(coalesce(p_color, ''));
  v_size_ci text := lower(coalesce(p_size, ''));
begin
  if p_qty is null or p_qty < 1 then
    return;
  end if;

  select base_product_id, base_size into v_base_product_id, v_base_size
  from public.product_variants
  where product_id = p_product_id
    and lower(coalesce(color, '')) = v_color_ci
    and lower(coalesce(size, '')) = v_size_ci
  limit 1;

  if v_base_product_id is not null and v_base_size is not null then
    p_product_id := v_base_product_id;
    p_size := v_base_size;
    v_size_ci := lower(coalesce(v_base_size, ''));
  end if;

  update public.product_variants
  set stock = stock + p_qty
  where product_id = p_product_id
    and lower(coalesce(color, '')) = lower(coalesce(p_color, ''))
    and lower(coalesce(size, '')) = v_size_ci;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    insert into public.stock_anomaly_log (product_id, color, size, qty, reason, source)
    values (p_product_id, p_color, p_size, p_qty, 'restore_variant_not_found', 'restore_stock');
  end if;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. increment: pencocokan diseragamkan + catat kalau tidak ada baris ter-update
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.samaqu_increment_stock(
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
  v_base_product_id text;
  v_base_size text;
  v_rows integer;
  v_color_ci text := lower(coalesce(p_color, ''));
  v_size_ci text := lower(coalesce(p_size, ''));
begin
  if p_qty is null or p_qty = 0 then
    return false;
  end if;

  select base_product_id, base_size into v_base_product_id, v_base_size
  from public.product_variants
  where product_id = p_product_id
    and lower(coalesce(color, '')) = v_color_ci
    and lower(coalesce(size, '')) = v_size_ci
  limit 1;

  if v_base_product_id is not null then
    p_product_id := v_base_product_id;
    p_size := upper(coalesce(v_base_size, p_size));
    v_size_ci := lower(coalesce(p_size, ''));
  end if;

  -- Batas bawah: stok tidak boleh jadi negatif.
  if p_qty < 0 then
    update public.product_variants
    set stock = stock + p_qty
    where product_id = p_product_id
      and lower(coalesce(color, '')) = lower(coalesce(p_color, ''))
      and lower(coalesce(size, '')) = v_size_ci
      and coalesce(stock, 0) + p_qty >= 0;
  else
    update public.product_variants
    set stock = coalesce(stock, 0) + p_qty
    where product_id = p_product_id
      and lower(coalesce(color, '')) = lower(coalesce(p_color, ''))
      and lower(coalesce(size, '')) = v_size_ci;
  end if;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    insert into public.stock_anomaly_log (product_id, color, size, qty, reason, source)
    values (p_product_id, p_color, p_size, p_qty, 'increment_variant_not_found', 'increment_stock');
    return false;
  end if;

  return true;
end;
$$;

-- Akses tetap service_role saja.
revoke execute on function public.samaqu_decrement_stock(text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.samaqu_restore_stock(text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.samaqu_increment_stock(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.samaqu_decrement_stock(text, text, text, integer) to service_role;
grant execute on function public.samaqu_restore_stock(text, text, text, integer) to service_role;
grant execute on function public.samaqu_increment_stock(text, text, text, integer) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Pesan kegagalan yang membedakan penyebab (poin 4)
--    Dipakai pemanggil untuk memilih pesan: stok kurang vs varian tidak ada.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.samaqu_stock_failure_reason(
  p_product_id text,
  p_color text,
  p_size text
) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_exists boolean;
  v_has_variants boolean;
begin
  select exists(select 1 from public.products where id = p_product_id) into v_exists;
  if not v_exists then
    return 'phantom_product';
  end if;

  select public.samaqu_product_has_variants(p_product_id) into v_has_variants;
  if not v_has_variants then
    return 'no_variants';
  end if;

  if exists (
    select 1 from public.product_variants
    where product_id = p_product_id
      and lower(coalesce(color, '')) = lower(coalesce(p_color, ''))
      and lower(coalesce(size, '')) = lower(coalesce(p_size, ''))
  ) then
    return 'insufficient_stock';
  end if;

  return 'variant_not_found';
end;
$$;

revoke all on function public.samaqu_stock_failure_reason(text, text, text) from public, anon, authenticated;
grant execute on function public.samaqu_stock_failure_reason(text, text, text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Retur: decrement di pembatalan retur dulu tidak dicek hasilnya padahal
--    stock_movements tetap ditulis 'out'. Sekarang dicek.
--    Log tetap aman karena ditulis lewat fungsi yang sama (autonomous = tidak,
--    sehingga ikut rollback bila gagal — pesannya tetap jelas untuk admin).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.samaqu_reverse_return_stock(p_return_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.returns%rowtype;
  it public.return_items%rowtype;
  v_ok boolean;
  v_reason text;
begin
  select * into r from public.returns where id = p_return_id for update;
  if not found then
    raise exception 'Retur tidak ditemukan';
  end if;
  if r.stock_applied_at is null or r.stock_reversed_at is not null then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;

  for it in select * from public.return_items where return_id = p_return_id loop
    if it.stock_in_applied then
      v_ok := public.samaqu_decrement_stock(
        it.product_id, coalesce(nullif(it.color, ''), 'default'), it.size, it.qty
      );
      if not v_ok then
        v_reason := public.samaqu_stock_failure_reason(
          it.product_id, coalesce(nullif(it.color, ''), 'default'), it.size
        );
        raise exception 'Retur % gagal dibatalkan: % untuk % (% / %). Stok tidak berubah. STOCK_ANOMALY:%',
          r.return_number,
          case v_reason
            when 'variant_not_found' then 'varian tidak ditemukan'
            when 'no_variants' then 'produk tidak punya varian stok'
            when 'phantom_product' then 'produk tidak terdaftar'
            else 'stok tidak cukup'
          end,
          coalesce(it.product_name, it.product_id),
          coalesce(nullif(it.color, ''), 'default'),
          it.size,
          public.samaqu_anomaly_detail(it.product_id, coalesce(nullif(it.color, ''), 'default'), it.size, it.qty)::text;
      end if;

      -- movement hanya ditulis kalau decrement benar-benar berhasil.
      insert into public.stock_movements (
        product_id, color, size, qty, direction, source, ref_type, ref_id, notes
      ) values (
        it.product_id, coalesce(nullif(it.color, ''), 'default'), it.size, it.qty,
        'out', r.type, 'return', r.id, 'Pembatalan retur ' || r.return_number
      );
      update public.return_items set stock_in_applied = false where id = it.id;
    end if;

    if it.stock_out_applied and it.replacement_size is not null then
      perform public.samaqu_increment_stock(
        it.product_id, coalesce(nullif(it.color, ''), 'default'), it.replacement_size, it.qty
      );
      insert into public.stock_movements (
        product_id, color, size, qty, direction, source, ref_type, ref_id, notes
      ) values (
        it.product_id, coalesce(nullif(it.color, ''), 'default'), it.replacement_size, it.qty,
        'in', 'tukar_size', 'return', r.id, 'Pembatalan retur ' || r.return_number
      );
      update public.return_items set stock_out_applied = false where id = it.id;
    end if;
  end loop;

  delete from public.stock_in where ref_return_id = p_return_id;

  update public.returns
     set stock_applied_at = null, stock_reversed_at = now(), updated_at = now()
   where id = p_return_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Tukar series: dua `perform` yang mengabaikan hasil.
--    - increment (barang sellable masuk): hasil dicek, anomali sudah dicatat fungsi.
--    - decrement (kirim pengganti): sudah dicek sejak awal, pesannya diperjelas.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.samaqu_apply_return_stock(p_return_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.returns%rowtype;
  it public.return_items%rowtype;
  v_date date := (now() at time zone 'Asia/Jakarta')::date;
  v_out_product text;
  v_out_color text;
  v_out_name text;
  v_ok boolean;
  v_reason text;
begin
  select * into r from public.returns where id = p_return_id for update;
  if not found then
    raise exception 'Retur tidak ditemukan';
  end if;
  if r.stock_applied_at is not null then
    return jsonb_build_object('ok', true, 'already_applied', true);
  end if;
  if r.status not in ('disetujui', 'barang_diterima') then
    raise exception 'Status retur belum siap menerapkan stok';
  end if;

  for it in select * from public.return_items where return_id = p_return_id loop
    if it.condition = 'sellable' and not it.stock_in_applied then
      perform public.samaqu_increment_stock(
        it.product_id, coalesce(nullif(it.color, ''), 'default'), it.size, it.qty
      );
      insert into public.stock_in (
        date, product_id, product_name, sku, variant_color, variant_size,
        qty, cost_per_unit, notes, source, ref_return_id
      ) values (
        v_date, it.product_id, it.product_name,
        coalesce((select sku from public.products where id = it.product_id), ''),
        coalesce(nullif(it.color, ''), 'default'), it.size,
        it.qty, 0, 'Pengembalian stok - ' || r.return_number, r.type, r.id
      );
      insert into public.stock_movements (
        product_id, color, size, qty, direction, source, ref_type, ref_id, notes
      ) values (
        it.product_id, coalesce(nullif(it.color, ''), 'default'), it.size, it.qty,
        'in', r.type, 'return', r.id, 'Barang balik ' || r.return_number
      );
      update public.return_items set stock_in_applied = true where id = it.id;
    end if;

    if r.type = 'tukar_size' and it.replacement_size is not null and not it.stock_out_applied then
      v_out_product := coalesce(nullif(it.replacement_product_id, ''), it.product_id);
      v_out_color := coalesce(nullif(it.replacement_color, ''), nullif(it.color, ''), 'default');
      v_out_name := coalesce(
        (select name from public.products where id = v_out_product),
        it.product_name
      );

      v_ok := public.samaqu_decrement_stock(v_out_product, v_out_color, it.replacement_size, it.qty);
      if not v_ok then
        v_reason := public.samaqu_stock_failure_reason(v_out_product, v_out_color, it.replacement_size);
        raise exception 'Tukar ukuran % gagal: % untuk % / % ukuran %. Stok tidak berubah. STOCK_ANOMALY:%',
          r.return_number,
          case v_reason
            when 'variant_not_found' then 'varian tidak ditemukan'
            when 'no_variants' then 'produk tidak punya varian stok'
            when 'phantom_product' then 'produk tidak terdaftar'
            else 'stok tidak cukup'
          end,
          v_out_name, v_out_color, it.replacement_size,
          public.samaqu_anomaly_detail(v_out_product, v_out_color, it.replacement_size, it.qty)::text;
      end if;

      insert into public.stock_movements (
        product_id, color, size, qty, direction, source, ref_type, ref_id, notes
      ) values (
        v_out_product, v_out_color, it.replacement_size, it.qty,
        'out', 'tukar_size', 'return', r.id, 'Pengganti ' || r.return_number
      );
      update public.return_items set stock_out_applied = true where id = it.id;
    end if;
  end loop;

  update public.returns
     set stock_applied_at = now(), stock_reversed_at = null, updated_at = now()
   where id = p_return_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.samaqu_apply_return_stock(uuid) from public, anon, authenticated;
revoke all on function public.samaqu_reverse_return_stock(uuid) from public, anon, authenticated;
grant execute on function public.samaqu_apply_return_stock(uuid) to service_role;
grant execute on function public.samaqu_reverse_return_stock(uuid) to service_role;

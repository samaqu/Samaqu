-- Rollback untuk 20261104_stock_guard_tahap2.sql
--
-- Mengembalikan tiga fungsi stok + dua fungsi retur ke perilaku SEBELUM tahap 2,
-- dan menghapus kolom/objek tambahan.
--
-- CATATAN: `stock_anomaly_log` tetap ada (dibuat di 20261104_stock_anomaly_guard.sql).
-- Kolom order_id/source dihapus; baris log yang sudah ada ikut kehilangan kolom itu.

-- ── 1. Fungsi stok kembali ke versi sebelumnya ─────────────────────────────
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

  select base_product_id, base_size into v_base_product_id, v_base_size
  from public.product_variants
  where product_id = p_product_id and color = p_color and size = p_size
  limit 1;

  if v_base_product_id is not null and v_base_size is not null then
    p_product_id := v_base_product_id;
    p_size := v_base_size;
  end if;

  select stock into v_stock
  from public.product_variants
  where product_id = p_product_id and color = p_color and size = p_size
  for update;

  if v_stock is null then
    select exists(select 1 from public.products where id = p_product_id) into v_product_exists;
    if not v_product_exists then
      return true;
    end if;
    insert into public.stock_anomaly_log (product_id, color, size, qty, reason)
    values (p_product_id, p_color, p_size, p_qty, 'variant_not_found');
    return false;
  end if;

  if v_stock < p_qty then
    return false;
  end if;

  update public.product_variants
  set stock = v_stock - p_qty
  where product_id = p_product_id and color = p_color and size = p_size;

  return true;
end;
$$;

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

  select base_product_id, base_size into v_base_product_id, v_base_size
  from public.product_variants
  where product_id = p_product_id and color = p_color and size = p_size
  limit 1;

  if v_base_product_id is not null and v_base_size is not null then
    p_product_id := v_base_product_id;
    p_size := v_base_size;
  end if;

  update public.product_variants
  set stock = stock + p_qty
  where product_id = p_product_id and color = p_color and size = p_size;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    insert into public.stock_anomaly_log (product_id, color, size, qty, reason)
    values (p_product_id, p_color, p_size, p_qty, 'restore_variant_not_found');
  end if;
end;
$$;

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
begin
  select base_product_id, base_size
    into v_base_product_id, v_base_size
  from public.product_variants
  where product_id = p_product_id
    and lower(coalesce(color, '')) = lower(coalesce(p_color, ''))
    and lower(coalesce(size, ''))  = lower(coalesce(p_size, ''))
  limit 1;

  if v_base_product_id is not null then
    p_product_id := v_base_product_id;
    p_size := upper(coalesce(v_base_size, p_size));
  end if;

  update public.product_variants
     set stock = coalesce(stock, 0) + p_qty
   where product_id = p_product_id
     and lower(coalesce(color, '')) = lower(coalesce(p_color, ''))
     and lower(coalesce(size, ''))  = lower(coalesce(p_size, ''));

  return found;
end;
$$;

revoke execute on function public.samaqu_decrement_stock(text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.samaqu_restore_stock(text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.samaqu_increment_stock(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.samaqu_decrement_stock(text, text, text, integer) to service_role;
grant execute on function public.samaqu_restore_stock(text, text, text, integer) to service_role;
grant execute on function public.samaqu_increment_stock(text, text, text, integer) to service_role;

-- ── 2. Kembalikan fungsi retur ke perilaku lama ────────────────────────────
-- (definisi asli, lihat 20261103_tukar_series.sql)

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

      if not public.samaqu_decrement_stock(v_out_product, v_out_color, it.replacement_size, it.qty) then
        raise exception 'Stok ukuran % tidak cukup untuk %', it.replacement_size, v_out_name;
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

create or replace function public.samaqu_reverse_return_stock(p_return_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.returns%rowtype;
  it public.return_items%rowtype;
  v_out_product text;
  v_out_color text;
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
      perform public.samaqu_decrement_stock(
        it.product_id, coalesce(nullif(it.color, ''), 'default'), it.size, it.qty
      );
      insert into public.stock_movements (
        product_id, color, size, qty, direction, source, ref_type, ref_id, notes
      ) values (
        it.product_id, coalesce(nullif(it.color, ''), 'default'), it.size, it.qty,
        'out', r.type, 'return', r.id, 'Pembatalan retur ' || r.return_number
      );
      update public.return_items set stock_in_applied = false where id = it.id;
    end if;

    if it.stock_out_applied and it.replacement_size is not null then
      v_out_product := coalesce(nullif(it.replacement_product_id, ''), it.product_id);
      v_out_color := coalesce(nullif(it.replacement_color, ''), nullif(it.color, ''), 'default');

      perform public.samaqu_increment_stock(
        v_out_product, v_out_color, it.replacement_size, it.qty
      );
      insert into public.stock_movements (
        product_id, color, size, qty, direction, source, ref_type, ref_id, notes
      ) values (
        v_out_product, v_out_color, it.replacement_size, it.qty,
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

revoke all on function public.samaqu_apply_return_stock(uuid) from public, anon, authenticated;
revoke all on function public.samaqu_reverse_return_stock(uuid) from public, anon, authenticated;
grant execute on function public.samaqu_apply_return_stock(uuid) to service_role;
grant execute on function public.samaqu_reverse_return_stock(uuid) to service_role;

-- ── 3. Hapus helper + kolom tambahan ───────────────────────────────────────
drop function if exists public.samaqu_anomaly_detail(text, text, text, integer);
drop function if exists public.samaqu_stock_failure_reason(text, text, text);
drop function if exists public.samaqu_product_has_variants(text);

drop index if exists public.stock_anomaly_log_reason_idx;
alter table public.stock_anomaly_log
  drop column if exists order_id,
  drop column if exists source;

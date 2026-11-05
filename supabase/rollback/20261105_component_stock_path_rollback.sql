-- Rollback untuk 20261105_component_stock_path.sql
--
-- Mengembalikan decrement/restore dan stock_failure_reason ke versi tahap 1:
-- tidak ada cabang `track_stock = false`, perilaku kembali seperti semula.
--
-- CATATAN: jalankan hanya kalau belum ada varian ber-`track_stock = false` yang
-- sudah terjual. Kalau sudah, rollback ini membuat varian itu memotong stoknya
-- sendiri (yang 0) sehingga penjualannya gagal.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. decrement_stock versi tahap 1 (tanpa cabang track_stock)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.samaqu_decrement_stock(
  p_product_id text,
  p_color text,
  p_size text,
  p_qty integer,
  p_ref_type text default null,
  p_ref_id uuid default null
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
  v_comp record;
  v_comp_stock integer;
  v_need integer;
  v_take integer;
begin
  if p_qty is null or p_qty < 1 then
    return false;
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

  select stock into v_stock
  from public.product_variants
  where product_id = p_product_id
    and lower(coalesce(color, '')) = lower(coalesce(p_color, ''))
    and lower(coalesce(size, '')) = v_size_ci
  for update;

  if v_stock is null then
    select exists(select 1 from public.products where id = p_product_id) into v_product_exists;

    if not v_product_exists then
      insert into public.stock_anomaly_log (product_id, color, size, qty, reason, source)
      values (p_product_id, p_color, p_size, p_qty, 'phantom_product', 'decrement_stock');
      return true;
    end if;

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

  for v_comp in
    select * from public.samaqu_component_plan(p_product_id, p_qty, p_color, p_size)
  loop
    if p_ref_type is null or p_ref_id is null then
      insert into public.stock_anomaly_log (product_id, color, size, qty, reason, source, order_id)
      values (v_comp.component_product_id, v_comp.component_color, v_comp.component_size,
              v_comp.qty, 'component_missing_ref', 'decrement_stock', null);
      continue;
    end if;

    select stock into v_comp_stock
    from public.product_variants
    where product_id = v_comp.component_product_id
      and lower(coalesce(color, '')) = lower(coalesce(v_comp.component_color, ''))
      and lower(coalesce(size, '')) = lower(coalesce(v_comp.component_size, ''))
    for update;

    if v_comp_stock is null then
      insert into public.stock_anomaly_log (product_id, color, size, qty, reason, source)
      values (v_comp.component_product_id, v_comp.component_color, v_comp.component_size,
              v_comp.qty, 'component_variant_not_found', 'decrement_stock');
      continue;
    end if;

    v_need := v_comp.qty;
    v_take := least(v_need, v_comp_stock);

    if v_take > 0 then
      update public.product_variants
      set stock = v_comp_stock - v_take
      where product_id = v_comp.component_product_id
        and lower(coalesce(color, '')) = lower(coalesce(v_comp.component_color, ''))
        and lower(coalesce(size, '')) = lower(coalesce(v_comp.component_size, ''));

      insert into public.stock_movements (
        product_id, color, size, qty, direction, source, ref_type, ref_id,
        before_stock, after_stock, notes
      ) values (
        v_comp.component_product_id, v_comp.component_color, v_comp.component_size,
        v_take, 'out', 'order', 'component', p_ref_id,
        v_comp_stock, v_comp_stock - v_take,
        'Komponen (dari penjualan) — ' || v_need || ' dibutuhkan, ' || v_take || ' terpotong'
      );
    end if;

    if v_take < v_need then
      insert into public.stock_anomaly_log (product_id, color, size, qty, reason, source, order_id)
      values (v_comp.component_product_id, v_comp.component_color, v_comp.component_size,
              v_need - v_take, 'component_out_of_stock', 'decrement_stock', p_ref_id::text);
    end if;
  end loop;

  return true;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. restore_stock versi tahap 1
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.samaqu_restore_stock(
  p_product_id text,
  p_color text,
  p_size text,
  p_qty integer,
  p_ref_type text default null,
  p_ref_id uuid default null
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
  v_comp record;
  v_out integer;
  v_in integer;
  v_back integer;
  v_comp_stock integer;
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

  for v_comp in
    select * from public.samaqu_component_plan(p_product_id, p_qty, p_color, p_size)
  loop
    if p_ref_type is null or p_ref_id is null then
      insert into public.stock_anomaly_log (product_id, color, size, qty, reason, source, order_id)
      values (v_comp.component_product_id, v_comp.component_color, v_comp.component_size,
              v_comp.qty, 'component_missing_ref', 'restore_stock', null);
      continue;
    end if;

    select
      coalesce(sum(case when direction = 'out' then qty else 0 end), 0),
      coalesce(sum(case when direction = 'in'  then qty else 0 end), 0)
    into v_out, v_in
    from public.stock_movements
    where product_id = v_comp.component_product_id
      and lower(coalesce(color, '')) = lower(coalesce(v_comp.component_color, ''))
      and lower(coalesce(size, '')) = lower(coalesce(v_comp.component_size, ''))
      and ref_type = p_ref_type
      and ref_id = p_ref_id;

    v_back := least(v_comp.qty, greatest(0, v_out - v_in));
    if v_back <= 0 then
      continue;
    end if;

    select stock into v_comp_stock
    from public.product_variants
    where product_id = v_comp.component_product_id
      and lower(coalesce(color, '')) = lower(coalesce(v_comp.component_color, ''))
      and lower(coalesce(size, '')) = lower(coalesce(v_comp.component_size, ''))
    for update;

    if v_comp_stock is null then
      insert into public.stock_anomaly_log (product_id, color, size, qty, reason, source)
      values (v_comp.component_product_id, v_comp.component_color, v_comp.component_size,
              v_back, 'component_variant_not_found', 'restore_stock');
      continue;
    end if;

    update public.product_variants
    set stock = v_comp_stock + v_back
    where product_id = v_comp.component_product_id
      and lower(coalesce(color, '')) = lower(coalesce(v_comp.component_color, ''))
      and lower(coalesce(size, '')) = lower(coalesce(v_comp.component_size, ''));

    insert into public.stock_movements (
      product_id, color, size, qty, direction, source, ref_type, ref_id,
      before_stock, after_stock, notes
    ) values (
      v_comp.component_product_id, v_comp.component_color, v_comp.component_size,
      v_back, 'in', 'order', 'component', p_ref_id,
      v_comp_stock, v_comp_stock + v_back,
      'Komponen dikembalikan (pembatalan/retur) — ' || v_back || ' dari ' || v_out || ' terpotong'
    );
  end loop;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. stock_failure_reason versi tahap 1
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

revoke execute on function public.samaqu_decrement_stock(text, text, text, integer, text, uuid) from public, anon, authenticated;
revoke execute on function public.samaqu_restore_stock(text, text, text, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.samaqu_decrement_stock(text, text, text, integer, text, uuid) to service_role;
grant execute on function public.samaqu_restore_stock(text, text, text, integer, text, uuid) to service_role;

notify pgrst, 'reload schema';

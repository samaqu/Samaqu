-- TAHAP 2 — jalur stok untuk varian TANPA stok sendiri (`track_stock = false`).
--
-- `track_stock = false` adalah sifat PERMANEN sebuah varian: stoknya bukan milik sendiri,
-- melainkan stok terkecil dari komponennya (product_components). Tahap ini membuat fungsi
-- stok menanganinya dengan benar. BELUM ada varian yang memakai nilai ini; varianny dibuat
-- di tahap berikutnya, jadi perilaku seluruh produk hari ini tidak berubah.
--
-- Aturan:
--   - track_stock TRUE  → perilaku lama (potong stok varian itu sendiri).
--   - track_stock FALSE → stok varian itu TIDAK dipotong; SEMUA komponennya dipotong
--     atomik (semua berhasil atau seluruhnya batal).
--   - Stok sharing (base_product_id) tetap diproses lebih dulu dan tidak sampai ke cabang ini.
--   - Baris komponen selalu dikunci dengan urutan tetap (product_id, color, size) supaya
--     dua transaksi yang memakai komponen sama (mis. hanger) tidak deadlock.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Rencana komponen: sertakan urutan kunci yang eksplisit
--    (sudah disiapkan tahap 1; dibuat ulang di sini supaya berkas ini berdiri sendiri)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.samaqu_component_plan(
  p_product_id text,
  p_qty integer,
  p_color text default null,
  p_size text default null
)
returns table (component_product_id text, component_color text, component_size text, qty integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.component_product_id,
         coalesce(c.component_color, ''),
         coalesce(c.component_size, ''),
         c.qty * greatest(1, coalesce(p_qty, 1))
  from public.product_components c
  where c.product_id = p_product_id
    and c.is_active
    and (c.product_color is null or lower(c.product_color) = lower(coalesce(p_color, '')))
    and (c.product_size is null or lower(c.product_size) = lower(coalesce(p_size, '')))
  -- Urutan tetap: dipakai sebagai urutan penguncian baris komponen.
  order by c.component_product_id, coalesce(c.component_color, ''), coalesce(c.component_size, '');
$$;

revoke all on function public.samaqu_component_plan(text, integer, text, text) from public, anon, authenticated;
grant execute on function public.samaqu_component_plan(text, integer, text, text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. decrement_stock — cabang track_stock = false
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
  v_track boolean;
  v_base_product_id text;
  v_base_size text;
  v_product_exists boolean;
  v_color_ci text := lower(coalesce(p_color, ''));
  v_size_ci text := lower(coalesce(p_size, ''));
  v_comp record;
  v_comp_stock integer;
  v_need integer;
  v_take integer;
  v_plan_count integer := 0;
  v_short jsonb := '[]'::jsonb;
  v_missing jsonb := '[]'::jsonb;
begin
  if p_qty is null or p_qty < 1 then
    return false;
  end if;

  -- Varian turunan (series sharing) diarahkan ke produk induk.
  select base_product_id, base_size, track_stock
    into v_base_product_id, v_base_size, v_track
  from public.product_variants
  where product_id = p_product_id
    and lower(coalesce(color, '')) = v_color_ci
    and lower(coalesce(size, '')) = v_size_ci
  limit 1;

  if v_base_product_id is not null and v_base_size is not null then
    p_product_id := v_base_product_id;
    p_size := v_base_size;
    v_size_ci := lower(coalesce(v_base_size, ''));
    v_track := null;  -- stok milik induk, bukan varian turunan
  end if;

  -- ── Cabang varian TANPA stok sendiri ──────────────────────────────────────
  -- Tidak ada stok varian yang dipotong; yang dipotong komponennya, dan hanya
  -- kalau SEMUA komponen cukup. Kalau satu kurang → seluruh panggilan gagal.
  if coalesce(v_track, true) = false then
    -- Kunci semua baris komponen lebih dulu, dalam urutan tetap.
    for v_comp in
      select * from public.samaqu_component_plan(p_product_id, p_qty, p_color, p_size)
    loop
      v_plan_count := v_plan_count + 1;
      v_need := v_comp.qty;

      select stock into v_comp_stock
      from public.product_variants
      where product_id = v_comp.component_product_id
        and lower(coalesce(color, '')) = lower(coalesce(v_comp.component_color, ''))
        and lower(coalesce(size, '')) = lower(coalesce(v_comp.component_size, ''))
      for update;

      if v_comp_stock is null then
        v_missing := v_missing || jsonb_build_object(
          'product_id', v_comp.component_product_id,
          'color', v_comp.component_color,
          'size', v_comp.component_size,
          'qty', v_need
        );
      elsif v_comp_stock < v_need then
        v_short := v_short || jsonb_build_object(
          'product_id', v_comp.component_product_id,
          'color', v_comp.component_color,
          'size', v_comp.component_size,
          'need', v_need,
          'stock', v_comp_stock
        );
      end if;
    end loop;

    -- Tidak ada rencana komponen sama sekali: konfigurasi belum benar → jangan dianggap berhasil.
    if v_plan_count = 0 then
      insert into public.stock_anomaly_log (product_id, color, size, qty, reason, source)
      values (p_product_id, p_color, p_size, p_qty, 'component_none_configured', 'decrement_stock');
      return false;
    end if;

    if jsonb_array_length(v_missing) > 0 then
      insert into public.stock_anomaly_log (product_id, color, size, qty, reason, source)
      values (p_product_id, p_color, p_size, p_qty, 'component_variant_not_found', 'decrement_stock');
      return false;
    end if;

    if jsonb_array_length(v_short) > 0 then
      insert into public.stock_anomaly_log (product_id, color, size, qty, reason, source)
      values (p_product_id, p_color, p_size, p_qty, 'component_out_of_stock', 'decrement_stock');
      return false;
    end if;

    -- Semua cukup → potong semuanya (tidak ada yang bisa gagal lagi di titik ini).
    for v_comp in
      select * from public.samaqu_component_plan(p_product_id, p_qty, p_color, p_size)
    loop
      v_need := v_comp.qty;

      select stock into v_comp_stock
      from public.product_variants
      where product_id = v_comp.component_product_id
        and lower(coalesce(color, '')) = lower(coalesce(v_comp.component_color, ''))
        and lower(coalesce(size, '')) = lower(coalesce(v_comp.component_size, ''))
      for update;

      update public.product_variants
      set stock = v_comp_stock - v_need
      where product_id = v_comp.component_product_id
        and lower(coalesce(color, '')) = lower(coalesce(v_comp.component_color, ''))
        and lower(coalesce(size, '')) = lower(coalesce(v_comp.component_size, ''));

      if p_ref_type is not null and p_ref_id is not null then
        insert into public.stock_movements (
          product_id, color, size, qty, direction, source, ref_type, ref_id,
          before_stock, after_stock, notes
        ) values (
          v_comp.component_product_id, v_comp.component_color, v_comp.component_size,
          v_need, 'out', 'order', 'component', p_ref_id,
          v_comp_stock, v_comp_stock - v_need,
          'Komponen (dari penjualan) — bagian dari varian ' || p_product_id || ' ' || coalesce(p_color, '')
        );
      end if;
    end loop;

    return true;
  end if;

  -- ── Jalur lama: varian punya stok sendiri ─────────────────────────────────
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

  -- Komponen (mis. box kabak untuk produk kabak) — perilaku tidak berubah.
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
-- 3. restore_stock — cabang track_stock = false
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
  v_track boolean;
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

  select base_product_id, base_size, track_stock
    into v_base_product_id, v_base_size, v_track
  from public.product_variants
  where product_id = p_product_id
    and lower(coalesce(color, '')) = v_color_ci
    and lower(coalesce(size, '')) = v_size_ci
  limit 1;

  if v_base_product_id is not null and v_base_size is not null then
    p_product_id := v_base_product_id;
    p_size := v_base_size;
    v_size_ci := lower(coalesce(v_base_size, ''));
    v_track := null;
  end if;

  -- ── Varian tanpa stok sendiri: hanya komponen yang dikembalikan ───────────
  if coalesce(v_track, true) = false then
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
    return;
  end if;

  -- ── Jalur lama ────────────────────────────────────────────────────────────
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
-- 4. Kegagalan stok: varian tanpa stok sendiri tidak pernah "stok kurang"
--    sendiri — penyebabnya selalu komponen.
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
  v_track boolean;
  v_variant_found boolean := false;
  v_comp record;
  v_comp_stock integer;
begin
  select exists(select 1 from public.products where id = p_product_id) into v_exists;
  if not v_exists then
    return 'phantom_product';
  end if;

  select public.samaqu_product_has_variants(p_product_id) into v_has_variants;
  if not v_has_variants then
    return 'no_variants';
  end if;

  select track_stock into v_track
  from public.product_variants
  where product_id = p_product_id
    and lower(coalesce(color, '')) = lower(coalesce(p_color, ''))
    and lower(coalesce(size, '')) = lower(coalesce(p_size, ''))
  limit 1;

  v_variant_found := found;
  if not v_variant_found then
    return 'variant_not_found';
  end if;

  -- Varian tanpa stok sendiri: periksa komponennya.
  if coalesce(v_track, true) = false then
    for v_comp in
      select * from public.samaqu_component_plan(p_product_id, 1, p_color, p_size)
    loop
      select stock into v_comp_stock
      from public.product_variants
      where product_id = v_comp.component_product_id
        and lower(coalesce(color, '')) = lower(coalesce(v_comp.component_color, ''))
        and lower(coalesce(size, '')) = lower(coalesce(v_comp.component_size, ''))
      limit 1;

      if v_comp_stock is null then
        return 'component_variant_not_found';
      end if;
      if v_comp_stock < v_comp.qty then
        return 'component_out_of_stock';
      end if;
    end loop;
    return 'component_out_of_stock';
  end if;

  return 'insufficient_stock';
end;
$$;

revoke all on function public.samaqu_stock_failure_reason(text, text, text) from public, anon, authenticated;
grant execute on function public.samaqu_stock_failure_reason(text, text, text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Akses + reload skema
-- ═══════════════════════════════════════════════════════════════════════════
revoke execute on function public.samaqu_decrement_stock(text, text, text, integer, text, uuid) from public, anon, authenticated;
revoke execute on function public.samaqu_restore_stock(text, text, text, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.samaqu_decrement_stock(text, text, text, integer, text, uuid) to service_role;
grant execute on function public.samaqu_restore_stock(text, text, text, integer, text, uuid) to service_role;

notify pgrst, 'reload schema';

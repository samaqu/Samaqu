-- Rollback untuk 20261105_kabak_box_component.sql
--
-- Mengembalikan signature lama PERSIS: (text, text, text, integer) tanpa parameter ref,
-- menghapus mekanisme komponen, dan menghapus tabel product_components.
--
-- Aman dijalankan meski sudah ada movement 'component' di stock_movements — baris itu
-- dibiarkan sebagai riwayat (tidak dihapus), hanya tidak lagi dibuat.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. decreeent/restore: drop versi baru, buat versi lama
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.samaqu_decrement_stock(text, text, text, integer, text, uuid);
drop function if exists public.samaqu_restore_stock(text, text, text, integer, text, uuid);

create function public.samaqu_decrement_stock(
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

  return true;
end;
$$;

create function public.samaqu_restore_stock(
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

revoke execute on function public.samaqu_decrement_stock(text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.samaqu_restore_stock(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.samaqu_decrement_stock(text, text, text, integer) to service_role;
grant execute on function public.samaqu_restore_stock(text, text, text, integer) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Lepas ref dari fungsi retur
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_src text;
begin
  -- apply_return_stock: buang blok restore komponen
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_apply_return_stock';

  if v_src is not null then
    v_src := regexp_replace(
      v_src,
      '-- Barang kembali:.*?v_ref\s*\n\s*\);',
      '',
      'gs'
    );
    v_src := regexp_replace(v_src, '\n\s*v_ref uuid := public\.samaqu_return_order_ref\(p_return_id\);', '', 'g');
    execute v_src;
  end if;

  -- reverse_return_stock: decrement tanpa ref
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_reverse_return_stock';

  if v_src is not null then
    v_src := regexp_replace(
      v_src,
      'v_ok := public\.samaqu_decrement_stock\(\s*it\.product_id, coalesce\(nullif\(it\.color, ''''\), ''default''\), it\.size, it\.qty,\s*case when v_ref is not null then ''component'' else null end, v_ref\s*\)',
      'v_ok := public.samaqu_decrement_stock(' ||
        chr(10) || '        it.product_id, coalesce(nullif(it.color, ''''), ''default''), it.size, it.qty' ||
        chr(10) || '      )',
      'g'
    );
    v_src := regexp_replace(v_src, '\n\s*v_ref uuid := public\.samaqu_return_order_ref\(p_return_id\);', '', 'g');
    execute v_src;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Hapus helper & tabel komponen
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.samaqu_return_order_ref(uuid);
drop function if exists public.samaqu_component_plan(text, integer);
drop function if exists public.samaqu_product_has_components(text);
drop table if exists public.product_components;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Muat ulang cache skema PostgREST
-- ═══════════════════════════════════════════════════════════════════════════
notify pgrst, 'reload schema';

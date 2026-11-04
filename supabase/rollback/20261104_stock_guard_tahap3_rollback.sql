-- Rollback untuk 20261104_stock_guard_tahap3.sql
--
-- Mengembalikan increment_stock ke versi tahap 2, menghapus unique index, dan
-- mengembalikan pesan reseller_create_order ke bentuk tanpa penanda.
--
-- CATATAN: menghapus unique index berarti data dobel yang hanya beda kapital bisa
-- masuk lagi. Jalankan hanya kalau memang ingin kembali ke perilaku lama.

-- ── 1. increment_stock versi tahap 2 ───────────────────────────────────────
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

revoke execute on function public.samaqu_increment_stock(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.samaqu_increment_stock(text, text, text, integer) to service_role;

-- ── 2. Hapus unique index ──────────────────────────────────────────────────
drop index if exists public.product_variants_identity_uidx;

-- ── 3. Kembalikan pesan reseller_create_order tanpa penanda ────────────────
do $$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_reseller_create_order';

  if v_src is null then
    raise notice 'samaqu_reseller_create_order tidak ditemukan - dilewati';
    return;
  end if;

  -- Buang penanda beserta argumen JSON-nya.
  v_src := regexp_replace(
    v_src,
    '\s*STOCK_ANOMALY:%\s*,\s*public\.samaqu_anomaly_detail\([^;]*?\)::text',
    '',
    'g'
  );

  execute v_src;
  raise notice 'samaqu_reseller_create_order: penanda dibuang';
end $$;

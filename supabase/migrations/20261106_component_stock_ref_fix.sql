-- Tutup celah ref stok komponen di tiga fungsi SQL.
--
-- MASALAH
-- `samaqu_restore_stock` untuk varian berkomponen hanya mengembalikan sebesar yang pernah
-- DIPOTONG dengan `ref_type` + `ref_id` yang SAMA. Tiga fungsi di bawah memanggil
-- decrement/restore TANPA ref, sehingga:
--   - potongan komponen tidak tercatat dengan ref order,
--   - saat order dibatalkan, komponen TIDAK kembali,
--   - restore tanpa ref hanya mencatat `component_missing_ref`.
--
-- YANG DIUBAH (hanya argumen ref; logika stok TIDAK berubah)
--   samaqu_edit_order_items          decrement + restore -> ref 'component' + uuid order
--   samaqu_reseller_create_order     decrement           -> ref 'component' + uuid order
--   samaqu_edit_reseller_order_items decrement + restore -> ref 'component' + uuid order
--
-- CATATAN `samaqu_reseller_create_order`
-- order-nya BELUM ADA saat stok dipotong (id dibuat oleh default kolom). Supaya ref bisa
-- dipakai, id dibuat lebih dulu lalu di-insert eksplisit — pola yang sama dengan
-- /api/orders dan /api/ops/transaksi.

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. Helper: id order (text) → uuid yang aman
--
--    `stock_movements.ref_id` bertipe uuid sedangkan `orders.id` bertipe text.
--    Id yang bukan uuid (data lama) dikembalikan NULL, bukan menggagalkan transaksi.
--    Dibuat PERTAMA karena dipakai default variabel `v_ref` di fungsi lain.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.samaqu_ref_uuid(p_id text)
returns uuid
language plpgsql
immutable
as $$
begin
  if p_id is null then
    return null;
  end if;
  begin
    return p_id::uuid;
  exception when others then
    return null;
  end;
end;
$$;

comment on function public.samaqu_ref_uuid(text) is
  'Cast id order (text) ke uuid untuk ref_type/ref_id stok. Non-uuid -> NULL.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. samaqu_edit_order_items — potong & kembali membawa ref order
-- ═══════════════════════════════════════════════════════════════════════════
do $mig$
declare
  v_def text;
  v_before int := 0;
  v_after int := 0;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_edit_order_items';

  if v_def is null then
    raise exception 'samaqu_edit_order_items tidak ditemukan';
  end if;

  -- Deklarasi variabel ref setelah variabel v_stock.
  if position('v_ref uuid' in v_def) = 0 then
    v_def := replace(v_def,
      '  v_stock record;',
      '  v_stock record;' || chr(10) || '  v_ref uuid := public.samaqu_ref_uuid(p_order_id);');
  end if;

  -- decrement: tambahkan ref.
  if position('v_stock.delta::int, ''component''' in v_def) = 0 then
    v_def := replace(v_def,
      'public.samaqu_decrement_stock(v_stock.product_id, v_stock.color, v_stock.size, v_stock.delta::int)',
      'public.samaqu_decrement_stock(v_stock.product_id, v_stock.color, v_stock.size, v_stock.delta::int, ''component'', v_ref)');
    v_after := v_after + 1;
  end if;

  -- restore: tambahkan ref.
  if position('''component'', v_ref)' in v_def) = 0 or position('(-v_stock.delta)::int, ''component''' in v_def) = 0 then
    v_def := replace(v_def,
      'public.samaqu_restore_stock(v_stock.product_id, v_stock.color, v_stock.size, (-v_stock.delta)::int)',
      'public.samaqu_restore_stock(v_stock.product_id, v_stock.color, v_stock.size, (-v_stock.delta)::int, ''component'', v_ref)');
    v_after := v_after + 1;
  end if;

  if v_after = 0 then
    raise notice 'samaqu_edit_order_items: sudah memakai ref, dilewati';
  else
    execute v_def;
    raise notice 'samaqu_edit_order_items: % panggilan diberi ref', v_after;
  end if;
end $mig$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. samaqu_edit_reseller_order_items — potong & kembali membawa ref order
-- ═══════════════════════════════════════════════════════════════════════════
do $mig$
declare
  v_def text;
  v_after int := 0;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_edit_reseller_order_items';

  if v_def is null then
    raise exception 'samaqu_edit_reseller_order_items tidak ditemukan';
  end if;

  if position('v_ref uuid' in v_def) = 0 then
    v_def := replace(v_def,
      '  v_size text;',
      '  v_size text;' || chr(10) || '  v_ref uuid := public.samaqu_ref_uuid(p_order_id);');
  end if;

  if position('v_delta.delta::int, ''component''' in v_def) = 0 then
    v_def := replace(v_def,
      '        v_delta.product_id, v_delta.color, v_delta.size, v_delta.delta::int',
      '        v_delta.product_id, v_delta.color, v_delta.size, v_delta.delta::int, ''component'', v_ref');
    v_after := v_after + 1;
  end if;

  if position('(-v_delta.delta)::int, ''component''' in v_def) = 0 then
    v_def := replace(v_def,
      '        v_delta.product_id, v_delta.color, v_delta.size, (-v_delta.delta)::int',
      '        v_delta.product_id, v_delta.color, v_delta.size, (-v_delta.delta)::int, ''component'', v_ref');
    v_after := v_after + 1;
  end if;

  if v_after = 0 then
    raise notice 'samaqu_edit_reseller_order_items: sudah memakai ref, dilewati';
  else
    execute v_def;
    raise notice 'samaqu_edit_reseller_order_items: % panggilan diberi ref', v_after;
  end if;
end $mig$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. samaqu_reseller_create_order — id pesanan dibuat SEBELUM potong stok
-- ═══════════════════════════════════════════════════════════════════════════
do $mig$
declare
  v_def text;
  v_after int := 0;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_reseller_create_order';

  if v_def is null then
    raise exception 'samaqu_reseller_create_order tidak ditemukan';
  end if;

  -- id pesanan dibuat di awal: dipakai sebagai ref komponen saat stok dipotong.
  if position('v_ref_order_id' in v_def) = 0 then
    v_def := replace(v_def,
      '  v_subtotal_check integer := 0;',
      '  v_subtotal_check integer := 0;' || chr(10) ||
      '  -- Dibuat lebih dulu supaya bisa dipakai sebagai ref potongan komponen.' || chr(10) ||
      '  v_ref_order_id text := gen_random_uuid()::text;');
  end if;

  if position('(v_item->>''quantity'')::int, ''component''' in v_def) = 0 then
    v_def := replace(v_def,
      '        v_item->>''product_id'', v_item->>''color'', v_item->>''size'', (v_item->>''quantity'')::int',
      '        v_item->>''product_id'', v_item->>''color'', v_item->>''size'', (v_item->>''quantity'')::int,' || chr(10) ||
      '        ''component'', v_ref_order_id::uuid');
    v_after := v_after + 1;
  end if;

  -- Insert orders: bawa id eksplisit, jangan biarkan default membuat id baru.
  if position('returning id into v_order_id' in v_def) > 0 then
    v_def := replace(v_def,
      '  insert into public.orders (' || chr(10) || '    order_number, reseller_id',
      '  insert into public.orders (' || chr(10) || '    id, order_number, reseller_id');
    v_def := replace(v_def,
      '    p_order_number, p_reseller_id, p_customer_name, p_customer_whatsapp,',
      '    v_ref_order_id, p_order_number, p_reseller_id, p_customer_name, p_customer_whatsapp,');
    v_after := v_after + 1;
  end if;

  if v_after = 0 then
    raise notice 'samaqu_reseller_create_order: sudah memakai ref, dilewati';
  else
    execute v_def;
    raise notice 'samaqu_reseller_create_order: % perubahan', v_after;
  end if;
end $mig$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. samaqu_apply_return_stock — decrement pengganti ukuran membawa ref
--    (restore-nya sudah memakai v_ref sejak awal)
-- ═══════════════════════════════════════════════════════════════════════════
do $mig$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_apply_return_stock';

  if v_def is null then
    raise notice 'samaqu_apply_return_stock tidak ditemukan - dilewati';
    return;
  end if;

  if position('it.replacement_size, it.qty, ''component''' in v_def) > 0 then
    raise notice 'samaqu_apply_return_stock: sudah memakai ref, dilewati';
    return;
  end if;

  v_def := replace(v_def,
    'public.samaqu_decrement_stock(v_out_product, v_out_color, it.replacement_size, it.qty)',
    'public.samaqu_decrement_stock(v_out_product, v_out_color, it.replacement_size, it.qty, ''component'', v_ref)');

  execute v_def;
  raise notice 'samaqu_apply_return_stock: decrement tukar ukuran diberi ref';
end $mig$;

commit;

notify pgrst, 'reload schema';

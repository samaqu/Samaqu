-- Rollback untuk 20261106_component_stock_ref_fix.sql
--
-- Mengembalikan EMPAT fungsi ke bentuk tanpa ref (persis seperti sebelum migration),
-- lalu menghapus helper samaqu_ref_uuid.
--
-- Stok TIDAK disentuh: movement yang sudah tercatat dengan ref tetap ada.

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. samaqu_edit_order_items
-- ═══════════════════════════════════════════════════════════════════════════
do $mig$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_edit_order_items';

  v_def := replace(v_def,
    'public.samaqu_decrement_stock(v_stock.product_id, v_stock.color, v_stock.size, v_stock.delta::int, ''component'', v_ref)',
    'public.samaqu_decrement_stock(v_stock.product_id, v_stock.color, v_stock.size, v_stock.delta::int)');
  v_def := replace(v_def,
    'public.samaqu_restore_stock(v_stock.product_id, v_stock.color, v_stock.size, (-v_stock.delta)::int, ''component'', v_ref)',
    'public.samaqu_restore_stock(v_stock.product_id, v_stock.color, v_stock.size, (-v_stock.delta)::int)');
  v_def := replace(v_def, chr(10) || '  v_ref uuid := public.samaqu_ref_uuid(p_order_id);', '');

  execute v_def;
  raise notice 'samaqu_edit_order_items: ref dikembalikan';
end $mig$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. samaqu_edit_reseller_order_items
-- ═══════════════════════════════════════════════════════════════════════════
do $mig$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_edit_reseller_order_items';

  v_def := replace(v_def,
    'v_delta.product_id, v_delta.color, v_delta.size, v_delta.delta::int, ''component'', v_ref',
    'v_delta.product_id, v_delta.color, v_delta.size, v_delta.delta::int');
  v_def := replace(v_def,
    'v_delta.product_id, v_delta.color, v_delta.size, (-v_delta.delta)::int, ''component'', v_ref',
    'v_delta.product_id, v_delta.color, v_delta.size, (-v_delta.delta)::int');
  v_def := replace(v_def, chr(10) || '  v_ref uuid := public.samaqu_ref_uuid(p_order_id);', '');

  execute v_def;
  raise notice 'samaqu_edit_reseller_order_items: ref dikembalikan';
end $mig$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. samaqu_reseller_create_order
-- ═══════════════════════════════════════════════════════════════════════════
do $mig$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_reseller_create_order';

  v_def := replace(v_def,
    chr(10) || '        ''component'', v_ref_order_id::uuid', '');
  v_def := replace(v_def,
    chr(10) || '  -- Dibuat lebih dulu supaya bisa dipakai sebagai ref potongan komponen.' ||
    chr(10) || '  v_ref_order_id text := gen_random_uuid()::text;', '');
  -- Insert orders: kembalikan ke tanpa kolom id eksplisit.
  v_def := replace(v_def,
    '  insert into public.orders (' || chr(10) || '    id, order_number, reseller_id',
    '  insert into public.orders (' || chr(10) || '    order_number, reseller_id');
  v_def := replace(v_def,
    '    v_ref_order_id, p_order_number, p_reseller_id, p_customer_name, p_customer_whatsapp,',
    '    p_order_number, p_reseller_id, p_customer_name, p_customer_whatsapp,');

  execute v_def;
  raise notice 'samaqu_reseller_create_order: ref dikembalikan';
end $mig$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. samaqu_apply_return_stock
-- ═══════════════════════════════════════════════════════════════════════════
do $mig$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_apply_return_stock';

  v_def := replace(v_def,
    'public.samaqu_decrement_stock(v_out_product, v_out_color, it.replacement_size, it.qty, ''component'', v_ref)',
    'public.samaqu_decrement_stock(v_out_product, v_out_color, it.replacement_size, it.qty)');

  execute v_def;
  raise notice 'samaqu_apply_return_stock: ref dikembalikan';
end $mig$;

commit;

-- Helper hanya dipakai oleh versi baru; aman dihapus setelah fungsi dikembalikan.
drop function if exists public.samaqu_ref_uuid(text);

notify pgrst, 'reload schema';

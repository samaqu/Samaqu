-- Uji regresi: tiga fungsi SQL wajib mengirim ref komponen ('component' + id order).
--
-- Jalankan SETELAH 20261106_component_stock_ref_fix.sql. Read-only terhadap data:
-- seluruh uji stok dijalankan dalam transaksi yang di-rollback.
--
-- Cara pakai:
--   psql "$DATABASE_URL" -f supabase/testing/20261106_component_stock_ref_test.sql
-- atau lewat runner SQL service-role.

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- 1. Statis: definisi fungsi memuat 'component', v_ref / v_ref_order_id
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
do $$
declare
  v_def text;
  v_fail text := '';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_edit_order_items';
  if v_def not like '%v_stock.delta::int, ''component'', v_ref%' then
    v_fail := v_fail || 'edit_order_items(decrement) ';
  end if;
  if v_def not like '%(-v_stock.delta)::int, ''component'', v_ref%' then
    v_fail := v_fail || 'edit_order_items(restore) ';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_edit_reseller_order_items';
  if v_def not like '%v_delta.delta::int, ''component'', v_ref%' then
    v_fail := v_fail || 'edit_reseller(decrement) ';
  end if;
  if v_def not like '%(-v_delta.delta)::int, ''component'', v_ref%' then
    v_fail := v_fail || 'edit_reseller(restore) ';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_reseller_create_order';
  if v_def not like '%''component'', v_ref_order_id::uuid%' then
    v_fail := v_fail || 'reseller_create(decrement) ';
  end if;
  if v_def not like '%v_ref_order_id, p_order_number%' then
    v_fail := v_fail || 'reseller_create(id eksplisit) ';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_apply_return_stock';
  if v_def not like '%it.replacement_size, it.qty, ''component'', v_ref%' then
    v_fail := v_fail || 'apply_return(tukar size) ';
  end if;

  if v_fail <> '' then
    raise exception 'GAGAL statis - belum memakai ref: %', v_fail;
  end if;
  raise notice 'OK statis: kelima panggilan memakai ref';
end $$;

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- 2. Dinamis: potong komponen dengan ref, kembali dengan ref -> stok pulih
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
begin;

do $$
declare
  v_thobe int; v_koko int; v_hanger int;
  v_ref uuid := 'aaaaaaaa-1111-2222-3333-444444444444';
  v_ok boolean;
begin
  select stock into v_thobe from product_variants where product_id='cover-thobe';
  select stock into v_koko  from product_variants where product_id='cover-koko';
  select stock into v_hanger from product_variants where product_id='hanger';

  v_ok := samaqu_decrement_stock('cover-hanger','Cover Thobe + Hanger','ALL SIZE',1,'component',v_ref);
  if not v_ok then raise exception 'GAGAL: decrement komponen ditolak'; end if;
  v_ok := samaqu_decrement_stock('cover-hanger','Cover Koko + Hanger','ALL SIZE',2,'component',v_ref);
  if not v_ok then raise exception 'GAGAL: decrement komponen koko ditolak'; end if;

  if (select stock from product_variants where product_id='cover-thobe') <> v_thobe - 1 then
    raise exception 'GAGAL: cover-thobe tidak turun 1';
  end if;
  if (select stock from product_variants where product_id='cover-koko') <> v_koko - 2 then
    raise exception 'GAGAL: cover-koko tidak turun 2';
  end if;
  if (select stock from product_variants where product_id='hanger') <> v_hanger - 3 then
    raise exception 'GAGAL: hanger tidak turun 3';
  end if;

  perform samaqu_restore_stock('cover-hanger','Cover Thobe + Hanger','ALL SIZE',1,'component',v_ref);
  perform samaqu_restore_stock('cover-hanger','Cover Koko + Hanger','ALL SIZE',2,'component',v_ref);

  if (select stock from product_variants where product_id='cover-thobe') <> v_thobe then
    raise exception 'GAGAL: cover-thobe tidak kembali ke %', v_thobe;
  end if;
  if (select stock from product_variants where product_id='cover-koko') <> v_koko then
    raise exception 'GAGAL: cover-koko tidak kembali ke %', v_koko;
  end if;
  if (select stock from product_variants where product_id='hanger') <> v_hanger then
    raise exception 'GAGAL: hanger tidak kembali ke %', v_hanger;
  end if;

  raise notice 'OK dinamis: potong & kembali komponen dengan ref seimbang';
end $$;

rollback;

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- 3. Dinamis: restore dengan ref berbeda TIDAK mengembalikan apa pun
--    (menegaskan restore bergantung pada ref yang sama)
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
begin;

do $$
declare
  v_thobe int;
  v_ref uuid := 'bbbbbbbb-1111-2222-3333-444444444444';
  v_other uuid := 'cccccccc-1111-2222-3333-444444444444';
begin
  select stock into v_thobe from product_variants where product_id='cover-thobe';

  perform samaqu_decrement_stock('cover-hanger','Cover Thobe + Hanger','ALL SIZE',1,'component',v_ref);
  -- Ref berbeda: tidak boleh mengembalikan.
  perform samaqu_restore_stock('cover-hanger','Cover Thobe + Hanger','ALL SIZE',1,'component',v_other);

  if (select stock from product_variants where product_id='cover-thobe') <> v_thobe - 1 then
    raise exception 'GAGAL: restore dengan ref lain seharusnya tidak mengembalikan';
  end if;

  raise notice 'OK: restore hanya berlaku untuk ref yang sama';
end $$;

rollback;

do $$ begin raise notice 'SEMUA UJI REF KOMPONEN LULUS'; end $$;


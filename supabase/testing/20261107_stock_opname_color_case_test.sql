-- Uji regresi: penerapan Stok Opname harus tahan beda huruf besar/kecil pada
-- warna & ukuran, dan harus menolak (bukan melewati diam-diam) baris yang
-- variannya tidak ketemu.
--
-- Jalankan SETELAH 20261107_stock_opname_color_case_fix.sql.
-- Seluruh uji data berjalan di dalam transaksi yang di-rollback, jadi tidak
-- mengubah stok atau riwayat produksi.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Statis: definisi fungsi memakai pencocokan case-insensitive + penjaga
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_apply_stock_opname';

  if v_def not like '%lower(btrim(color)) = lower(btrim(v_line.color))%' then
    raise exception 'GAGAL statis: pencocokan warna belum case-insensitive';
  end if;
  if v_def not like '%lower(btrim(size)) = lower(btrim(v_line.size))%' then
    raise exception 'GAGAL statis: pencocokan ukuran belum case-insensitive';
  end if;
  if v_def not like '%BARIS_TIDAK_KETEMU:%' then
    raise exception 'GAGAL statis: penjaga baris tidak ketemu belum ada';
  end if;

  raise notice 'OK statis: pencocokan case-insensitive + penjaga tersedia';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Dinamis: baris opname huruf kecil harus tetap mengubah varian Title Case
-- ═══════════════════════════════════════════════════════════════════════════
begin;

do $$
declare
  v_pid text;
  v_color text;
  v_size text;
  v_stock integer;
  v_sid uuid;
  v_res jsonb;
begin
  -- Ambil satu varian nyata yang warnanya bukan huruf kecil (kasus Kandora/Koko).
  select product_id, color, size, stock
    into v_pid, v_color, v_size, v_stock
  from public.product_variants
  where color <> lower(color)
    and size is not null
  order by product_id, color, size
  limit 1;

  if v_pid is null then
    raise notice 'SKIP dinamis: tidak ada varian warna Title Case di data ini';
    return;
  end if;

  insert into public.stock_opname_sessions (code, status, created_by, created_by_name)
  values ('TES-SO-COLOR', 'draft', 'test', 'Test')
  returning id into v_sid;

  insert into public.stock_opname_lines (
    session_id, product_id, product_name, color, size,
    system_stock, counted_stock, reason, price, is_derived
  ) values (
    v_sid, v_pid, v_pid, lower(btrim(v_color)), v_size,
    v_stock, v_stock + 2, 'salah_hitung', 0, false
  );

  v_res := public.samaqu_apply_stock_opname(v_sid, 'test', 'Test');

  if (select stock from public.product_variants where product_id = v_pid and color = v_color and size = v_size) <> v_stock + 2 then
    raise exception 'GAGAL dinamis: stok % % % tidak naik 2', v_pid, v_color, v_size;
  end if;
  if (select status from public.stock_opname_sessions where id = v_sid) <> 'selesai' then
    raise exception 'GAGAL dinamis: sesi tidak ditutup selesai setelah apply sukses';
  end if;
  if not exists (
    select 1 from public.stock_movements
    where ref_type = 'stock_opname' and ref_id = v_sid
      and product_id = v_pid and color = v_color and size = v_size
  ) then
    raise exception 'GAGAL dinamis: movement tidak mencatat warna asli varian';
  end if;

  raise notice 'OK dinamis: % · % · % naik 2, sesi selesai, movement tercatat', v_pid, v_color, v_size;
end $$;

rollback;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Dinamis: varian tidak ketemu → apply DIBATALKAN, sesi tetap draft
-- ═══════════════════════════════════════════════════════════════════════════
begin;

do $$
declare
  v_pid text;
  v_color text;
  v_size text;
  v_stock integer;
  v_sid uuid;
  v_failed boolean := false;
begin
  select product_id, color, size, stock
    into v_pid, v_color, v_size, v_stock
  from public.product_variants
  where size is not null
  order by product_id, color, size
  limit 1;

  if v_pid is null then
    raise notice 'SKIP dinamis-2: tidak ada varian untuk diuji';
    return;
  end if;

  insert into public.stock_opname_sessions (code, status, created_by, created_by_name)
  values ('TES-SO-MISSING', 'draft', 'test', 'Test')
  returning id into v_sid;

  insert into public.stock_opname_lines (
    session_id, product_id, product_name, color, size,
    system_stock, counted_stock, reason, price, is_derived
  ) values (
    v_sid, v_pid, v_pid, 'warna-tidak-ada', v_size,
    v_stock, v_stock + 1, 'salah_hitung', 0, false
  );

  begin
    perform public.samaqu_apply_stock_opname(v_sid, 'test', 'Test');
  exception when others then
    if position('BARIS_TIDAK_KETEMU' in sqlerrm) = 0 then
      raise exception 'GAGAL dinamis-2: error bukan dari penjaga baris tidak ketemu (%)', sqlerrm;
    end if;
    v_failed := true;
  end;

  if not v_failed then
    raise exception 'GAGAL dinamis-2: apply seharusnya ditolak';
  end if;
  if (select status from public.stock_opname_sessions where id = v_sid) <> 'draft' then
    raise exception 'GAGAL dinamis-2: sesi tidak boleh berubah jadi selesai';
  end if;
  if (select stock from public.product_variants where product_id = v_pid and color = v_color and size = v_size) <> v_stock then
    raise exception 'GAGAL dinamis-2: stok berubah padahal apply dibatalkan';
  end if;

  raise notice 'OK dinamis-2: apply ditolak, sesi tetap draft, stok utuh';
end $$;

rollback;

do $$ begin raise notice 'SEMUA UJI STOK OPNAME (WARNA/UKURAN) LULUS'; end $$;

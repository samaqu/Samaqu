-- Uji regresi: simpan Stok Opname lewat RPC batch.
--
-- Jalankan SETELAH 20261107_stock_opname_save_rpc.sql.
-- Seluruh uji berjalan di dalam transaksi yang di-rollback, jadi tidak
-- mengubah data sesi yang sebenarnya.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Statis: fungsi ada dan hanya service_role yang boleh eksekusi
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_save_stock_opname_lines';

  if v_def is null then
    raise exception 'GAGAL statis: fungsi samaqu_save_stock_opname_lines tidak ada';
  end if;
  if v_def not like '%v_status <> ''draft''%' then
    raise exception 'GAGAL statis: penjaga status draft tidak ada';
  end if;
  if v_def not like '%is_derived = false%' then
    raise exception 'GAGAL statis: penjaga is_derived tidak ada';
  end if;

  raise notice 'OK statis: fungsi batch + penjaga tersedia';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Dinamis: simpan banyak baris sekaligus, patch sebagian, halaman aman
-- ═══════════════════════════════════════════════════════════════════════════
begin;

do $$
declare
  v_sid uuid;
  v_res jsonb;
  v_filled integer;
  v_reason text;
  v_untouched integer;
begin
  insert into public.stock_opname_sessions (code, status, created_by, created_by_name)
  values ('TES-SO-SAVE', 'draft', 'test', 'Test')
  returning id into v_sid;

  insert into public.stock_opname_lines (
    session_id, product_id, product_name, color, size,
    system_stock, counted_stock, reason, price, is_derived
  )
  select v_sid, v.product_id, v.product_id, v.color, v.size,
         v.stock, null, null, 0, false
  from public.product_variants v
  where v.size is not null
  limit 3;

  -- Baris turunan (is_derived = true) tidak boleh ikut tersimpan.
  insert into public.stock_opname_lines (
    session_id, product_id, product_name, color, size,
    system_stock, counted_stock, reason, price, is_derived
  ) values (
    v_sid, 'derived-test', 'derived-test', 'x', 'ALL SIZE', 0, null, null, 0, true
  );

  -- Simulan tombol "Simpan draft": kirim semua baris sekaligus.
  select jsonb_agg(jsonb_build_object(
           'product_id', l.product_id,
           'color', lower(l.color),
           'size', l.size,
           'counted_stock', 7,
           'reason', 'salah_hitung',
           'reason_note', null
         ))
    into v_res
  from public.stock_opname_lines l
  where l.session_id = v_sid and l.is_derived = false;

  v_res := public.samaqu_save_stock_opname_lines(v_sid, v_res);
  if (v_res->>'saved')::integer <> 3 then
    raise exception 'GAGAL dinamis: saved = % (harus 3)', v_res->>'saved';
  end if;

  select count(*) into v_filled
  from public.stock_opname_lines
  where session_id = v_sid and is_derived = false and counted_stock = 7 and reason = 'salah_hitung';
  if v_filled <> 3 then
    raise exception 'GAGAL dinamis: hanya % baris tersimpan (harus 3)', v_filled;
  end if;

  select counted_stock into v_untouched
  from public.stock_opname_lines
  where session_id = v_sid and is_derived = true;
  if v_untouched is not null then
    raise exception 'GAGAL dinamis: baris is_derived ikut tersimpan';
  end if;

  -- Patch sebagian lewat id, hanya alasan: counted_stock tidak boleh hilang.
  perform public.samaqu_save_stock_opname_lines(
    v_sid,
    jsonb_build_array(jsonb_build_object(
      'id', (select id from public.stock_opname_lines where session_id = v_sid and is_derived = false order by product_id limit 1),
      'reason', 'hilang'
    ))
  );

  if (select counted_stock from public.stock_opname_lines where session_id = v_sid and is_derived = false order by product_id limit 1) <> 7 then
    raise exception 'GAGAL dinamis: patch sebagian menghapus counted_stock';
  end if;
  select reason into v_reason
  from public.stock_opname_lines where session_id = v_sid and is_derived = false order by product_id limit 1;
  if v_reason <> 'hilang' then
    raise exception 'GAGAL dinamis: alasan tidak ter-update (dapat %)', v_reason;
  end if;

  raise notice 'OK dinamis: 3 baris sekaligus, is_derived diabaikan, patch sebagian aman';
end $$;

rollback;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Dinamis: sesi selesai tidak boleh disimpan
-- ═══════════════════════════════════════════════════════════════════════════
begin;

do $$
declare
  v_sid uuid;
  v_failed boolean := false;
begin
  insert into public.stock_opname_sessions (code, status, created_by, created_by_name)
  values ('TES-SO-LOCKED', 'selesai', 'test', 'Test')
  returning id into v_sid;

  insert into public.stock_opname_lines (
    session_id, product_id, product_name, color, size,
    system_stock, counted_stock, price, is_derived
  ) values (v_sid, 'locked-test', 'locked-test', 'x', 'ALL SIZE', 0, 1, 0, false);

  begin
    perform public.samaqu_save_stock_opname_lines(
      v_sid,
      jsonb_build_array(jsonb_build_object('product_id', 'locked-test', 'color', 'x', 'size', 'ALL SIZE', 'counted_stock', 99))
    );
  exception when others then
    v_failed := true;
  end;

  if not v_failed then
    raise exception 'GAGAL dinamis-2: sesi selesai seharusnya ditolak';
  end if;
  if (select counted_stock from public.stock_opname_lines where session_id = v_sid) <> 1 then
    raise exception 'GAGAL dinamis-2: baris sesi selesai ikut berubah';
  end if;

  raise notice 'OK dinamis-2: sesi selesai ditolak, data tidak berubah';
end $$;

rollback;

do $$ begin raise notice 'SEMUA UJI SIMPAN STOK OPNAME LULUS'; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Stok Opname — alur approval dihapus.
--
-- Yang menginput hitungan juga yang menerapkan, jadi status sesi cukup dua:
--   draft  → masih dihitung / boleh diubah
--   selesai → stok sudah diterapkan, read-only
--
-- Migrasi ini:
--  1. memetakan status lama: disetujui → selesai, menunggu/ditolak → draft,
--  2. menyempitkan CHECK constraint ke ('draft','selesai'),
--  3. mengganti RPC `samaqu_apply_stock_opname` agar menerima sesi draft dan
--     langsung menyelesaikannya (logika delta & atomic tetap sama).
--
-- Jalankan manual di SQL Editor Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Constraint lama dilepas dulu supaya update status tidak ditolak.
alter table public.stock_opname_sessions
  drop constraint if exists stock_opname_sessions_status_check;

-- 2) Backfill status lama.
update public.stock_opname_sessions
set status = 'selesai'
where status = 'disetujui';

update public.stock_opname_sessions
set status = 'draft',
    reject_reason = null
where status in ('menunggu', 'ditolak');

-- 3) Constraint baru: hanya dua status.
alter table public.stock_opname_sessions
  add constraint stock_opname_sessions_status_check
  check (status in ('draft', 'selesai'));

-- 4) RPC: terima draft, selesaikan sesi. Delta tetap:
--    stok baru = stok terkini + (fisik − system_stock snapshot).
create or replace function public.samaqu_apply_stock_opname(
  p_session_id uuid,
  p_actor_id text,
  p_actor_name text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.stock_opname_sessions%rowtype;
  v_line record;
  v_current integer;
  v_delta integer;
  v_new integer;
  v_adjusted integer := 0;
  v_skipped integer := 0;
  v_moves integer := 0;
  v_bad jsonb := '[]'::jsonb;
begin
  select * into v_session
  from public.stock_opname_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Sesi tidak ditemukan';
  end if;

  -- Penjaga apply dobel: hanya sesi draft yang bisa diterapkan.
  if v_session.status <> 'draft' then
    raise exception 'Sesi ini sudah diterapkan (status: %)', v_session.status;
  end if;

  for v_line in
    select *
    from public.stock_opname_lines
    where session_id = p_session_id
      and is_derived = false
      and counted_stock is not null
    order by product_id, color, size
  loop
    select stock into v_current
    from public.product_variants
    where product_id = v_line.product_id
      and color = v_line.color
      and size = v_line.size
    for update;

    if not found then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_delta := v_line.counted_stock - v_line.system_stock;
    v_new := v_current + v_delta;

    if v_new < 0 then
      v_bad := v_bad || jsonb_build_object(
        'product_id', v_line.product_id,
        'product_name', v_line.product_name,
        'color', v_line.color,
        'size', v_line.size,
        'system_stock', v_line.system_stock,
        'counted_stock', v_line.counted_stock,
        'current_stock', v_current,
        'final_stock', v_new
      );
      continue;
    end if;

    if v_delta <> 0 then
      update public.product_variants
      set stock = v_new
      where product_id = v_line.product_id
        and color = v_line.color
        and size = v_line.size;

      insert into public.stock_movements (
        product_id, color, size, qty, direction, source, ref_type, ref_id,
        before_stock, after_stock, actor_name, notes
      ) values (
        v_line.product_id,
        v_line.color,
        v_line.size,
        abs(v_delta),
        case when v_delta > 0 then 'in' else 'out' end,
        'opname',
        'stock_opname',
        p_session_id,
        v_current,
        v_new,
        nullif(p_actor_name, ''),
        v_session.code || ' · ' || coalesce(v_line.product_name, v_line.product_id)
          || ' · ' || coalesce(v_line.reason, '-')
          || coalesce(' (' || v_line.reason_note || ')', '')
          || ' · selisih ' || case when v_delta > 0 then '+' else '' end || v_delta
      );

      v_moves := v_moves + 1;
      v_adjusted := v_adjusted + 1;
    end if;

    update public.stock_opname_lines
    set applied = true, updated_at = now()
    where id = v_line.id;
  end loop;

  -- Ada baris yang bakal negatif → batalkan SEMUA perubahan (exception = rollback).
  if jsonb_array_length(v_bad) > 0 then
    raise exception 'STOK_NEGATIF:%', v_bad::text;
  end if;

  -- reviewed_* dipakai sebagai penanda "diterapkan oleh/kapan".
  update public.stock_opname_sessions
  set status = 'selesai',
      reviewed_at = now(),
      reviewed_by = p_actor_id,
      reviewed_by_name = p_actor_name,
      updated_at = now()
  where id = p_session_id;

  return jsonb_build_object('adjusted', v_adjusted, 'skipped', v_skipped, 'movements', v_moves);
end;
$$;

revoke all on function public.samaqu_apply_stock_opname(uuid, text, text) from public;
grant execute on function public.samaqu_apply_stock_opname(uuid, text, text) to service_role;

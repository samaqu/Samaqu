-- ─────────────────────────────────────────────────────────────────────────────
-- Stok Opname — perbaikan pencocokan warna/ukuran saat menerapkan ke stok.
--
-- Masalah: sesi opname menyimpan `color` dalam huruf kecil (dibuat oleh
-- buildOpnameLines), sedangkan `product_variants.color` untuk sebagian produk
-- (Kandora, Koko, Vest Duha, Kabak, Cover/Hanger, Box Kabak) tersimpan dengan
-- huruf besar. RPC lama mencocokkan `color = v_line.color` secara persis,
-- sehingga semua baris produk tersebut tidak ketemu → dihitung `skipped` →
-- dilewati, tetapi sesi tetap ditutup "selesai". Stok tidak berubah.
--
-- Perbaikan:
--  1. Pencocokan memakai lower(btrim(...)) untuk warna dan ukuran, sama dengan
--     unique index identitas varian (product_id, lower(color), lower(size)).
--  2. Kalau masih ada baris terhitung yang variannya tidak ketemu, SELURUH
--     penerapan dibatalkan (exception → rollback) dan sesi tetap draft, jadi
--     tidak ada lagi "selesai" palsu.
--  3. Movement dicatat memakai warna/ukuran asli dari product_variants, bukan
--     versi huruf kecil dari baris opname.
--
-- Tidak ada baris/tabel data yang diubah oleh migration ini — hanya definisi
-- fungsi. Sesi SO-001..SO-007 dan stock_movements lama tidak disentuh.
--
-- Jalankan manual di SQL Editor Supabase (supabase db push tidak dipakai).
-- ─────────────────────────────────────────────────────────────────────────────

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
  v_color text;
  v_size text;
  v_delta integer;
  v_new integer;
  v_adjusted integer := 0;
  v_skipped integer := 0;
  v_moves integer := 0;
  v_bad jsonb := '[]'::jsonb;
  v_missing jsonb := '[]'::jsonb;
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
    /*
     * Cocokkan tanpa membedakan huruf besar/kecil. Ini sama dengan identitas
     * unik varian (product_id, lower(color), lower(size)), jadi hasilnya
     * pasti satu baris dan tidak mungkin menggandakan stok.
     */
    select stock, color, size into v_current, v_color, v_size
    from public.product_variants
    where product_id = v_line.product_id
      and lower(btrim(color)) = lower(btrim(v_line.color))
      and lower(btrim(size)) = lower(btrim(v_line.size))
    for update;

    if not found then
      v_missing := v_missing || jsonb_build_object(
        'product_id', v_line.product_id,
        'product_name', v_line.product_name,
        'color', v_line.color,
        'size', v_line.size
      );
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
        and lower(btrim(color)) = lower(btrim(v_line.color))
        and lower(btrim(size)) = lower(btrim(v_line.size));

      insert into public.stock_movements (
        product_id, color, size, qty, direction, source, ref_type, ref_id,
        before_stock, after_stock, actor_name, notes
      ) values (
        v_line.product_id,
        v_color,
        v_size,
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

  /*
   * Ada baris terhitung yang variannya tidak ketemu → jangan tutup sesi.
   * Exception membatalkan seluruh perubahan di transaksi ini, sesi tetap draft,
   * dan admin melihat baris mana yang bermasalah.
   */
  if jsonb_array_length(v_missing) > 0 then
    raise exception 'BARIS_TIDAK_KETEMU:%', v_missing::text;
  end if;

  -- Ada baris yang bakal negatif → batalkan SEMUA perubahan (exception = rollback).
  if jsonb_array_length(v_bad) > 0 then
    raise exception 'STOK_NEGATIF:%', v_bad::text;
  end if;

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

notify pgrst, 'reload schema';

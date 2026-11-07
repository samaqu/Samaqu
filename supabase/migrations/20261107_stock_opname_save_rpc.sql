-- ─────────────────────────────────────────────────────────────────────────────
-- Stok Opname — simpan hitungan dalam SATU perjalanan ke database.
--
-- Masalah: route `PATCH /api/ops/stock-opname { action: "save" }` meng-update
-- baris satu per satu (loop di TypeScript). Satu sesi punya 251 baris yang bisa
-- diisi, jadi satu klik "Simpan draft" = 251 round-trip berurutan dari
-- Vercel (bom1) ke Supabase (ap-northeast-2) → belasan sampai puluhan detik.
--
-- Perbaikan: satu fungsi SQL yang menerima JSON array dan meng-update semua
-- baris lewat satu statement. Aturan tetap sama seperti sebelumnya:
--   • hanya sesi berstatus draft yang bisa disimpan,
--   • hanya baris is_derived = false,
--   • baris dicocokkan lewat `id` (simpan otomatis) atau
--     product_id + color + size (tombol Simpan draft),
--   • field yang tidak dikirim tidak diubah (patch sebagian).
--
-- Tidak ada data lama yang diubah oleh migration ini — hanya definisi fungsi.
--
-- Jalankan manual di SQL Editor Supabase (supabase db push tidak dipakai).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.samaqu_save_stock_opname_lines(
  p_session_id uuid,
  p_lines jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_saved integer := 0;
begin
  select status into v_status
  from public.stock_opname_sessions
  where id = p_session_id;

  if not found then
    raise exception 'Sesi tidak ditemukan';
  end if;

  -- Sesi yang sudah diterapkan bersifat read-only.
  if v_status <> 'draft' then
    raise exception 'Sesi ini sudah dikunci (status: %).', v_status;
  end if;

  with input as (
    select
      nullif(e->>'id', '')::uuid          as id,
      e->>'product_id'                    as product_id,
      e->>'color'                         as color,
      e->>'size'                          as size,
      (e ? 'counted_stock')               as has_counted,
      (e->>'counted_stock')::integer      as counted_stock,
      (e ? 'reason')                      as has_reason,
      nullif(e->>'reason', '')            as reason,
      (e ? 'reason_note')                 as has_reason_note,
      nullif(e->>'reason_note', '')       as reason_note
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as e
  ), upd as (
    update public.stock_opname_lines l
    set counted_stock = case when i.has_counted then i.counted_stock else l.counted_stock end,
        reason        = case when i.has_reason then i.reason else l.reason end,
        reason_note   = case when i.has_reason_note then i.reason_note else l.reason_note end,
        updated_at    = now()
    from input i
    where l.session_id = p_session_id
      and l.is_derived = false
      and (
        (i.id is not null and l.id = i.id)
        or (
          i.id is null
          and i.product_id is not null
          and l.product_id = i.product_id
          and lower(btrim(l.color)) = lower(btrim(i.color))
          and lower(btrim(l.size)) = lower(btrim(i.size))
        )
      )
    returning l.id
  )
  select count(*) into v_saved from upd;

  update public.stock_opname_sessions
  set updated_at = now()
  where id = p_session_id;

  return jsonb_build_object('saved', v_saved);
end;
$$;

revoke all on function public.samaqu_save_stock_opname_lines(uuid, jsonb) from public;
grant execute on function public.samaqu_save_stock_opname_lines(uuid, jsonb) to service_role;

notify pgrst, 'reload schema';

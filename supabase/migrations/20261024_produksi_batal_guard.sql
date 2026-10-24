-- Cegah pembatalan jadwal Berjalan yang sudah punya penerimaan hasil.
-- Jadwal seperti itu harus ditutup lewat Selesai (retur + kunci).

create or replace function production_cancel_started_schedule(
  p_id uuid,
  p_items jsonb,
  p_actor text default ''
) returns jsonb
language plpgsql as $$
declare
  v_row production_schedules;
  v_item jsonb;
  v_comp production_components;
  v_qty numeric;
  v_issued numeric;
  v_returned int := 0;
begin
  select * into v_row from production_schedules where id = p_id for update;
  if v_row.id is null then raise exception 'Jadwal tidak ditemukan'; end if;
  if v_row.status <> 'berjalan' then
    raise exception 'Hanya jadwal Berjalan yang bisa dibatalkan dengan retur';
  end if;
  if exists (select 1 from production_receipts where schedule_id = p_id) then
    raise exception 'Jadwal sudah memiliki penerimaan hasil. Gunakan tombol Selesai untuk menutup produksi.';
  end if;

  if jsonb_typeof(p_items) = 'array' then
    for v_item in select * from jsonb_array_elements(p_items) loop
      v_qty := coalesce((v_item->>'qty')::numeric, 0);
      if v_qty <= 0 then continue; end if;

      select * into v_comp from production_components
       where id = (v_item->>'component_id')::uuid;
      if v_comp.id is null then raise exception 'Komponen tidak ditemukan'; end if;

      if not exists (
        select 1 from production_schedule_requirements
        where schedule_id = p_id and component_id = v_comp.id
      ) then
        raise exception 'Komponen % bukan kebutuhan jadwal ini', v_comp.code;
      end if;

      select coalesce(sum(-qty), 0) into v_issued
        from production_stock_movements
       where component_id = v_comp.id
         and ref_type = 'production_schedule'
         and ref_id = p_id
         and type = 'keluar_produksi';

      if v_qty > v_issued then
        raise exception 'Retur % (%) melebihi jumlah yang dikeluarkan (%)',
          v_comp.name, v_comp.code, v_issued;
      end if;

      insert into production_stock_movements (
        component_id, movement_date, type, qty, unit_price,
        ref_type, ref_id, notes, actor
      ) values (
        v_comp.id, current_date, 'retur_sisa_bahan', v_qty, v_comp.real_price,
        'production_schedule', p_id,
        'Retur Sisa Bahan ' || v_row.schedule_number,
        nullif(p_actor, '')
      );
      v_returned := v_returned + 1;
    end loop;
  end if;

  update production_schedules set
    status = 'batal',
    cancelled_at = now(),
    cancelled_by = nullif(p_actor, ''),
    updated_at = now()
  where id = p_id;

  return jsonb_build_object('status', 'batal', 'returned', v_returned);
end $$;

-- JADWAL PRODUKSI — FASE 3 (sampai status Berjalan).
--
-- Tidak menyentuh stok produk jadi. Hanya buku stok komponen (Fase 1).
-- Alur: Draft → Disetujui (reservasi) → Berjalan (keluar bahan) → Batal.
-- Selesai/QC/barang jadi = Fase 4.
--
-- Reservasi tidak disimpan di kolom stok: dihitung dari requirements milik
-- jadwal berstatus 'disetujui'. Stok fisik tetap dari production_stock_movements.

create table if not exists production_schedules (
  id uuid primary key default gen_random_uuid(),
  schedule_number text not null unique,
  status text not null default 'draft'
    check (status in ('draft', 'disetujui', 'berjalan', 'selesai', 'batal')),
  start_date date not null,
  target_date date,
  tailor text,
  notes text,
  total_pcs integer not null default 0,
  approved_at timestamptz,
  approved_by text,
  started_at timestamptz,
  started_by text,
  cancelled_at timestamptz,
  cancelled_by text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_production_schedules_status
  on production_schedules (status, start_date desc);

create table if not exists production_schedule_targets (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references production_schedules (id) on delete cascade,
  category text not null,
  fabric_type_id uuid references jenis_kain (id) on delete set null,
  color text,
  series text,
  -- {"S": 10, "M": 20, ...}
  size_qtys jsonb not null default '{}'::jsonb,
  total_pcs integer not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_production_schedule_targets_schedule
  on production_schedule_targets (schedule_id, sort_order);

create table if not exists production_schedule_requirements (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references production_schedules (id) on delete cascade,
  target_id uuid references production_schedule_targets (id) on delete cascade,
  recipe_id uuid references production_recipes (id) on delete set null,
  recipe_version integer,
  component_id uuid not null references production_components (id) on delete restrict,
  component_code text not null,
  component_name text not null,
  unit_use text,
  required_qty numeric(14, 4) not null check (required_qty > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_production_schedule_req_schedule
  on production_schedule_requirements (schedule_id, component_id);
create index if not exists idx_production_schedule_req_component
  on production_schedule_requirements (component_id);

-- ── Simpan jadwal (draft / edit) ────────────────────────────────────────────
create or replace function production_save_schedule(
  p_id uuid,
  p_header jsonb,
  p_targets jsonb,
  p_actor text default ''
) returns jsonb
language plpgsql as $$
declare
  v_row production_schedules;
  v_number text;
  v_start date := nullif(p_header->>'start_date', '')::date;
  v_target_date date := nullif(p_header->>'target_date', '')::date;
  v_prefix text;
  v_next int;
  v_item jsonb;
  v_sizes jsonb;
  v_qty int;
  v_total int := 0;
  v_sort int := 0;
begin
  if v_start is null then raise exception 'Tanggal mulai wajib diisi'; end if;
  if v_target_date is not null and v_target_date < v_start then
    raise exception 'Target selesai tidak boleh sebelum tanggal mulai';
  end if;
  if jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) = 0 then
    raise exception 'Minimal satu baris target';
  end if;

  -- Validasi target + hitung total pcs.
  for v_item in select * from jsonb_array_elements(p_targets) loop
    if btrim(coalesce(v_item->>'category', '')) = '' then
      raise exception 'Kategori produk pada baris target wajib diisi';
    end if;
    v_sizes := coalesce(v_item->'size_qtys', '{}'::jsonb);
    if jsonb_typeof(v_sizes) <> 'object' then
      raise exception 'Jumlah per ukuran tidak valid';
    end if;
    for v_qty in select value::int from jsonb_each_text(v_sizes) loop
      if v_qty < 0 then raise exception 'Jumlah target tidak boleh negatif'; end if;
      v_total := v_total + v_qty;
    end loop;
  end loop;

  if v_total <= 0 then raise exception 'Total target harus lebih dari 0'; end if;

  if p_id is null then
    v_prefix := 'WO-' || to_char(v_start, 'YYYYMM') || '-';
    select coalesce(max(substring(schedule_number from length(v_prefix) + 1)::int), 0) + 1
      into v_next
      from production_schedules
     where schedule_number like v_prefix || '%';

    v_number := v_prefix || lpad(v_next::text, 4, '0');

    insert into production_schedules (
      schedule_number, status, start_date, target_date, tailor, notes, total_pcs, created_by
    ) values (
      v_number, 'draft', v_start, v_target_date,
      nullif(btrim(coalesce(p_header->>'tailor', '')), ''),
      nullif(btrim(coalesce(p_header->>'notes', '')), ''),
      v_total, nullif(p_actor, '')
    ) returning * into v_row;
  else
    select * into v_row from production_schedules where id = p_id for update;
    if v_row.id is null then raise exception 'Jadwal tidak ditemukan'; end if;
    if v_row.status not in ('draft', 'disetujui') then
      raise exception 'Jadwal berstatus % tidak bisa diedit', v_row.status;
    end if;

    -- Edit jadwal Disetujui = kembali ke Draft dan melepas reservasi.
    if v_row.status = 'disetujui' then
      delete from production_schedule_requirements where schedule_id = p_id;
    end if;

    update production_schedules set
      start_date = v_start,
      target_date = v_target_date,
      tailor = nullif(btrim(coalesce(p_header->>'tailor', '')), ''),
      notes = nullif(btrim(coalesce(p_header->>'notes', '')), ''),
      total_pcs = v_total,
      status = 'draft',
      approved_at = null,
      approved_by = null,
      updated_at = now()
    where id = p_id
    returning * into v_row;

    delete from production_schedule_targets where schedule_id = p_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_targets) loop
    v_sort := v_sort + 1;
    insert into production_schedule_targets (
      schedule_id, category, fabric_type_id, color, series, size_qtys, total_pcs, sort_order
    ) values (
      v_row.id,
      btrim(v_item->>'category'),
      nullif(v_item->>'fabric_type_id', '')::uuid,
      nullif(btrim(coalesce(v_item->>'color', '')), ''),
      nullif(btrim(coalesce(v_item->>'series', '')), ''),
      coalesce(v_item->'size_qtys', '{}'::jsonb),
      (
        select coalesce(sum(value::int), 0)
        from jsonb_each_text(coalesce(v_item->'size_qtys', '{}'::jsonb))
      ),
      v_sort
    );
  end loop;

  return jsonb_build_object(
    'id', v_row.id,
    'schedule_number', v_row.schedule_number,
    'status', v_row.status,
    'total_pcs', v_row.total_pcs
  );
end $$;

-- ── Setujui: simpan snapshot requirements + reservasi ───────────────────────
create or replace function production_approve_schedule(
  p_id uuid,
  p_requirements jsonb,
  p_actor text default ''
) returns jsonb
language plpgsql as $$
declare
  v_row production_schedules;
  v_item jsonb;
  v_count int := 0;
begin
  select * into v_row from production_schedules where id = p_id for update;
  if v_row.id is null then raise exception 'Jadwal tidak ditemukan'; end if;
  if v_row.status <> 'draft' then
    raise exception 'Hanya jadwal Draft yang bisa disetujui';
  end if;
  if jsonb_typeof(p_requirements) <> 'array' then
    raise exception 'Snapshot kebutuhan bahan tidak valid';
  end if;

  delete from production_schedule_requirements where schedule_id = p_id;

  for v_item in select * from jsonb_array_elements(p_requirements) loop
    if coalesce((v_item->>'required_qty')::numeric, 0) <= 0 then
      continue;
    end if;
    insert into production_schedule_requirements (
      schedule_id, target_id, recipe_id, recipe_version,
      component_id, component_code, component_name, unit_use, required_qty
    ) values (
      p_id,
      nullif(v_item->>'target_id', '')::uuid,
      nullif(v_item->>'recipe_id', '')::uuid,
      nullif(v_item->>'recipe_version', '')::int,
      (v_item->>'component_id')::uuid,
      coalesce(v_item->>'component_code', ''),
      coalesce(v_item->>'component_name', ''),
      nullif(v_item->>'unit_use', ''),
      (v_item->>'required_qty')::numeric
    );
    v_count := v_count + 1;
  end loop;

  update production_schedules set
    status = 'disetujui',
    approved_at = now(),
    approved_by = nullif(p_actor, ''),
    updated_at = now()
  where id = p_id;

  return jsonb_build_object('status', 'disetujui', 'requirements', v_count);
end $$;

-- ── Batal dari Draft/Disetujui ──────────────────────────────────────────────
create or replace function production_cancel_schedule(
  p_id uuid,
  p_actor text default ''
) returns jsonb
language plpgsql as $$
declare
  v_row production_schedules;
begin
  select * into v_row from production_schedules where id = p_id for update;
  if v_row.id is null then raise exception 'Jadwal tidak ditemukan'; end if;
  if v_row.status not in ('draft', 'disetujui') then
    raise exception 'Jadwal berstatus % tidak bisa dibatalkan dari sini', v_row.status;
  end if;

  update production_schedules set
    status = 'batal',
    cancelled_at = now(),
    cancelled_by = nullif(p_actor, ''),
    updated_at = now()
  where id = p_id;
  -- Requirements tetap disimpan sebagai jejak; status batal tidak dihitung
  -- sebagai reservasi aktif.

  return jsonb_build_object('status', 'batal');
end $$;

-- ── Mulai produksi: keluar bahan (atomik) ───────────────────────────────────
create or replace function production_start_schedule(
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
  v_stock numeric;
  v_issued int := 0;
begin
  select * into v_row from production_schedules where id = p_id for update;
  if v_row.id is null then raise exception 'Jadwal tidak ditemukan'; end if;
  if v_row.status <> 'disetujui' then
    raise exception 'Hanya jadwal Disetujui yang bisa dimulai';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal satu komponen dikeluarkan';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'qty')::numeric, 0);
    if v_qty <= 0 then continue; end if;

    select * into v_comp
      from production_components
     where id = (v_item->>'component_id')::uuid
     for update;
    if v_comp.id is null then raise exception 'Komponen tidak ditemukan'; end if;

    if not exists (
      select 1 from production_schedule_requirements
      where schedule_id = p_id and component_id = v_comp.id
    ) then
      raise exception 'Komponen % bukan kebutuhan jadwal ini', v_comp.code;
    end if;

    select coalesce(sum(qty), 0) into v_stock
      from production_stock_movements
     where component_id = v_comp.id;

    if v_stock < v_qty then
      raise exception 'Stok % (%) tidak cukup: tersedia %, diminta %',
        v_comp.name, v_comp.code, v_stock, v_qty;
    end if;

    insert into production_stock_movements (
      component_id, movement_date, type, qty, unit_price,
      ref_type, ref_id, notes, actor
    ) values (
      v_comp.id, current_date, 'keluar_produksi', -v_qty, v_comp.real_price,
      'production_schedule', p_id,
      'Keluar ke Produksi ' || v_row.schedule_number,
      nullif(p_actor, '')
    );
    v_issued := v_issued + 1;
  end loop;

  if v_issued = 0 then raise exception 'Tidak ada komponen dengan jumlah lebih dari 0'; end if;

  update production_schedules set
    status = 'berjalan',
    started_at = now(),
    started_by = nullif(p_actor, ''),
    updated_at = now()
  where id = p_id;

  return jsonb_build_object('status', 'berjalan', 'issued', v_issued);
end $$;

-- ── Batal dari Berjalan: retur sisa bahan ──────────────────────────────────
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

alter table production_schedules enable row level security;
alter table production_schedule_targets enable row level security;
alter table production_schedule_requirements enable row level security;

revoke all on function production_save_schedule(uuid, jsonb, jsonb, text) from public;
revoke all on function production_approve_schedule(uuid, jsonb, text) from public;
revoke all on function production_cancel_schedule(uuid, text) from public;
revoke all on function production_start_schedule(uuid, jsonb, text) from public;
revoke all on function production_cancel_started_schedule(uuid, jsonb, text) from public;

grant execute on function production_save_schedule(uuid, jsonb, jsonb, text) to service_role;
grant execute on function production_approve_schedule(uuid, jsonb, text) to service_role;
grant execute on function production_cancel_schedule(uuid, text) to service_role;
grant execute on function production_start_schedule(uuid, jsonb, text) to service_role;
grant execute on function production_cancel_started_schedule(uuid, jsonb, text) to service_role;

comment on table production_schedules is
  'Jadwal produksi fase 3. Reservasi = requirements milik status disetujui.';
comment on table production_schedule_targets is
  'Target per kategori/jenis kain/warna/series + jumlah per ukuran.';
comment on table production_schedule_requirements is
  'Snapshot kebutuhan bahan + versi resep saat disetujui.';

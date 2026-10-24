-- HAPUS PEMBELIAN BAHAN (terkontrol).
--
-- Menghapus pembelian = tarik semua efeknya:
--   1. movement stok pembelian
--   2. rincian + header pembelian
--   3. hitung ulang Harga Real dan last_buy_price komponen
--
-- Ditolak kalau stok yang masuk dari pembelian sudah tidak cukup tersedia.
-- Jejak hapus disimpan di production_purchase_deletions (tidak tampil di daftar).

create table if not exists production_purchase_deletions (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null,
  purchase_number text not null,
  purchase_date date,
  supplier text,
  additional_cost numeric(14, 2) not null default 0,
  items_value numeric(14, 2) not null default 0,
  total_value numeric(14, 2) not null default 0,
  notes text,
  purchase_actor text,
  items jsonb not null default '[]'::jsonb,
  reason text,
  deleted_by text,
  deleted_at timestamptz not null default now()
);

create index if not exists idx_production_purchase_deletions_purchase
  on production_purchase_deletions (purchase_id, deleted_at desc);

-- Izinkan DELETE movement pembelian hanya saat RPC hapus pembelian berjalan.
create or replace function production_guard_movement() returns trigger
language plpgsql as $$
begin
  if TG_OP = 'DELETE'
     and current_setting('samaqu.allow_purchase_delete', true) = 'on'
     and old.type = 'pembelian'
     and old.ref_type = 'purchase' then
    return old;
  end if;

  raise exception 'Buku stok bersifat append-only. Koreksi lewat transaksi penyesuaian baru.';
end $$;

create or replace function production_delete_purchase(
  p_purchase_id uuid,
  p_reason text default '',
  p_actor text default ''
) returns jsonb
language plpgsql as $$
declare
  v_purchase production_purchases;
  v_item_count int;
  v_movement_count int;
  v_deleted int;
  v_items jsonb;
  v_component_ids uuid[];
  v_component_id uuid;
  v_component production_components;
  v_qty_use numeric;
  v_stock numeric;
  v_last numeric;
begin
  select * into v_purchase
    from production_purchases
   where id = p_purchase_id
   for update;
  if v_purchase.id is null then
    raise exception 'Pembelian tidak ditemukan';
  end if;

  select count(*) into v_item_count
    from production_purchase_items
   where purchase_id = p_purchase_id;
  if v_item_count = 0 then
    raise exception 'Pembelian tidak punya rincian barang';
  end if;

  select count(*) into v_movement_count
    from production_stock_movements
   where ref_type = 'purchase'
     and ref_id = p_purchase_id
     and type = 'pembelian';
  if v_movement_count <> v_item_count then
    raise exception 'Data stok pembelian tidak konsisten (rincian %, movement %). Hapus dibatalkan.',
      v_item_count, v_movement_count;
  end if;

  -- Cek stok per komponen sebelum menghapus apa pun.
  for v_component_id, v_qty_use in
    select component_id, sum(qty_use)
      from production_purchase_items
     where purchase_id = p_purchase_id
     group by component_id
     order by component_id
  loop
    select * into v_component
      from production_components
     where id = v_component_id
     for update;
    if v_component.id is null then
      raise exception 'Komponen pada pembelian tidak ditemukan';
    end if;

    select coalesce(sum(qty), 0) into v_stock
      from production_stock_movements
     where component_id = v_component_id;

    if v_stock < v_qty_use then
      raise exception 'Stok % (%) tidak cukup untuk menghapus pembelian. Stok sekarang %, pembelian ini %. Koreksi stok lewat Stok Opname dulu.',
        v_component.name, v_component.code, v_stock, v_qty_use;
    end if;
  end loop;

  select array_agg(distinct component_id)
    into v_component_ids
    from production_purchase_items
   where purchase_id = p_purchase_id;

  select coalesce(jsonb_agg(to_jsonb(pi) order by pi.created_at), '[]'::jsonb)
    into v_items
    from production_purchase_items pi
   where pi.purchase_id = p_purchase_id;

  insert into production_purchase_deletions (
    purchase_id, purchase_number, purchase_date, supplier,
    additional_cost, items_value, total_value, notes, purchase_actor,
    items, reason, deleted_by
  ) values (
    v_purchase.id, v_purchase.purchase_number, v_purchase.purchase_date, v_purchase.supplier,
    v_purchase.additional_cost, v_purchase.items_value, v_purchase.total_value,
    v_purchase.notes, v_purchase.actor,
    v_items, nullif(btrim(coalesce(p_reason, '')), ''), nullif(p_actor, '')
  );

  perform set_config('samaqu.allow_purchase_delete', 'on', true);
  delete from production_stock_movements
   where ref_type = 'purchase'
     and ref_id = p_purchase_id
     and type = 'pembelian';
  get diagnostics v_deleted = row_count;
  perform set_config('samaqu.allow_purchase_delete', 'off', true);

  if v_deleted <> v_item_count then
    raise exception 'Jumlah movement yang dihapus (%) tidak sama dengan rincian (%). Hapus dibatalkan.',
      v_deleted, v_item_count;
  end if;

  delete from production_purchases where id = p_purchase_id;

  foreach v_component_id in array v_component_ids loop
    perform production_recalc_price(v_component_id);

    select pi.final_unit_price into v_last
      from production_purchase_items pi
      join production_purchases p on p.id = pi.purchase_id
     where pi.component_id = v_component_id
     order by p.purchase_date desc, p.created_at desc
     limit 1;

    update production_components
       set last_buy_price = coalesce(v_last, 0),
           updated_at = now()
     where id = v_component_id;
  end loop;

  return jsonb_build_object(
    'purchase_number', v_purchase.purchase_number,
    'components', coalesce(array_length(v_component_ids, 1), 0),
    'items', v_item_count
  );
end $$;

alter table production_purchase_deletions enable row level security;

revoke all on function production_delete_purchase(uuid, text, text) from public;
grant execute on function production_delete_purchase(uuid, text, text) to service_role;

comment on table production_purchase_deletions is
  'Audit hapus pembelian. Pembelian & movement sudah dihapus dari data aktif.';
comment on function production_delete_purchase(uuid, text, text) is
  'Hapus pembelian + movement stok, tolak kalau stok sudah terpakai, lalu recalc harga komponen.';

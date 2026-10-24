-- SISTEM PRODUKSI & HPP — FASE 2: RESEP PRODUK
--
-- Hanya definisi resep dan kalkulator HPP. TIDAK mengurangi stok, TIDAK membuat
-- jadwal produksi, dan TIDAK menyentuh transaksi/pesanan.
--
-- ATURAN:
--   * Resep disimpan per kategori produk, berversi. Versi lama TIDAK PERNAH ditimpa.
--   * Mengubah resep aktif = membuat versi baru; versi lama otomatis nonaktif.
--   * Satu kategori hanya boleh punya SATU versi aktif (unique index parsial).
--   * Baris bahan memakai komponen dari production_components (Fase 1).
--   * Baris biaya menyimpan nominal Real & Aman manual.
--   * Filter baris kosong = berlaku untuk semua. Filter tersedia: jenis kain,
--     series, ukuran, warna.
--
-- DIJALANKAN MANUAL / lewat Management API. Idempoten (create if not exists).

create table if not exists production_recipes (
  id uuid primary key default gen_random_uuid(),
  product_category text not null,
  version integer not null check (version > 0),
  effective_date date not null default current_date,
  is_active boolean not null default true,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_category, version)
);

-- Satu versi aktif per kategori.
create unique index if not exists uq_production_recipes_active
  on production_recipes (product_category)
  where is_active;

create index if not exists idx_production_recipes_category
  on production_recipes (product_category, version desc);

create table if not exists production_recipe_lines (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references production_recipes (id) on delete cascade,
  -- 'bahan' memakai komponen; 'biaya' memakai nominal manual.
  line_type text not null check (line_type in ('bahan', 'biaya')),
  -- Bahan: kain | bahan_produksi | packaging_pesanan | tambahan_opsional.
  -- Biaya: selalu 'biaya' (label kelompoknya ada di group_label).
  group_code text not null,
  group_label text,
  component_id uuid references production_components (id) on delete restrict,
  -- Snapshot nama komponen (bahan) atau nama biaya (biaya).
  name text not null,
  qty_per_pcs numeric(14, 4) not null default 0 check (qty_per_pcs >= 0),
  waste_percent numeric(6, 2) not null default 0 check (waste_percent >= 0),
  -- Khusus kain: override qty per ukuran, mis. {"L": 1.8, "XL": 1.9}.
  size_qty jsonb not null default '{}'::jsonb,
  -- Biaya non-bahan: nominal per pcs. Bahan mengabaikan kolom ini (pakai harga komponen).
  real_price numeric(14, 4) not null default 0 check (real_price >= 0),
  safe_price numeric(14, 4) not null default 0 check (safe_price >= 0),
  -- Filter opsional. NULL/'' = berlaku untuk semua.
  filter_fabric_type_id uuid references jenis_kain (id) on delete set null,
  filter_series text,
  filter_size text,
  filter_color text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_production_recipe_lines_recipe
  on production_recipe_lines (recipe_id, sort_order);
create index if not exists idx_production_recipe_lines_component
  on production_recipe_lines (component_id);

-- ── Simpan resep: versi baru, versi lama tidak ditimpa ───────────────────────
create or replace function production_save_recipe(
  p_recipe_id uuid,
  p_category text,
  p_effective_date date,
  p_notes text,
  p_lines jsonb,
  p_actor text default ''
) returns jsonb
language plpgsql as $$
declare
  v_source production_recipes;
  v_recipe production_recipes;
  v_version int;
  v_line jsonb;
  v_type text;
  v_group text;
  v_component uuid;
  v_name text;
  v_qty numeric;
  v_waste numeric;
  v_real numeric;
  v_safe numeric;
  v_size_qty jsonb;
  v_sort int := 0;
begin
  if p_effective_date is null then
    raise exception 'Tanggal berlaku wajib diisi';
  end if;
  if jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Daftar baris resep tidak valid';
  end if;

  if p_recipe_id is null then
    if btrim(coalesce(p_category, '')) = '' then
      raise exception 'Kategori produk wajib dipilih';
    end if;
    if exists (
      select 1 from production_recipes
      where product_category = btrim(p_category) and is_active
    ) then
      raise exception 'Resep aktif untuk kategori % sudah ada. Buka resep itu untuk membuat versi baru.', btrim(p_category);
    end if;

    select coalesce(max(version), 0) + 1 into v_version
    from production_recipes
    where product_category = btrim(p_category);

    insert into production_recipes
      (product_category, version, effective_date, is_active, notes, created_by)
    values
      (btrim(p_category), v_version, p_effective_date, true,
       nullif(btrim(coalesce(p_notes, '')), ''), nullif(p_actor, ''))
    returning * into v_recipe;
  else
    select * into v_source from production_recipes where id = p_recipe_id for update;
    if v_source.id is null then
      raise exception 'Resep tidak ditemukan';
    end if;
    if not v_source.is_active then
      raise exception 'Versi lama tidak bisa diubah. Buka versi aktif untuk membuat versi baru.';
    end if;

    -- Resep yang masih KOSONG (baru dibuat, belum pernah dipakai) diisi di versi
    -- yang sama. Versi baru hanya dibuat kalau sudah ada baris yang tersimpan.
    if not exists (
      select 1 from production_recipe_lines where recipe_id = v_source.id
    ) then
      update production_recipes
         set effective_date = p_effective_date,
             notes = nullif(btrim(coalesce(p_notes, '')), ''),
             updated_at = now()
       where id = v_source.id
       returning * into v_recipe;
    else
      select coalesce(max(version), 0) + 1 into v_version
      from production_recipes
      where product_category = v_source.product_category;

      update production_recipes
         set is_active = false, updated_at = now()
       where id = v_source.id;

      insert into production_recipes
        (product_category, version, effective_date, is_active, notes, created_by)
      values
        (v_source.product_category, v_version, p_effective_date, true,
         nullif(btrim(coalesce(p_notes, '')), ''), nullif(p_actor, ''))
      returning * into v_recipe;
    end if;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_sort := v_sort + 1;
    v_type := btrim(coalesce(v_line->>'line_type', ''));
    v_group := btrim(coalesce(v_line->>'group_code', ''));
    v_qty := coalesce((v_line->>'qty_per_pcs')::numeric, 0);
    v_waste := coalesce((v_line->>'waste_percent')::numeric, 0);
    v_real := coalesce((v_line->>'real_price')::numeric, 0);
    v_safe := coalesce((v_line->>'safe_price')::numeric, 0);
    v_size_qty := case
      when jsonb_typeof(v_line->'size_qty') = 'object' then v_line->'size_qty'
      else '{}'::jsonb
    end;

    if v_type not in ('bahan', 'biaya') then
      raise exception 'Jenis baris resep tidak dikenal';
    end if;
    if v_qty < 0 then raise exception 'Jumlah per pcs tidak boleh negatif'; end if;
    if v_waste < 0 then raise exception 'Susut tidak boleh negatif'; end if;
    if v_real < 0 or v_safe < 0 then raise exception 'Nominal biaya tidak boleh negatif'; end if;

    if v_type = 'bahan' then
      if v_group not in ('kain', 'bahan_produksi', 'packaging_pesanan', 'tambahan_opsional') then
        raise exception 'Kelompok bahan tidak dikenal';
      end if;
      v_component := nullif(v_line->>'component_id', '')::uuid;
      if v_component is null then
        raise exception 'Baris bahan harus memilih komponen';
      end if;
      select name into v_name from production_components where id = v_component;
      if v_name is null then
        raise exception 'Komponen pada resep tidak ditemukan';
      end if;

      -- Baris kain: wajib filter jenis kain dan memakai komponen kategori kain.
      if v_group = 'kain' then
        if nullif(v_line->>'filter_fabric_type_id', '') is null then
          raise exception 'Baris kain wajib memilih jenis kain';
        end if;
        if (select category from production_components where id = v_component) <> 'kain' then
          raise exception 'Baris kain harus memakai komponen kategori Kain';
        end if;
      end if;

      insert into production_recipe_lines (
        recipe_id, line_type, group_code, group_label, component_id, name,
        qty_per_pcs, waste_percent, size_qty, real_price, safe_price,
        filter_fabric_type_id, filter_series, filter_size, filter_color,
        notes, sort_order
      ) values (
        v_recipe.id, 'bahan', v_group, null, v_component, v_name,
        v_qty, v_waste, v_size_qty, 0, 0,
        nullif(v_line->>'filter_fabric_type_id', '')::uuid,
        nullif(btrim(coalesce(v_line->>'filter_series', '')), ''),
        nullif(btrim(coalesce(v_line->>'filter_size', '')), ''),
        nullif(btrim(coalesce(v_line->>'filter_color', '')), ''),
        nullif(btrim(coalesce(v_line->>'notes', '')), ''),
        v_sort
      );
    else
      if v_group <> 'biaya' then
        raise exception 'Kelompok biaya tidak dikenal';
      end if;
      v_name := btrim(coalesce(v_line->>'name', ''));
      if v_name = '' then
        raise exception 'Nama biaya wajib diisi';
      end if;

      insert into production_recipe_lines (
        recipe_id, line_type, group_code, group_label, component_id, name,
        qty_per_pcs, waste_percent, size_qty, real_price, safe_price,
        filter_fabric_type_id, filter_series, filter_size, filter_color,
        notes, sort_order
      ) values (
        v_recipe.id, 'biaya', 'biaya',
        nullif(btrim(coalesce(v_line->>'group_label', '')), ''),
        null, v_name,
        1, 0, '{}'::jsonb, v_real, v_safe,
        nullif(v_line->>'filter_fabric_type_id', '')::uuid,
        nullif(btrim(coalesce(v_line->>'filter_series', '')), ''),
        nullif(btrim(coalesce(v_line->>'filter_size', '')), ''),
        nullif(btrim(coalesce(v_line->>'filter_color', '')), ''),
        nullif(btrim(coalesce(v_line->>'notes', '')), ''),
        v_sort
      );
    end if;
  end loop;

  return jsonb_build_object(
    'id', v_recipe.id,
    'product_category', v_recipe.product_category,
    'version', v_recipe.version,
    'effective_date', v_recipe.effective_date,
    'is_active', v_recipe.is_active,
    'lines', v_sort
  );
end $$;

-- ── Proteksi: hanya service role (route /api/ops/production/*) ───────────────
alter table production_recipes enable row level security;
alter table production_recipe_lines enable row level security;

revoke all on function production_save_recipe(uuid, text, date, text, jsonb, text) from public;
grant execute on function production_save_recipe(uuid, text, date, text, jsonb, text) to service_role;

comment on table production_recipes is
  'Resep produk berversi. Mengubah resep aktif membuat versi baru; versi lama tetap tersimpan.';
comment on table production_recipe_lines is
  'Baris bahan (komponen Fase 1) dan biaya non-bahan, dengan filter jenis kain/series/ukuran/warna.';

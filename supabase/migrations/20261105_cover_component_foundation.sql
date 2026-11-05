-- TAHAP 1 — fondasi varian Cover & Hanger berkomponen.
--
-- TIDAK mengubah perilaku apa pun:
--   - `product_components.product_color/size` default NULL = berlaku semua varian,
--     jadi aturan kabak → box-kabak tetap persis seperti sekarang.
--   - `product_variants.track_stock` default TRUE = semua varian tetap memotong
--     stoknya sendiri, belum ada varian yang memakai nilai false.
--
-- Yang disiapkan untuk tahap berikutnya:
--   - komponen bisa dibatasi ke varian tertentu (mis. "Cover Thobe + Hanger" saja),
--   - varian tanpa stok sendiri bisa ditandai `track_stock = false`,
--   - helper stok efektif (stok varian sendiri ATAU stok terkecil komponennya).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Komponen per varian
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.product_components
  add column if not exists product_color text,
  add column if not exists product_size text;

comment on column public.product_components.product_color is
  'Varian produk pemilik komponen (NULL = berlaku untuk semua varian). Dicocokkan case-insensitive.';
comment on column public.product_components.product_size is
  'Ukuran varian produk pemilik komponen (NULL = semua ukuran).';

-- Unik per (produk, varian, komponen). Baris lama punya product_color/size NULL,
-- jadi tetap unik satu baris per pasangan produk-komponen seperti sebelumnya.
-- Yang lama adalah CONSTRAINT (bukan index biasa), jadi harus di-drop sebagai constraint.
alter table public.product_components
  drop constraint if exists product_components_uniq;

create unique index if not exists product_components_uniq_v2
  on public.product_components (
    product_id,
    coalesce(lower(product_color), ''),
    coalesce(lower(product_size), ''),
    component_product_id
  );

create index if not exists product_components_variant_idx
  on public.product_components (product_id, lower(coalesce(product_color, '')))
  where is_active;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Penanda varian tanpa stok sendiri
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.product_variants
  add column if not exists track_stock boolean not null default true;

comment on column public.product_variants.track_stock is
  'FALSE = varian tidak punya stok sendiri; stok yang tampil = stok terkecil komponennya (product_components). Default TRUE = perilaku lama.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Rencana komponen untuk satu VARIAN (bukan hanya produk)
--
--    Baris berlaku bila product_color/product_size NULL (semua varian) ATAU
--    cocok dengan warna/ukuran yang diminta (case-insensitive).
--    Dengan begitu baris kabak lama (NULL) tetap cocok untuk semua varian kabak.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.samaqu_component_plan(
  p_product_id text,
  p_qty integer,
  p_color text default null,
  p_size text default null
)
returns table (component_product_id text, component_color text, component_size text, qty integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.component_product_id,
         coalesce(c.component_color, ''),
         coalesce(c.component_size, ''),
         c.qty * greatest(1, coalesce(p_qty, 1))
  from public.product_components c
  where c.product_id = p_product_id
    and c.is_active
    -- Komponen khusus varian hanya berlaku untuk varian itu; NULL = semua varian.
    and (
      c.product_color is null
      or lower(c.product_color) = lower(coalesce(p_color, ''))
    )
    and (
      c.product_size is null
      or lower(c.product_size) = lower(coalesce(p_size, ''))
    )
  -- Urutan tetap: dipakai untuk mengunci baris komponen dengan urutan yang konsisten
  -- supaya dua transaksi yang memakai komponen sama (mis. hanger) tidak deadlock.
  order by c.component_product_id, coalesce(c.component_color, ''), coalesce(c.component_size, '');
$$;

revoke all on function public.samaqu_component_plan(text, integer, text, text) from public, anon, authenticated;
grant execute on function public.samaqu_component_plan(text, integer, text, text) to service_role;

-- Versi lama (2 argumen) dihapus supaya tidak ada dua fungsi yang sama-sama cocok.
drop function if exists public.samaqu_component_plan(text, integer);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Stok efektif satu varian
--
--    track_stock = TRUE  → stok varian itu sendiri (perilaku lama).
--    track_stock = FALSE → stok terkecil dari komponennya (NULL bila tak ada komponen).
--    Varian turunan (base_product_id) → stok produk induk seperti aturan stok sharing.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.samaqu_variant_effective_stock(
  p_product_id text,
  p_color text,
  p_size text
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_track boolean;
  v_stock integer;
  v_base text;
  v_base_size text;
  v_min integer;
begin
  select track_stock, stock, base_product_id, base_size
    into v_track, v_stock, v_base, v_base_size
  from public.product_variants
  where product_id = p_product_id
    and lower(coalesce(color, '')) = lower(coalesce(p_color, ''))
    and lower(coalesce(size, '')) = lower(coalesce(p_size, ''))
  limit 1;

  if not found then
    return null;
  end if;

  -- Stok sharing: varian turunan menumpang stok produk induk.
  if v_base is not null and v_base_size is not null then
    select stock into v_stock
    from public.product_variants
    where product_id = v_base
      and lower(coalesce(size, '')) = lower(coalesce(v_base_size, ''))
    limit 1;
    return coalesce(v_stock, 0);
  end if;

  if coalesce(v_track, true) then
    return coalesce(v_stock, 0);
  end if;

  -- Varian tanpa stok sendiri: stok tampil = stok terkecil komponennya.
  select min(coalesce(pv.stock, 0)) into v_min
  from public.samaqu_component_plan(p_product_id, 1, p_color, p_size) c
  join public.product_variants pv
    on pv.product_id = c.component_product_id
   and lower(coalesce(pv.color, '')) = lower(coalesce(c.component_color, ''))
   and lower(coalesce(pv.size, '')) = lower(coalesce(c.component_size, ''));

  return coalesce(v_min, 0);
end;
$$;

revoke all on function public.samaqu_variant_effective_stock(text, text, text) from public, anon, authenticated;
grant execute on function public.samaqu_variant_effective_stock(text, text, text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. decrement/restore: kirim warna+ukuran ke rencana komponen
--
--    TIDAK ada perubahan perilaku: `track_stock` belum ada yang false, dan
--    rencana komponen kabak tetap satu baris (product_color/size NULL).
--    Perubahan di sini hanya meneruskan p_color/p_size agar komponen bisa
--    dibatasi per varian pada tahap berikutnya.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_src text;
  v_count integer := 0;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_decrement_stock';

  if v_src is not null then
    v_src := replace(
      v_src,
      'select * from public.samaqu_component_plan(p_product_id, p_qty)',
      'select * from public.samaqu_component_plan(p_product_id, p_qty, p_color, p_size)'
    );
    execute v_src;
    v_count := v_count + 1;
  end if;

  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_restore_stock';

  if v_src is not null then
    v_src := replace(
      v_src,
      'select * from public.samaqu_component_plan(p_product_id, p_qty)',
      'select * from public.samaqu_component_plan(p_product_id, p_qty, p_color, p_size)'
    );
    execute v_src;
    v_count := v_count + 1;
  end if;

  raise notice 'Fungsi stok diperbarui: % dari 2', v_count;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Muat ulang cache skema PostgREST (kolom & signature baru)
-- ═══════════════════════════════════════════════════════════════════════════
notify pgrst, 'reload schema';

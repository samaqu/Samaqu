-- Peralihan Cover Hanger → produk berkomponen.
--
-- Sebelum: satu varian "Set Hanger + Cover" (stock 43), stok dipelihara manual.
-- Sesudah: dua varian yang stoknya DITURUNKAN dari komponen —
--          Cover Thobe + Hanger (1 cover-thobe + 1 hanger)
--          Cover Koko  + Hanger (1 cover-koko  + 1 hanger)
--
--     varian lama TIDAK dihapus dan stoknya TIDAK diubah. Hanya is_sellable = false
--     supaya tidak ditawarkan lagi; add-on/promo/pesanan lama tetap membutuhkannya
--     sampai kode diperbarui di rilis yang sama.
--
-- Aman diulang (idempotent): aman dijalankan lagi kalau perlu.

begin;

do $$
declare
  v_src  record;
  v_new  record;
  v_seed record;
begin
  -- ── 1. Varian lama: berhenti dijual, stok tetap ───────────────────────────
  update public.product_variants
     set is_sellable = false
   where product_id = 'cover-hanger'
     and color = 'Set Hanger + Cover'
     and is_sellable is distinct from false;

  -- ── 2. Sumber berat & harga: varian lama ─────────────────────────────────
  select price_override, weight, hex, display_order
    into v_seed
    from public.product_variants
   where product_id = 'cover-hanger' and color = 'Set Hanger + Cover'
   limit 1;

  if not found then
    raise exception 'Varian lama Set Hanger + Cover tidak ditemukan — peralihan dibatalkan';
  end if;

  -- ── 3. Dua varian baru, stok dari komponen ───────────────────────────────
  for v_new in
    select * from (values
      ('Cover Thobe + Hanger'::text, 'CVH-CTH'::text, 100),
      ('Cover Koko + Hanger'::text,  'CVH-CKH'::text, 200)
    ) as t(color, sku, urutan)
  loop
    insert into public.product_variants
      (product_id, color, size, stock, price_override, sku, hex, display_order,
       weight, track_stock, is_sellable)
    values
      ('cover-hanger', v_new.color, 'ALL SIZE', 0, v_seed.price_override, v_new.sku,
       v_seed.hex, coalesce(v_seed.display_order, 0) + v_new.urutan,
       v_seed.weight, false, true)
    on conflict (product_id, color, size) do update
      set track_stock = false,
          is_sellable = true,
          sku         = excluded.sku;
  end loop;

  -- ── 4. Komponen: 1 cover + 1 hanger per varian ───────────────────────────
  delete from public.product_components
   where product_id = 'cover-hanger'
     and lower(coalesce(product_color, '')) in ('cover thobe + hanger', 'cover koko + hanger');

  insert into public.product_components
    (product_id, product_color, product_size, component_product_id,
     component_color, component_size, qty, is_active)
  values
    ('cover-hanger', 'Cover Thobe + Hanger', 'ALL SIZE', 'cover-thobe', 'Cover saja', 'ALL SIZE', 1, true),
    ('cover-hanger', 'Cover Thobe + Hanger', 'ALL SIZE', 'hanger',      'Hanger saja', 'ALL SIZE', 1, true),
    ('cover-hanger', 'Cover Koko + Hanger',  'ALL SIZE', 'cover-koko',  'Cover saja', 'ALL SIZE', 1, true),
    ('cover-hanger', 'Cover Koko + Hanger',  'ALL SIZE', 'hanger',      'Hanger saja', 'ALL SIZE', 1, true);
end $$;

commit;

notify pgrst, 'reload schema';

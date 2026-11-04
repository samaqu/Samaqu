-- Pesan error yang membedakan penyebab (stok kurang vs varian tidak ditemukan)
-- + penanda STOCK_ANOMALY supaya pemanggil TS bisa mencatat log setelah rollback.
--
-- Cara aman: ambil definisi fungsi yang ADA DI DATABASE, ganti hanya blok pesan error
-- stok, lalu tulis ulang fungsi dengan signature yang sama. Tidak menyentuh logika stok,
-- tidak menyentuh stok sharing, tidak mengubah data.

do $$
declare
  v_src text;
  v_before text;
  v_after text;
  v_changed integer := 0;
begin
  ---------------------------------------------------------------------------
  -- 1. samaqu_edit_order_items
  ---------------------------------------------------------------------------
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_edit_order_items';

  if v_src is null then
    raise exception 'Fungsi samaqu_edit_order_items tidak ditemukan';
  end if;

  v_before := $old$        raise exception 'Stok tambahan tidak cukup untuk % / % / % (butuh %)',
          v_stock.product_id, v_stock.color, v_stock.size, v_stock.delta;$old$;
  v_after  := $new$        raise exception 'Stok tambahan tidak cukup untuk % / % / % (butuh %). Stok tidak berubah. STOCK_ANOMALY:%',
          v_stock.product_id, v_stock.color, v_stock.size, v_stock.delta,
          public.samaqu_anomaly_detail(v_stock.product_id, v_stock.color, v_stock.size, v_stock.delta::int)::text;$new$;

  if position(v_before in v_src) > 0 then
    v_src := replace(v_src, v_before, v_after);
    execute v_src;
    v_changed := v_changed + 1;
  end if;

  ---------------------------------------------------------------------------
  -- 2. samaqu_edit_reseller_order_items
  ---------------------------------------------------------------------------
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_edit_reseller_order_items';

  if v_src is not null then
    v_before := $old$        raise exception 'Stok ukuran baru tidak cukup untuk % / % / % (butuh %)',
          v_delta.product_id, v_delta.color, v_delta.size, v_delta.delta;$old$;
    v_after  := $new$        raise exception 'Stok ukuran baru tidak cukup untuk % / % / % (butuh %). Stok tidak berubah. STOCK_ANOMALY:%',
          v_delta.product_id, v_delta.color, v_delta.size, v_delta.delta,
          public.samaqu_anomaly_detail(v_delta.product_id, v_delta.color, v_delta.size, v_delta.delta::int)::text;$new$;

    if position(v_before in v_src) > 0 then
      v_src := replace(v_src, v_before, v_after);
      execute v_src;
      v_changed := v_changed + 1;
    end if;
  end if;

  ---------------------------------------------------------------------------
  -- 3. samaqu_reseller_create_order
  ---------------------------------------------------------------------------
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_reseller_create_order';

  if v_src is not null then
    v_before := $old$        raise exception 'Stok tidak mencukupi';$old$;
    v_after  := $new$        raise exception 'Stok tidak mencukupi (varian tidak ditemukan atau sisa kurang). Stok tidak berubah.';$new$;

    if position(v_before in v_src) > 0 then
      v_src := replace(v_src, v_before, v_after);
      execute v_src;
      v_changed := v_changed + 1;
    end if;
  end if;

  raise notice 'Fungsi diperbarui: % dari 3', v_changed;
end $$;

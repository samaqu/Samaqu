-- 3.2 — pesan gagal stok di reseller: bedakan penyebab komponen.
--
-- Sebelumnya pesannya generik "Stok tidak mencukupi (varian tidak ditemukan atau sisa
-- kurang)". Untuk varian berkomponen (Cover Thobe/Koko + Hanger) penyebabnya adalah
-- KOMPONEN yang habis, jadi admin perlu tahu bedanya.
--
-- Perilaku stok TIDAK diubah: hanya kalimat exception.

do $$
declare
  v_src text;
  v_before text;
  v_after text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_reseller_create_order';

  if v_src is null then
    raise notice 'samaqu_reseller_create_order tidak ditemukan - dilewati';
    return;
  end if;

  v_before := 'raise exception ''Stok tidak mencukupi (varian tidak ditemukan atau sisa kurang). Stok tidak berubah. STOCK_ANOMALY:%'',';
  v_after  := $new$raise exception 'Stok tidak mencukupi untuk % (% / %): %. Stok tidak berubah. STOCK_ANOMALY:%',
          coalesce(nullif(btrim(v_item->>'product_name'), ''), v_item->>'product_id'),
          v_item->>'color', v_item->>'size',
          case public.samaqu_stock_failure_reason(
                 v_item->>'product_id', v_item->>'color', v_item->>'size')
            when 'component_out_of_stock' then 'komponen (Cover/Hanger) habis'
            when 'component_variant_not_found' then 'komponen belum punya data stok'
            when 'component_none_configured' then 'komponen varian belum diatur'
            when 'variant_not_found' then 'varian tidak ditemukan'
            else 'sisa stok kurang'
          end,$new$;

  if position(v_before in v_src) > 0 then
    v_src := replace(v_src, v_before, v_after);
    execute v_src;
    raise notice 'samaqu_reseller_create_order: pesan diperbarui';
  else
    raise notice 'samaqu_reseller_create_order: pola pesan tidak cocok, dilewati';
  end if;
end $$;

notify pgrst, 'reload schema';

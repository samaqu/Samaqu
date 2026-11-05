-- Rollback untuk 20261105_component_failure_messages.sql
-- Mengembalikan kalimat exception di samaqu_reseller_create_order ke bentuk umum.

do $$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'samaqu_reseller_create_order';

  if v_src is null then
    raise notice 'samaqu_reseller_create_order tidak ditemukan - dilewati';
    return;
  end if;

  v_src := regexp_replace(
    v_src,
    'raise exception ''Stok tidak mencukupi untuk % \(% / %\): %\. Stok tidak berubah\. STOCK_ANOMALY:%'',[\s\S]*?end,',
    'raise exception ''Stok tidak mencukupi (varian tidak ditemukan atau sisa kurang). Stok tidak berubah. STOCK_ANOMALY:%'',',
    'g'
  );

  execute v_src;
  raise notice 'samaqu_reseller_create_order: pesan dikembalikan';
end $$;

notify pgrst, 'reload schema';

-- =============================================================================
-- Tes 20261118_reseller_admin_order.sql  (SELALU di-rollback)
-- =============================================================================
-- Jalankan SETELAH migrasi diterapkan (atau gabungkan migrasinya di awal blok untuk dry-run).
-- Seluruh blok berakhir dengan `raise exception`, jadi TIDAK ada yang tersimpan: stok, saldo, dan
-- pesanan uji kembali seperti semula. Hasilnya dibaca dari pesan error "DRY-RUN-SELESAI".
-- Memakai reseller & produk nyata (Muhammad Nurrahman, Dewi Aulia Rahmah, thobe-superblack-jiharkah/S)
-- hanya di dalam transaksi yang dibatalkan; ganti id kalau datanya sudah berubah.
-- =============================================================================

do $dry$
declare
  r1 uuid := 'c454ddca-6cae-4fab-8957-0f9f30180b50';  -- saldo 0 (diberi topup uji di dalam transaksi)
  r3 uuid := 'e6720b04-56d9-4dc8-96fb-34b5846ab466';  -- saldo 0 (untuk uji saldo kurang)
  v_items jsonb := jsonb_build_array(jsonb_build_object(
    'product_id', 'thobe-superblack-jiharkah', 'product_name', 'Thobe Superblack', 'series', 'Jiharkah',
    'kain', 'B-01', 'image', '', 'color', 'default', 'size', 'S', 'quantity', 1,
    'buy_price', 100000, 'sell_price', 150000));
  v_report jsonb := '{}'::jsonb;
  v_res jsonb;
  v_ord record;
  v_def_before text;
  v_stock0 int; v_stock1 int; v_stock2 int;
  v_saldo_before int; v_saldo_after int;
  v_n int;
  v_msg text;
begin
  v_def_before := md5(pg_get_functiondef('public.samaqu_reseller_create_order(uuid, text, jsonb, text, text, text, text, text, text, text, text, text, integer, integer, integer, integer, boolean, text)'::regprocedure));

  -- topup uji untuk r1
  insert into reseller_ledger (reseller_id, type, amount, balance_after, reference, note, created_by)
  values (r1, 'topup', 1000000, 1000000, 'TEST-TOPUP-1', 'uji', 'uji');

  select stock into v_stock0 from product_variants where product_id = 'thobe-superblack-jiharkah' and color = 'default' and size = 'S';

  -- S0: fungsi pembuat pesanan LAMA (jalur portal) tetap bekerja & tidak memberi penanda
  v_res := public.samaqu_reseller_create_order(r1, 'EP-TEST-0', v_items, 'Tes', '628111111111', 'Jl Tes', 'Kec, Kota', 'Kec', 'Prov', '12345', null, 'J&T EZ', 15000, 1000, 100000, 115000, false, 'portal-tes');
  select shipping_pending, created_by_admin, status, reseller_balance_deduction into v_ord from orders where order_number = 'EP-TEST-0';
  v_report := v_report || jsonb_build_object('S0_portal_lama_tidak_berubah',
    (v_res->>'status') = 'diproses' and v_ord.shipping_pending = false and v_ord.created_by_admin is null and v_ord.reseller_balance_deduction = 115000);

  -- S1: admin membuat pesanan "ongkir menyusul" (saldo cukup)
  select stock into v_stock1 from product_variants where product_id = 'thobe-superblack-jiharkah' and color = 'default' and size = 'S';
  v_res := public.samaqu_reseller_admin_create_order(r1, 'EP-TEST-A', v_items, 'Tes', '628111111111', 'Jl Tes', 'Kec, Kota', 'Kec', 'Prov', '12345', null, 'manual', 0, 1000, 100000, 100000, false, 'tes@admin', true);
  select shipping_pending, created_by_admin, status, total, shipping_cost, stock_reserved, reseller_balance_deduction, reseller_shortfall_status into v_ord from orders where order_number = 'EP-TEST-A';
  select stock into v_stock2 from product_variants where product_id = 'thobe-superblack-jiharkah' and color = 'default' and size = 'S';
  v_report := v_report || jsonb_build_object(
    'S1_status_diproses', (v_res->>'status') = 'diproses',
    'S1_penanda_dan_admin', v_ord.shipping_pending = true and v_ord.created_by_admin = 'tes@admin',
    'S1_total_produk_saja', v_ord.total = 100000 and v_ord.shipping_cost = 0 and v_ord.reseller_balance_deduction = 100000 and v_ord.reseller_shortfall_status = 'none',
    'S1_stok_ditahan', v_ord.stock_reserved = true and v_stock2 = v_stock1 - 1,
    'S1_ledger_admin', (select count(*) from reseller_ledger where reference = 'EP-TEST-A' and amount = -100000 and created_by = 'tes@admin') = 1);

  -- S2: saldo reseller kurang untuk produk -> ditolak
  begin
    perform public.samaqu_reseller_admin_create_order(r3, 'EP-TEST-C', v_items, 'Tes', '628111111111', 'Jl Tes', 'Kec, Kota', 'Kec', 'Prov', '12345', null, 'manual', 0, 1000, 100000, 100000, false, 'tes@admin', true);
    v_report := v_report || jsonb_build_object('S2_saldo_kurang_ditolak', false);
  exception when others then
    v_report := v_report || jsonb_build_object('S2_saldo_kurang_ditolak', sqlerrm like 'Saldo reseller tidak cukup%', 'S2_pesan', sqlerrm);
  end;

  -- S3: Isi Ongkir, saldo cukup -> potong ongkir (baris ledger terpisah), tetap diproses
  v_res := public.samaqu_reseller_set_shipping('EP-TEST-A', 'J&T EZ', 20000, 'tes@admin');
  select shipping_pending, status, total, shipping_cost, shipping_method, reseller_balance_deduction, reseller_shortfall_status into v_ord from orders where order_number = 'EP-TEST-A';
  v_report := v_report || jsonb_build_object(
    'S3_total_dan_ongkir', v_ord.total = 120000 and v_ord.shipping_cost = 20000 and v_ord.shipping_method = 'J&T EZ',
    'S3_potongan_kumulatif_120000', v_ord.reseller_balance_deduction = 120000,
    'S3_penanda_mati_tetap_diproses', v_ord.shipping_pending = false and v_ord.status = 'diproses' and v_ord.reseller_shortfall_status = 'none',
    'S3_dua_baris_ledger_terpisah', (select count(*) from reseller_ledger where reference in ('EP-TEST-A', 'EP-TEST-A:ongkir')) = 2
       and (select amount from reseller_ledger where reference = 'EP-TEST-A:ongkir') = -20000,
    'S3_hasil', v_res);

  -- S4: Isi Ongkir kedua kali ditolak (tidak dobel potong)
  begin
    perform public.samaqu_reseller_set_shipping('EP-TEST-A', 'J&T EZ', 20000, 'tes@admin');
    v_report := v_report || jsonb_build_object('S4_dobel_ditolak', false);
  exception when others then
    v_report := v_report || jsonb_build_object('S4_dobel_ditolak', sqlerrm like '%tidak menunggu ongkir%', 'S4_pesan', sqlerrm);
  end;

  -- S5: saldo kurang saat Isi Ongkir -> jalur bayar kekurangan yang sudah ada
  v_res := public.samaqu_reseller_admin_create_order(r1, 'EP-TEST-B', v_items, 'Tes', '628111111111', 'Jl Tes', 'Kec, Kota', 'Kec', 'Prov', '12345', null, 'manual', 0, 1000, 100000, 100000, false, 'tes@admin', true);
  select coalesce(sum(amount), 0) into v_saldo_before from reseller_ledger where reseller_id = r1;
  insert into reseller_ledger (reseller_id, type, amount, balance_after, reference, note, created_by)
  values (r1, 'adjustment', -(v_saldo_before - 5000), 5000, null, 'uji: sisakan saldo 5000', 'uji');
  v_res := public.samaqu_reseller_set_shipping('EP-TEST-B', 'J&T ECO', 20000, 'tes@admin');
  select status, payment_status, paid_at, shortfall_started_at, reseller_shortfall_amount, reseller_shortfall_status, reseller_balance_deduction, total, shipping_pending into v_ord from orders where order_number = 'EP-TEST-B';
  v_report := v_report || jsonb_build_object(
    'S5_hasil', v_res,
    'S5_kurang_15000_status_pending', v_ord.status = 'pending' and v_ord.payment_status = 'unpaid' and v_ord.paid_at is null
       and v_ord.reseller_shortfall_amount = 15000 and v_ord.reseller_shortfall_status = 'pending' and v_ord.shipping_pending = false,
    'S5_jam_24_mulai_dari_isi_ongkir', v_ord.shortfall_started_at is not null and v_ord.shortfall_started_at > now() - interval '1 minute',
    'S5_potongan_produk_plus_saldo', v_ord.reseller_balance_deduction = 105000 and v_ord.total = 120000,
    'S5_baris_pembayaran_kekurangan', (select count(*) from reseller_order_payments p join orders o on o.id = p.order_id where o.order_number = 'EP-TEST-B' and p.amount = 15000 and p.status = 'pending') = 1,
    'S5_ledger_ongkir_5000', (select amount from reseller_ledger where reference = 'EP-TEST-B:ongkir') = -5000);

  -- S6: batal sebelum dikirim -> refund memulihkan SEMUA (produk + ongkir yang sudah terpotong), sekali saja
  select coalesce(sum(amount), 0) into v_saldo_before from reseller_ledger where reseller_id = r1;
  perform public.samaqu_reseller_refund_order(r1, (select id from orders where order_number = 'EP-TEST-A'), 120000, 'tes', 'uji refund');
  select coalesce(sum(amount), 0) into v_saldo_after from reseller_ledger where reseller_id = r1;
  v_report := v_report || jsonb_build_object('S6_refund_pulihkan_120000', v_saldo_after = v_saldo_before + 120000);
  begin
    perform public.samaqu_reseller_refund_order(r1, (select id from orders where order_number = 'EP-TEST-A'), 120000, 'tes', 'uji refund 2');
    v_report := v_report || jsonb_build_object('S6_refund_dobel_ditolak', false);
  exception when others then
    v_report := v_report || jsonb_build_object('S6_refund_dobel_ditolak', true);
  end;

  -- S7: validasi masukan
  begin perform public.samaqu_reseller_set_shipping('EP-TEST-A', 'J&T EZ', 0, 'tes@admin'); v_report := v_report || jsonb_build_object('S7_ongkir_nol_ditolak', false);
  exception when others then v_report := v_report || jsonb_build_object('S7_ongkir_nol_ditolak', sqlerrm like '%lebih dari 0%'); end;
  begin perform public.samaqu_reseller_set_shipping('EP-TIDAK-ADA', 'J&T EZ', 1000, 'tes@admin'); v_report := v_report || jsonb_build_object('S7_pesanan_tak_ada_ditolak', false);
  exception when others then v_report := v_report || jsonb_build_object('S7_pesanan_tak_ada_ditolak', sqlerrm like '%tidak ditemukan%'); end;
  begin perform public.samaqu_reseller_admin_create_order(r1, 'EP-TEST-D', v_items, 'Tes', '628111111111', 'Jl Tes', 'Kec, Kota', 'Kec', 'Prov', '12345', null, 'manual', 5000, 1000, 100000, 105000, false, 'tes@admin', true); v_report := v_report || jsonb_build_object('S7_menyusul_ongkir_harus_0', false);
  exception when others then v_report := v_report || jsonb_build_object('S7_menyusul_ongkir_harus_0', sqlerrm like '%ongkir harus 0%'); end;

  -- S8: fungsi pembuat pesanan lama TIDAK berubah sama sekali
  v_report := v_report || jsonb_build_object('S8_fungsi_lama_identik',
    v_def_before = md5(pg_get_functiondef('public.samaqu_reseller_create_order(uuid, text, jsonb, text, text, text, text, text, text, text, text, text, integer, integer, integer, integer, boolean, text)'::regprocedure)));

  raise exception 'DRY-RUN-SELESAI %', jsonb_pretty(v_report);
end
$dry$;

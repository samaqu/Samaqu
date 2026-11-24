-- Uji 20261124_preorder_dp.sql (Pre-Order DP 50%).
--
-- AMAN: seluruh pengujian berjalan dalam satu blok DO yang DIAKHIRI dengan RAISE EXCEPTION,
-- jadi semua data uji otomatis dibatalkan. Hasil tiap cek dibaca dari pesan error
-- "PREORDER_DP_TEST: ...". Baris "FAIL" berarti ada cek yang gagal.
--
-- Prasyarat: migrasi sudah dijalankan, ATAU isi migrasi ditempel tepat sebelum blok ini dalam
-- satu pernyataan (dry-run sebelum diterapkan). Tidak menyentuh stok maupun pesanan nyata.

do $test$
declare
  v_res text := '';
  v_all int;
  v_null int;
  v_ok boolean;
  v_err text;
  v_dp int;
begin
  -- 1. Semua pesanan lama: kedua kolom baru NULL (perilaku lama tidak berubah).
  select count(*) into v_all from orders;
  select count(*) into v_null from orders where preorder_dp_amount is null and preorder_settled_at is null;
  v_res := v_res || format(E'\n%s migrasi: %s dari %s pesanan lama kedua kolom NULL',
    case when v_all = v_null then 'PASS' else 'FAIL' end, v_null, v_all);

  -- 2. PO ber-DP sah: 50% dari total, tersimpan.
  insert into orders (id, order_number, customer_name, customer_whatsapp, shipping_address, shipping_city,
                      subtotal, total, shipping_cost, discount, status, stock_reserved, source, payment_status,
                      is_preorder, preorder_estimate, preorder_dp_amount, paid_at)
  values ('DRYRUN-DP-1', 'DRYRUN-DP-1', 'Uji DP', '0000', 'Jl Uji 1', 'Jakarta',
          598000, 607000, 9000, 0, 'diproses', false, 'whatsapp', 'paid', true, '7-10 hari kerja', 303500, now());
  select preorder_dp_amount into v_dp from orders where id = 'DRYRUN-DP-1';
  v_res := v_res || format(E'\n%s PO ber-DP tersimpan: dp %s (harapan 303500), settled_at NULL',
    case when v_dp = 303500 and (select preorder_settled_at is null from orders where id = 'DRYRUN-DP-1') then 'PASS' else 'FAIL' end, v_dp);

  -- 3. Pelunasan boleh dicatat pada PO ber-DP.
  update orders set preorder_settled_at = now() where id = 'DRYRUN-DP-1';
  v_res := v_res || format(E'\n%s pelunasan tercatat pada PO ber-DP',
    case when (select preorder_settled_at is not null from orders where id = 'DRYRUN-DP-1') then 'PASS' else 'FAIL' end);

  -- 4. Total boleh turun di bawah DP (edit item PO tidak boleh gagal karena DP).
  update orders set total = 200000, subtotal = 191000 where id = 'DRYRUN-DP-1';
  v_res := v_res || format(E'\n%s total turun di bawah DP tidak ditolak (total %s, dp %s)',
    case when (select total from orders where id = 'DRYRUN-DP-1') = 200000 then 'PASS' else 'FAIL' end,
    (select total from orders where id = 'DRYRUN-DP-1'), (select preorder_dp_amount from orders where id = 'DRYRUN-DP-1'));

  -- 5. DP nol/negatif ditolak.
  begin
    insert into orders (id, order_number, customer_name, customer_whatsapp, shipping_address, shipping_city,
                        subtotal, total, shipping_cost, discount, status, stock_reserved, source, payment_status,
                        is_preorder, preorder_dp_amount)
    values ('DRYRUN-DP-3', 'DRYRUN-DP-3', 'Uji', '0000', 'Jl', 'Jakarta', 100, 100, 0, 0, 'diproses', false, 'whatsapp', 'paid', true, 0);
    v_ok := false;
  exception when check_violation then v_ok := true;
  end;
  v_res := v_res || format(E'\n%s DP 0 ditolak', case when v_ok then 'PASS' else 'FAIL' end);

  -- 6. DP hanya untuk pre-order.
  begin
    insert into orders (id, order_number, customer_name, customer_whatsapp, shipping_address, shipping_city,
                        subtotal, total, shipping_cost, discount, status, stock_reserved, source, payment_status,
                        is_preorder, preorder_dp_amount)
    values ('DRYRUN-DP-4', 'DRYRUN-DP-4', 'Uji', '0000', 'Jl', 'Jakarta', 100, 100, 0, 0, 'diproses', false, 'whatsapp', 'paid', false, 50);
    v_ok := false;
  exception when check_violation then v_ok := true;
  end;
  v_res := v_res || format(E'\n%s DP pada pesanan non-PO ditolak', case when v_ok then 'PASS' else 'FAIL' end);

  -- 7. Pelunasan tanpa DP ditolak.
  begin
    insert into orders (id, order_number, customer_name, customer_whatsapp, shipping_address, shipping_city,
                        subtotal, total, shipping_cost, discount, status, stock_reserved, source, payment_status,
                        is_preorder, preorder_settled_at)
    values ('DRYRUN-DP-5', 'DRYRUN-DP-5', 'Uji', '0000', 'Jl', 'Jakarta', 100, 100, 0, 0, 'diproses', false, 'whatsapp', 'paid', true, now());
    v_ok := false;
  exception when check_violation then v_ok := true;
  end;
  v_res := v_res || format(E'\n%s pelunasan tanpa DP ditolak', case when v_ok then 'PASS' else 'FAIL' end);

  -- 8. Indeks antrean pelunasan ada.
  v_ok := exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_orders_preorder_dp_unsettled');
  v_res := v_res || format(E'\n%s indeks idx_orders_preorder_dp_unsettled ada', case when v_ok then 'PASS' else 'FAIL' end);

  -- Selalu dibatalkan: pesan ini membawa hasil uji.
  raise exception 'PREORDER_DP_TEST: %', v_res;
end
$test$;

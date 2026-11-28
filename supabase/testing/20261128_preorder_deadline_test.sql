-- Uji 20261128_preorder_deadline.sql (kolom `preorder_deadline` + edit PO).
--
-- AMAN: seluruh pengujian berjalan dalam satu blok DO yang DIAKHIRI dengan RAISE EXCEPTION,
-- jadi semua data uji otomatis dibatalkan. Hasil tiap cek dibaca dari pesan error
-- "PREORDER_DEADLINE_TEST: ...". Baris "FAIL" berarti ada cek yang gagal.
--
-- Prasyarat: migrasi sudah dijalankan. Tidak menyentuh stok maupun pesanan nyata.

do $test$
declare
  v_res text := '';
  v_all int;
  v_null int;
  v_deadline date;
  v_edit_result jsonb;
begin
  -- 1. Semua pesanan lama: kolom baru NULL (perilaku lama tidak berubah).
  select count(*) into v_all from orders;
  select count(*) into v_null from orders where preorder_deadline is null;
  v_res := v_res || format(E'\n%s migrasi: %s dari %s pesanan lama preorder_deadline NULL',
    case when v_all = v_null then 'PASS' else 'FAIL' end, v_null, v_all);

  -- 2. PO baru dengan deadline tersimpan apa adanya.
  insert into orders (id, order_number, customer_name, customer_whatsapp, shipping_address, shipping_city,
                      subtotal, total, shipping_cost, discount, status, stock_reserved, source, payment_status,
                      is_preorder, preorder_estimate, preorder_deadline, paid_at)
  values ('DRYRUN-DEADLINE-1', 'DRYRUN-DEADLINE-1', 'Uji Deadline', '0000', 'Jl Uji 1', 'Jakarta',
          100000, 100000, 0, 0, 'diproses', false, 'whatsapp', 'paid', true, '7-10 hari kerja', '2026-12-10', now());
  select preorder_deadline into v_deadline from orders where id = 'DRYRUN-DEADLINE-1';
  v_res := v_res || format(E'\n%s PO baru menyimpan deadline: %s (harapan 2026-12-10)',
    case when v_deadline = '2026-12-10'::date then 'PASS' else 'FAIL' end, v_deadline);

  insert into order_items (order_id, product_id, product_name, series, kain, color, size, quantity, price)
  values ('DRYRUN-DEADLINE-1', 'PRODUK-UJI', 'Produk Uji', 'Uji Series', 'Katun', 'default', 'L', 2, 50000);

  -- 3. samaqu_edit_preorder_items bisa mengubah preorder_deadline lewat p_header (fungsi hasil migrasi ini).
  v_edit_result := samaqu_edit_preorder_items(
    'DRYRUN-DEADLINE-1', 'uji',
    jsonb_build_array(jsonb_build_object('product_id', 'PRODUK-UJI', 'product_name', 'Produk Uji', 'series', 'Uji Series', 'kain', 'Katun', 'color', 'default', 'size', 'L', 'quantity', 2, 'price', 50000)),
    null, 0, 0,
    jsonb_build_object('preorder_deadline', '2026-12-25')
  );
  select preorder_deadline into v_deadline from orders where id = 'DRYRUN-DEADLINE-1';
  v_res := v_res || format(E'\n%s edit PO mengubah deadline: %s (harapan 2026-12-25)',
    case when v_deadline = '2026-12-25'::date then 'PASS' else 'FAIL' end, v_deadline);

  -- 4. Header edit TANPA preorder_deadline (kosong): nilai lama tetap dipertahankan (coalesce), tidak ter-null-kan.
  v_edit_result := samaqu_edit_preorder_items(
    'DRYRUN-DEADLINE-1', 'uji',
    jsonb_build_array(jsonb_build_object('product_id', 'PRODUK-UJI', 'product_name', 'Produk Uji', 'series', 'Uji Series', 'kain', 'Katun', 'color', 'default', 'size', 'L', 'quantity', 3, 'price', 50000)),
    null, 0, 0,
    jsonb_build_object('discount', 0)
  );
  select preorder_deadline into v_deadline from orders where id = 'DRYRUN-DEADLINE-1';
  v_res := v_res || format(E'\n%s edit tanpa preorder_deadline tidak menghapus deadline lama: %s (harapan tetap 2026-12-25)',
    case when v_deadline = '2026-12-25'::date then 'PASS' else 'FAIL' end, v_deadline);

  -- 5. Indeks parsial ada.
  v_res := v_res || format(E'\n%s indeks idx_orders_preorder_deadline ada',
    case when exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_orders_preorder_deadline') then 'PASS' else 'FAIL' end);

  -- Selalu dibatalkan: pesan ini membawa hasil uji.
  raise exception 'PREORDER_DEADLINE_TEST: %', v_res;
end
$test$;

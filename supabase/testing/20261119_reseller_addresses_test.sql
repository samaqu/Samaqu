-- =============================================================================
-- Tes 20261119_reseller_addresses.sql  (SELALU di-rollback)
-- =============================================================================
-- Jalankan SETELAH migrasi diterapkan (atau gabungkan migrasinya di awal blok untuk dry-run).
-- Blok berakhir dengan `raise exception`, jadi TIDAK ada yang tersimpan. Hasil dibaca dari pesan
-- galat "DRY-RUN-SELESAI". Memakai reseller nyata (Muhammad Nurrahman, Dewi Aulia Rahmah) hanya di
-- dalam transaksi yang dibatalkan; ganti id kalau datanya sudah berubah.
-- =============================================================================

do $dry$
declare
  r1 uuid := 'c454ddca-6cae-4fab-8957-0f9f30180b50';
  r2 uuid := 'e6720b04-56d9-4dc8-96fb-34b5846ab466';
  v_report jsonb := '{}'::jsonb;
  a1 jsonb; a2 jsonb; a3 jsonb; v jsonb;
  v_n int;
  v_state text;
  v_msg text;
  i int;
begin
  -- T1: alamat pertama otomatis jadi utama
  a1 := public.samaqu_reseller_address_save(null, r1, 'Toko', 'Budi', '081234567890', 'Jl. Satu No. 1', 'Sulawesi Selatan', 'Makassar', 'Tallo', '90211', null, false, 'tes@admin');
  v_report := v_report || jsonb_build_object('T1_pertama_otomatis_utama', (a1->>'is_default')::boolean = true);

  -- T2: alamat kedua tidak mengambil alih
  a2 := public.samaqu_reseller_address_save(null, r1, 'Gudang', 'Sari', '081111111111', 'Jl. Dua No. 2', 'Jawa Barat', 'Depok', 'Sawangan', null, 'dekat pos', false, 'tes@admin');
  v_report := v_report || jsonb_build_object('T2_kedua_bukan_utama_utama_tetap', (a2->>'is_default')::boolean = false
    and (select is_default from reseller_addresses where id = (a1->>'id')::uuid) = true);

  -- T3: alamat ketiga dijadikan utama -> utama berpindah, tetap SATU
  a3 := public.samaqu_reseller_address_save(null, r1, 'Rumah', 'Ani', '082222222222', 'Jl. Tiga No. 3', 'DKI Jakarta', 'Jakarta Selatan', 'Tebet', '12810', null, true, 'tes@admin');
  select count(*) into v_n from reseller_addresses where reseller_id = r1 and is_default;
  v_report := v_report || jsonb_build_object('T3_utama_pindah_tetap_satu', (a3->>'is_default')::boolean = true and v_n = 1
    and (select is_default from reseller_addresses where id = (a1->>'id')::uuid) = false);

  -- T4: ubah alamat kedua (spasi dipangkas, kosong jadi null), tetap bukan utama
  v := public.samaqu_reseller_address_save((a2->>'id')::uuid, r1, '  Gudang Baru  ', ' Sari Dewi ', '081111111111', ' Jl. Dua Baru ', 'Jawa Barat', 'Depok', 'Sawangan', '   ', '  ', null, 'tes@admin');
  v_report := v_report || jsonb_build_object('T4_ubah_dan_rapikan',
    v->>'label' = 'Gudang Baru' and v->>'recipient_name' = 'Sari Dewi' and v->>'address' = 'Jl. Dua Baru'
    and v->>'postal_code' is null and v->>'notes' is null and (v->>'is_default')::boolean = false);

  -- T5: ubah alamat utama dengan make_default=false TIDAK mencabut statusnya
  v := public.samaqu_reseller_address_save((a3->>'id')::uuid, r1, 'Rumah', 'Ani', '082222222222', 'Jl. Tiga No. 3A', 'DKI Jakarta', 'Jakarta Selatan', 'Tebet', '12810', null, false, 'tes@admin');
  v_report := v_report || jsonb_build_object('T5_ubah_tidak_cabut_utama', (v->>'is_default')::boolean = true);

  -- T6: jadikan alamat pertama utama
  v := public.samaqu_reseller_address_set_default((a1->>'id')::uuid);
  select count(*) into v_n from reseller_addresses where reseller_id = r1 and is_default;
  v_report := v_report || jsonb_build_object('T6_set_default_tetap_satu', (v->>'is_default')::boolean = true and v_n = 1);

  -- T7: hapus alamat utama -> alamat TERTUA yang tersisa dipromosikan (waktu dibuat diatur eksplisit)
  update reseller_addresses set created_at = now() - interval '3 min' where id = (a1->>'id')::uuid;
  update reseller_addresses set created_at = now() - interval '2 min' where id = (a2->>'id')::uuid;
  update reseller_addresses set created_at = now() - interval '1 min' where id = (a3->>'id')::uuid;
  v := public.samaqu_reseller_address_delete((a1->>'id')::uuid);
  select count(*) into v_n from reseller_addresses where reseller_id = r1 and is_default;
  v_report := v_report || jsonb_build_object('T7_hapus_utama_promosi_tertua',
    (v->>'promoted_id')::uuid = (a2->>'id')::uuid and v_n = 1
    and (select is_default from reseller_addresses where id = (a2->>'id')::uuid) = true);

  -- T8: hapus alamat bukan-utama -> utama tidak berubah
  v := public.samaqu_reseller_address_delete((a3->>'id')::uuid);
  v_report := v_report || jsonb_build_object('T8_hapus_non_utama_utama_tetap', v->'promoted_id' = 'null'::jsonb
    and (select is_default from reseller_addresses where id = (a2->>'id')::uuid) = true);

  -- T9: hapus yang terakhir -> kosong, tanpa promosi
  v := public.samaqu_reseller_address_delete((a2->>'id')::uuid);
  select count(*) into v_n from reseller_addresses where reseller_id = r1;
  v_report := v_report || jsonb_build_object('T9_hapus_terakhir_kosong', v_n = 0 and v->'promoted_id' = 'null'::jsonb);

  -- T10: batas 20 alamat per reseller
  for i in 1..20 loop
    perform public.samaqu_reseller_address_save(null, r1, 'A' || i, 'Nama ' || i, '0812345678' || lpad(i::text, 2, '0'), 'Jl. ' || i, 'Prov', 'Kota', 'Kec', null, null, false, 'tes');
  end loop;
  begin
    perform public.samaqu_reseller_address_save(null, r1, 'A21', 'Nama 21', '081234567899', 'Jl. 21', 'Prov', 'Kota', 'Kec', null, null, false, 'tes');
    v_report := v_report || jsonb_build_object('T10_batas_20', false);
  exception when others then
    v_report := v_report || jsonb_build_object('T10_batas_20', sqlerrm like 'Maksimal 20 alamat%');
  end;
  select count(*) into v_n from reseller_addresses where reseller_id = r1 and is_default;
  v_report := v_report || jsonb_build_object('T10b_20_alamat_satu_utama', (select count(*) from reseller_addresses where reseller_id = r1) = 20 and v_n = 1);
  delete from reseller_addresses where reseller_id = r1;

  -- T11: aturan isian (CHECK)
  begin perform public.samaqu_reseller_address_save(null, r1, 'X', 'Nama', '12345', 'Jl', 'P', 'K', 'D', null, null, false, 't'); v_report := v_report || jsonb_build_object('T11_wa_pendek_ditolak', false);
  exception when check_violation then v_report := v_report || jsonb_build_object('T11_wa_pendek_ditolak', true); end;
  begin perform public.samaqu_reseller_address_save(null, r1, '   ', 'Nama', '081234567890', 'Jl', 'P', 'K', 'D', null, null, false, 't'); v_report := v_report || jsonb_build_object('T11_label_kosong_ditolak', false);
  exception when check_violation then v_report := v_report || jsonb_build_object('T11_label_kosong_ditolak', true); end;
  begin perform public.samaqu_reseller_address_save(null, r1, 'X', 'Nama', '081234567890', repeat('a', 501), 'P', 'K', 'D', null, null, false, 't'); v_report := v_report || jsonb_build_object('T11_alamat_501_huruf_ditolak', false);
  exception when check_violation then v_report := v_report || jsonb_build_object('T11_alamat_501_huruf_ditolak', true); end;

  -- T12: alamat milik reseller lain tidak bisa diubah lewat reseller yang salah
  a1 := public.samaqu_reseller_address_save(null, r1, 'Toko', 'Budi', '081234567890', 'Jl. Satu', 'P', 'K', 'D', null, null, false, 't');
  begin perform public.samaqu_reseller_address_save((a1->>'id')::uuid, r2, 'Curi', 'Budi', '081234567890', 'Jl. Satu', 'P', 'K', 'D', null, null, false, 't'); v_report := v_report || jsonb_build_object('T12_lintas_reseller_ditolak', false);
  exception when others then v_report := v_report || jsonb_build_object('T12_lintas_reseller_ditolak', sqlerrm = 'Alamat tidak ditemukan'); end;

  -- T13: reseller tidak ada
  begin perform public.samaqu_reseller_address_save(null, '00000000-0000-0000-0000-000000000000', 'X', 'Nama', '081234567890', 'Jl', 'P', 'K', 'D', null, null, false, 't'); v_report := v_report || jsonb_build_object('T13_reseller_tak_ada_ditolak', false);
  exception when others then v_report := v_report || jsonb_build_object('T13_reseller_tak_ada_ditolak', sqlerrm = 'Reseller tidak ditemukan'); end;

  -- T14: alamat utama tiap reseller terpisah
  a2 := public.samaqu_reseller_address_save(null, r2, 'Toko', 'Dewi', '083333333333', 'Jl. Dewi', 'P', 'K', 'D', null, null, false, 't');
  v_report := v_report || jsonb_build_object('T14_utama_per_reseller_terpisah', (a2->>'is_default')::boolean = true
    and (select is_default from reseller_addresses where id = (a1->>'id')::uuid) = true);

  -- T15: indeks unik menolak dua alamat utama (jaring pengaman di luar fungsi)
  begin
    insert into reseller_addresses (reseller_id, label, recipient_name, whatsapp, address, province, city, district, is_default)
    values (r1, 'Dobel', 'Budi', '081234567890', 'Jl', 'P', 'K', 'D', true);
    v_report := v_report || jsonb_build_object('T15_dua_utama_ditolak_indeks', false);
  exception when unique_violation then v_report := v_report || jsonb_build_object('T15_dua_utama_ditolak_indeks', true); end;

  -- T16: keamanan tabel
  v_report := v_report || jsonb_build_object(
    'T16_rls_aktif_tanpa_policy', (select relrowsecurity from pg_class where oid = 'public.reseller_addresses'::regclass) and (select count(*) from pg_policies where tablename = 'reseller_addresses') = 0,
    'T16_anon_authenticated_tanpa_hak_tabel', not has_table_privilege('anon', 'public.reseller_addresses', 'select') and not has_table_privilege('authenticated', 'public.reseller_addresses', 'select')
       and not has_table_privilege('anon', 'public.reseller_addresses', 'insert') and not has_table_privilege('authenticated', 'public.reseller_addresses', 'insert'),
    'T16_service_role_punya_hak', has_table_privilege('service_role', 'public.reseller_addresses', 'select'),
    'T16_fk_cascade_saat_reseller_dihapus', (select confdeltype from pg_constraint where conrelid = 'public.reseller_addresses'::regclass and contype = 'f') = 'c',
    'T16_fungsi_hanya_service_role', not has_function_privilege('anon', 'public.samaqu_reseller_address_delete(uuid)', 'execute') and not has_function_privilege('authenticated', 'public.samaqu_reseller_address_delete(uuid)', 'execute')
       and has_function_privilege('service_role', 'public.samaqu_reseller_address_delete(uuid)', 'execute'));

  raise exception 'DRY-RUN-SELESAI %', jsonb_pretty(v_report);
end
$dry$;

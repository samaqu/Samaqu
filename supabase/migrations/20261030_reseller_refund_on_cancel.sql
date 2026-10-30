-- =============================================================================
-- Pengembalian saldo reseller saat pesanan dibatalkan (2026-10-30)
-- =============================================================================
--
-- JANGAN dijalankan otomatis oleh deploy. Jalankan manual di Supabase SQL Editor.
-- Aman diulang (idempoten).
--
-- Isi:
--   BAGIAN 1  Memperbarui RPC `samaqu_reseller_refund_order` supaya keterangan di
--             riwayat saldo menjelaskan komposisi pengembalian (saldo + transfer).
--             Nominal tetap satu baris per pesanan; tidak ada entri baru.
--   BAGIAN 2  Koreksi data lama: pesanan reseller yang SUDAH dibatalkan tetapi
--             pengembaliannya belum pernah dicatat. Termasuk RSL-20261030-818.
--             Bagian ini dibagi dua: LIHAT dulu, baru TERAPKAN.
--
-- Catatan akuntansi:
--   Konstanta `reseller_ledger.type` hanya mengizinkan topup, order_debit,
--   order_refund, withdrawal_hold, withdrawal_release, adjustment. Karena itu
--   pengembalian transfer DIGABUNG ke satu baris `order_refund` yang sama,
--   bukan jenis baru. Constraint `unique (type, reference)` menjamin satu pesanan
--   hanya direfund sekali.
-- =============================================================================


-- =============================================================================
-- BAGIAN 1 — RPC refund: keterangan lebih jelas, perilaku sama
-- =============================================================================

create or replace function public.samaqu_reseller_refund_order(
  p_reseller_id uuid,
  p_order_id text,
  p_jumlah integer,
  p_dibuat_oleh text default 'sistem',
  p_catatan text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo integer;
  v_saldo_setelah integer;
begin
  if p_jumlah is null or p_jumlah <= 0 then
    raise exception 'Jumlah refund harus lebih dari 0';
  end if;

  -- Kunci baris reseller supaya dua pembatalan bersamaan tidak membaca saldo yang sama.
  perform 1 from resellers where id = p_reseller_id for update;

  select coalesce(sum(amount), 0) into v_saldo
  from reseller_ledger
  where reseller_id = p_reseller_id;

  v_saldo_setelah := v_saldo + p_jumlah;

  begin
    insert into reseller_ledger (reseller_id, type, amount, balance_after, reference, note, created_by)
    values (
      p_reseller_id,
      'order_refund',
      p_jumlah,
      v_saldo_setelah,
      p_order_id,
      coalesce(nullif(trim(p_catatan), ''), 'Pengembalian saldo — pesanan dibatalkan'),
      p_dibuat_oleh
    );
  exception when unique_violation then
    raise exception 'Refund untuk pesanan ini sudah pernah dicatat (sekali saja per pesanan)';
  end;

  return jsonb_build_object('ok', true, 'saldo_setelah', v_saldo_setelah);
end;
$$;

revoke all on function public.samaqu_reseller_refund_order(uuid, text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.samaqu_reseller_refund_order(uuid, text, integer, text, text)
  to service_role;


-- =============================================================================
-- BAGIAN 2A — LIHAT DULU: daftar pesanan yang akan dikoreksi
-- Jalankan blok ini sendirian, periksa hasilnya, baru lanjut ke 2B.
--
-- Hasil pratinjau 30 Oktober 2026 (dijalankan lewat REST API, read-only):
--   pesanan reseller berstatus dibatalkan : 1
--   yang belum pernah direfund            : 1
--
--   order_number        potongan_saldo   bayar_transfer   total   sudah_refund
--   RSL-20261030-818               0            284250   284250   false
--
--   Total nominal koreksi: Rp284.250.
-- Kalau angka di atas berubah saat dijalankan, berarti ada pembatalan reseller baru
-- setelah tanggal ini — periksa ulang daftarnya sebelum lanjut ke 2B.
-- =============================================================================

with kandidat as (
  select
    o.id,
    o.order_number,
    o.reseller_id,
    coalesce(o.reseller_balance_deduction, 0) as potongan_saldo,
    coalesce((
      select sum(p.amount)
      from public.reseller_order_payments p
      where p.order_id = o.id and p.status = 'approved'
    ), 0) as bayar_transfer,
    exists (
      select 1 from public.reseller_ledger l
      where l.reference = o.id and l.type = 'order_refund'
    ) as sudah_refund
  from public.orders o
  where o.reseller_id is not null
    and o.status = 'dibatalkan'
)
select
  order_number,
  potongan_saldo,
  bayar_transfer,
  (potongan_saldo + bayar_transfer) as total_seharusnya_dikembalikan,
  sudah_refund
from kandidat
where sudah_refund = false
  and (potongan_saldo + bayar_transfer) > 0
order by order_number;


-- =============================================================================
-- BAGIAN 2B — TERAPKAN: catat pengembalian yang belum tercatat
-- Jalankan SETELAH memeriksa hasil 2A. Cukup dijalankan sekali.
-- =============================================================================

do $$
declare
  r record;
  v_saldo integer;
  v_note text;
begin
  for r in
    select
      o.id                as order_id,
      o.order_number,
      o.reseller_id,
      coalesce(o.reseller_balance_deduction, 0)::integer as potongan_saldo,
      coalesce((
        select sum(p.amount)
        from public.reseller_order_payments p
        where p.order_id = o.id and p.status = 'approved'
      ), 0)::integer as bayar_transfer
    from public.orders o
    where o.reseller_id is not null
      and o.status = 'dibatalkan'
      and not exists (
        select 1 from public.reseller_ledger l
        where l.reference = o.id and l.type = 'order_refund'
      )
    order by o.order_number
  loop
    if (r.potongan_saldo + r.bayar_transfer) <= 0 then
      continue;
    end if;

    -- Kunci reseller, hitung saldo terbaru, lalu catat satu baris refund.
    perform 1 from public.resellers where id = r.reseller_id for update;

    select coalesce(sum(amount), 0) into v_saldo
    from public.reseller_ledger
    where reseller_id = r.reseller_id;

    if r.potongan_saldo > 0 and r.bayar_transfer > 0 then
      v_note := 'Pengembalian saldo dan pembayaran transfer — pesanan dibatalkan';
    elsif r.bayar_transfer > 0 then
      v_note := 'Pengembalian pembayaran transfer — pesanan dibatalkan';
    else
      v_note := 'Pengembalian saldo — pesanan dibatalkan';
    end if;

    insert into public.reseller_ledger (reseller_id, type, amount, balance_after, reference, note, created_by)
    values (
      r.reseller_id,
      'order_refund',
      r.potongan_saldo + r.bayar_transfer,
      v_saldo + r.potongan_saldo + r.bayar_transfer,
      r.order_id,
      v_note,
      'koreksi-cancel-refund'
    );

    raise notice 'Refund dicatat: % sebesar %', r.order_number, (r.potongan_saldo + r.bayar_transfer);
  end loop;

  -- Tutup pembayaran kekurangan yang masih menunggu pada pesanan batal.
  update public.reseller_order_payments p
  set status = 'rejected',
      reject_reason = 'Pesanan dibatalkan'
  where p.status = 'pending'
    and exists (
      select 1 from public.orders o
      where o.id = p.order_id and o.status = 'dibatalkan'
    );

  raise notice 'Pembayaran pending pada pesanan batal ditutup: % baris', (select count(*)
    from public.reseller_order_payments p
    join public.orders o on o.id = p.order_id
    where o.status = 'dibatalkan' and p.status = 'rejected'
      and p.reject_reason = 'Pesanan dibatalkan');
end $$;


-- =============================================================================
-- VERIFIKASI setelah 2B
-- =============================================================================
-- 1. Pastikan tidak ada lagi pesanan batal reseller yang belum direfund:
--    hasilnya harus 0 baris.
--
--    with kandidat as (
--      select o.id,
--             coalesce(o.reseller_balance_deduction,0) as saldo,
--             coalesce((select sum(p.amount) from public.reseller_order_payments p
--                       where p.order_id = o.id and p.status = 'approved'),0) as transfer,
--             exists (select 1 from public.reseller_ledger l
--                     where l.reference = o.id and l.type = 'order_refund') as sudah
--      from public.orders o
--      where o.reseller_id is not null and o.status = 'dibatalkan')
--    select * from kandidat where sudah = false and (saldo + transfer) > 0;
--
-- 2. Cek saldo reseller pemilik RSL-20261030-818:
--
--    select r.store_name, coalesce(sum(l.amount),0) as saldo
--    from public.resellers r
--    left join public.reseller_ledger l on l.reseller_id = r.id
--    where r.id = '80abf627-8f28-4c20-ad16-588f326ffbbe'
--    group by r.store_name;
--
-- 3. Riwayat saldo pesanan itu:
--
--    select type, amount, note, created_at
--    from public.reseller_ledger
--    where reference = '8e6269d5-9db7-4261-9939-d84b17f25358'
--    order by created_at;
-- =============================================================================

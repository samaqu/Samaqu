-- =============================================================================
-- Buat Pesanan atas nama reseller (admin) + "Ongkir menyusul" (18 November 2026)
-- =============================================================================
--
-- JANGAN dijalankan otomatis oleh deploy. Jalankan manual (service role) SETELAH dry-run
-- (supabase/testing/20261118_reseller_admin_order_test.sql) dan persetujuan pemilik.
-- Aman diulang (idempoten). ADITIF: tidak mengubah fungsi/tabel yang sudah ada.
--
-- Isi:
--   1. orders.shipping_pending       true = pesanan menunggu ongkir (stok ditahan, saldo terpotong sebesar produk)
--      orders.created_by_admin       email admin yang membuatkan pesanan (NULL = dibuat reseller sendiri)
--      orders.shortfall_started_at   awal jam 24 jam bayar kekurangan ongkir (NULL = pakai created_at)
--   2. samaqu_reseller_admin_create_order  MEMBUNGKUS samaqu_reseller_create_order (yang sudah ada, TIDAK diubah)
--      dalam satu transaksi, lalu menulis penanda + admin pembuat. Mode ongkir menyusul wajib saldo >= produk.
--   3. samaqu_reseller_set_shipping        "Isi Ongkir": potong ongkir dari saldo (baris ledger terpisah,
--      reference "<nomor>:ongkir"); kalau saldo kurang -> jalur bayar kekurangan yang sudah ada.
--
-- Fungsi pembuat pesanan lama dipakai portal reseller dan TIDAK disentuh sama sekali.
-- Refund saat batal tidak berubah: memakai orders.reseller_balance_deduction (kumulatif produk + ongkir)
-- ditambah pembayaran kekurangan yang approved.
-- =============================================================================

-- ---------------------------------------------------------------------
-- 1. Kolom aditif (bawaan kosong: pesanan lama tidak berubah)
-- ---------------------------------------------------------------------
alter table public.orders add column if not exists shipping_pending boolean not null default false;
alter table public.orders add column if not exists created_by_admin text;
alter table public.orders add column if not exists shortfall_started_at timestamptz;

create index if not exists idx_orders_shipping_pending
  on public.orders (created_at desc)
  where shipping_pending = true;

-- ---------------------------------------------------------------------
-- 2. Buat pesanan oleh admin (membungkus fungsi lama; atomik)
-- ---------------------------------------------------------------------
create or replace function public.samaqu_reseller_admin_create_order(
  p_reseller_id uuid,
  p_order_number text,
  p_items jsonb,
  p_customer_name text,
  p_customer_whatsapp text,
  p_shipping_address text,
  p_shipping_city text,
  p_shipping_kecamatan text,
  p_shipping_province text,
  p_shipping_postal_code text,
  p_shipping_notes text,
  p_shipping_method text,
  p_shipping_cost integer,
  p_weight integer,
  p_subtotal integer,
  p_total integer,
  p_show_label boolean,
  p_admin_email text,
  p_shipping_pending boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_saldo integer;
  v_result jsonb;
  v_order_id text;
begin
  if nullif(btrim(p_admin_email), '') is null then
    raise exception 'Admin pembuat pesanan wajib dicatat';
  end if;

  -- Kunci reseller lebih dulu: cek saldo dan pembuatan pesanan satu urutan, tanpa celah.
  perform 1 from public.resellers where id = p_reseller_id for update;
  if not found then
    raise exception 'Reseller tidak ditemukan';
  end if;

  if p_shipping_pending then
    if coalesce(p_shipping_cost, 0) <> 0 then
      raise exception 'Ongkir menyusul: ongkir harus 0 saat pesanan dibuat';
    end if;
    select coalesce(sum(amount), 0) into v_saldo
    from public.reseller_ledger where reseller_id = p_reseller_id;
    if v_saldo < p_total then
      raise exception 'Saldo reseller tidak cukup untuk produk (saldo %, produk %). Top up dulu atau pakai ongkir otomatis.',
        v_saldo, p_total;
    end if;
  end if;

  -- Fungsi pembuat pesanan yang SAMA dengan portal (stok, saldo, order, item, kekurangan).
  -- created_by = email admin, jadi baris ledger mencatat siapa yang membuatkan.
  v_result := public.samaqu_reseller_create_order(
    p_reseller_id, p_order_number, p_items, p_customer_name, p_customer_whatsapp,
    p_shipping_address, p_shipping_city, p_shipping_kecamatan, p_shipping_province,
    p_shipping_postal_code, p_shipping_notes, p_shipping_method, p_shipping_cost,
    p_weight, p_subtotal, p_total, p_show_label, p_admin_email
  );

  v_order_id := v_result->>'order_id';
  update public.orders
     set created_by_admin = p_admin_email,
         shipping_pending = coalesce(p_shipping_pending, false)
   where id = v_order_id;

  return v_result || jsonb_build_object('shipping_pending', coalesce(p_shipping_pending, false));
end;
$fn$;

-- ---------------------------------------------------------------------
-- 3. Isi Ongkir untuk pesanan yang menunggu ongkir
-- ---------------------------------------------------------------------
create or replace function public.samaqu_reseller_set_shipping(
  p_order_number text,
  p_method text,
  p_cost integer,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_order public.orders%rowtype;
  v_saldo integer;
  v_extra integer;
  v_short integer;
  v_new_total integer;
begin
  if p_cost is null or p_cost <= 0 then
    raise exception 'Ongkir harus lebih dari 0';
  end if;
  if nullif(btrim(p_method), '') is null then
    raise exception 'Layanan pengiriman wajib dipilih';
  end if;
  if nullif(btrim(p_actor), '') is null then
    raise exception 'Admin pengisi ongkir wajib dicatat';
  end if;

  -- Kunci pesanan, lalu reseller (urutan sama dengan jalur batal: pesanan -> saldo).
  select * into v_order
  from public.orders
  where order_number = p_order_number and reseller_id is not null
  for update;
  if not found then
    raise exception 'Pesanan reseller tidak ditemukan';
  end if;
  perform 1 from public.resellers where id = v_order.reseller_id for update;

  if v_order.shipping_pending is not true then
    raise exception 'Pesanan ini tidak menunggu ongkir';
  end if;
  if v_order.status = 'dibatalkan' then
    raise exception 'Pesanan sudah dibatalkan';
  end if;
  if nullif(btrim(coalesce(v_order.awb_no, '')), '') is not null then
    raise exception 'Pesanan sudah punya resi';
  end if;

  select coalesce(sum(amount), 0) into v_saldo
  from public.reseller_ledger where reseller_id = v_order.reseller_id;

  -- Potong sebanyak saldo yang ada (maksimal sebesar ongkir); sisanya jadi kekurangan.
  v_extra := least(greatest(v_saldo, 0), p_cost);
  v_short := p_cost - v_extra;
  v_new_total := coalesce(v_order.total, 0) + p_cost;

  if v_extra > 0 then
    -- Baris TERPISAH dari potongan produk; UNIQUE (type, reference) mencegah potong ongkir dua kali.
    insert into public.reseller_ledger
      (reseller_id, type, amount, balance_after, reference, note, created_by)
    values
      (v_order.reseller_id, 'order_debit', -v_extra, v_saldo - v_extra,
       p_order_number || ':ongkir', 'Potongan ongkir untuk pesanan', p_actor);
  end if;

  if v_short > 0 then
    -- Saldo kurang: pakai jalur bayar kekurangan yang sudah ada (status pending, bukti transfer, konfirmasi admin).
    -- Jam 24 jam dimulai dari SEKARANG (shortfall_started_at), bukan dari created_at pesanan.
    update public.orders
       set shipping_cost = p_cost,
           shipping_method = p_method,
           total = v_new_total,
           reseller_balance_deduction = coalesce(reseller_balance_deduction, 0) + v_extra,
           reseller_shortfall_amount = v_short,
           reseller_shortfall_status = 'pending',
           status = 'pending',
           payment_status = 'unpaid',
           paid_at = null,
           shortfall_started_at = now(),
           shipping_pending = false,
           updated_at = now()
     where id = v_order.id;

    insert into public.reseller_order_payments (order_id, reseller_id, amount, status)
    values (v_order.id, v_order.reseller_id, v_short, 'pending');
  else
    update public.orders
       set shipping_cost = p_cost,
           shipping_method = p_method,
           total = v_new_total,
           reseller_balance_deduction = coalesce(reseller_balance_deduction, 0) + v_extra,
           shipping_pending = false,
           updated_at = now()
     where id = v_order.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'balance_deduction', v_extra,
    'shortfall', v_short,
    'status', case when v_short > 0 then 'pending' else v_order.status end,
    'total', v_new_total
  );
end;
$fn$;

-- ---------------------------------------------------------------------
-- Akses: hanya service_role (server)
-- ---------------------------------------------------------------------
revoke all on function public.samaqu_reseller_admin_create_order(uuid, text, jsonb, text, text, text, text, text, text, text, text, text, integer, integer, integer, integer, boolean, text, boolean)
  from public, anon, authenticated;
grant execute on function public.samaqu_reseller_admin_create_order(uuid, text, jsonb, text, text, text, text, text, text, text, text, text, integer, integer, integer, integer, boolean, text, boolean)
  to service_role;

revoke all on function public.samaqu_reseller_set_shipping(text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.samaqu_reseller_set_shipping(text, text, integer, text)
  to service_role;

notify pgrst, 'reload schema';

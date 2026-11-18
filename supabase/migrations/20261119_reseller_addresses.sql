-- =============================================================================
-- Buku alamat reseller (19 November 2026)
-- =============================================================================
--
-- JANGAN dijalankan otomatis oleh deploy. Jalankan manual (service role) SETELAH dry-run
-- (supabase/testing/20261119_reseller_addresses_test.sql) dan persetujuan pemilik.
-- Aman diulang (idempoten). ADITIF: tidak mengubah tabel/fungsi yang sudah ada.
--
-- Isi:
--   1. Tabel reseller_addresses: banyak alamat per reseller (label, penerima, WA, alamat lengkap),
--      maksimal SATU alamat utama per reseller (indeks unik parsial). Ikut terhapus bila reseller dihapus.
--      Hanya dibaca/ditulis lewat server (service role): RLS aktif TANPA policy DAN hak tabel
--      anon/authenticated dicabut (berisi nama, WhatsApp, dan alamat).
--   2. Tiga fungsi (hanya service_role) supaya aturan "satu alamat utama" dan "maksimal 20 alamat"
--      atomik walau dua admin menyimpan bersamaan (reseller dikunci lebih dulu):
--        samaqu_reseller_address_save        tambah / ubah (+ jadikan utama; alamat pertama otomatis utama)
--        samaqu_reseller_address_set_default jadikan alamat utama
--        samaqu_reseller_address_delete      hapus (bila yang utama, alamat tertua yang tersisa dipromosikan)
--
-- Pesanan TIDAK menautkan ke tabel ini: tiap pesanan menyimpan salinan alamatnya sendiri, jadi mengubah
-- atau menghapus alamat tersimpan tidak memengaruhi pesanan lama.
-- =============================================================================

create table if not exists public.reseller_addresses (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.resellers(id) on delete cascade,
  label text not null,
  recipient_name text not null,
  whatsapp text not null,
  address text not null,
  province text not null,
  city text not null,
  district text not null,
  postal_code text,
  notes text,
  is_default boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reseller_addresses_label_len check (char_length(btrim(label)) between 1 and 40),
  constraint reseller_addresses_name_len check (char_length(btrim(recipient_name)) between 1 and 120),
  constraint reseller_addresses_wa_len check (char_length(regexp_replace(whatsapp, '\D', '', 'g')) between 9 and 20),
  constraint reseller_addresses_address_len check (char_length(btrim(address)) between 1 and 500),
  constraint reseller_addresses_region_len check (
    char_length(btrim(province)) between 1 and 80
    and char_length(btrim(city)) between 1 and 80
    and char_length(btrim(district)) between 1 and 80
  ),
  constraint reseller_addresses_postal_len check (postal_code is null or char_length(postal_code) <= 10),
  constraint reseller_addresses_notes_len check (notes is null or char_length(notes) <= 300)
);

create index if not exists reseller_addresses_reseller_idx
  on public.reseller_addresses (reseller_id, created_at);

-- Maksimal satu alamat utama per reseller.
create unique index if not exists reseller_addresses_one_default_idx
  on public.reseller_addresses (reseller_id)
  where is_default;

alter table public.reseller_addresses enable row level security;
revoke all on public.reseller_addresses from anon, authenticated;

-- ---------------------------------------------------------------------
-- Tambah / ubah alamat
-- ---------------------------------------------------------------------
create or replace function public.samaqu_reseller_address_save(
  p_id uuid,
  p_reseller_id uuid,
  p_label text,
  p_recipient_name text,
  p_whatsapp text,
  p_address text,
  p_province text,
  p_city text,
  p_district text,
  p_postal_code text,
  p_notes text,
  p_make_default boolean,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
  v_row public.reseller_addresses%rowtype;
  v_make_default boolean := coalesce(p_make_default, false);
begin
  -- Kunci reseller: dua penyimpanan bersamaan tidak bisa melanggar batas jumlah / alamat utama.
  perform 1 from public.resellers where id = p_reseller_id for update;
  if not found then
    raise exception 'Reseller tidak ditemukan';
  end if;

  select count(*) into v_count from public.reseller_addresses where reseller_id = p_reseller_id;

  if p_id is null then
    if v_count >= 20 then
      raise exception 'Maksimal 20 alamat tersimpan per reseller';
    end if;
    -- Alamat pertama otomatis jadi alamat utama.
    if v_count = 0 then v_make_default := true; end if;
    if v_make_default then
      update public.reseller_addresses set is_default = false, updated_at = now()
       where reseller_id = p_reseller_id and is_default;
    end if;
    insert into public.reseller_addresses
      (reseller_id, label, recipient_name, whatsapp, address, province, city, district,
       postal_code, notes, is_default, created_by)
    values
      (p_reseller_id, btrim(p_label), btrim(p_recipient_name), btrim(p_whatsapp), btrim(p_address),
       btrim(p_province), btrim(p_city), btrim(p_district),
       nullif(btrim(coalesce(p_postal_code, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''),
       v_make_default, nullif(btrim(coalesce(p_actor, '')), ''))
    returning * into v_row;
  else
    select * into v_row from public.reseller_addresses
     where id = p_id and reseller_id = p_reseller_id for update;
    if not found then
      raise exception 'Alamat tidak ditemukan';
    end if;
    if v_make_default and not v_row.is_default then
      update public.reseller_addresses set is_default = false, updated_at = now()
       where reseller_id = p_reseller_id and is_default;
    end if;
    update public.reseller_addresses
       set label = btrim(p_label),
           recipient_name = btrim(p_recipient_name),
           whatsapp = btrim(p_whatsapp),
           address = btrim(p_address),
           province = btrim(p_province),
           city = btrim(p_city),
           district = btrim(p_district),
           postal_code = nullif(btrim(coalesce(p_postal_code, '')), ''),
           notes = nullif(btrim(coalesce(p_notes, '')), ''),
           -- Status utama tidak dicabut lewat ubah; ganti dengan menjadikan alamat lain utama.
           is_default = v_row.is_default or v_make_default,
           updated_at = now()
     where id = p_id
    returning * into v_row;
  end if;

  return to_jsonb(v_row);
end;
$fn$;

-- ---------------------------------------------------------------------
-- Jadikan alamat utama
-- ---------------------------------------------------------------------
create or replace function public.samaqu_reseller_address_set_default(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.reseller_addresses%rowtype;
begin
  select * into v_row from public.reseller_addresses where id = p_id;
  if not found then
    raise exception 'Alamat tidak ditemukan';
  end if;
  perform 1 from public.resellers where id = v_row.reseller_id for update;

  update public.reseller_addresses set is_default = false, updated_at = now()
   where reseller_id = v_row.reseller_id and is_default and id <> p_id;
  update public.reseller_addresses set is_default = true, updated_at = now()
   where id = p_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$fn$;

-- ---------------------------------------------------------------------
-- Hapus alamat (alamat utama yang dihapus digantikan alamat tertua yang tersisa)
-- ---------------------------------------------------------------------
create or replace function public.samaqu_reseller_address_delete(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.reseller_addresses%rowtype;
  v_promoted uuid;
begin
  select * into v_row from public.reseller_addresses where id = p_id;
  if not found then
    raise exception 'Alamat tidak ditemukan';
  end if;
  perform 1 from public.resellers where id = v_row.reseller_id for update;

  delete from public.reseller_addresses where id = p_id;

  if v_row.is_default then
    update public.reseller_addresses set is_default = true, updated_at = now()
     where id = (
       select id from public.reseller_addresses
        where reseller_id = v_row.reseller_id
        order by created_at asc, id asc
        limit 1
     )
    returning id into v_promoted;
  end if;

  return jsonb_build_object('ok', true, 'promoted_id', v_promoted);
end;
$fn$;

-- ---------------------------------------------------------------------
-- Akses: hanya service_role (server)
-- ---------------------------------------------------------------------
revoke all on function public.samaqu_reseller_address_save(uuid, uuid, text, text, text, text, text, text, text, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.samaqu_reseller_address_save(uuid, uuid, text, text, text, text, text, text, text, text, text, boolean, text)
  to service_role;

revoke all on function public.samaqu_reseller_address_set_default(uuid) from public, anon, authenticated;
grant execute on function public.samaqu_reseller_address_set_default(uuid) to service_role;

revoke all on function public.samaqu_reseller_address_delete(uuid) from public, anon, authenticated;
grant execute on function public.samaqu_reseller_address_delete(uuid) to service_role;

notify pgrst, 'reload schema';

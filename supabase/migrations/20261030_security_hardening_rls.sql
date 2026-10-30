-- =============================================================================
-- Audit keamanan 2026-10-30 — perbaikan RLS KRITIS
-- =============================================================================
--
-- JANGAN dijalankan otomatis oleh deploy. Jalankan manual di Supabase SQL Editor,
-- setelah review, karena mengubah kebijakan akses tabel yang sedang dipakai.
--
-- Isi:
--   1. store_settings   — policy `FOR ALL USING (true)` untuk PUBLIC membuat anon bisa
--                         MENULIS nomor rekening BSI reseller & gambar QRIS.
--   2. page_sections    — policy serupa; anon bisa mengubah toggle section CMS.
--   3. order_tracking_events — RLS tidak pernah diaktifkan; anon bisa INSERT event
--                         pengiriman palsu dan membaca semua AWB.
--   4. postal_district_cache — RLS tidak diaktifkan.
--   5. Revoke EXECUTE fungsi production_* & cleanup_destination_cache dari anon.
--
-- Semua pemakaian aplikasi membaca/menulis tabel ini lewat /api/* dengan service
-- role, jadi mencabut akses anon TIDAK mengubah perilaku aplikasi.
-- =============================================================================

begin;

-- ── 1 & 2. store_settings / page_sections ────────────────────────────────────
drop policy if exists "Service role all store_settings" on public.store_settings;
drop policy if exists "Service role all page_sections" on public.page_sections;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'store_settings' and policyname = 'Admin write'
  ) then
    create policy "Admin write" on public.store_settings for all to authenticated
      using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
      with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'page_sections' and policyname = 'Admin write'
  ) then
    create policy "Admin write" on public.page_sections for all to authenticated
      using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
      with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));
  end if;
end $$;

-- SELECT publik tetap: toko butuh membaca setting tampilan & section aktif.
revoke insert, update, delete on public.store_settings from anon;
revoke insert, update, delete on public.page_sections from anon;

-- ── 3 & 4. Aktifkan RLS pada tabel cache/tracking yang belum punya ───────────
alter table if exists public.order_tracking_events enable row level security;
alter table if exists public.postal_district_cache enable row level security;

-- Tanpa policy = hanya service role yang bisa membaca/menulis.
revoke all on public.order_tracking_events from anon, authenticated;
revoke all on public.postal_district_cache from anon, authenticated;

-- ── 5. Cabut EXECUTE RPC dari anon/authenticated ─────────────────────────────
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'production\_%' or p.proname = 'cleanup_destination_cache')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

commit;

-- =============================================================================
-- VERIFIKASI setelah dijalankan
-- =============================================================================
-- select tablename, policyname, roles, cmd
-- from pg_policies
-- where schemaname = 'public' and tablename in ('store_settings','page_sections')
-- order by 1, 2;
--
-- select relname, relrowsecurity
-- from pg_class
-- where relname in ('order_tracking_events','postal_district_cache');
-- =============================================================================

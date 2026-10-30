-- =============================================================================
-- Audit keamanan 2026-10-30 — perbaikan RLS KRITIS (v2, idempoten)
-- =============================================================================
--
-- Jalankan manual di Supabase SQL Editor. Aman diulang.
--
-- v2: setiap objek dicek dulu keberadaannya. Database produksi ternyata TIDAK
-- punya `page_sections`, `order_tracking_events`, maupun `postal_district_cache`
-- (beberapa file migrasi lama tidak pernah dijalankan). Versi sebelumnya gagal
-- dengan 42P01 karena itu.
--
-- Yang dikerjakan:
--   1. store_settings        — policy `FOR ALL USING (true)` untuk PUBLIC membuat
--                              anon bisa MENULIS nomor rekening BSI & gambar QRIS.
--   2. page_sections         — hanya kalau tabelnya ada.
--   3. order_tracking_events — aktifkan RLS kalau tabelnya ada.
--   4. postal_district_cache — aktifkan RLS kalau tabelnya ada.
--   5. Revoke EXECUTE fungsi production_* & cleanup_destination_cache dari anon.
--
-- Semua pemakaian aplikasi lewat /api/* memakai service role, jadi mencabut akses
-- anon tidak mengubah perilaku aplikasi.
-- =============================================================================

-- ── 1. store_settings ────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.store_settings') is null then
    raise notice 'store_settings tidak ada, dilewati';
    return;
  end if;

  -- Policy lama yang salah nama: FOR ALL USING(true) tanpa TO => berlaku untuk PUBLIC.
  execute 'drop policy if exists "Service role all store_settings" on public.store_settings';

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'store_settings' and policyname = 'Admin write'
  ) then
    execute $p$
      create policy "Admin write" on public.store_settings for all to authenticated
        using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
        with check (exists (select 1 from public.admins a where a.user_id = auth.uid()))
    $p$;
  end if;

  execute 'revoke insert, update, delete on public.store_settings from anon';
end $$;

-- ── 2. page_sections (hanya kalau ada) ───────────────────────────────────────
do $$
begin
  if to_regclass('public.page_sections') is null then
    raise notice 'page_sections tidak ada, dilewati';
    return;
  end if;

  execute 'drop policy if exists "Service role all page_sections" on public.page_sections';

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'page_sections' and policyname = 'Admin write'
  ) then
    execute $p$
      create policy "Admin write" on public.page_sections for all to authenticated
        using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
        with check (exists (select 1 from public.admins a where a.user_id = auth.uid()))
    $p$;
  end if;

  execute 'revoke insert, update, delete on public.page_sections from anon';
end $$;

-- ── 3 & 4. Tabel cache/tracking: aktifkan RLS kalau ada ──────────────────────
do $$
begin
  if to_regclass('public.order_tracking_events') is not null then
    execute 'alter table public.order_tracking_events enable row level security';
    execute 'revoke all on public.order_tracking_events from anon, authenticated';
  else
    raise notice 'order_tracking_events tidak ada, dilewati';
  end if;

  if to_regclass('public.postal_district_cache') is not null then
    execute 'alter table public.postal_district_cache enable row level security';
    execute 'revoke all on public.postal_district_cache from anon, authenticated';
  else
    raise notice 'postal_district_cache tidak ada, dilewati';
  end if;
end $$;

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

-- =============================================================================
-- VERIFIKASI setelah dijalankan
-- =============================================================================
-- select tablename, policyname, roles, cmd
-- from pg_policies
-- where schemaname = 'public' and tablename in ('store_settings','page_sections')
-- order by 1, 2;
--
-- select relname, relrowsecurity from pg_class
-- where relname in ('order_tracking_events','postal_district_cache');
-- =============================================================================

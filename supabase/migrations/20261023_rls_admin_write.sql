-- Batasi operasi tulis tabel konten, katalog, dan pembayaran ke admin yang login.
--
-- Kenapa bukan "TO service_role" saja:
-- form admin (produk, voucher, payment methods, konten website, biolink, ukuran produk,
-- testimoni) masih menulis langsung dari browser memakai sesi Supabase. Kalau policy
-- diubah jadi service_role saja, form-form itu ikut mati. Policy di bawah memakai
-- "TO authenticated" + cek baris di tabel admins, jadi admin tetap bisa menulis,
-- sedangkan anon (pengunjung tanpa login) tidak.
--
-- Policy SELECT publik yang sudah ada TIDAK disentuh, karena katalog dan halaman
-- publik masih membacanya. Satu pengecualian: voucher_usages, yang berisi nomor
-- WhatsApp pembeli, dibatasi ke admin.
--
-- Jalankan manual di Supabase SQL Editor. Service role tetap melewati RLS, jadi
-- seluruh /api/* yang memakai service role tidak terpengaruh.

do $$
declare
  tbl text;
  pol record;
  admin_check constant text := '(exists (select 1 from public.admins a where a.user_id = auth.uid()))';
begin
  foreach tbl in array array[
    'products',
    'product_variants',
    'product_images',
    'product_series',
    'jenis_kain',
    'payment_methods',
    'vouchers',
    'voucher_usages',
    'bio_links',
    'bio_page_content',
    'bio_carousel_images',
    'size_guide_images',
    'katalog_info_images',
    'testimonials',
    'hero_content',
    'category_images',
    'order_steps',
    'garansi_items',
    'garansi_retur_page',
    'faq_items',
    'marquee_items',
    'trust_badges',
    'featured_products',
    'customer_featured_products',
    'categories',
    'templates'
  ] loop
    -- Hapus semua policy tulis lama, termasuk yang bernama "Service role all ..."
    -- tetapi sebenarnya berlaku untuk public.
    for pol in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = tbl
        and cmd <> 'SELECT'
    loop
      execute format('drop policy %I on public.%I', pol.policyname, tbl);
    end loop;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = tbl
        and policyname = 'Admin write'
    ) then
      execute format(
        'create policy "Admin write" on public.%I for all to authenticated using %s with check %s',
        tbl,
        admin_check,
        admin_check
      );
    end if;
  end loop;
end $$;

-- voucher_usages berisi nomor WhatsApp pembeli, jadi baca publik dicabut.
drop policy if exists "Public read voucher_usages" on public.voucher_usages;
drop policy if exists "Admin read voucher_usages" on public.voucher_usages;

create policy "Admin read voucher_usages" on public.voucher_usages
  for select
  to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- Cek hasil: harus tidak ada policy tulis dengan roles public/anon.
-- select tablename, policyname, roles, cmd
-- from pg_policies
-- where schemaname = 'public' and cmd <> 'SELECT'
-- order by tablename, policyname;

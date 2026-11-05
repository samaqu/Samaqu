-- `products.colors` cover-hanger masih memuat varian lama "Set Hanger + Cover"
-- (is_sellable = false), sehingga halaman detail katalog menampilkan pilihan yang
-- tidak bisa dibeli: tampil "Tersedia" tapi CHECKOUT DITOLAK.
--
-- Perbaikan: samakan `products.colors` dengan varian yang benar-benar dijual.
--
-- Aman diulang: nilainya diganti utuh (idempotent).
-- TIDAK menyentuh stok, varian, product_components, atau data lain.

begin;

update public.products
   set colors = (
     select array_agg(v.color order by v.display_order, v.color)
       from public.product_variants v
      where v.product_id = public.products.id
        and v.is_sellable is true
        and v.color is not null
   )
 where id = 'cover-hanger'
   and exists (
     select 1 from public.product_variants v
      where v.product_id = 'cover-hanger' and v.is_sellable is true
   );

commit;

notify pgrst, 'reload schema';

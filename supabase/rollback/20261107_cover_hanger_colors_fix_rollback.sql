-- Rollback untuk 20261107_cover_hanger_colors_fix.sql
-- Mengembalikan `products.colors` cover-hanger ke nilai lamanya.

begin;

update public.products
   set colors = array['Set Hanger + Cover']::text[]
 where id = 'cover-hanger';

commit;

notify pgrst, 'reload schema';

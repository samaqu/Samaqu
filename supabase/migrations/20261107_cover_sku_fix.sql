-- 1) Perbaiki SKU dobel CVH-CSO (dipakai cover-thobe DAN cover-koko).
-- 2) Pasang aturan unik SKU per tabel supaya tidak terulang.
--
--     products          : CVH-CSO -> cover-thobe = CVH-CTO, cover-koko = CVH-CKO
--     product_variants  : CVH-CSO -> cover-thobe = CVH-CTO, cover-koko = CVH-CKO
--
-- `stock_opname_lines` DIBIARKAN apa adanya: itu arsip historis dan setiap barisnya
-- sudah membawa product_id, jadi tidak ambigu.
--
-- Tidak menyentuh stok, varian lain, product_components, atau data transaksi.

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Rename SKU
--
--    Guard `sku = 'CVH-CSO'` membuat ini idempoten: SKU yang sudah diubah manual
--    (atau migration yang dijalankan dua kali) tidak ditimpa.
-- ═══════════════════════════════════════════════════════════════════════════
update public.products set sku = 'CVH-CTO'
 where id = 'cover-thobe' and sku = 'CVH-CSO';

update public.products set sku = 'CVH-CKO'
 where id = 'cover-koko' and sku = 'CVH-CSO';

update public.product_variants set sku = 'CVH-CTO'
 where product_id = 'cover-thobe' and sku = 'CVH-CSO';

update public.product_variants set sku = 'CVH-CKO'
 where product_id = 'cover-koko' and sku = 'CVH-CSO';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Aturan unik per tabel
--
--    Partial index: hanya baris dengan SKU terisi yang diperiksa, jadi SKU
--    kosong/NULL boleh berapa pun (tidak dianggap bentrok). Perbandingan
--    memakai upper(btrim(...)) supaya "cvh-cto" dan " CVH-CTO " dianggap sama.
--
--    UNIK PER TABEL, bukan lintas tabel: hari ini SKU produk dan SKU variannya
--    memang sama untuk produk 1-varian (CVH-SHC, KBK-BOX, CVH-HSA, KBK-K01).
-- ═══════════════════════════════════════════════════════════════════════════
create unique index if not exists products_sku_uidx
  on public.products (upper(btrim(sku)))
  where sku is not null and btrim(sku) <> '';

create unique index if not exists product_variants_sku_uidx
  on public.product_variants (upper(btrim(sku)))
  where sku is not null and btrim(sku) <> '';

comment on index public.products_sku_uidx is
  'SKU produk unik (tanpa beda kapital/spasi). SKU kosong diabaikan.';
comment on index public.product_variants_sku_uidx is
  'SKU varian unik (tanpa beda kapital/spasi). SKU kosong diabaikan.';

commit;

notify pgrst, 'reload schema';

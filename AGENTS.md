# AGENTS.md â€” running this repo in the Base44 sandbox

Notes that are not obvious from the manifests.

## What this app is

Next.js 16 (App Router, Turbopack dev) + next-intl + Tailwind 4. All data lives in a
**hosted Supabase project** â€” there is no local database, ORM, or migration runner in
this setup. `supabase/*.sql` files are applied manually against the hosted project.

`src/lib/supabase.ts` creates the Supabase client at **module scope**, so
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` must be non-empty or the
whole bundle fails to load. `SUPABASE_SERVICE_ROLE_KEY` is needed at request time by
`src/lib/supabase-admin.ts` (admin/order/cron API routes).

## Run it

```bash
docker compose -f docker-compose.base44.yml up -d --build
docker compose -f docker-compose.base44.yml logs -f web
```

- Only one service (`web`): `node:22`, repo bind-mounted at `/app`, `next dev` on
  `0.0.0.0:3000`, healthcheck probing `http://127.0.0.1:3000/`.
- Dependencies install **inside the container on startup** into the bind-mounted
  `node_modules`, stamped with `node_modules/.base44-lock` (compared against
  `package-lock.json`). Change `package.json`/`package-lock.json` â†’ the next container
  start re-syncs automatically. To force it: `docker compose ... exec web sh -c 'rm node_modules/.base44-lock'` then restart.
- `npm ci` in the repo originally failed (`@swc/helpers` missing from the lockfile);
  `package-lock.json` was regenerated with `npm install` to match `package.json`.
  Re-run `npm install` if the lock ever drifts again.

## Environment / secrets

- `.base44/env.defaults` holds **placeholders** so the app boots before credentials
  exist; it is loaded first in `env_file`.
- Real values come from the platform secret file `/run/base44/app.env`, loaded **last**,
  so they always override the placeholders. Never move a user-supplied key into
  compose `environment:`, and never write secret values into the repo.
- Supabase keys are **required for a meaningful preview**: with placeholders the site
  shell renders (home page falls back to static data) but the catalog (`/katalog`),
  accounts, cart/checkout, orders and admin panel query an unreachable project and come
  up empty. `/katalog` has **no** static fallback â€” an empty product list is the sign
  the Supabase credentials are missing/wrong.
- Optional integrations that degrade silently when unset: Cloudinary (admin image
  upload), RajaOngkir (shipping cost), J&T Express (tariff/order/track), Meta Pixel.

## Media backup (Cloudinary originals)

The Cloudinary account that hosted most media is no longer accessible (its API key/secret
are unknown), so admin image upload is dead while delivery URLs keep working. Copies of
every reachable original live in the Supabase project's **public** Storage bucket
`media-backup` (`image/â€¦`, `video/â€¦`, plus `_manifest.json` mapping original URL â†’
bucket path â†’ table). Re-run a backup with the Supabase REST + Storage APIs
(`/rest/v1/<table>` to find URLs, strip the Cloudinary transform segment to get the
original, then POST `/storage/v1/object/media-backup/<path>`); one-off scripts belong in
`/tmp`, never in the repo. ~64 older URLs on the clouds `dgtixuop0` / `dfxc4ceya` return
401 at source (testimonials, category/`katalog_info`/`size_guide` images, old order
items) â€” unfixable without those accounts; product main images are all intact.

Those dead references were cleaned up on request: 22 gallery rows deleted
(`category_images` 6, `katalog_info_images` 6, `bio_carousel_images` 5,
`size_guide_images` 5), `testimonials.image_url`/`video_url` and
`order_items.product_image` emptied (14 + 36 rows), and `garansi_retur_page` hero/CTA
pointed back at the local `/garansi/*.png` assets. The deleted rows are recoverable from
`_deleted-refs-snapshot.json` in the same bucket.
- The home "Koleksi" grid has static `FALLBACK_CATEGORIES` in
  `src/components/Koleksi.tsx` and uses DB rows only when they exist, so deleting
  `category_images` falls back to `public/images/*.png` rather than an empty section.

## Static assets under public/

`src/middleware.ts` runs the next-intl locale redirect for every path except the
prefixes listed in its `matcher`, so **each folder in `public/` must be listed there**.
`/garansi/*` was missing: `/garansi/hero-web.png` was redirected to
`/id/garansi/hero-web.png` â†’ 404, which is why the garansi page's own default images
never loaded. Exclude with a trailing slash (`garansi/`) so bare `/<folder>` routes that
start with the same word â€” `/garansi-retur` must still redirect to `/id/garansi-retur` â€”
keep working.

## Sandbox-only overrides

- `next.config.ts` appends `allowedDevOrigins: ['3000-' + BASE44_PUBLIC_HOST_SUFFIX]`
  **only when `BASE44_PREVIEW_MODE === '1'`**, because the preview proxies the dev
  server through a different origin and Next otherwise rejects cross-origin dev
  asset/HMR requests (403). Unset/none â†’ identical config to upstream.
  Verify: a `GET` on a `/_next/static/chunks/...` URL with
  `Origin: https://3000-$BASE44_PUBLIC_HOST_SUFFIX` must return 200.

## i18n layout (root vs locale)

`src/app/layout.tsx` is the App Router root layout: it renders `<html>`/`<body>` (fonts,
metadata, JSON-LD) and wraps children in `<Providers>`. `src/app/[locale]/layout.tsx` must
therefore **not** render it again â€” it only mounts `NextIntlClientProvider` around `children`.

Rendering `<RootLayout>` from the locale layout nests `<html>` inside `<body>` (browser
hydration error) and mounts every provider twice (cart, toast, locale, and â€” the visible one â€”
`MetaPixelProvider`, i.e. a duplicate pageview). The root layout has to keep the html shell
because top-level `/admin` (excluded from the locale middleware) also renders under it. Verify
a change here by counting tags in the SSR output: `curl -s .../id/open-order | grep -c '<html'`
must be `1`.

## Rich text messages (i18n)

next-intl 4 treats `<tag>` inside a message as ICU rich text. Reading such a message with
plain `t()` throws and falls back to the raw key (logged as `FORMATTING_ERROR` /
`INVALID_MESSAGE`), which is how the home, about and Sama Quran pages ended up rendering
key names. Rules that now hold:

- HTML in a message must use **closed** ICU tags â€” `<br></br>`, `<span>â€¦</span>`. A
  self-closing `<br/>` is passed through as literal text, and tag **attributes** are
  rejected outright (`INVALID_TAG`), so styling is re-applied by the handler.
- Read such a message with `t.markup(key, { tag: (chunks) => "<tag>â€¦</tag>" })`; it returns a
  string for `dangerouslySetInnerHTML`. Sites: `CaraPemesanan` (`subtitleLead` + `subtitle`),
  `SamaQuran` (`perjalananTitle`, `values.*`), both `tentang-kami` pages (`storyP1`).
- `useSafeTranslations`' no-provider fallback mirrors `markup`/`rich`/`raw`, so callers keep
  working (and type-checking) when `NextIntlClientProvider` isn't mounted.

## Verify

```bash
curl -s -o /dev/null -w '%{http_code}\n' -L http://localhost:3000/     # expect 200 (redirects to /id)
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/id/katalog # expect 200, and product cards in the browser
# If a route that just worked starts returning 404 right after the container is
# recreated, the bind-mounted .next Turbopack cache has gone stale â€” `docker compose
# -f docker-compose.base44.yml restart web` restores it (no code change needed).
docker compose -f docker-compose.base44.yml ps                          # web must be (healthy)
```

## Open Order (alur pesanan Create Your Price)

The old Google Form ("OPEN ORDER SAMAQU â€” Create Your Price") is now a **6-step wizard** on
**/open-order**: daftar produk â†’ detail produk â†’ keranjang â†’ data pemesan â†’ review â†’ pesanan
berhasil, all inside one client component (`src/app/[locale]/(customer)/open-order/page.tsx` is
a thin wrapper around `src/components/open-order/OpenOrderWizard.tsx`). The wizard owns all the
state (cart lines, product draft, customer data, J&T ongkir, submit) and renders one focused
component per step: `StepCatalog`, `StepProduct`, `StepCart`, `StepCustomer`, `StepReview`,
`StepSuccess`, plus the `ui.tsx` primitives and `types.ts`. `OpenOrderForm.tsx` and
`OpenOrderProducts.tsx` were deleted â€” do not resurrect them.

Presentation follows the **katalog** look (cream `--cream`, espresso `--espresso`, gold `--gold`,
Cormorant serif headings) â€” on request the wizard was switched off the earlier monochrome style.
The palette lives once in `src/components/open-order/ui.tsx` (`INK`/`MUTED`/`LINE`/`FIELD_BG`/`GOLD`,
plus `Chip`, `Counter`, `PrimaryButton`, â€¦), so a colour change belongs there, not in each step;
step components pass those tokens via inline styles. `StepCatalog` cards mirror the katalog
`ProductCard` (cream-bright card, 3/4 image, serif name, gold "Kain â€¦", outlined "Lihat Detail"
button) and `StepProduct` mirrors the katalog detail page (gold "Detail Produk" eyebrow, serif
title, "Pilih Series / Warna / Ukuran" chip rows, cream "Harga Minimum" card). Indonesian copy is
hardcoded inside the step components and is not part of the i18n flow (the now-unused `openOrder`
keys are still in `src/i18n/messages/{id,en}.json`).

The offering is **derived from the catalog `products` table**, not written by hand. Sejak
**2026-10-14**, Open Order dijadikan seperti pesanan biasa: **semua baris katalog yang kolom
`products.open_order_enabled`-nya true** (default true, jadi produk baru & lama ikut â€” admin
tinggal mematikan lewat form Produk atau daftar di menu admin "Open Order") tampil di
`/open-order`, **lintas kategori** (Thobe, Kandora, Koko, Vest, Kabak, Cover & Hanger) â€” bukan
cuma Thobe â€” dan penjualannya **memotong stok** yang sama dengan menu Produk.

`src/lib/open-order-offering.ts` â†’ `buildOpenOrderProducts(rows, stockRows)` mengelompokkan baris
per **produk utama** (`category::name`) â€” sama seperti kartu di halaman Katalog, jadi produk Thobe
dengan beberapa series tetap satu kartu â€” lalu tiap grup membawa `colors`, `series` (boleh
kosong), harga terendah, dan **peta `variants` ke baris `products` asli**: `{ color, label,
series, productId, sizes, media }`, dengan `sizes` dari `product_variants`. `color` adalah warna
varian asli (nilai yang dipakai stok & dikirim ke API); `label` adalah nama tampilannya â€” untuk
Thobe, yang tersimpan cuma `default`, jadi labelnya diambil dari **nama** produk
(`"Thobe Navy"` â†’ `Navy`). Satu baris katalog = satu kombinasi warna Ã— series, jadi mengubah
harga/menambah warna di katalog sudah cukup â€” tanpa edit kode. The input type
`OpenOrderCatalogRow` is structural, so the same function serves the client (from `getProducts()`,
which embeds `jenis_kain(*)`, plus a `product_variants` read for the sizes) and the API route
(admin client, same reads) â€” id produk grup diambil dari baris **terlama** (urutan
`created_at` menaik, sama di klien dan server).

Hanya data non-katalog yang tetap statis di `src/lib/open-order-config.ts`: `OPEN_ORDER_PERIOD`,
`OPEN_ORDER_ADDON` (Cover & Hanger) price/weight, dan `OPEN_ORDER_SIZES` â€” daftar ukuran Sâ€“XXL kini
hanya **cadangan** kalau baris varian tidak punya ukuran; daftar normalnya datang dari
`product_variants`. Berat kirim produk diambil dari baris katalog. Client prices are never trusted
(see the API notes below). `src/lib/open-order-catalog.ts` holds the shared display helpers:
`money`, `priceRange`, `openOrderImage`/`openOrderGallery` (foto per warna+series dari varian),
dan `openOrderVariants(products)` â€” satu kartu per produk Ã— warna, which is what the step-1 grid
renders, difilter dengan chip **kategori**.

Step 2 (detail produk) shows the **real catalog photos**, not the single thumbnail:
`openOrderGallery(product, color, series)` membaca media varian (baris `products` asli untuk
kombinasi warna + series terpilih, mis. `thobe-navy-bayati`, dengan `images`-nya sendiri) dan
merendernya urut seperti galeri detail katalog, minus video. Selector **series hanya muncul kalau
produknya punya series**, kartu **Create Your Price hanya muncul kalau produknya mengaktifkannya**
(kalau tidak, harga tetap dan tidak ada input), dan chip **ukuran** datang dari `sizes` varian.
Switching a warna or series chip swaps the gallery and resets it to the first photo â€” dan kalau
ukuran terpilih tidak ada di varian baru, otomatis pindah ke ukuran pertama yang tersedia.

Submissions POST to **`/api/open-order`** (`src/app/api/open-order/route.ts`; the `[locale]/api`
duplicate was removed on 23 October 2026 - the live API is the one under `src/app/api/`)
`products` (+ `jenis_kain`) dan `product_variants` with the admin client, rebuilds the offering via
`buildOpenOrderProducts()` and re-validates product/color/series/size/quantity and the price floor
against it (client prices are never trusted), lalu **memotong stok** dulu (lihat bagian stok di
bawah), baru menulis baris biasa ke **`orders` + `order_items`**, so they appear in the
existing admin dashboard (`/[locale]/admin`, "Pesanan" tab) with the normal status flow:

- `order_number` uses the prefix **`CYO-`** (`SMQ-` = website checkout) â€” that is how the two
  kinds of order are told apart in the admin list,
- `shipping_method` = `J&T - <service>` and `shipping_cost` = the J&T tariff for the customer's
  kecamatan (see the ongkir note below); it falls back to `manual` / 0 when kecamatan is empty
  or the J&T call fails, and then the admin arranges shipping later,
- `payment_method` `bank` (legacy value, renders as "Transfer Bank"),
- `status` `pending` dan **`stock_reserved` `true`** (sejak 2026-10-14) â€” penanda bahwa pesanan ini
  sudah memotong stok, dipakai jalur pembatalan & penghapusan supaya stok hanya dikembalikan
  sekali (lihat `src/lib/cancel-order.ts`),
- `shipping_notes` = `IG @username Â· <customer note>` (each part only
  when filled) â€” the admin order detail renders that as "Catatan", which is where the Instagram
  handle is read. The wizard no longer asks for Instagram (the reference flow has no such
  field), so `instagram` is **optional** in the route and `shipping_notes` holds just the
  customer note,
- `shipping_postal_code` is filled from the wizard's "Kode Pos" field (the orders table already
  had the column),
- `order_items.product_id` = **id baris `products` asli** (dulu kode kain) dan `order_items.size`
  divalidasi terhadap **ukuran varian** yang benar-benar ada di baris itu (fallback
  `OPEN_ORDER_SIZES` hanya kalau variannya tidak punya ukuran). `kain` tetap diisi kalau barisnya
  punya jenis kain,
- **Create Your Price**: the wizard's detail step sends the customer's chosen `price` per item.
  The route clamps it to the selected series' catalog minimum price (`price = max(minimum, client price)`,
  so a client can never go below the minimum) and stores `price` + `customer_price` = that
  value with `minimum_price` = the series/product minimum â€” exactly the pair the admin order detail
  already renders as `Min: â€¦ Â· Dipilih: â€¦`. Kalau produknya **tidak** mengaktifkan CYP, harga dari
  client diabaikan total (dipakai harga katalog) dan kedua kolom CYP diisi `null`. The add-on row
  keeps both columns `null`,
- the Cover & Hanger add-on is one extra `order_items` row (`product_id` `addon-cover-hanger`),
  toggled in step 3 (keranjang) â€” the wizard has no add-on page section.

**Stok (sejak 2026-10-14)** â€” Open Order memotong stok yang sama dengan menu Produk, persis
checkout website (`/api/orders`): stok dikurangi DULU secara atomik lewat `samaqu_decrement_stock`
(per baris `products` asli + warna + ukuran); kalau ada satu item gagal / stok kurang, semua
decrement di-rollback (`samaqu_restore_stock`) dan pesanan ditolak **400** dengan pesan jelas â€”
jadi item lain tidak ikut terpotong. Kalau insert order/order_items gagal setelah stok terpotong,
stok juga di-rollback. Pembatalan mengembalikannya lewat `cancelOrderCompletely()`. Item tanpa
warna/ukuran (`color` kosong atau `-`) dilewati, sama seperti `/api/orders`. Kolom `stock_reserved`
yang membedakan CYO lama (tidak pernah memotong stok â†’ tidak dikembalikan) dari CYO baru.

Ongkir (J&T shipping): the form asks for **Kecamatan**; once ~3+ chars are typed the client
debounces 1s and POSTs `{ city, district, weight }` to **`/api/shipping/jnt-cost`** (the same
J&T Tariff API the checkout uses, via `src/lib/jnt/*`), keeps the cheapest service and shows it
as the `Ongkir` line that feeds the bottom `Total`. Weight counts the current lines at each
product's catalog `weight` Ã— qty, plus 300 g for the Cover & Hanger add-on, min 300 g. The picked method/cost ride
along in the POST body as `shipping: { method, cost }`; `/api/open-order` does **not** re-verify
the tariff (same trust model as `/api/orders`) â€” it only clamps the cost to â‰¥ 0 and folds it into
`total`. J&T credentials are **required for a price**: `JNT_TARIFF_KEY` + `JNT_TARIFF_CUS_NAME`,
and the route also gates on `JNT_ORDER_USERNAME`. Without them the route answers **200** with
`{ data: [], configured: false, error: "J&T API belum dikonfigurasi" }` â€” a missing credential is a
normal state, not a server failure, so the log stays free of a 500 (and of one `console.error` per
keystroke) while the `error` field is kept so the checkout callers behave exactly as before; the route
logs a single `console.warn` per process. `OpenOrderWizard` detects `configured: false` and shows the
fallback message with the ongkir line at `â€”` without a `console.error` (the order still submits,
admin prices shipping later) â€” that is the state of this sandbox: no J&T credential is stored, so
live tariffs stay off until credentials are supplied â€” sekarang admin bisa mengisinya sendiri lewat
form di Pengaturan (lihat "Kredensial J&T Express (form admin)" di bawah). Nilai J&T **testing**
yang dulu dipakai app ini ada di commit `e48a6fe`; nilai asli tidak boleh masuk repo. `JNT_ENV`
defaults to `testing`, dipakai selama kolom `env` di `jnt_settings` masih kosong.

No new table: the hosted Supabase project has **no DDL path** from the sandbox, so a new table
would have needed the user to run SQL by hand. Verified dead ends with the stored credentials:
`SUPABASE_SERVICE_ROLE_KEY` **cannot** run DDL â€” `/pg/query` and `/pg/meta/query` are 404
("requested path is invalid") and there is no `exec_sql` RPC (`PGRST202`), and PostgREST offers
no DDL verb at all. Running SQL from the sandbox needs a Supabase **Management API** personal
access token (`sbp_â€¦`, sent as `Authorization: Bearer` to
`https://api.supabase.com/v1/projects/<ref>/database/query`, ref = the subdomain of
`NEXT_PUBLIC_SUPABASE_URL`) or the project's **database password** for a direct Postgres
connection; neither ships with this app. Don't re-probe the service-role key for DDL.

Page presentation (not obvious from the code):

- The page still renders **without the navbar**: `src/app/[locale]/(customer)/layout.tsx` skips
  `<Navbar />` for path suffixes in `NAVBAR_HIDDEN_SUFFIXES` (`/open-order`). The wizard brings
  its own sticky header instead (step title, `n/6` counter, progress bar, close â†’ `/` on step 1
  and a back chevron after that) â€” the old espresso/gold hero is gone.
- Steps 2â€“5 render in a centred `max-w-2xl` column; step 1 (the product grid + fabric filter
  tabs) uses the full `max-w-5xl` width.
- Step 4 (data pemesan) picks the destination from RajaOngkir via
  `src/components/open-order/LocationPicker.tsx` â€” Provinsi â†’ Kota/Kabupaten â†’ Kecamatan, fed by
  `/api/shipping/provinces` + `/api/shipping/districts` (the province/city/district lists are
  cached in Supabase `shipping_cache` and do load in this sandbox, key from `store_settings`
  falling back to `RAJAONGKIR_API_KEY`). The picker stores the RajaOngkir **names** in
  `customer.city` / `customer.district`, so ongkir no longer depends on the customer's spelling.
  If the lists can't be loaded it falls back to the old plain Kota + Kecamatan text inputs, so the
  order still submits; the same debounced `/api/shipping/jnt-cost` call and the same graceful
  `configured: false` fallback (`Ongkir â€”`) apply either way. Langkah 4 juga menampilkan **baris
  Ongkir** sendiri (label service + harga, `Menghitungâ€¦` selagi menunggu, `â€”` + catatan saat gagal)
  tepat di bawah Kode Pos â€” nilainya dari state wizard yang sama dengan langkah 5, jadi terhitung
  sekali. Sebelum wilayah dipilih, barisnya `â€”` dengan petunjuk singkat memilih provinsi/kota/kecamatan.
- The period line under the title comes from `store_settings.open_order_period`, diatur di menu admin
  **Open Order** dan dibaca lewat `useStoreSettings()` (`StepCatalog` merendernya sebagai `Periode â€¦`).
  `OPEN_ORDER_PERIOD` di `src/lib/open-order-config.ts` ("8-15 Agustus 2026") kini hanya **nilai
  default/fallback** â€” dipakai selama kolomnya kosong.
- The **Extra Cover & Hanger** row in step 3 follows the catalog look: a cream card with a thin
  gold spine on the left edge (grows to full height on hover), a sans-serif espresso name and
  price (on request, matched to the cart lines / summary rows), a gold uppercase caption, and a round gold ring that fills with a check while the
  add-on is selected (`is-on` class). Its CSS is scoped in `StepCart.tsx` (the `ADDON_CSS` string
  rendered in a `<style>` tag) instead of being added to the shared `ui.tsx` tokens, because the
  ornament is used nowhere else; the row is still the same toggle button (click selects/deselects)
  and only its appearance changed. The summary box below it lists the item lines, an `Extra Cover &
  Hanger` line while the add-on is selected, and a `Total` (subtotal + add-on) so toggling the card
- **Halaman detail pesanan akun** (`/[locale]/akun/pesanan/<order_number>`) memakai tata letak rincian
  pesanan ala marketplace (latar abu terang `#F5F6F7`, kartu putih radius 12, aksen terracotta `#B4552F`):
  renderernya satu komponen klien `src/components/akun/RincianPesanan.tsx` (CSS scoped dengan awalan `rp-`
  di dalam komponen itu, mengikuti pola `ADDON_CSS` di `StepCart.tsx`), sementara file route hanya
  mengambil pesanan lewat `getCustomerOrders()` lalu merendernya. Urutan bloknya: banner status â†’ "Info
  Pengiriman" â†’ "Alamat Pengiriman" (alamat dipotong 2 baris + tombol "Lihat") â†’ kartu produk (baris
  `Total Pesanan` dibuka untuk Ringkasan Pembayaran) â†’ "Status Pesanan" yang dilipat (`<details>`) â†’
  tombol "Lacak Pesanan" lengket di atas nav bawah (`bottom: var(--mobile-nav-h)`); untuk pesanan
  `pending`/`diproses` ada tombol sekunder **"Batalkan Pesanan"** (putih, teks merah) di bawahnya â†’
  `POST /api/orders/cancel` lewat `ConfirmModal`, dan setelah berhasil statusnya ditimpa lokal jadi `dibatalkan`.
  Blok "Butuh Bantuan?" (Garansi & Pengembalian / Hubungi Admin / Panduan Ukuran) sudah **dihapus**
  atas permintaan pemilik â€” jangan ditambahkan lagi di halaman ini.
  Di **desktop** halaman ini jadi satu lembar **"Struk Hangat"**: `.rp-wrap` dibatasi `max-width:600px`
  dan terpusat, latar halaman dibiarkan transparan (krem milik `AkunShell`) sehingga yang tampak hanya
  kertas struknya. Pembungkus `<div className="rp-sheet">` membalut banner â†’ kartu-kartu â†’ aksi:
  **mobile** `display:contents` (tata letak lama persis sama), **desktop** jadi satu lembar krem
  (`#FFFDF8`, border `#EFE6D9`, radius 16, shadow lembut) dengan pemisah antar-blok berupa garis
  putus-putus (`#E7DCCB`) ala struk; kartu di dalamnya dibuat transparan tanpa border
  (`.rp-card{background:none;border:0}`), ringkasan pembayaran memakai krem `#FCF8F1`, dan teks
  sekunder dihangatkan (`#7E746B`). Aturan pemisah harus ditulis **terakhir** di blok `@media` supaya
  menang atas `.rp-card{border:0}`. Breakpoint `<768px` tidak berubah (mobile identik).
  Halaman ini **tidak lagi memakai `STRUK_CSS`/`StrukHeader`** (keduanya masih dipakai halaman lacak â€”
  jangan hapus, dan perbaikan gaya halaman lacak terpisah). Foto produk memakai `order_items.product_image`
  dengan `object-fit: contain` di atas kotak abu muda **tanpa bingkai/lis** (permintaan pemilik: lis emas
  lama jelek, dan foto tidak boleh terpotong), dengan `FALLBACK_PHOTO` (aset Base44) kalau kolomnya kosong â€”
  banyak `order_items` lama memang menyimpan `product_image` NULL. Blok "Info Pengiriman" memanggil
  `/api/jnt/track` sekali (hanya bila ada resi) untuk baris update terakhir. Header halaman lama
  (`AkunHeader` dari `AkunShell.tsx`) masih dipakai halaman akun lain, jadi jangan ubah gaya globalnya
  untuk halaman ini.
  visibly changes the amount; ongkir is added in step 5 (review) â€” dan sudah tampil juga sebagai
  baris tersendiri di langkah 4, tepat di bawah Kode Pos.
- **Checkout Open Order wajib punya akun**: langkah 4 adalah gerbangnya. Kalau belum ada sesi
  customer, langkah 4 merender `StepAuth` (masuk/daftar **inline** â€” bukan redirect â€” supaya
  keranjang & data yang sudah diisi di state wizard tidak hilang) dan judul header jadi
  "Masuk / Daftar"; sesi dibaca sekali saat `OpenOrderWizard` mount lewat `getCurrentCustomer()`.
  Setelah masuk/daftar, form data pemesan langsung tampil terisi nama + WhatsApp dari akun (hanya
  field yang masih kosong) dan judul kembali "Data Pemesanan". Kalau project Supabase meminta
  verifikasi email, `signUp` tidak menghasilkan sesi: `StepAuth` pindah ke tab Masuk sambil
  menampilkan pesan cek email.
- `/api/open-order` **menolak** request tanpa sesi (`401`; header `Authorization: Bearer
  <access_token>` diverifikasi `supabaseAdmin.auth.getUser`) dan menolak sesi yang bukan akun
  pelanggan (`403`, dicek dari baris `customers` â€” `orders.customer_id` ber-FK ke tabel itu, jadi
  insert-nya akan gagal kalau tidak dicek). Order disimpan dengan `customer_id` +
  `customer_email` **dari token**, bukan dari body â€” order `CYO-` jadi muncul di `/akun/pesanan`.
  (Order checkout website lama maupun baru masih `customer_id: null`; itu di luar cakupan gerbang
  ini.)
  Sebelum gerbang `customers` ini ada, akun auth tanpa baris `customers` membuat insert `orders`
  gagal `23503` (FK `orders_customer_id_fkey`) â†’ `500`. Sekarang kasus itu berhenti di `403`:
  pernah ada **satu akun lama** (dibuat 2026-07-25) yang tidak punya baris `customers`, jadi
  `403` di log bukan tanda gerbangnya rusak â€” cek dulu `GET /rest/v1/customers?id=eq.<uid>`.
- The admin **Pesanan** panel splits the list into sub-tabs **Pesanan Website** / **Open Order**
  (`orderSource` state): Open Order rows are the `CYO-` numbers, everything else is the website
  checkout, and the status chips (Semua/pending/diproses/selesai) filter inside the selected tab.
  Kedua route dashboard admin â€” `/admin` (`src/app/admin/page.tsx`, di luar prefix locale lewat
  `src/middleware.ts`) dan `/id/admin` â€” kini merender **satu komponen yang sama**:
  `src/app/[locale]/admin/page.tsx` cuma `export { default } from "@/app/admin/page"`. Dulu file itu
  salinan penuh dan sudah drift (kartu Pengaturan tidak ikut tersalin), jadi cukup ubah
  `src/app/admin/page.tsx`. **Subhalaman** admin lain (`voucher`, `open-order`, `testimoni`,
  `ukuran-produk`, dll.) masih punya salinan locale sendiri dan tetap perlu diedit di dua tempat â€”
  kecuali **`produk/tambah`**, yang juga sudah jadi satu komponen bersama
  (`src/components/admin/ProductForm.tsx`, lihat "Form tambah produk admin" di bawah).
  **Drawer detail pesanan** kedua dashboard memakai komponen bersama
  **`src/components/admin/OrderDetailDrawer.tsx`** â€” panel meluncur dari kanan, pola yang sama dengan
  `ProductDetailDrawer` (`ODR_CSS`, kelas `odr-`, lebar 520 px / penuh di mobile). Isinya satu
  komponen bersama **`src/components/admin/OrderDetailContent.tsx`**, yang memakai susunan & gaya
  halaman detail pesanan customer: banner status berwarna â†’ "Info Pengiriman" (kurir + **Nomor
  Resi J&T**) â†’ **"Metode Pembayaran"** â†’ "Alamat Pengiriman" â†’ kartu produk + baris "Total
  Pesanan" yang dilipat â†’ "Status Pesanan" (linimasa `strukSteps`) â†’ aksi. **Nomor resi dan metode
  pembayaran sengaja jadi blok yang selalu terlihat** (permintaan pemilik: "kok resi-nya ilang",
  "harusnya tampil metode pembayaran") â€” dulu keduanya hanya ada di dalam ringkasan "Total Pesanan"
  yang terlipat dan resi cuma ditempel di belakang nama kurir (`J&T - EZ: JOâ€¦`), jadi terbaca
  seperti hilang. **Resi J&T tidak lagi terisi otomatis saat pesanan masuk** â€” admin yang
  menerbitkannya lewat tombol **"Atur Pesanan"** di blok aksi drawer (lihat "Atur Pesanan" di
  bawah); resi kosong di drawer berarti pesanan itu memang belum diatur, bukan field-nya yang
  dibuang; halaman detail customer (`RincianPesanan.tsx`) tidak ikut diubah. Header drawer (nomor pesanan + tanggal + tombol X) hidup di
  `OrderDetailDrawer.tsx` saja; nomor pesanan memakai font UI admin (dulu serif Cormorant di header
  modal â€” permintaan pemilik: "samain kaya yg lain biar seragam"). Drawer tertutup lewat X, klik
  latar, atau `Escape`, dan `z-index`-nya **50** supaya `ConfirmModal` (Hapus Pesanan / Batalkan
  J&T, juga z-50 tapi dirender setelah drawer) tetap tampil di atasnya. Gaya/DOM-nya dipinjam dari
  `RincianPesanan`: kelas `rp-`,
  `RINCIAN_CSS`, dan `FALLBACK_PHOTO` **diekspor dari sana** â€” ubah salah satunya, halaman customer
  dan drawer admin ikut berubah (itu yang diinginkan: satu sumber gaya). Kontrol khusus admin
  (chip "Ubah Status", WhatsApp, Cetak Label, Batalkan J&T, Hapus Pesanan) memakai kelas `od-` di
  `OD_CSS` file yang sama. Perbedaan yang disengaja dari halaman customer: baris item tetap memakai
  `Kain <kode> Â· <series> Â· <warna> Â· <size> Ã— <qty>` (warna `default` disembunyikan) dengan
  `Min: â€¦ Â· Dipilih: â€¦` untuk Open Order, ditambah baris Email + Catatan di blok alamat. Tombol
  **Lacak Paket** (dulu drawer sengaja tidak memanggil `/api/jnt/track`) sekarang ada di blok aksi â€”
  lihat "Lacak paket di drawer pesanan & status selesai otomatis" di bawah.
  `order_items` di query kedua dashboard menyertakan `product_image`
  untuk thumbnail (object-fit contain, tanpa bingkai). Perubahan lain pada panel Pesanan tetap harus
  dikerjakan di kedua file.
  **Di bawah breakpoint `lg` daftar pesanan tidak memakai tabel**: kedua dashboard merender
  `src/components/admin/OrdersMobileList.tsx` â€” kartu ala Shopee: nomor pesanan + **pill tahap**
  (dihitung sendiri oleh komponen dari `src/lib/order-flow.ts`, bukan prop `renderStatus` yang dulu),
  nama pelanggan, `tanggal Â· total`, lalu **baris pengiriman** (ikon truk + kurir + nomor resi;
  "Resi belum dibuat" disorot oranye untuk tahap Perlu Dikirim). Badan kartunya jadi tombol yang
  membuka drawer detail (dengan chevron) bila prop `onSelect` diberi; kartunya **tanpa tombol
  aksi** â€” prop `renderActions` (dan `renderStatus` sebelumnya) sudah dihapus, karena semua aksi
  pesanan hanya boleh ada di drawer detail (lihat "Aksi hanya di drawer detail" di bawah). Komponen itu menyembunyikan dirinya sendiri di `lg` (`lg:hidden`),
  sedangkan `<table>`-nya tetap di dalam pembungkus `overflow-x-auto` yang sama dan cukup diberi
  `hidden lg:table` â€” jangan menambah pembungkus kedua (dua root elemen di dalam ternary
  `{loading ? â€¦ : ( â€¦ )}` menghasilkan parse error JSX "Expected '</', got 'ident'"). Tombol aksi
  berada **di luar** tombol badan kartu (button bersarang = HTML tidak sah), dan baris tab tahap
  memakai `flex-wrap` supaya "Dibatalkan" tidak terpotong di layar ~370 px.
  **Tata letak drawer detail di mobile** (permintaan pemilik: "kurang rapih, bikin lebih responsif",
  lalu "pastikan responsif di mobile"): `ODR_CSS` membuat drawer selebar penuh di bawah 768 px
  (header lebih rapat, `padding:14px 16px`) â€” breakpoint-nya sengaja sama (768 px) dengan breakpoint
  "struk" di `RINCIAN_CSS`; `OrderDetailContent`'s `OD_CSS` menambahkan override `max-width:767.98px`
  yang **hanya** berlaku di dalam drawer: `.od-root .rp-root` jadi transparan (latar abu `#F5F6F7`
  milik halaman customer dibuang, kalau tidak ada blok abu di dalam lembar drawer), banner status
  menempel di bawah header drawer (`margin-top:0` + radius 0), chip "Ubah Status" jadi grid 2Ã—2 dan
  tombol aksi jadi baris penuh (flex-wrap membuat 3 chip + 1 dan tombol berlebar pincang). Yang
  Sejak 2026-10-11 (permintaan pemilik: "drawer di detail pesanan jadi jelek, terlalu lebar,
  bagusan yg sebelumnya, biar modern") drawer â‰¥768 px jadi **520 px** dan **isi struk mengisi lebar
  drawer**: dulu panelnya 640 px sementara `RINCIAN_CSS` membatasi `.rp-wrap` ke 600 px terpusat,
  jadi ada sisa 20 px krem di kiri-kanan yang membuat panel terasa lebar & seperti dua lapis krem
  bertumpuk. Override-nya di blok `@media (min-width:768px)` `OD_CSS`: `.od-root .rp-wrap{max-width:none}`
  + `.od-root .rp-sheet{background:transparent;border:0;border-radius:0;box-shadow:none}` (panelnya
  sendiri yang jadi "kertas", latar `#FFFDF8`, overlay diberi `backdrop-filter:blur(3px)`).
  Jangan menyentuh `RINCIAN_CSS` untuk ini â€” lembar struk 600 px itu masih dipakai halaman detail
  pesanan customer. Verifikasi (sesi admin diputar ulang): `preview_screenshot({path:'/admin'})` â†’
  panel Order Management â†’ tombol **Detail** â†’ `.odr-panel` harus `width:520px`, `.rp-wrap`
  `max-width:none`, `.rp-sheet` border/radius `0px`, tanpa error console, dan di 375 px drawer
  100% tanpa scroll samping.
- **Dashboard akun** (`/[locale]/akun`, `src/app/[locale]/akun/page.tsx`) ditata ulang untuk mobile:
  baris "Pesanan Terakhir" = satu baris atas (thumbnail, nama pesanan + `#nomor Â· tanggal` yang
  dipotong `truncate` satu baris, chevron rata tengah) lalu satu baris penuh di bawahnya berisi
  harga + pill status yang rata dengan tepi kartu (blok `sm:hidden`; pasangan `hidden sm:block`
  dengan kolom kanan harga/pill mempertahankan tata letak desktop persis seperti sebelumnya).
  Kartu "Akses Cepat" menumpuk ikon (36 px) + chevron di baris atas dengan judul + subteks
  didorong ke bawah lewat `mt-auto`, dan `min-h-[112px]` menjaga keempat kartu sejajar walau
  judulnya membungkus dua baris di layar ~370 px.
- **Sidebar akun (desktop) harus muat tanpa scroll** (permintaan pemilik: "harusnya ngga ada scroll
  di menunya, bikin responsif di semua ukuran") â€” sama seperti sidebar admin yang lebih dulu
  dirapatkan. `AkunShell`'s `<aside>`: `<nav>` memakai **`min-h-0`** (tanpa itu flex item tidak bisa
  mengecil dari isinya, jadi menu luber dan scrollbar muncul) + kelas `akun-side-nav` / `-brand` /
  `-group` / `-item` / `-foot`, dan blok CSS di `src/app/globals.css` yang (a) menyembunyikan
  scrollbar nav (`scrollbar-width: none` + `::-webkit-scrollbar{display:none}`) dan (b)
  merapatkan jarak vertikal lewat kueri `max-height` 820 / 700 / 600 / 520 px (di bawah 520 px
  label grup disembunyikan). Lebar & warna sidebar tidak berubah, dan semua halaman `/akun/*`
  ikut karena semuanya memakai shell yang sama. Kueri itu di luar `@layer` Tailwind, jadi
  menang atas utility `py-*` (jangan dipindah ke dalam layer).
  **Tidak bisa diverifikasi lewat preview**: `/akun/*` butuh sesi **customer**, sedangkan sesi
  yang diputar ulang preview adalah sesi **admin** â†’ selalu mendarat di `/akun/login`. Uji manual:
  masuk sebagai customer di `/id/akun`, lalu kecilkan tinggi jendela (â‰¤700 px, lalu â‰¤600 px) dan
  pastikan tidak ada bar di menu.
- **Nav bawah ala aplikasi (mobile)** di semua halaman toko: `src/components/MobileBottomNav.tsx`
  (Beranda Â· Kategori Â· Open Order Â· Pesanan Â· Akun) dipasang oleh
  `src/app/[locale]/(customer)/layout.tsx` dan tampil di bawah breakpoint `lg` â€” sama dengan navbar
  atas yang beralih ke drawer di sana. Tingginya satu variabel CSS, `--mobile-nav-h`
  (`src/app/globals.css`: 0 px di desktop, 62 px di bawah 1024 px); layout memakai variabel itu untuk
  padding bawah halaman, dan tiga halaman yang punya bar aksi bawah sendiri (keranjang, checkout,
  detail produk) menggeser bar-nya dengan `bottom-[var(--mobile-nav-h)]` supaya tidak bertumpuk.
  Elemen mengambang ikut aturan itu: tombol WhatsApp `AutoCTA` (hanya dipasang di beranda) memakai
  `bottom-[calc(var(--mobile-nav-h)_+_1.5rem)]` â€” dengan `bottom-6` tombolnya menutupi menu "Akun".
  Route group `src/app/(customer)/` (tanpa locale) sengaja tidak disentuh â€” middleware me-redirect
  semua path toko ke `/<locale>/â€¦`, jadi pohon itu tidak terpakai.
- **Jendela Open Order diatur dari dashboard admin** (dulu hardcode `OPEN_ORDER_PERIOD`).
  Menu sidebar **Open Order** â†’ `/admin/open-order` (+ salinan `/id/admin/open-order`); kedua route
  hanya merender `src/components/admin/OpenOrderSettingsForm.tsx` di dalam `AdminShell` â€” formulirnya
  **satu file** supaya dua halaman itu tidak dobel. (Entri sidebar-nya sendiri masih perlu ada di
  `AdminShell`'s `navGroups` **dan** di sidebar dua dashboard admin, karena masing-masing punya sidebar.)
  **Grup & urutan menu wajib identik di kedua sidebar** (`AdminShell`'s `navGroups` dan `navGroups`
  di `src/app/admin/page.tsx`): kalau tidak, menu terlihat "berubah urutan" begitu admin membuka
  salah satu subhalaman. Sejak permintaan pemilik 2026-10-11 ("rapihin menu, yg bisa digabung
  gabungin aja, terus Open Order pindahin ke atas di bawah Order Management") kedua sidebar punya
  **tiga grup yang sama**: **Menu Utama** (Dashboard Â· Order Management Â· **Open Order** Â· Produk Â·
  Pelanggan), **Konten** (Konten Website Â· Biolink Â· Foto Carousel Â· Testimoni Â· Panduan Ukuran Â·
  Halaman Garansi &amp; Retur), dan **Lainnya** (Voucher Â· Pengaturan). Grup "Biolink" lama
  dibubarkan â€” Biolink/Foto Carousel pindah ke "Konten", dan "Open Order" naik tepat di bawah
  "Order Management". Di dashboard `navGroups` sekarang menyatukan item panel (`panel: Panel`) dan
  item halaman (`href: string`) â€” pakai pola itu saat menambah menu.
  Sejak 2026-10-11 item panel di **`AdminShell`** mengarah ke **`/admin?panel=<panel>`** (Dashboard
  tetap `/admin` polos), dan `src/app/admin/page.tsx` membaca `?panel=` sekali saat mount untuk
  memilih panel awalnya â€” dulu keempat item itu semuanya menuju `/admin` polos, jadi klik "Order
  Management" dari subhalaman admin selalu mendarat di Dashboard lebih dulu. Panel baru di sidebar
  subhalaman: tulis href-nya dengan pola `?panel=` itu (urutan & grup tetap harus sama dengan
  sidebar dashboard). Verifikasi tanpa browser:
  `curl -s http://localhost:3000/admin/open-order | grep -o 'href="/admin[^"]*"'` harus sama
  urutannya dengan sidebar dashboard (yang di-SSR spinner, jadi bandingkan dengan sumber `page.tsx`).
  Admin memilih **tanggal mulai + tanggal tutup** (`<input type="date">`) dan **series yang dibuka**
  (chip multi-pilih dari katalog); tidak ada lagi toggle buka/tutup manual.
  Halaman ini memakai pola kartu **Pengaturan** (`SettingsCard`): default **read-only** â€” tanggal
  tampil sebagai teks ("8 Agustus 2026", atau "Belum diatur"), chip series jadi label `<span>`
  (bukan `<button>`), footer hanya tombol **Edit** â€” lalu klik **Edit** membuat tanggal jadi input
  dan chip bisa diklik, footer berganti **Simpan + Batal** dan kembali read-only setelah simpan
  berhasil (`original` = nilai tersimpan, dasar Batal + penanda `dirty`; Simpan nonaktif selama
  tidak ada perubahan). Permintaan pemilik 2026-10-11: "button simpan nya harusnya jadi edit gitu
  bro, soalnya kan udah di simpan, bikin kaya yg di pengaturan".
  ~~Tombol **"Buka semua series"**~~ â€” **sudah dihapus 2026-10-14** bersama seluruh kartu "Series
  yang dibuka": pemilihan produk Open Order sekarang lewat sakelar `products.open_order_enabled`
  (lihat butir "Pilih produk" di bawah), dan kartu tanggal tetap memakai pola Edit/Simpan/Batal
  yang sama.
- Aturan jendela ada di **satu** modul, `src/lib/open-order-window.ts` â€” dipakai halaman admin
  *dan* publik: `resolveOpenOrderState()` (`before` / `open` / `closed`, dibandingkan sebagai teks
  `YYYY-MM-DD` lokal, bukan objek `Date`, supaya tidak bergeser zona waktu),
  `formatOpenOrderPeriod()` ("8 Agustus 2026 â€“ 15 Agustus 2026"), dan `openOrderSeriesList()`.
  Tanggalnya belum diisi â†’ `open_order_active` lama dipakai sebagai fallback, jadi perilaku lama
- **Jendela Open Order = TANGGAL + JAM** (bukan tanggal doang). Kolom baru di `store_settings`:
  `open_order_start_time` + `open_order_end_time` (TEXT `"HH:MM"`, **WIB**), dibuat oleh
  `supabase/migrations/20261021_open_order_time.sql` — **dijalankan manual di SQL Editor Supabase**
  (sandbox tidak punya jalur DDL: `exec_sql` 404). Diatur dari menu admin "Open Order" (input
  `<input type="time">`). Kosong → fallback buka 00:00 / tutup 23:59 (perilaku lama). Semua
  perhitungan pakai WIB (`Date.UTC(...) - 7 jam`) → sama untuk semua perangkat. Fungsi jendela
  (`resolveOpenOrderState`, `openOrderDeadline`, `openOrderStartDeadline`) sekarang membandingkan
  **epoch ms**, bukan teks tanggal. `readOpenOrderWindow()` (`src/lib/open-order-settings.ts`)
  membaca dengan **fallback**: kalau kolom jam belum ada di DB, query diulang tanpa kolom jam →
  halaman tetap jalan.
- **Tampilan `/open-order` sudah dirombak mengikuti mockup HTML** (mockup ada di folder Download
  `samaqu-open-order`): palet **grayscale** (putih/hitam/abu — token `--gold` dsb. di `globals.css`
  memang sudah netral), 3 fase event, dan animasi. `Countdown` (`src/components/open-order/Countdown.tsx`)
  punya varian `card` (kartu timer besar di langkah 1), `pill` (pil compact di langkah 2) dan
  `inline` (isi tombol terkunci). Fase: `upcoming` (sebelum jam buka → label "Segera dibuka",
  titik amber, produk dikunci, CTA shimmer berisi "SEGERA DIBUKA" + hitung mundur),
  `live` ("Buruan, sisa waktu", titik hijau + denyut, CTA "TAMBAH KE PESANAN"),
  `ended` ("Follow kami, tunggu batch berikutnya", titik abu, CTA "OPEN ORDER DITUTUP").
  - Angka countdown punya **animasi roll** (blur + geser) tiap detik → dipakai `key={nilai}` di
    span angka supaya di-remount dan animasinya diputar ulang.
  - CSS-nya di `src/app/globals.css` dengan awalan `oo-`: `oo-roll`, `oo-tick`, `oo-shimmer`
    (tombol terkunci), `oo-ping`, `oo-fade-up`, `oo-lock-overlay`. Ada fallback
    `@media (prefers-reduced-motion: reduce)` supaya konten nggak tertahan `opacity: 0`.
  - Pill timer di langkah 2 **disembunyikan saat `upcoming`** (timer-nya sudah ada di dalam CTA).
  - State `ended` **tetap merender katalog** dengan overlay kunci — tidak lagi layar
    "Periode Open Order Telah Berakhir" terpisah. Klik tombol produk terkunci → toast.
  - Klik tombol "Ingatkan Saya"/"Kabari Periode Berikutnya" → toast lokal (bukan ToastProvider
    global, karena toast global memakai ikon centang yang inappropriate untuk pesan ini).
- **Status jendela & deadline & periode dibaca di SERVER**
  (`src/app/[locale]/(customer)/open-order/page.tsx` → `store_settings`) lalu dikirim sebagai prop ke
  `OpenOrderWizard` (`initialState`, `startDeadline`, `endDeadline`, `period`, `startDate`,
  `endDate`) — kalau dihitung dari `useStoreSettings()` saja, nilainya baru ada setelah hydration
  sehingga tombol yang seharusnya terkunci sempat bisa diklik (pop-in) dan baris "Periode …"
  sempat nampilin teks fallback lama. Angka timer sendiri baru dihitung setelah komponen
  ter-mount (SSR tidak punya jam yang sama dengan klien) → sebelum mount angkanya "00".
- **Pemesanan terkunci saat event belum dibuka** — katalog/harga/Create Your Price tetap bisa
  dilihat, tapi "Tambah ke Pesanan" mati (CTA shimmer berisi timer). **Server juga menolak**:
  `POST /api/open-order` membaca `store_settings` dan membalas **403** kalau statusnya `before`
  atau `ended` — jangan andalkan
- **Pilih produk** (dulu "batasi series"): sejak **2026-10-14** yang menentukan produk mana yang
  tampil di `/open-order` adalah kolom **`products.open_order_enabled`** (default `true`), bukan lagi
  `store_settings.open_order_series`. Dua tempat mengaturnya: **checkbox "Tampilkan di Open Order"**
  di form Produk (tambah + dua halaman edit; produk baru default nyala, dan ikut ke semua baris
  satu grup nama+kategori) dan **daftar "Produk di Open Order"** di menu admin Open Order (sakelar
  per produk, tersimpan langsung). `open_order_series` + `restrictOpenOrderProducts()` +
  `openOrderSeriesList` **sudah tidak dipakai** (kolomnya dibiarkan di DB; `useStoreSettings` tidak
  lagi membawanya). Saringan `open_order_enabled` diterapkan di `buildOpenOrderProducts()` â€” jadi
  klien dan route `/api/open-order` otomatis memakai aturan yang sama.
- `useStoreSettings()` (`src/lib/store-settings.ts`) membawa `open_order_start_date` dan
  `open_order_end_date` saja.
- Kolom tanggalnya datang dari **`supabase/open-order-settings.sql` yang harus dijalankan manual** di SQL
  editor Supabase (sandbox tidak punya jalur DDL, sama seperti kolom pengaturan lain). Selama belum
  dijalankan, halaman admin menampilkan peringatan dan simpan akan gagal; halaman publik tetap jalan
  dengan `OPEN_ORDER_PERIOD`.
  **Sudah dijalankan untuk `open_order_period` + `open_order_active`** (2026-10-10, peringatan di
  halaman admin hilang dan simpanâ†’muat-ulang terbukti mem-persist).
  **`open_order_start_date` + `open_order_end_date`** ada di file yang sama dan sudah dijalankan.
  **`open_order_start_time` + `open_order_end_time`** (jam buka/tutup) ada di file terpisah
  `supabase/migrations/20261021_open_order_time.sql` dan **sudah dijalankan** (2026-10-21).
- **Kolom baru 2026-10-14 â€” `supabase/migrations/20261014_open_order_products.sql`** (sudah dijalankan
  ke produksi): `products.open_order_enabled BOOLEAN NOT NULL DEFAULT true` (produk ini tampil di
  `/open-order`) dan `orders.stock_reserved BOOLEAN NOT NULL DEFAULT false` (penanda "pesanan ini
  pernah memotong stok"), plus backfill `UPDATE orders SET stock_reserved = true WHERE order_number
  LIKE 'SMQ-%'` â€” pesanan CYO yang dibuat **sebelum** perubahan ini tidak pernah memotong stok, jadi
  jangan sampai dibatalkan lalu menambah stok. Cek cepat:
  `curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/products?select=id,open_order_enabled&limit=1" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"`.
- `src/types/lucide-react.d.ts` adalah shim tipe tulis-tangan berisi daftar ikon yang boleh diimpor
  proyek ini â€” ikon lucide baru (di sini `AlertTriangle`, `LayoutGrid`, `Save`) harus ditambahkan ke
  situ, kalau tidak `tsc` gagal dengan TS2305 walaupun ikonnya ada saat runtime. (Karena itu
  `ToggleLeft`/`ToggleRight`/`EyeOff` tidak bisa dipakai â€” pakai ikon yang sudah ada di shim, atau
  ornamen CSS/titik seperti di daftar "Produk di Open Order".)
- The success screen shows the order number and the "Menunggu Konfirmasi Admin" badge; "Lihat
  Pesanan Saya" points at `/akun/pesanan`, which needs a logged-in customer.

Verify: open `/id/open-order` and click through â€” product card â†’ warna/ukuran/series + harga
(Create Your Price, minimum = harga series) â†’ TAMBAH KE PESANAN â†’ keranjang â†’ data pemesan (an
empty form is blocked with a message) â†’ SUBMIT PESANAN. Then check
`docker compose -f docker-compose.base44.yml logs web | grep OPEN-ORDER` and confirm the row
under `/id/admin` â†’ Pesanan carries `size`, the postal code and "Min: â€¦ Â· Dipilih: â€¦".
**Delete that test order afterwards** (admin detail â†’ Hapus, or the Supabase REST API) so it
does not pollute the real order list. The price clamp can be checked without the UI: a POST to
`/api/open-order` with a below-minimum `price` must come back with `total` equal to the series
minimum.
```

## Kredensial J&T Express (kartunya sudah dihapus dari dashboard)

Kartu **"Kredensial J&T Express"** dan komponen `src/components/admin/JntCredentialsForm.tsx` sudah
**dihapus dari panel Pengaturan** atas permintaan pemilik â€” kredensial J&T diatur lewat environment
variable (platform secrets / Vercel), dan `getJntConfig()` memang sudah membacanya dari sana, jadi
integrasi ongkir/AWB/track tidak berubah. Route **`/api/admin/jnt-settings`** dan tabel
`jnt_settings` sengaja dibiarkan (tidak lagi dipakai UI); catatan di bawah masih berlaku kalau
kartunya nanti dihidupkan lagi.

- Disimpan di tabel **`jnt_settings`** (satu baris, `id = 1`), **bukan** `store_settings`:
  `store_settings` punya policy "Public read" dan dibaca anon client (`select("*")` di
  `src/lib/store-settings.ts`), jadi kredensial di sana akan ikut terkirim ke browser. `jnt_settings`
  dibuat **tanpa policy RLS** â†’ hanya service role yang bisa membacanya.
- Tabelnya dibuat lewat **`supabase/jnt-settings.sql`**, dijalankan manual di SQL Editor Supabase
  (sandbox tidak punya jalur DDL). Sebelum dijalankan: form menampilkan peringatan, tombol simpan
  nonaktif, dan GET `/api/admin/jnt-settings` membalas `{ tableReady: false }`. Jalankan dulu
  sebelum memakai form ini.
- Akses lewat **`/api/admin/jnt-settings`** (GET status, POST simpan). Route-nya memverifikasi
  session Supabase **dan** keanggotaan di tabel `admins`, dan hanya mengembalikan status terisi +
  pilihan `env` â€” nilai kredensial tidak pernah dikirim ke browser (karena itu nilai lama tidak bisa
  ditampilkan; field kosong = jangan diubah).
- `getJntConfig()` di `src/lib/jnt/config.ts` kini **async**: baca `jnt_settings` dengan service role
  (cache 60 detik; `clearJntConfigCache()` dipanggil setelah simpan) â†’ field yang kosong jatuh ke
  environment variable (`JNT_ORDER_USERNAME`, `JNT_TARIFF_KEY`, â€¦). Pemanggilnya sudah `await`
  (`src/lib/jnt/{tariff,order,track,cancel}.ts`, `/api/shipping/jnt-cost`, `/api/jnt/test`), dan
  `getJntBaseUrl(endpoint, env)` menerima env supaya pilihan testing/production dari form ikut
  terpakai.
- Tanpa kredensial sama sekali perilakunya tidak berubah: `/api/shipping/jnt-cost` tetap membalas
  `{ configured: false }` (bukan 500), dan `/api/jnt/test` tidak lagi menyertakan `orderApiKey` di
  responsnya (dulu membocorkan key).

Verify: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/admin/jnt-settings` â†’
`401` (tanpa session admin). POST `/api/shipping/jnt-cost` tanpa kredensial â†’ `configured: false`.
Simpan-dari-form baru bisa terbukti setelah `supabase/jnt-settings.sql` dijalankan.

**Kredensial J&T sekarang datang dari platform secrets** (2026-10-11): `JNT_ORDER_USERNAME`,
`JNT_ORDER_API_KEY`, `JNT_TARIFF_KEY`, `JNT_TARIFF_CUS_NAME`, `JNT_TRACK_PASSWORD` diisi pemilik
toko lewat kartu secrets Base44 (`/run/base44/app.env`), dibaca `getJntConfig()` dari environment
variable. **Tabel `jnt_settings` masih belum dibuat** (GET `/rest/v1/jnt_settings` masih 404) dan itu
tidak lagi menghalangi ongkir â€” form admin tetap butuh SQL itu kalau nanti mau dipakai.

Kredensial toko ini **production**, bukan demo: `data` + `sign` yang sama membalas
`{ is_success: "false", message: "fail" }` di `demo-general.inuat-jntexpress.id`, tetapi
`is_success: "true"` di `partner-track.jet.co.id`. Karena itu `JNT_ENV=production` diset di
`.base44/env.defaults` (bukan rahasia, jadi aman di repo; nilai dari dashboard tetap menang).
Kalau ongkir tiba-tiba `fail` lagi, cek `JNT_ENV` dulu sebelum menuduh sign/kredensialnya salah.

## Halaman pesanan customer (`/akun/pesanan`)

Yang tidak kelihatan dari kode:

- **Status di detail pesanan mengikuti `orders.status`**, bukan hardcode: `strukSteps()` di
  `src/lib/akun-format.ts` (dirender `src/components/akun/RincianPesanan.tsx`) memetakan pending â†’ baru dikonfirmasi,
  diproses â†’ diproses, dikirim â†’ diserahkan ke kurir/dalam perjalanan, selesai â†’ semua langkah
  selesai, dibatalkan â†’ linimasa berhenti di langkah pembatalan (banner tone `cancel`). **Dulu langkah 1 & 2
  selalu "done"**, jadi pesanan `pending` di akun tampak sudah diproses sementara admin
  menampilkannya `pending` â€” itu bug yang diperbaiki, jangan kembalikan hardcode itu.
- **Jam pembatalan pesanan (`waktuBatal` di `src/lib/akun-format.ts`).** Tabel `orders` **tidak
  punya trigger yang mengisi `updated_at`** â€” dicek 2026-10-11: di semua baris `updated_at` sama
  persis dengan `created_at`, termasuk pesanan yang sudah `dibatalkan`/`diproses`/`selesai`. Dulu
  langkah "Pesanan dibatalkan" menampilkan `updated_at` apa adanya, jadi jamnya selalu menyalin jam
  pesanan dibuat (pemilik melihat "dibuat 13:38, dibatalkan 13:38" pada pesanan yang batalnya
  belakangan). Sekarang jam batalnya punya kolom sendiri:
  - **`orders.cancelled_at`** = jam batal yang akurat, dibuat lewat
    **`supabase/migrations/20261011_order_cancelled_at.sql`** yang dijalankan manual di SQL Editor
    Supabase (sandbox tidak punya jalur DDL). **Belum dijalankan** (dicek 2026-10-11: select
    `id,cancelled_at` â†’ `400` `42703`), jadi selama belum dijalankan linimasa masih memakai
    `updated_at` seperti sebelumnya. File itu sekaligus mem-backfill `cancelled_at = updated_at`
    untuk pesanan `dibatalkan` yang `updated_at` â‰  `created_at` â€” nilai yang selama ini sudah
    dipakai `waktuBatal`; baris dengan `updated_at` = `created_at` dibiarkan NULL karena jam
    batalnya memang tidak pernah tersimpan.
  - `cancelOrderCompletely()` (`src/lib/cancel-order.ts`) â€” satu jalur untuk `PATCH
    /api/admin/orders` (action `cancelJnt` **dan** chip status `dibatalkan`), `POST
    /api/orders/cancel`, dan `GET /api/cron/auto-cancel` â€” menulis `status`, `cancelled_at`, dan
    `updated_at` sekaligus. Selama kolomnya belum ada, update **diulang tanpa `cancelled_at`**
    (`error.message` memuat nama kolomnya) supaya pembatalan tetap jalan â€” jangan hapus fallback
    itu sebelum SQL-nya dijalankan.
  - `waktuBatal()` memakai `cancelled_at` kalau ada (jam pasti, tampil polos); kalau tidak,
    `updated_at` yang berbeda dari `created_at` (jam sebenarnya sejak ketiga jalur pembatalan
    menulis kolom itu), dan jam terakhir yang tersimpan **dengan penanda `(perkiraan)`** kalau
    `updated_at` masih sama dengan `created_at`. Penandanya wajib: pemilik dua kali melaporkan
    masalah ini â€” pertama "dibuat 13:38, dibatalkan 13:38" (jam salinan tampil polos), lalu "kok
    ngga ada jam sama tgl" setelah jamnya disembunyikan â€” jadi jamnya tetap terlihat, tapi tidak
    boleh terbaca sebagai jam pasti.
  - `Order`/`AdminDetailOrder`/`RincianOrder` (`src/app/admin/page.tsx`,
    `src/components/admin/OrderDetailContent.tsx`, `src/components/akun/RincianPesanan.tsx`) ikut
    membawa `cancelled_at`; baris admin yang baru dibatalkan menimpanya lokal, dan
    `RincianPesanan.tsx` menyuntik jam lokal saat customer membatalkan dari halaman pesanan;
  Verifikasi: pesanan uji buatan sendiri (insert REST) â†’ dibatalkan lewat chip "Ubah Status" di
  drawer admin â†’ `updated_at` > `created_at` dan timeline menampilkan jam valid tanpa `(perkiraan)`,
  sedangkan pesanan lama (mis. `SMQ-20261009-386`) menampilkan `9 Okt 2026 â€¢ 16:53 (perkiraan)`;
  hapus pesanan uji setelahnya. Cek kolomnya: `curl -s -o /dev/null -w '%{http_code}\n'
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/orders?select=id,cancelled_at&limit=1" -H "apikey:
  $SUPABASE_SERVICE_ROLE_KEY"` â†’ `200` = SQL sudah dijalankan, `400` = belum (perilaku lama).
- Label pill ikut disamakan dengan admin: `pending` = **"Menunggu Pembayaran"** (dipakai daftar
  pesanan, dashboard akun, banner struk, dan modal admin), `dibatalkan` pakai `akun-pill-batal` (merah). Dipakai bersama oleh `/akun` (dashboard),
  list pesanan, dan detail â€” ubah di `src/lib/akun-format.ts` saja.
- **Foto "Informasi Produk" diambil dari katalog.** Baris `order_items` pesanan Open Order tidak
  menyimpan `product_image` (route `/api/open-order` tidak pernah mengisinya), jadi foto item
  dicocokkan ke baris `products` (sejak 2026-10-14 `order_items.product_id` **adalah** id baris
  `products` asli, jadi pencocokan jadi langsung) dan memakai `getProductThumbnail`. Karena itu
  `getCustomerOrders()` di `src/lib/customer-auth.ts` **wajib memilih `kain, series`** â€” kalau
  kolomnya tidak ikut di-select, fotonya hilang tanpa error (placeholder ikon lagi).
- **Nomor resi TIDAK dibuat saat pesanan dibuat** (sejak 2026-10-11): `/api/open-order` dan
  `/api/orders` hanya menyimpan pesanan (`awb_no: null` di responsnya) dan tidak lagi memanggil
  J&T. Resi diterbitkan admin lewat **"Atur Pesanan"** â€” lihat bagian "Atur Pesanan" di bawah.
  Kode area dari nama wilayah RajaOngkir: `getOriginCode("DEPOK")` (= "DPK"),
  `getDestinationCode(city)`, `getReceiverArea(city, district)` â€” wizard menyimpan nama resmi
  ("Kota Depok", "Beji") dan `area-mapping.ts` membuang prefix administratif, jadi biarkan
  namanya apa adanya. Order lama tetap tanpa resi (tidak ada backfill) sampai admin mengaturnya.
- **Customer bisa membatalkan pesanannya sendiri**: `POST /api/orders/cancel` (body
  `{ orderNumber }`, header `Authorization: Bearer <access_token>`) â€” verifikasi sesi, pesanan
  harus milik customer itu (kalau bukan â†’ 404, bukan 403), hanya status `pending`/`diproses` yang
  boleh, batalkan pengiriman di J&T dulu baru `status = dibatalkan`. Stok dikembalikan **hanya
  kalau `orders.stock_reserved` true** (sejak 2026-10-14 penanda itu diisi checkout website **dan**
  Open Order) â€” jadi CYO lama yang belum pernah memotong stok tidak ikut dikembalikan. Tombolnya di blok aksi
  `src/components/akun/RincianPesanan.tsx` (di bawah "Lacak Pesanan") + `ConfirmModal`.

Verify (mobile 374px, akun customer):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/orders/cancel \
  -H 'Content-Type: application/json' -d '{"orderNumber":"CYO-..."}'   # 401 tanpa sesi
```

Lalu di browser: buka `/id/akun/pesanan` â†’ detail pesanan. Timeline harus sama dengan status di
`/id/admin` (Pesanan), foto produk muncul (Cloudinary), kartu **Nomor Resi** terisi begitu pesanan
baru dibuat, dan tombol **Batalkan Pesanan** muncul hanya untuk `pending`/`diproses`. Bikin
pesanan uji sebisa mungkin **dibatalkan lalu dihapus** (admin detail â†’ Hapus, atau REST
`DELETE /rest/v1/orders?order_number=eq.â€¦`) agar daftar pesanan asli tidak kotor.

## Drawer detail produk admin

Detail produk admin kini satu komponen bersama, **`src/components/admin/ProductDetailDrawer.tsx`**
(panel gelap charcoal `#1b1e25`, kartu `#232730`, aksen hijau `#22c55e` / biru `#3b82f6` â€” permintaan
pemilik "drawer modern", mengikuti referensi desain yang dikirim). Dipakai di **dua tempat**:

- **Drawer dari daftar produk**: `ProductsCatalog` menerima prop `onDetail(id)`; tombol mata di
  kartu memanggilnya (dulu `<Link>` ke halaman detail). Kedua dashboard (`/admin` dan `/id/admin`)
  menyimpan `selectedProductId` dan merender `<ProductDetailDrawer productId={â€¦} onClose={â€¦} />`
  tepat sebelum `<OrderDetailDrawer â€¦ />`. Drawer tertutup lewat tombol **Tutup**, klik latar, atau
  `Escape`.
- **Halaman route tetap ada** (`/admin/produk/detail/<id>` + salinan locale) dan sekarang hanya
  merender `ProductDetailPanel` dengan `mode="page"` (lembar terpusat, gaya sama) â€” jadi tidak ada
  dua tampilan detail yang berbeda. Ubah tampilan detail â†’ ubah komponen itu saja.

**Warna `"default"` jangan ditampilkan**: produk satu warna (semua baris `Thobe â€¦`) menyimpan
`product_variants.color = "default"`, jadi baris varian dan judul blok Media harus menampilkannya
sebagai "Semua" / tanpa nama warna â€” bukan nilai mentahnya (`default Â· XS`, `Media (default)`).
Konvensi ini sudah dipakai di blok Riwayat Pesanan (`item.color === "default" ? "" : â€¦`) dan
drawer pesanan; ikuti pola itu. Catatan: kolom `product_variants.series` **tidak ada** di database
ini (`42703`), jadi cabang "Varian Series" tidak pernah aktif dari klien.

Angka drawer semuanya dari data asli: stok & SKU dari `product_variants`, harga dari `products`
(harga minimum bila Create Your Price aktif), penjualan dari `order_items`. Skema **tidak** punya
"stok awal"/"total masuk"/"profit", jadi baris statistiknya memakai angka nyata (Total Pesanan,
Total Transaksi, Varian Menipis) â€” jangan mengarang kolom yang tidak ada. Gaya ditulis di string
`PD_CSS` (pola sama seperti `RINCIAN_CSS`), kelasnya berawalan `pd-`.

**Verifikasi manual** (route admin tidak bisa dicapai lewat navigasi SPA preview:
`window.__base44_preview.navigate('/admin'|'/id/admin')` mengubah URL tapi konten tidak berganti,
dan full page load di-reset ke route home pada panggilan preview berikutnya â€” jadi perubahan
dashboard admin **tidak bisa** dibuktikan lewat preview tool, cukup `tsc --noEmit` bersih + curl
`/admin` & `/id/admin` = 200 tanpa error kompilasi di log): buka
`/id/admin` â†’ panel **Produk** â†’ klik tombol mata di kartu produk; drawer harus meluncur dari kanan,
tombol **Tutup** menutupnya, dan `/admin/produk/detail/<id>` menampilkan panel yang sama.
Untuk **drawer detail pesanan**: panel **Order Management** â†’ klik baris pesanan (atau tombol
"Detail"); drawer meluncur dari kanan dengan nomor pesanan (font UI, bukan serif) + tanggal di
header, lalu isi struk (banner status â†’ info pengiriman â†’ alamat â†’ produk â†’ Total Pesanan â†’
Status Pesanan); chip "Ubah Status" & tombol aksi (WhatsApp / Cetak Label / Hapus) tetap bekerja,
dan tutup lewat **X**, klik latar, atau `Escape`. Ulangi di lebar <768 px: drawer selebar penuh,
chip status 2Ã—2, tombol aksi satu kolom.

## Form tambah produk admin

Dulu form ini dua salinan (~1400 baris) di `src/app/admin/produk/tambah/page.tsx` dan salinan
locale-nya, dan salinan locale sudah tertinggal fitur "Stok dari Produk Dasar". Sekarang **satu**
komponen bersama **`src/components/admin/ProductForm.tsx`**; kedua route cuma
`export { default } from "@/components/admin/ProductForm"`. Ubah form tambah produk â†’ ubah file itu
saja (`produk/edit/[id]` masih salinan terpisah dan **tidak** ikut berubah).

- **SKU produk**: field baru di kartu *Info Dasar* (`sku` state) â€” dulu produk cuma punya SKU
  per-ukuran, padahal panel detail produk (`ProductDetailDrawer`) menampilkan satu baris "SKU:".
  Tabel `products` **tidak punya kolom `sku`** dan sandbox tidak punya jalur DDL, jadi SKU produk
  disimpan di `product_variants.sku`: nilai per-ukuran dipakai kalau diisi, kalau kosong jatuh ke
  SKU produk (`sku: s.sku.trim() || sku.trim() || null`), dan placeholder kolom SKU tiap ukuran
  menampilkan SKU produk itu. Jangan pindahkan ke kolom `products.sku` tanpa migration yang
  dijalankan manual: select `products.sku` membalas `400` `42703` sampai kolomnya ada
  (`curl -s -o /dev/null -w '%{http_code}\n' "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/products?select=sku&limit=1"`).
- **Tabel ukuran** kini satu komponen `SizeGrid` (dipakai blok series Thobe **dan** varian biasa,
  sebelumnya markahnya disalin dua kali): di bawah `640px` tiap ukuran jadi kartu berlabel â€” kolom
  tetap 444 px yang lama membuat form melebar keluar layar di HP â€” dan kembali jadi satu baris 5
  kolom (`84px 84px 1fr 1fr 34px`) di `sm+`. Kelasnya `pf-size-*` di string CSS form.
- Baris field dibuat konsisten dua kolom (`grid sm:grid-cols-2 gap-4`): Nama/Kategori, Slug/SKU
  Produk, Harga Dasar (non-Thobe)/Berat.
- **Chip warna & tombol hapusnya**: chip pemilih warna adalah `<button>` untuk mengaktifkan
  warna, sedangkan kontrol hapus (X) di dalamnya memakai **`<span role="button" tabIndex={0}>`**
  dengan `onClick`/`onKeyDown`, **bukan** `<button>` â€” tombol di dalam tombol membuat React
  melaporkan `In HTML, <button> cannot be a descendant of <button>` (hydration error) dan
  men-gagalkan hidrasi seluruh halaman. Salinan `produk/edit/[id]` (kedua prefix locale) memakai
  pola yang sama, jadi perbaiki di ketiga tempat.
- Verifikasi: `tsc --noEmit` bersih + `curl /admin/produk/tambah` & `/id/admin/produk/tambah` = `200`
  (HTML SSR-nya memuat field "SKU Produk"). **Tidak bisa lewat preview** (route admin tidak bisa
  dicapai navigasi SPA, dan full page load di-reset ke route home di panggilan berikutnya) â€” jadi
  tampilan form di HP/desktop dan simpan-SKU harus diuji manual di browser.

## Panel Pengaturan (read-only + Edit) & panel Pelanggan

- Seluruh isi panel **Pengaturan** kini di **`src/components/admin/SettingsSections.tsx`** (satu
  default export `SettingsPanel`), bukan lagi inline di `page.tsx`. Semua kartunya memakai pola yang
  sama: default **read-only** â€” nilai tampil sebagai teks dan footer hanya punya tombol **Edit** â€”
  lalu klik Edit membuat field jadi input dan footer jadi **Simpan + Batal** (Batal mengembalikan
  nilai awal). Pembungkusnya `SettingsCard` + `Field` di
  **`src/components/admin/SettingsCard.tsx`**; kartu pengaturan baru sebaiknya memakai keduanya
  (state form & fungsi simpan tetap milik section-nya).
  Kartu yang ikut pola ini: Informasi Toko, Alamat Pengiriman Toko, Provider Pengiriman, Ekspedisi
  Aktif, API Key RajaOngkir, Sosial Media, Meta Pixel. `PaymentMethodsManager` sengaja **tidak**
  ikut â€” itu pengelola daftar (tambah/hapus per metode), bukan satu form.
- **Alamat Pengiriman Toko** memuat daftar wilayahnya lewat `loadLists()` lalu memasang nilai
  kecamatan *setelah* daftarnya ada (kalau tidak, `<select>` tampil kosong). `Batal` memuat ulang
  daftar kalau provinsi/kota sempat diubah, supaya nilai aslinya tetap punya option yang cocok.
  Di mode read-only label "Memuatâ€¦" hanya muncul selama daftarnya masih diambil.
- Panel **Pelanggan** kini `src/components/admin/CustomersView.tsx`: kartu ringkas per pelanggan
  (tanggal lahir, total belanja, jumlah pesanan, belanja terakhir) + tombol **"Riwayat Belanja &
  Alamat (n)"**, plus chip filter "Ulang Tahun Bulan Ini" dan kartu ringkasan di atasnya.
- **Tombol Export di panel Pelanggan** merakit CSV-nya di **`src/lib/customer-csv.ts`**
  (`customersToCsv` + `formatWhatsapp`), bukan lagi inline di `CustomersView`. Permintaan pemilik:
  "pas di export No WA nya malah berantakan" â€” Excel mengubah digit panjang (`85299954529`) jadi
  notasi ilmiah `8,52999E+10`, jadi No WA sekarang ditulis sebagai teks `+62 852-9995-4529`
  (angka aslinya tidak diubah, cuma awalan `62`/`0` dibuang dulu). Tanda `+`/`-` membuat Excel
  memperlakukannya sebagai teks, dan panjang tiap baris jadi seragam; tanggal lahir tetap
  `YYYY-MM-DD`. File itu sengaja bebas JSX/React supaya bisa diuji langsung tanpa browser:
  `docker compose exec -T web node --input-type=module -e "import {formatWhatsapp} from './src/lib/customer-csv.ts'; console.log(formatWhatsapp('085299954529'))"`
  (Node 22 sudah men-strip tipe TS, jadi impor `.ts` langsung jalan). Ekspor lewat UI sendiri cuma
  bisa dicek sampai "tidak ada error console" â€” unduhan `blob:` tidak muncul di
  `getNetworkRequests`, jadi isi CSV-nya dibuktikan lewat Node di atas, bukan lewat preview.
- **Drawer detail pelanggan** = `src/components/admin/CustomerDetailDrawer.tsx` (panel netral
  putih/abu tema admin, kelas `cd-`, lebar 460 px / penuh di bawah 768 px, tutup lewat X / klik
  latar / `Escape` â€” pola sama dengan `ProductDetailDrawer`/`OrderDetailDrawer`). Isinya: header
  (avatar inisial + nama + WhatsApp + badge "Belum daftar") â†’ ringkasan 2Ã—2 (total belanja, jumlah
  pesanan, belanja terakhir, tanggal lahir) â†’ **"Alamat Pengiriman"** â†’ **"Riwayat Belanja"**.
  Alamat diambil dari `orders` (tabel `customers` tidak menyimpan alamat): route
  `/api/admin/customers` men-`select` `shipping_address, shipping_city, shipping_postal_code` lalu
  menggabungkannya jadi satu string `address` per order; drawer men-dedupe alamat unik dan
  mengurutkannya dari yang terakhir dipakai (`Dipakai nÃ—` bila dipakai berkali-kali). Tipe
  `AdminCustomer`/`CustomerOrder` sekarang **diekspor dari drawer** dan diimpor `CustomersView`
  (jangan didefinisikan ulang di CustomersView). Kartu pelanggan tidak lagi membuka riwayat
  belanja inline â€” satu-satunya jalan ke detail adalah tombol drawer itu.
- Datanya dari **`/api/admin/customers`** (`src/app/api/admin/customers/route.ts`, service role).
  Ini **wajib** lewat route: tabel `customers` punya policy RLS "read own", jadi anon client admin
  tidak bisa membaca pelanggan lain. Route-nya memverifikasi sesi Supabase + keanggotaan tabel
  `admins` (pola sama dengan `/api/admin/jnt-settings`), lalu menggabungkan `customers` dengan
  `orders` â€” order lama yang `customer_id`-nya null dicocokkan lewat nama, dan pembeli tanpa akun
  tetap tampil sebagai entri "Belum daftar" supaya tidak ada yang hilang dari daftar.
  **Total belanja tidak menghitung pesanan `dibatalkan`.**
- Halaman **profil pelanggan** (`/[locale]/akun/profil`) memakai pola yang sama dengan kartu
  Pengaturan admin (diminta pemilik: "samain button nya kaya di menu setting admin"): Nama, Email,
  Nomor HP/WhatsApp, dan Tanggal Lahir tampil sebagai **teks read-only** dengan satu tombol **Edit**;
  setelah diklik barulah muncul input + **Simpan Perubahan + Batal** (Batal mengembalikan nilai yang
  terakhir tersimpan, dan setelah Simpan berhasil halaman kembali read-only). Tanggal lahir
  ditampilkan sebagai `15 Agustus 1995`, atau "Belum diisi". Polanya ditiru dari `SettingsCard` tapi
  gayanya tetap gaya halaman akun (hijau `#0f3d33` / krem), bukan tema admin.
  **Route ini tidak bisa dibuka preview tool** (`navigate('/id/akun/profil')` mengubah URL tapi
  konten tetap halaman home), jadi perubahan halaman profil diverifikasi lewat `tsc --noEmit` +
  `curl /id/akun/profil` = `200`, sisanya uji manual â€” jangan buang panggilan preview untuk itu.
  `birth_date` dibaca dengan fallback tanpa kolom itu kalau migration
  `supabase/migrations/20260910_customer_birth_date.sql` belum dijalankan.
  **Migration itu BELUM dijalankan** (dicek 2026-10-11: `select=id,name,birth_date` â†’ `400`
  `42703 column customers.birth_date does not exist`), jadi tanggal lahir belum tersimpan di mana
  pun. Simpan profil customer (`/[locale]/akun/profil`) menulis `birth_date` langsung dari browser,
  dan tanpa kolomnya PostgREST menolak seluruh update dengan **400** â€” itulah error
  `rest/v1/customers?id=eq.<uuid>` di console. Sandbox tidak punya jalur DDL, jadi kolomnya dibuat
  lewat SQL Editor Supabase: `ALTER TABLE customers ADD COLUMN IF NOT EXISTS birth_date DATE;`
  (sudah ada di `supabase/migrations/20260910_customer_birth_date.sql`). Selama belum dijalankan,
  halaman profil tetap menyimpan nama/WhatsApp (update diulang tanpa `birth_date`) dan menampilkan
  toast bahwa tanggal lahir gagal disimpan.
  Cek cepat kolom: `curl -s -o /dev/null -w '%{http_code}\n' "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/customers?select=id,birth_date&limit=1" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"`
  â†’ `200` berarti kolomnya sudah ada (`400` = belum).
- **Lookup "user ini pelanggan?" wajib `.maybeSingle()`, bukan `.single()`.** PostgREST membalas
  **`406`** (bukan `400`/`404`) kalau `.single()` tidak menerima tepat satu baris, jadi setiap akun
  **auth tanpa baris `customers`** (mis. sesi admin yang diputar ulang preview, atau akun lama)
  memunculkan `Failed to load resource: 406` di console pada request
  `rest/v1/customers?select=â€¦&id=eq.<uid>` â€” pesan yang terlihat seperti kerusakan, padahal memang
  bukan pelanggan. `.maybeSingle()` membalas `200` + `null`, jadi hasilnya sama (`customer === null`
  â†’ dropdown menampilkan Masuk/Daftar) tanpa error. Sudah dipakai di `src/components/ProfileDropdown.tsx`,
  `src/lib/use-wishlist.ts`, dan `src/lib/customer-auth.ts` (`loginCustomer`, `getCurrentCustomer`).
  `.single()` hanya untuk baris yang dijamin ada (mis. `store_settings?id=1`).
  Cek cepat: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/admin/customers`
  â†’ `401` tanpa sesi admin.
- Verifikasi panel-panel ini lewat preview: sesi admin user ikut diputar ulang, jadi
  `preview_screenshot({ path: "/admin" })` lalu `preview_execute_code` (klik "Pengaturan"/
  "Pelanggan" â€” panelnya tombol in-page, bukan route) berhasil. Yang diuji: 7 tombol **Edit** dan
  0 **Simpan/Batal** saat read-only, `Nama Toko` = "SAMAQU" sebagai teks, setelah Edit muncul input
  bernilai sama + Simpan/Batal, Batal kembali ke read-only, kartu J&T tidak ada lagi, dan panel
  Pelanggan memuat (59 pelanggan, 4 kartu ringkasan) tanpa error.

## Daftar pesanan ala Shopee Seller Centre (panel Order Management)

Permintaan pemilik (2026-10-11): "rapihkan flow orderan management broo . pengen setara ecommerce
shopee seller jgn rusak logic nya broo" â€” daftar pesanan ditata menurut **langkah kerja penjual**,
tanpa menyentuh status ataupun logika database sama sekali.

- **Satu modul tahap**: `src/lib/order-flow.ts` (murni, tanpa React) â†’ `orderStage(order)`
  (`belum_bayar` / `perlu_dikirim` / `dikirim` / `selesai` / `dibatalkan`), `ORDER_STAGE_LABEL`,
  `ORDER_STAGE_TABS`, `ORDER_STAGE_STYLE`, `matchesStage()`, `stageNeedsAdminAction()`, dan
  `shippingLine()`. **Pemetaannya**: `pending` â†’ Belum Bayar; `diproses` **tanpa resi** â†’ Perlu
  Dikirim; `diproses`/`dikirim` **ber-resi** â†’ Dikirim; `selesai`/`dibatalkan` apa adanya. Tidak ada
  status baru yang ditulis ke `orders` dan tidak ada query yang berubah â€” penamaan + pengelompokan
  lapisan tampilan saja. **Jangan** jadikan tahap ini nilai `status` di database.
- **Satu panel**: seluruh alur panel Pesanan (tab sumber, kotak cari, tab tahap, daftar, tabel)
  pindah dari `src/app/admin/page.tsx` ke **`src/components/admin/OrdersView.tsx`** (file `page.tsx`
  sudah ~1000 baris). Kedua dashboard tetap ikut otomatis karena `/id/admin` cuma
  `export { default } from "@/app/admin/page"`. Props tinggal `orders` + `onSelect(row)`: halaman
  admin mencari ulang pesanan lengkapnya lewat `id` saat baris diklik, jadi `selectedOrder` tetap
  objek dari state `orders` dan drawer + chip status bekerja persis seperti sebelumnya. Prop
  `onArrangeOrder` **sudah dihapus** (aksi pesanan hanya ada di drawer detail â€” lihat "Aksi hanya di
  drawer detail"); `arrangeOrder` (konfirmasi `ConfirmModal` + `PATCH action: "createJnt"`, **tetap
  digerbangi `diproses` di server**) sekarang hanya dipakai `OrderDetailDrawer`, bertipe
  `{ order_number: string }` â€” hanya field itu yang dipakainya.
- **Aksi hanya di drawer detail** (permintaan pemilik 2026-10-11: "tabel nya jadi berantakan ini
  broo harus nya atur pesanan hubungi pembeli di detail aja bro, rapihin juga tabel yg di open
  order"): tombol per baris yang dulu ditulis `OrdersView.rowAction()` (**Atur Pesanan** saat Perlu
  Dikirim, **Cetak Label** saat Dikirim ber-resi, **Hubungi Pembeli** saat Belum Bayar) sudah
  **dihapus** bersama helper `waLink()`-nya â€” daftar pesanan kini cuma menyaring, menampilkan, dan
  membuka detail. Satu-satunya tombol di baris adalah **Detail** (di bawah `lg` seluruh kartunya jadi
  tombol), dan `onClick={(e) => { e.stopPropagation(); onSelect(o); }}` menjaga klik tombol tidak ikut
  memanggil handler barisnya. Semua aksi itu tetap lengkap di `OrderDetailContent` (drawer), jadi
  **jangan** menambahkan tombol aksi ke `OrdersView`/`OrdersMobileList` lagi tanpa permintaan baru â€”
  kolom aksi yang berisi dua tombol itulah yang membuat tabelnya berantakan. **Jangan** mengubah
  gerbang "Atur Pesanan" di `OrderDetailContent` (masih `status === "diproses"`): `orderStage` hanya
  memberi tahu keadaan pesanan, bukan menggantikan gerbangnya.
- **Kolom "Total" sudah dihapus dari tabel** (permintaan pemilik 2026-10-11: "tabel total mending
  hapus aja deh bro di menu manage pesanan") â€” kolomnya cuma mengulang angka yang sudah ada di kartu
  dan di total produk/ringkasan drawer. Menghapusnya juga menghapus helper `money()` di
  `OrdersView` (tidak dipakai lagi) dan menurunkan `colSpan` baris kosong `7` â†’ `6`. Kartu
  (`OrdersMobileList`) sengaja **tetap** menampilkan `tanggal Â· total`. Tabelnya kini tinggal enam
  kolom: `ID Â· Pelanggan Â· Tanggal Â· Pengiriman Â· Status Â· Aksi` (`min-w-[860px]` tidak berubah,
  jadi masih muat).
- **Tabel dipepetkan satu baris per sel** supaya tidak berantakan (bagian "rapihin juga tabel yg di
  open order"): `whitespace-nowrap` di kolom ID, Tanggal, dan kolom Aksi; nama pelanggan
  dipotong `max-w-[200px] truncate` (+ `title`); kolom
  Pengiriman `min-w-[150px]`. Nomor Open Order (`CYO-20261011-â€¦`) dan nama panjang tidak lagi membuat
  baris tumbuh tinggi sendiri-sendiri. Tab **Open Order** memakai tabel yang sama persis â€” tidak ada
  tabel terpisah, jadi perbaikan ini ikut keduanya.
- **Kolom "Pengiriman" (tabel) + baris pengiriman (kartu)** memakai `shippingLine()`: kurir (mis.
  "J&T - EZ") + nomor resi, atau **"Resi belum dibuat"** (oranye, `awaiting`) untuk tahap Perlu
  Dikirim, dan "Tanpa resi" untuk pesanan yang memang tidak pernah ber-resi (banyak `selesai` lama).
  Tabel minimumnya naik `720px` â†’ `860px` (tujuh kolom) dan tetap di dalam pembungkus
  `overflow-x-auto` yang sama.
- **Warna pill tahap** ada di `ORDER_STAGE_STYLE` (Belum Bayar amber, Perlu Dikirim oranye
  `#fff7ed`/`#c2410c`, Dikirim biru, Selesai hijau, Dibatalkan abu). Tab "Perlu Dikirim" disorot
  oranye selama jumlahnya > 0 (`stageNeedsAdminAction`) â€” pengingat pesanan yang menunggu resi.
  `StatusBadge` + helper `statusLabel`/`money` di `page.tsx` sudah dihapus (digantikan `StageBadge`
  + helper di `OrdersView`), tetapi kelas `badge` (CSS admin) masih dipakai di sidebar & kartu.
- **Verifikasi (2026-10-11, sesi admin diputar ulang, 768 px + desktop)**: `tsc --noEmit` bersih;
  `curl /admin` & `/id/admin` = `200`; tab berbunyi `Semua (35) Â· Belum Bayar (1) Â· Perlu Dikirim (2)
  Â· Dikirim (0) Â· Selesai (22) Â· Dibatalkan (10)`; 35 kartu dengan pill tahap + baris pengiriman;
  klik tab **Perlu Dikirim** â†’ 2 baris, semuanya "Perlu Dikirim" + "Resi belum dibuat"; di desktop
  tabel menampilkan tujuh kolom (termasuk `Total` â€” kolom itu dihapus belakangan, lihat "Kolom
  "Total" sudah dihapus dari tabel" di atas); tidak ada scroll samping di kedua lebar; tanpa error
  console. (Klik **Atur Pesanan** di baris masih ada saat
  pengujian itu, kini sudah dipindah ke drawer detail â€” lihat "Aksi hanya di drawer detail"; setelah
  pemindahan itu yang bisa dibuktikan hanya `tsc --noEmit` bersih + `curl /admin` & `/id/admin` =
  `200`, karena route admin memang tidak dapat dibuka lewat preview tool.) **Belum** terbukti end-to-end: menekan **konfirmasi** "Atur
  Pesanan" (kredensial J&T toko production â€” akan menerbitkan pengiriman asli), serta tautan **Cetak
  Label**/**Hubungi Pembeli** (tautan keluar, tidak diklik).
- **Catatan tool preview**: `preview_screenshot({path:'/admin'})` hanya melakukan kunjungan penuh
  kalau halaman preview baru saja di-reset (perintah shell/edit sebelumnya) â€” kalau dipanggil di
  tengah turn ia mencoba SPA nav dan gagal (`navigation_failed`, URL berubah tapi konten tetap).
  Jadi: **jalankan perintah shell dulu**, baru `preview_screenshot({path:'/admin'})`, lalu
  `preview_execute_code` tanpa shell/edit di antaranya.
  **Cara yang lebih andal (2026-10-24, terbukti):** `preview_execute_code` cukup membuat
  `<iframe src="/admin">` (same-origin, lebar 375/867/1280 px sebagai pengganti `setViewport`) lalu
  membaca `frame.contentDocument` — halaman admin dimuat penuh di dalam iframe tanpa menyentuh URL
  preview, jadi route admin **bisa** diperiksa: teks/lebar elemen (`scrollWidth` vs `clientWidth`
  untuk mendeteksi teks terpotong), posisi baris (`getBoundingClientRect().top` untuk membuktikan
  kartu sejajar), `documentElement.scrollWidth - clientWidth` untuk scroll samping, plus
  `consoleLogs`. `navigate()` tetap gagal (`navigation_failed`) dan URL-nya tertinggal menunjuk
  route admin — panggil `reload_preview` kalau halaman preview sendiri perlu bersih.

## "Atur Pesanan" â€” resi J&T diterbitkan admin (ala Shopee Seller Centre)

Permintaan pemilik (2026-10-11): alur pengiriman disamakan dengan Shopee Seller â€” resi/AWB J&T
**tidak lagi terbit saat customer checkout**, tapi saat admin menekan **"Atur Pesanan"** setelah
pembayaran diverifikasi.

- **Checkout berhenti memanggil J&T**: `/api/orders` (checkout website) dan `/api/open-order` tidak
  lagi memanggil `createOrder` dan membalas `awbNo: null`. Logika payload J&T-nya sekarang **satu**
  modul: `src/lib/jnt/order-from-order.ts` â†’ `createJntOrderForOrder(order)` (dulu disalin di dua
  route checkout). Modul itu juga menentukan COD (`payment_methods.method_type`, atau nilai lama
  `'cod'`) dan berat kirim (`orders.weight`; kalau kosong dijumlah dari `products.weight` per
  `order_items`, fallback 1200 g/item â€” pesanan Open Order menyimpan `weight: null`).
  Salinan mati `src/app/[locale]/api/**` sudah dihapus 23 Oktober 2026.
- **Aksi admin**: `PATCH /api/admin/orders` dengan `action: "createJnt"` â†’ guard (404 pesanan tidak
  ada, 400 sudah punya `awb_no`, 400 kalau `dibatalkan`), panggil J&T, lalu simpan `awb_no` +
  `jnt_order_id` **dan ubah status ke `diproses`**. Tombol **"Atur Pesanan"** (kelas `od-a-primary`,
  ikon kotak) ada di blok aksi `OrderDetailContent.tsx`, muncul hanya bila pesanan belum punya resi
  dan statusnya sudah **`diproses`** (permintaan pemilik 2026-10-11: "ini kan orderan menunggu
  pembayaran, tapi kok ada atur pesanan â€” harusnya munculnya ketika admin ubah ke proses, mirip
  Shopee"; sebelumnya `pending` juga menampilkan tombolnya, jadi pesanan yang belum dibayar/
  diverifikasi sudah menawarkan pembuatan resi). Konsekuensinya admin harus menekan chip
  **Diproses** dulu; petunjuk "Nomor resi belum dibuatâ€¦" di blok Info Pengiriman ikut menyesuaikan
  (`canArrange`) supaya tidak menyuruh klik tombol yang belum tampil. Guard route `createJnt`
  **tidak** ikut berubah (masih menolak `dibatalkan`/pesanan ber-`awb_no`) â€” itu jalur langka yang
  hanya bisa dipanggil langsung, bukan dari UI. Kliknya membuka `ConfirmModal` (label konfirmasinya "Atur
  Pesanan", bukan "Hapus" â€” `showConfirm` di `src/app/admin/page.tsx` menerima
  `options: { confirmText, danger }`), lalu `arrangeOrder()` meng-update baris tabel + drawer tanpa
  reload. Status `dikirim` tetap datang dari pelacakan, bukan dari sini.
- **Kalau J&T menolak** (kredensial/kode area gagal) route membalas 400 dengan pesan `reason`/`desc`
  dari J&T, status pesanan tidak berubah, dan tombolnya tetap ada untuk dicoba lagi.
- **Pemulihan resi yang tidak sengaja dibatalkan** (kejadian nyata 2026-10-11, `SMQ-20261008-432`):
  J&T **tidak bisa menghidupkan AWB yang sudah di-void** ("Cancelled AWB by Seller" di Riwayat
  Pengiriman), jadi satu-satunya jalur adalah **terbit resi baru**. Karena `createJnt` menolak
  pesanan yang masih ber-`awb_no`, resi mati itu harus dikosongkan lebih dulu lewat REST/PATCH
  `orders` (`awb_no = null`, `jnt_order_id = null`; status dibiarkan `diproses`) â€” setelah itu
  tombol **Atur Pesanan** muncul lagi dengan petunjuk "Nomor resi belum dibuatâ€¦". Pembatalan tadi
  juga sudah mengembalikan stok (khusus `SMQ-`), jadi stok barang itu **dipotong ulang** dengan
  `samaqu_decrement_stock(product_id, color, size, qty)` dari baris `order_items`-nya supaya tidak
  dobel-hitung. Ini perbaikan data sekali jalan (skrip `/tmp`/REST), bukan kode app â€” jangan
  menambah jalur "un-cancel" di aplikasi tanpa permintaan. Dibuktikan lewat preview (sesi admin
  diputar ulang): drawer `SMQ-20261008-432` â†’ "Nomor resi belum dibuatâ€¦" + tombol **Atur Pesanan**
  ada, tombol Lacak/Batalkan/Cetak Label hilang, tanpa error console.
- **`shipping_city` kini menyimpan "Kecamatan, Kota" di kedua jalur** (checkout website dulu hanya
  menyimpan kota, jadi kecamatan hilang dan `receiver_area` J&T cuma bisa ditebak dari kota).
  `splitCityDistrict()` di `order-from-order.ts` memecahnya lagi saat membuat resi; order lama yang
  isinya hanya nama kota tetap jalan (district kosong â†’ lookup per kota).
- **Verifikasi**: `tsc --noEmit` bersih; `curl /admin` & `/id/admin` = `200`. Lewat preview (sesi
  admin diputar ulang): Order Management â†’ baris pesanan tanpa resi (mis. `SMQ-20261007-761`) â†’
  tombol **Atur Pesanan** ada; pesanan ber-resi (mis. `SMQ-20261008-432`) tidak punya tombol itu;
  klik tombol â†’ `ConfirmModal` muncul, klik **Batal** â†’ tidak ada request `PATCH /api/admin/orders`
  (cek `getNetworkRequests`). Guard route tanpa menyentuh J&T:
  `curl -X PATCH http://localhost:3000/api/admin/orders -H 'Content-Type: application/json'
  -d '{"orderNumber":"SMQ-20261008-432","action":"createJnt"}'` â†’ `400` "sudah punya nomor resi";
  order asing â†’ `404`. **Pembuatan resi yang benar-benar sukses belum diuji otomatis**: kredensial
  J&T toko ini production, jadi mengonfirmasi dialognya akan membuat pengiriman J&T asli â€” uji
  manual dengan satu pesanan nyata. Setelah gerbang status di atas (2026-10-11) tombolnya **hanya**
untuk `diproses`; verified ulang lewat preview (sesi admin diputar ulang): `pending`
(`SMQ-20261011-643`) â†’ chip Pending, **tanpa** tombol Atur Pesanan; `diproses` tanpa resi
(`SMQ-20261011-371`) â†’ tombol muncul + petunjuk "Klik Atur Pesanan", tanpa error console. Kasus
**`pending` tanpa resi** tidak bisa direproduksi saat itu (satu-satunya pesanan `pending` sudah
 ber-resi) â€” kondisi `order.status === "diproses"` yang menutupnya.

## Status pesanan vs status pengiriman (revisi 2026-10-14)

Permintaan pemilik: klik "Atur Pesanan" jangan langsung bikin pesanan tampak **Dikirim** â€” resi
terbit â‰  paket berangkat. Alur baru:

`Perlu Dikirim` (diproses, resi belum ada) â†’ **Atur Pesanan** â†’ `Menunggu Pickup` (resi terbit) â†’
J&T **pemindaian pertama** â†’ `Dikirim` â†’ paket diterima (J&T `status_code` 200) â†’ `Selesai`.

- **Data**: `orders.shipping_status` (`NULL`â†’`menunggu_pickup`â†’`dikirim`â†’`selesai`) +
  `tracking_status_code/text/city/updated_at`, dan tabel `order_tracking_events`
  (`supabase/migrations/20261014_order_shipping_status.sql`). Riwayat idempoten via `event_key`
  unik (`<awb>|<status_code>|<date_time>`). **Catatan**: `orders.id` di DB ini bertipe **TEXT**
  (bukan UUID) â€” FK `order_tracking_events.order_id` ikut TEXT.
- **Atur Pesanan** (`PATCH /api/admin/orders` `action:"createJnt"`) sekarang menulis
  `{awb_no, jnt_order_id, status:"diproses", shipping_status:"menunggu_pickup"}` â€” **tidak** `dikirim`.
- **Satu sumber logika transisi**: `src/lib/jnt/tracking-sync.ts` (`applyTrackingToOrder`) â€”
  dipakai cron **dan** aksi admin `action:"syncTracking"` (dipicu tombol "Lacak Paket"). Aturan:
  riwayat kosong / API gagal â†’ status tak berubah; pemindaian pertama â†’ `dikirim`; `200` â†’ `selesai`;
  **maju-saja** (respons telat tak memundurkan status); `dibatalkan` tak disentuh; kode tak dikenal
  hanya disimpan (kolom `raw`) tanpa menebak. `src/lib/jnt/track-status.ts` menyediakan `isShipped`
  + `isDelivered` + rank.
- **Tampilan**: `src/lib/order-flow.ts` `orderStage` kini **murni dari `orders.status`** (tidak lagi
  `diproses && awb_no â†’ dikirim`); status pengiriman ditampilkan terpisah lewat `shippingLine`/
  `shippingStatusOf` (pill "Menunggu Pickup"/"Dikirim") di `OrdersView`, `OrdersMobileList`, dan
  `OrderDetailContent` (+ "Tracking terakhir").
- **Sinkronisasi**: **tanpa webhook J&T** â†’ polling `GET /api/cron/sync-tracking` (header
  `Authorization: Bearer $CRON_SECRET`) yang dijadwalkan **cron-job eksternal** milik pemilik
  (bukan Vercel Cron). Belum ada penjadwal di repo.
- **Diuji** (harness memanggil `applyTrackingToOrder` dengan stub + payload track terkontrol,
  lib di-compile dari sumber nyata): resi tanpa scan â†’ tetap `menunggu_pickup`; scan pertama â†’
  `dikirim` + event tersimpan; API gagal â†’ tak berubah; riwayat sama berulang â†’ idempoten
  (event_key unik diverifikasi di DB: 2 insert identik = 1 baris); sudah `dikirim` + respons lama â†’
  tak mundur; `200` â†’ `selesai`; `dibatalkan` â†’ tak disentuh. **Produksi (2026-10-13)**: dengan
  kredensial production terbaru, create order âœ… (resi `JO0329847318`), tariff âœ… (Rp68.000),
  track âœ…, cancel/void âœ… â€” semua diuji langsung ke endpoint production. Catatan penting: resi
  baru **langsung** punya entri tracking `status_code 101 = "Manifes"` (otomatis saat order dibuat),
  dan void resi menghasilkan `status_code 162 = "Cancelled AWB by Seller"` â€” keduanya dikecualikan
  (`JNT_NON_SHIPPING_CODES`) supaya tidak salah menandai "Dikirim".

## Lacak paket di drawer pesanan & status selesai otomatis

Permintaan pemilik (2026-10-11): "di detail tambahin tombol Lacak", "ketika paket sudah diterima
otomatis statusnya selesai sendiri", plus chip filter "dibatalkan" di panel Pesanan.

- **Tab tahap** (dulu chips status mentah `["Semua","pending","diproses","selesai","dibatalkan"]`,
  kini di `src/components/admin/OrdersView.tsx`): `ORDER_STAGE_TABS` di `src/lib/order-flow.ts` â€”
  Semua Â· Belum Bayar Â· Perlu Dikirim Â· Dikirim Â· Selesai Â· Dibatalkan. Satu sumber untuk `/admin`
  dan `/id/admin`. Barisnya tetap `flex-wrap`, jadi enam tab tidak memotong apa pun di ~370 px.
  Setiap tab menampilkan **jumlahnya** (`Perlu Dikirim (2)`) dan **judul daftar ikut tab aktif**
  ("Semua Pesanan" â†’ "Pesanan Perlu Dikirim"; tab Open Order â†’ "Open Order Selesai"). Angkanya dari
  `stageCounts` yang dihitung atas `searchedOrders` (tab sumber yang aktif **setelah** kotak cari),
  jadi selalu cocok dengan baris di bawahnya â€” bukan query terpisah.
- **Kotak cari pesanan** (permintaan pemilik 2026-10-11: "di menu management order tambahin search
  biar enak, bikin yg modern"): state `orderSearch` + kotak di bawah baris judul/chip, mencocokkan
  `order_number`, `customer_name`, `customer_email`, dan `customer_whatsapp` (substring,
  case-insensitive). Saringannya **sebelum** chip status (AND), angka chip "Semua" ikut
  `searchedOrders.length`, dan pesan kosong dibedakan (`ordersEmptyText`): "Tidak ada pesanan yang
  cocok dengan pencarian" vs "belum ada pesanan". Kotak ini **beda** dari kotak "Cari produkâ€¦" di
  topbar (`productSearch`, menggerakkan panel Produk). Verifikasi (sesi admin diputar ulang;
  `preview_screenshot({path:'/admin'})` dulu karena `navigate()` tidak bereaksi di route admin):
  "Sri" â†’ 2 baris (`SMQ-20261011-643` cocok dari email `naniusriyati@â€¦` + `SMQ-20261008-432`) dan
  chip jadi `Semua (2)`/`Pending (1)`/`Diproses (1)`/`Selesai (0)`; "SMQ-20261008-432" â†’ 1 baris;
  teks ngawur â†’ 0 baris + pesan kosong; tombol X mengembalikan 35 baris; tanpa error console.
- **Tipografi admin seragam**: satu aturan di `ADMIN_WF_VARS` (`src/components/admin/admin-theme.ts`,
  `#admin-root h1..h4 { font-family: var(--font-inter) !important; font-style: normal !important }`)
  memaksa SEMUA judul admin memakai font UI, bukan Cormorant serif italic (gaya storefront).
  Dipaksa `!important` karena banyak judul menulis `fontFamily` inline â€” jadi menghapus satu per satu
  di puluhan file (termasuk salinan locale) tidak perlu; elemen serif yang **bukan** judul (kode
  voucher, nama produk di blok "Preview Produk") sengaja dibiarkan. Verifikasi: `getComputedStyle`
  pada h2 "Semua Pesanan" & "Konten Website" â†’ `fontFamily` Inter, `fontStyle` normal.
- **Tombol Lacak**: `OrderDetailContent.tsx` (drawer detail pesanan, kedua dashboard) punya tombol
  **Lacak Paket** di blok aksi, muncul hanya bila pesanan punya `awb_no`. Tombol membuka panel
  **Riwayat Pengiriman** di dalam drawer yang memanggil `/api/jnt/track?awb=â€¦` sekali (data
  disimpan di state, tutup/buka lagi tidak fetch ulang); riwayat J&T datang terlama-dulu, jadi
  dibalik supaya yang terbaru di atas. Gaya memakai kelas `od-` di `OD_CSS` (bukan komponen
  halaman lacak customer yang butuh sesi customer).
- **Auto "selesai"**: begitu pelacakan menunjukkan paket **diterima penerima**, status pesanan
  otomatis jadi `selesai` tanpa admin mengubahnya:
  - **saat dilihat** â€” panel Lacak memanggil `onStatusChange("selesai")` (prop drawer yang sudah
    ada â†’ `PATCH /api/admin/orders`) hanya bila `isDelivered()` benar dan status masih
    `pending`/`diproses`/`dikirim` (jadi pesanan `dibatalkan`/`selesai` tidak tersentuh);
  - **di latar belakang** â€” cron **`/api/cron/sync-tracking`** (`src/app/api/cron/sync-tracking/route.ts`)
    memindai â‰¤100 pesanan ber-resi berstatus belum final, melacak tiap resi, dan menandai yang
    sudah diterima sebagai `selesai`. Gerbang `CRON_SECRET` sama dengan `/api/cron/auto-cancel`
    (`Authorization: Bearer $CRON_SECRET`; `401` kalau salah/kosong) â€” **belum ada penjadwal di
    repo**: jadwalkan endpoint ini (mis. tiap jam) bersama `auto-cancel` di penjadwal cron/Vercel
    yang sudah dipakai untuk endpoint itu. Tanpa penjadwal, auto-selesai tetap jalan begitu admin
    membuka panel Lacak.
- **Deteksi "diterima"** ada di satu modul murni **`src/lib/jnt/track-status.ts`** â†’
  `isDelivered({history})` = ada riwayat dengan `status_code === 200` ("Paket telah diterima" /
  Delivered, per dokumentasi J&T). **Jangan** mencocokkan teks: `status_code` 100 juga berbunyi
  "Paket telah diterima oleh <gerai>" (paket baru diserahkan ke J&T di gerai asal), bukan bukti
  sampai ke penerima. Modulnya cuma impor tipe, jadi dipakai klien & server.
- Verifikasi: `tsc --noEmit` bersih; `curl /admin` & `/id/admin` = `200`; `/api/cron/sync-tracking`
  tanpa/`salah` header = `401`; `isDelivered` diuji lewat Node (200 â†’ true, 100/401/kosong â†’
  false). Lewat preview (sesi admin diputar ulang): chip **Dibatalkan** tampil, filter menyisakan
  10 pesanan dibatalkan, drawer terbuka, tombol **Lacak Paket** muncul untuk pesanan ber-resi
  `SMQ-20261010-364`, panel Riwayat Pengiriman terisi (`Manifes DEPOK â€¦`), tanpa error console,
  dan tidak ada scroll samping di 375 px. **Belum** terbukti live: status berubah sendiri saat
  paket benar-benar diterima (perlu pesanan yang resinya sudah `status_code 200`) â€” logikanya
  diuji unit, bukan end-to-end.

## Satu scrollbar untuk panel meluncur (drawer) admin

Permintaan pemilik (2026-10-11): "kok scroll nya jadi ada 2 sih di detail pesanan satu aja broo
jgn 2 gitu cek juga di yg lain, tolong bikin kaya website mahal". Dulu drawer punya scrollbar
sendiri sementara halaman admin di belakangnya masih bisa di-scroll â€” dua bar terlihat sekaligus.

- **Kunci scroll halaman**: hook bersama **`src/lib/use-scroll-lock.ts`** â†’ `useBodyScrollLock(active)`.
  Dipanggil `OrderDetailDrawer` (`!!order`), `ProductDetailDrawer` (`!!productId` â€” hanya jalur
  drawer; `ProductDetailPanel` mode `page` tidak ikut terkunci) dan `CustomerDetailDrawer`
  (`!!customer`). Hook menulis `overflow:hidden` ke `<html>` + `<body>` dan menambah
  `padding-right` selebar scrollbar yang hilang supaya tata letak tidak bergeser saat panel dibuka;
  penghitung di modulnya membuat beberapa panel yang terbuka bersamaan (mis. drawer + `ConfirmModal`)
  hanya mengunci sekali dan membuka kunci saat panel terakhir ditutup. Panel baru: pakai hook ini,
  jangan menulis kunci scroll sendiri.
- **Bar ramping**: kelas **`drawer-scroll`** di `src/app/globals.css` (`overscroll-behavior:contain`,
  `scrollbar-width:thin`, `::-webkit-scrollbar` dengan track transparan & thumb membulat) dipasang di
  `.odr-body`, `.pd-body`, `.cd-body`; itu juga yang mencegah scroll panel "menular" ke halaman.
- Verifikasi (sesi admin diputar ulang): `/id/admin` â†’ Order Management â†’ tombol **Detail** â†’
  `overflow` `<body>` = `hidden`, `window.scrollTo(0,700)` tidak menggeser halaman, `.odr-body`
  berkelas `drawer-scroll` dengan `overscroll-behavior:contain` dan tetap bisa di-scroll, di 768 px
  panel 520 px tanpa scroll samping, lalu setelah drawer ditutup `overflow` body kembali normal dan
  halaman bisa di-scroll lagi. **Catatan tool**: `navigate('/id/admin')` di `preview_execute_code`
  membalas `navigation_failed` (route admin tidak bereaksi ke SPA nav) dan URL-nya tertinggal
  menunjuk `/id/admin` padahal isinya halaman lain â€” panggil `preview_screenshot({path:'/id/admin'})`
  (yang melakukan kunjungan halaman penuh) dulu sebelum menguji panel admin.

## Satu jalur pembatalan: resi J&T selalu di-void dulu

Permintaan pemilik (2026-10-11): "bagus gimana buat alur yg skrng, kasih yg terbaik aja" â€”
setelah dibahas, celahnya bukan di cron (order `pending` normalnya belum beresi) melainkan di
chip **"Ubah Status"** drawer admin: chip itu dulu menulis status apa adanya, jadi pesanan beresi
bisa dikembalikan ke `pending` atau ditandai `dibatalkan` sementara resinya tetap hidup di J&T.

- **Satu modul**: `src/lib/cancel-order.ts` â†’ `cancelOrderCompletely(order, remark)`. Urutannya
  void resi J&T (kalau `awb_no`/`jnt_order_id` ada) â†’ stok website dikembalikan â†’ status
  `dibatalkan` + `cancelled_at`/`updated_at` ditulis manual (lihat "Jam pembatalan pesanan" di
  atas). Kalau J&T menolak, status **tidak** diubah dan
  fungsinya mengembalikan `{ success: false, stage: "jnt" }` supaya resi tidak menggantung.
  Dipakai **empat** pemanggil: `PATCH /api/admin/orders` (action `cancelJnt` **dan** status
  `dibatalkan`), `POST /api/orders/cancel` (customer), dan `GET /api/cron/auto-cancel`.
  Jangan tulis ulang urutan voidâ†’stokâ†’status di route baru; panggil modul ini.
- **Stok dikembalikan hanya kalau `orders.stock_reserved` true**: `hasStockReservation()` di modul
  itu memakai kolom itu (sejak 2026-10-14), bukan lagi awalan nomor pesanan. Checkout website
  **dan** Open Order sama-sama memotong stok (`samaqu_decrement_stock`) dan sama-sama menandai
  `stock_reserved`; CYO lama tidak, jadi jalur admin & cron tidak lagi **menambah** stok yang tidak
  pernah diambil hanya karena nomornya berawalan `CYO-`.
  Customer hanya bisa membatalkan order miliknya (`customer_id`), dan order website lama/baru
  `customer_id`-nya null â†’ praktis tidak berubah, tapi aturannya sekarang eksplisit.
- **Dua penjagaan di `PATCH /api/admin/orders`** (selain `cancelJnt`): status `pending` **ditolak
  400** kalau pesanan sudah punya resi (`Pesanan ini sudah punya resi J&T (<resi>)â€¦`), dan status
  `dibatalkan` dirutekan ke `cancelOrderCompletely()` â€” jadi chip "Dibatalkan" kini ikut mem-void
  resi, bukan cuma mengganti status.
- **Klien**: `updateOrderStatus()` di `src/app/admin/page.tsx` mendelegasikan `dibatalkan` untuk
  pesanan ber-`awb_no` ke `cancelJntOrder()` (konfirmasi + void), dan dialog itu memakai
  `{ confirmText: "Ya, Batalkan", danger: true }` (sebelumnya tombolnya berbunyi "Hapus").
  Penjagaan server tetap yang mengikat â€” klien cuma UX.
- **Pesan error J&T**: `cancelOrder()` hanya melihat `raw.detail[0].status === "Sukses"`, sedangkan
  `raw.desc` bisa berbunyi "Request berhasil" walau `detail[0].reason` menolak; karena itu pesan
  error memakai `detail[0].reason` lebih dulu.
- **Verifikasi (2026-10-11, semua lolos)**: `tsc --noEmit` bersih. Lewat API + baca REST:
  (a) order uji tanpa resi + status `dibatalkan` â†’ 200, `updated_at` > `created_at`;
  (b) order uji pending **beresi** + chip `pending` â†’ 400 (ditolak) dan chip `dibatalkan` â†’ 400
  dengan status tetap `pending` (J&T menolak void);
  (c) order uji `created_at` 25 jam lalu â†’ cron `auto-cancel` â†’ `{cancelled:1}` dan statusnya
  `dibatalkan`; (d) sesi admin diputar ulang: `/id/admin` â†’ Order Management â†’ baris pesanan uji
  â†’ chip "Dibatalkan" membuka dialog "Batalkan di J&T?" berisi nomor AWB, **tidak** ada
  `PATCH /api/admin/orders` selama dialog terbuka, status tetap Pending, dialog/drawer ditutup
  tanpa error console. Semua pesanan uji dihapus lagi setelah uji (tidak ada sisa `TEST*`).
  Perubahan terakhir pada label tombol dialog tidak diuji ulang di browser (jatah panggilan
  preview habis) â€” hanya `tsc` bersih.
## Alamat pesanan: kecamatan & kode pos (2026-10-11)

Pemilik menemukan pesanan `SMQ-20261011-643` (Damar) alamatnya cuma "Jl.Medokan Asri Barat IV
Blok F No.44, Surabaya" â€” kecamatan dan kode pos tidak muncul, padahal checkout meminta keduanya.
Dua bug berbeda, keduanya di `src/app/[locale]/(customer)/checkout/page.tsx` (pohon
`src/app/(customer)/` sengaja **tidak** disentuh: tidak terpakai) dan di drawer admin:

- **Kecamatan alamat manual terbuang.** Payload checkout dulu mengirim
  `district: selectedAddr?.kecamatan || ""`, jadi untuk tamu/alamat manual (yang kecamatannya
  diketik di field "Kecamatan") nilainya selalu kosong â†’ `shipping_city` cuma berisi kota dan
  `getReceiverArea()` J&T kehilangan kode area. Sekarang:
  `district: selectedAddr ? selectedAddr.kecamatan || "" : kecamatanName.trim()`, dan karena
  field Kecamatan berlabel wajib, submit manual tanpa kecamatan **ditolak** klien
  (`e.kecamatan = "Kecamatan wajib diisi"`, pesan + border merah ditampilkan seperti field lain).
  `const selectedAddr` diangkat ke atas blok validasi supaya dipakai validasi & payload sekaligus.
- **"Gunakan Alamat Baru" masih memakai alamat tersimpan.** Dulu `selectedAddressId` tidak
  dikosongkan, jadi setelah menekan "+ Gunakan Alamat Baru" kecamatan tetap diambil dari alamat
  tersimpan sementara jalan/kota/kode pos dari field yang diketik â€” campur dua alamat. Sekarang
  tombol itu `setSelectedAddressId("")`, dan "â† Kembali ke alamat tersimpan" memilih ulang alamat
  default lewat `handleSelectAddress` supaya payload tidak tertinggal di mode manual.
- **Kode pos tidak tampil di drawer admin.** Drawer membaca `order.shipping_postal`, padahal
  kolomnya `orders.shipping_postal_code` (API admin pun mengirim nama itu) â†’ kode pos hilang dari
  blok "Alamat Pengiriman". Sudah diperbaiki di `src/components/admin/OrderDetailContent.tsx`
  (tipe + perakit `alamat`) dan tipe `Order` di `src/app/admin/page.tsx`. Halaman customer
  (`RincianPesanan.tsx`) memang sudah benar sejak awal, jadi kode pos selalu terlihat di
  `/akun/pesanan` â€” yang bolong hanya sisi admin.

Konsekuensi data: kecamatan yang sudah telanjur hilang **tidak bisa dipulihkan** (tidak ada
`saved_addresses` untuk pembeli itu dan kolomnya tidak menyimpan jejaknya) â€” `SMQ-20261011-643`
masih perlu kecamatan diisi manual/konfirmasi ke pembeli saat resi diterbitkan (kode posnya aman:
`60295`). Pesanan `SMQ-`/`CYO-` baru sudah ikut membaik otomatis.

Verifikasi: `tsc --noEmit` bersih; `/id/checkout` = `200` dan HTML SSR-nya memuat
`data-field="alamat|kecamatan|kota|kodepos"`; `/admin` = `200`; baris REST pesanan menunjukkan
`shipping_postal_code: "60295"` (masukannya ada, cuma tidak dirender). **Belum terbukti di
browser**: klik "Buat Pesanan" dengan kecamatan terisi benar-benar mengirim `district` yang
diketik (jatah panggilan preview habis; `navigate('/id/checkout')` di preview balas
`navigation_failed` â€” route tidak merender lewat SPA nav, jadi checkout harus dibuka dengan
kunjungan halaman penuh lalu diuji manual).

- **Kredensial production SUDAH BERES (2026-10-13)**: pemilik mengirim kredensial production
  (`WITHSAMAQU-DPK01C`) dan semuanya diverifikasi langsung ke endpoint production â€” **create order
  âœ…** (resi `JO0329847318`), **tariff âœ…** (Rp68.000), **track âœ…**, **cancel/void âœ…**. Diisi di
  `.env.local` (gitignored) + env Vercel; pemilik akan merotasi. Temuan penting: entri tracking
  pertama resi baru adalah `status_code 101 = "Manifes"` (otomatis saat order dibuat) â†’ dikecualikan
  dari pemicu "Dikirim" (lihat bagian "Status pesanan vs status pengiriman").

## Pusat data pelanggan (admin + ops) + sinkron Orderâ†’Lead (2026-10-13)

Permintaan pemilik: daftar **Pelanggan** admin urut **terbaru** + **filter**; modul **Pelanggan di
dashboards ops**; dan "order baru bikin lead". Keputusan user = **"tandai closing kalau cocok"**.

- **Satu sumber data**: `src/lib/customer-directory.ts` (`buildCustomerDirectory` + `filterCustomers`
  + `sortCustomers`). Dipakai `GET /api/admin/customers` (`{ customers }`) dan `GET /api/ops/customers`
  (`{ items }`, guard `isOpsAdmin`). Default urut **Terbaru** = aktivitas terakhir (`max(createdAt, lastOrderAt)`).
  Kolom baru: `createdAt` + `cities` (untuk filter Kota).
- **UI bersama**: `src/components/customers/CustomerDirectoryView.tsx` (kelas Tailwind netral/slate â€”
  BUKAN var tema admin, karena `--fg`/`.card`/`--bd` cuma ada di tema admin) dipakai oleh panel admin
  (`CustomersView`, + stat cards + Export) dan halaman ops `src/app/ops/pelanggan/page.tsx`.
  Filter: **Punya akun/Belum daftar**, **Belanja terakhir (30/90/365 hari)**, **Kota**, **Ulang tahun
  bulan ini**; + pilih urut (Terbaru/Belanja/Nama Aâ€“Z).
- **Orderâ†’Lead** (`src/lib/ops-lead-sync.ts` `markLeadBoughtForOrder`): order **TIDAK** membuat lead
  baru (kalau tiap order dibikin lead, pembeli masuk antrean Follow-up). Kalau nomor order
  (`normalizeKontak`) cocok dengan lead yang **masih aktif** â†’ lead ditandai `status="closing"`,
  `outcome="buy"`, `followup_status="selesai"` + `lead_activities` "order_created" (idempoten via
  `note_followup` memuat nomor order). Dipanggil di `api/orders` + `api/open-order` (service role,
  try/catch supaya tak menggagalkan order).
- Diuji: filter/urut di dua dashboard (0 error konsol); `markLeadBoughtForOrder` â€” cocok+aktif â†’
  closing+buy+aktivitas; terminal / tak cocok / idempoten â†’ tidak berubah.

## Notifikasi WhatsApp (Fonnte) â€” dua jalur + anti-pesan-ganda (2026-10-15)

Satu modul: `src/lib/fonnte.ts`. Dua jalur token TERPISAH di tabel `fonnte_settings` (satu baris):
`customer_token` + `customer_number` untuk semua pesan ke pembeli, `admin_token` + `admin_number`
untuk pesan internal. Diatur di Pengaturan â†’ dua kartu ("Notifikasi WhatsApp â€” Customer" dan
"â€” Admin"), masing-masing punya Simpan + Test Notifikasi. Token tidak pernah dikirim balik ke
browser (hanya disamarkan); kolom lama `token` tetap jadi cadangan transisi, lalu environment
`FONNTE_TOKEN`. Migrasi: `supabase/fonnte-settings-split.sql` + `supabase/order-notify-flags.sql`.

Pesan & pemicunya (semua pesan ke customer TANPA emoji, sapaan "Ka"):

| Pesan | Pemicu | Fungsi |
|-------|--------|--------|
| Pesanan dibuat | checkout website `/api/orders` & `/api/open-order`, SETELAH invoice Mayar dibuat | `notifyCustomerOrderCreated` |
| Pembayaran diterima | webhook Mayar terverifikasi ATAU admin ubah status `pending`â†’`diproses` (bukan COD) | `notifyCustomerOrderPaid` |
| Pesanan dikirim | scan pertama J&T (status â†’ `dikirim`) | `notifyCustomerOrderShipped` |
| Paket diterima | tracking J&T `delivered` (status â†’ `selesai`) | `notifyCustomerOrderDelivered` |
| Reminder bayar | cron `/api/cron/auto-cancel`, jendela 20â€“23 jam, sekali saja | `notifyCustomerPaymentReminder` |
| Pesanan dibatalkan | `cancelOrderCompletely()` (admin / customer / auto-cancel) | `notifyCustomerOrderCancelled` + `notifyAdminOrderCancelled` |
| Pesanan baru (admin) | checkout website & Open Order | `notifyAdminNewOrder` |

Anti-pesan-ganda: satu kolom klaim per peristiwa di `orders` (`notify_created_at`,
`paid_notified_at`, `shipped_notified_at`, `delivered_notified_at`, `reminded_at`,
`cancelled_notified_at`). Pengiriman lewat `claimOrderNotification()` / `sendOnce()`
(`src/lib/order-notify.ts`) â€” satu `UPDATE ... WHERE kolom IS NULL` di database, jadi webhook,
cron, dan aksi admin yang berjalan bersamaan tetap mengirim satu kali. Klaim TIDAK dilepas kalau
Fonnte gagal (lebih baik tidak terkirim daripada dobel): kegagalannya masuk log, dan
`orders.shipped_notify_status` mencatat `sent`/`failed` untuk notifikasi resi.

Jalur pembayaran manual (admin `pending`â†’`diproses`) ikut menulis `payment_status='paid'` +
`paid_at` secara kondisional (`paid_at is null` di WHERE) â€” itulah penjaga agar webhook Mayar
yang datang belakangan tidak menandai lunas dua kali. COD dilewati: tanpa instruksi transfer,
tanpa "pembayaran diterima", tanpa reminder.

Reminder ditempel di cron auto-cancel (bukan endpoint/penjadwal baru) karena jadwalnya sudah tiap
jam; jendela 20â€“23 jam dipilih supaya reminder selalu keluar SEBELUM auto-cancel 24 jam, dengan
jarak 1 jam agar tidak ada pesanan yang diingatkan lalu langsung dibatalkan di eksekusi yang sama.
Link Mayar diperiksa ulang lewat `validMayarPaymentUrl()` (`src/lib/mayar.ts`) â€” kalau invoice sudah
lunas atau kedaluwarsa, pesan TIDAK memuat link dan jatuh ke instruksi "hubungi admin".

## Dokumentasi vault setelah perubahan (skill `samaqu-docs`)

Setelah pekerjaan yang **mengubah implementasi** â€” fitur, logic bisnis, skema/migration, API atau
integrasi, autentikasi/hak akses, arsitektur, perbaikan bug yang mengubah perilaku, atau konfigurasi
deploy yang relevan â€” perbarui dokumentasi Obsidian lewat skill **`samaqu-docs`**
(panggil `/samaqu-docs`, atau ikuti `SKILL.md`-nya). Untuk perubahan kosmetik/refactor internal
tanpa dampak perilaku, tidak perlu menambah catatan.

- **Vault:** `C:\Users\DELL\Downloads\SAMAQU DOC\samaqu doc\` â€” satu-satunya vault, jangan membuat
  yang baru dan jangan menulis ke lokasi lain.
- **Dokumentasi bukan pengganti pengujian.** Tetap jalankan `npx tsc --noEmit` (dan `npm run build`
  bila menyentuh route/UI); catatan hanya boleh menyebut pengujian yang benar-benar dijalankan.
- **Jangan mengklaim dokumentasi sudah diperbarui** kalau file belum benar-benar ditulis di vault.
- Kalau vault tidak bisa diakses, **laporkan kegagalan** â€” jangan diam-diam menulis di tempat lain
  dan jangan mengaku sukses.
- **Jangan menulis secret**: password, token, API key, nilai `.env.local`, atau data pelanggan.
  Catatan `SAMAQU - ENV VERCEL` hanya memuat nama variabel, fungsi, scope, dan env yang diperlukan.
- **Utamakan memperbarui** catatan yang sudah ada (jangan menggandakan dokumentasi ENV, database,
  arsitektur, atau fitur). Tautan internal pakai `[[Nama Dokumen]]`.
- **Jangan `git commit`/`push` hanya untuk dokumentasi** kecuali diminta secara terpisah; vault
  berada di luar repo ini.

## Produk Terlaris di halaman Laporan ops (per produk induk)

`src/app/ops/laporan/page.tsx` merender **`src/components/ops/BestSellerSection.tsx`** (self-fetching,
punya pemilih bulan sendiri) yang memanggil **`GET /api/ops/best-sellers?month=YYYY-MM`**
(guard `isOpsAdmin`). Angka lama (`buildTopProducts` di `/api/ops/laporan`, top 5 per
`product_id || nama`) sudah **dihapus**: `order_items.product_id` menunjuk ke baris katalog
(satu kombinasi produk × series) dan `product_name` ikut menyimpan "(Kain …) Size … (Include/Tanpa
Cover & Hanger)", jadi satu produk pecah jadi beberapa baris dan totalnya cuma jumlah top 5.

Satu modul agregasi: **`src/lib/best-sellers.ts`**
- produk induk = `products.category::products.name` (fallback: nama dibersihkan dari kain/size/cover);
- unit & omzet dari SEMUA item pesanan sah `SALE_STATUSES` (bukan top-N), jadi `totals.units` harus
  sama dengan jumlah `quantity` mentah di periode itu — itu cara termudah memeriksanya;
- breakdown per ukuran dan per kain/opsi disimpan untuk baris yang di-expand.

Batas periode **WIB** (`jakartaMonthBounds`/`jakartaDayBounds`). Pembanding apple-to-apple: bulan
berjalan → rentang tanggal yang sama bulan sebelumnya (1–23 Okt vs 1–23 Sep), bulan selesai → bulan
penuh vs bulan penuh; agregasi & filter memakai fungsi yang sama untuk kedua periode. Produk yang
hanya laku di periode pembanding ikut dikirim dengan `units: 0` (tampil sebagai turun di "Lihat
semua"); `prevUnits: 0` → label "Baru", tanpa persen. Katalog dibaca **sekali** untuk kedua periode.

Kartu Produk Terlaris di `/ops/dashboard` dan dashboard admin masih memakai `src/lib/top-products.ts`
(per varian) — sengaja tidak diubah.

## Ongkir J&T — cross-check tagihan J&T (menu Ops → Keuangan, 2026-10-23)

Menu baru **Ongkir J&T** (`/ops/ongkir-jnt`, sidebar grup Keuangan di `OpsShell`'s `MENU_GROUPS`)
untuk mencocokkan tagihan bulanan J&T dengan ongkir yang dibayar customer. Halaman dirakit dari
empat file: `src/app/ops/ongkir-jnt/page.tsx` (route tipis) → `src/components/ops/OngkirJntView.tsx`
(pemilih bulan + kartu ringkasan) + `JntInvoiceForm.tsx` (angka invoice) + `JntUploadCard.tsx`
(upload Excel) + `JntItemsTable.tsx` (tabel per resi).

**Aturan uang (jangan diubah tanpa membahas ulang dengan pemilik):**

- **Diskon J&T = pengurang biaya, bukan pendapatan.** Biaya yang dibukukan selalu `net_cost`
  (bruto − diskon). Efek diskon sudah otomatis masuk margin dihitung dari net; kalau dihitung dari
  bruto, laba terbaca lebih kecil dari yang sebenarnya.
- **Beban masuk ke bulan TANGGAL PENGIRIMAN** (`jnt_invoice_items.delivery_date`), bukan bulan bayar.
- **Tiga lapis angka sengaja tidak digabung**: (1) tagihan J&T — basis tanggal pengiriman;
  (2) ongkir yang dibayar customer (`orders.shipping_cost`); (3) omzet produk (`total − shipping_cost`)
  — keduanya basis **`orders.created_at` (WIB) + `SALE_STATUSES`**, sama seperti `/api/ops/laporan`
  dan Produk Terlaris. Sejak 2026-10-23 rumus lapisan (3) dipusatkan di
  **`orderRevenue(order)`** (`src/lib/transaksi.ts`) dan **semua kartu omset/penjualan** memakainya —
  Laporan (`Omzet Bruto` + ringkasan metode pembayaran + tren), Dashboard ops (`Omzet Bruto`,
  tren harian, AOV, laba, margin), menu Transaksi (`Omset bulan ini`), Database Kota
  (`Total Omset`, rata-rata per pesanan), panel-admin (`Omset hari ini`), dashboard admin
  (`dashRevenue`), dan tool AI `ringkas_operasional`. Jangan menjumlahkan `orders.total` langsung
  lagi di kartu omset: nilainya masih memuat ongkir. Query-nya harus ikut menarik `shipping_cost`
  (route kota, dashboard ops, laporan, admin-tools). Basis itu juga **dilabeli di UI** (2026-10-23):
  kartu `Pendapatan` + judul grafik `Pendapatan Bulanan` di dashboard admin
  (`src/components/admin/DashboardView.tsx`) dan kartu `Omset hari ini` di panel-admin
  (`src/app/panel-admin/(panel)/page.tsx`) memakai keterangan kecil **"Hanya harga produk (tanpa
  ongkir)"** (`note` di `metrics`/`MetricCard`, gaya `.stNote` di `panel.module.css`); grafik
  "Pendapatan Bulanan" yang dulu menjumlah `o.total` kini ikut `orderRevenue()` (`DashboardOrder`
  membawa `shipping_cost`). **Revisi 2026-10-23 (sore)**: di dashboard admin keterangan itu
  dipendekkan jadi bagian dari caption satu baris **"126 transaksi · tanpa ongkir"** dan basis
  lengkapnya pindah ke subjudul grafik + tooltip kartu — lihat bagian "Kartu dashboard admin"
  di bawah; panel-admin belum ikut diubah. Margin ongkir = (2) − (1) net, **hanya dari resi yang cocok ke pesanan**;
  omzet produk tidak pernah ikut ke angka margin. PPN invoice punya baris sendiri (menunggu
  keputusan akuntan) dan belum digabung ke biaya ongkir.
- **Jumlah transaksi = `saleCount()` + `SALE_COUNT_NOTE`** (`src/lib/transaksi.ts`, 2026-10-23).
  Kartu "Total Transaksi" (dashboard ops) dan "N transaksi" (Laporan Keuangan) memang sudah memakai
  `SALE_STATUSES`, tapi dashboard admin & panel admin cuma menampilkan jumlah SEMUA pesanan masuk —
  itulah yang membuat angka "jumlah transaksi" beda antar layar. Sekarang kartu pesanan di kedua
  dashboard membawa keterangan kecil **"N transaksi diakui"** dari `saleCount(orders)` —
  keterangannya **dipendekkan 2026-10-23** (pemilik: "keterangan card di dashboard update broo biar
  ga terlalu panjang bikin informatif"): dulu *"Termasuk belum bayar/batal · N transaksi diakui
  (diproses/dikirim/selesai)"*, sekarang `SALE_COUNT_NOTE` = "transaksi diakui" saja
  (`src/lib/transaksi.ts`; status yang dihitung tetap `SALE_STATUSES`). Dulu angka besar kartunya =
  jumlah SEMUA pesanan masuk dan `saleCount` hanya jadi keterangan kecil; **sejak 2026-10-24** kartu
  "Pesanan Masuk" (dashboard admin) dan "Pesanan masuk" (beranda panel-admin) memakai `saleCount()`
  sebagai NILAI besarnya dengan keterangan "dari N pesanan masuk \<periode\>" (N = semua pesanan
  periode itu). Jangan menghitung ulang filter status di layar — pakai `saleCount`.
  **Menu Transaksi** (`/panel-admin/transaksi` dan `/ops/transaksi`, satu komponen
  `src/app/ops/transaksi/page.jsx`) sempat beda sendiri: kartu **"Total transaksi"** di sana memakai
  `orders.length`, jadi menampilkan SEMUA baris bulan itu (mis. 143 = 126 diakui + 5 belum bayar +
  12 batal) sementara dashboard ops & laporan berbunyi 126. Sekarang **angka besarnya
  `saleCount(orders)`**, jadi angkanya sama dengan laporan. Keterangan kartunya **sejak 2026-10-24
  memakai kalimat kartu dashboard admin** (permintaan pemilik: *"kalimat dashboard persis"*):
  `Total transaksi` → **"Di luar batal & belum bayar"**, `Omset bulan ini` → **"N transaksi
  berhasil"**, `Belum bayar` → **"menunggu pembayaran"** (kartu `Perlu diproses` tidak punya
  padanan di dashboard, keterangannya tetap "Packing + siap kirim"). Label periode tidak lagi
  ditulis di keterangan — dulu *"dari N pesanan masuk <bulan>"*, sebelumnya lagi *"Oktober 2026 ·
  dari 143 pesanan masuk"* — karena pemilih bulan di bar filter sudah menunjukkannya;
  `panelKpis.ordersIn` dihapus karena sudah tidak dipakai. Tab tahap di
  bawahnya tetap menghitung semua baris — tab itu filter daftar, bukan angka transaksi.
  **Panel Order Management dashboard admin** (`src/components/admin/OrdersView.tsx`, 2026-10-23) ikut
  disamakan: kartu **"Total transaksi"** di sana dulu memakai `orders.length`, jadi menampilkan SEMUA
  baris periode itu (143 = 126 diakui + 5 belum bayar + 12 batal, angka yang terlihat di layar admin),
  padahal layar lain berbunyi 126. Sekarang angka besarnya `saleCount(orders)` dan keterangannya
  memakai **kalimat dashboard admin yang sama persis** (2026-10-24) — `Total transaksi` → "Di luar
  batal & belum bayar" (kartu *Pesanan Masuk*), `Omset bulan ini` → "N transaksi berhasil" (kartu
  *Pendapatan*), `Belum bayar` → "menunggu pembayaran"; `kpis.ordersIn` dihapus karena label
  periode tidak lagi ditulis di keterangan (pemilih bulan di bar filter sudah menunjukkannya). Kartu
  **"Omset bulan ini"** di panel yang sama juga ikut `orderRevenue()` (dulu menjumlah `o.total`, jadi
  masih memuat ongkir: 51.634.621 vs 48.331.123 pada 2026-10). Tab tahap + filter "Belum di packing"
  tetap menghitung semua baris — itu filter daftar, bukan angka transaksi.

## Kartu dashboard admin: 126 vs 143, keterangan satu baris, tren, grafik batang (2026-10-23/24)

Pemilik bertanya "transaksi yang benar berapa, 126 apa 143" sambil meminta keterangan kartu **satu
baris**, grafik **naik-turun**, desain lebih modern, dan kartu "Kategori Teratas" diganti. Semua
angka dijawab dari data nyata, tanpa mengubah aturan hitung mana pun.

**Jawaban angkanya (Oktober 2026, dicek langsung lewat REST `orders`):** 143 = SEMUA pesanan masuk
bulan itu (belum bayar 5 + diproses 13 + dikirim 14 + selesai 99 + dibatalkan 12); **126** = yang
diakui sebagai transaksi (`saleCount`, `SALE_STATUSES`), jadi 143 − 126 = 17 (5 belum bayar +
12 batal). Keduanya benar, beda pertanyaan — dan itu sekarang terbaca di UI: kartu berl label
**"Pesanan Masuk"** bernilai 143 dengan keterangan **"126 transaksi diakui"** (tooltip kartunya
menyebut rincian 126/5/12), sedangkan kartu `Pendapatan` berketerangan "126 transaksi · tanpa
ongkir" dan donut `Per Status` memecah 143 per status. Jangan "menyamakan" 143 dan 126: angkanya
memang beda per definisi. **Revisi 2026-10-24 (malam):** kartu "Pesanan Masuk" tidak lagi 143 maupun
132 — nilainya sekarang `saleCount()` = **126** (belum bayar & batal sama-sama tidak dihitung),
lihat butir terakhir di bagian ini.

- **Keterangan kartu satu baris** (permintaan pemilik: "tulisan keterangan di card bikin sejajar
  1 baris"): kartu metrik di `src/components/admin/DashboardView.tsx` sekarang label (uppercase) +
  chip tren di baris atas, nilai besar, lalu caption `.truncate` (satu baris, dipotong `…` kalau
  tidak muat). **Caption wajib pendek** — di `xl` kartu hanya ~205 px, jadi kalimat panjang
  terpotong; caption terpanjang sekarang "126 transaksi · tanpa ongkir" (28 karakter). Rincian
  panjang ditaruh di `title` kartu (tooltip), bukan di caption. Kalau menambah kartu/keterangan
  baru, ukur lagi di 4 kolom sebelum menyerahkannya.
  **Revisi 2026-10-24 (pemilik: "tulisan d card nya kepotong"):** nama kartu **tanpa `truncate`**
  (sempat `flex-wrap` + chip di baris kedua; lihat revisi berikutnya — chip itu sudah dipindah).
  **Revisi terakhir 2026-10-24 (pemilik mengirim contoh desain: "dibikin kaya gini sih broo yg
  trend naik turun nya sama grafik nya juga"):** susunan kartu mengikuti contoh itu —
  **nama kartu sendiri di barisnya → nilai besar → tren → caption**. Nama kartu jadi tidak pernah
  bersaing ruang dengan apa pun (itu akar keluhan `RATA-RATA PESAN…`), dan baris tren dibungkus
  `h-[18px]` yang **selalu ada** (kartu tanpa pembanding, mis. "Belum Bayar", menyisakan baris
  kosong) supaya caption keempat kartu tetap segaris. Pertahankan urutan itu; **jangan**
  mengembalikan `truncate` ke nama kartu atau menaruh tren sebaris dengan nama kartu lagi.
  Verifikasi (2026-10-24, `/admin` dibuka lewat iframe same-origin di preview, data termuat):
  `Pendapatan Rp 48.331.123 · +615,8% ▲ dari Sep` · `Pesanan Masuk 126 · +869,2% ▲ dari Sep` ·
  `Rata-rata Rp 383.580 · -26,1% ▼ dari Sep` · `Belum Bayar 7`; nama kartu & caption tidak
  terpotong di 4 kolom desktop maupun tablet 867 px; tren terbaca tepat di bawah nilai; tanpa
  scroll samping & 0 error console.
- **Keterangan tiga kartu + animasi counter (2026-10-24, permintaan pemilik).** `Pendapatan` kini
  berketerangan **"126 transaksi berhasil"** (angkanya dinamis, `saleCount(orders)` — basis "tanpa
  ongkir" tinggal di tooltip kartu + subjudul grafik), `Pesanan Masuk` **"Di luar batal & belum
  bayar"**, `Rata-rata Pesanan` **"Rata-rata nilai pesanan"** (dulu `per transaksi diakui`;
  `SALE_COUNT_NOTE` karena itu tidak lagi diimpor di `DashboardView.tsx`), sedangkan kartu
  **`Belum Bayar` tidak diubah** ("menunggu pembayaran"). Ketiganya ≤ 27 karakter dan **tidak
  terpotong** di 4 kolom (1280 px: `scrollWidth == clientWidth` = 163 px). Angka kartu bukan lagi
  string jadi: `Metric` membawa **`num` + `format`**, dirender **`CountUp`**
  (`src/components/admin/CountUp.tsx`, requestAnimationFrame ~700 ms ease-out;
  `prefers-reduced-motion: reduce` → langsung angka akhir) supaya nilai kartu "dihitung naik" saat
  kartu muncul / nilainya berubah — berlaku ke **keempat** kartu (termasuk `Belum Bayar`, hanya
  keterangannya yang tidak disentuh), dan nilai besar memakai `tabular-nums` supaya lebarnya tidak
  melompat. Kartu tanpa transaksi tetap menampilkan "—", bukan Rp 0.
  Verifikasi (2026-10-24, `/admin` dimuat di iframe same-origin): counter terbaca berubah frame demi
  frame (`Rp 0` → `Rp 4.162.119` → … → `Rp 48.331.123`, 18 nilai berbeda) lalu berhenti tepat di
  angka aslinya; keempat caption utuh; badge `▲ 615,8% dari Sep` (hijau `rgb(22,163,74)`) ·
  `▲ 869,2% dari Sep` · `▼ 26,1% dari Sep` (merah `rgb(220,38,38)`) dengan latar transparan 11 px;
  batang grafik `rgb(17,17,17)` hanya di Okt, 5 lain `rgb(217,217,217)`; 0 error console.
- **Tren naik/turun** (`TrendDelta`, dulu `TrendChip`) = pembanding bulan sebelumnya: panah + persen
  lalu `dari <bulan>` kecil abu — mis. `▲ 615,8% dari Sep` (Oktober 2026). **Tanpa latar chip.**
  **Revisi 2026-10-24 (pemilik: badge tren "kurang clean dan terlalu mencolok")**: gayanya
  diperkecil jadi panah 9 px + persen 11 px `font-semibold tabular-nums` (naik hijau `#16a34a`,
  turun merah `#dc2626`) **tanpa tanda `+`/`-`** — arah dibaca dari panah + warna; jarak `gap-0.5`,
  `dari <bulan>` 10 px abu. Jangan kembalikan `font-black` 12 px bertanda + warna tua `#047857`.
  Bulan lalu tanpa data (prev = 0) → **disembunyikan**, bukan dibagi nol/dikarang. Nilai pembanding
  dihitung dari jendela grafik 6 bulan (`chartOrders`), bukan query tambahan. Komponen yang sama
  dipakai untuk tren di header grafik "Pendapatan Bulanan".
- **Kartu "Kategori Teratas" diganti "Belum di Packing"** (jumlah pesanan lunas yang resinya belum
  dibuat) memakai **`orderStage()`** dari `src/lib/order-flow.ts` — jadi angkanya selalu sama dengan
  tab "Belum di Packing" di panel Order Management. Prop `products` di `DashboardView` (dulu hanya
  untuk kategori teratas) sudah dihapus dari komponen **dan** pemanggilnya.
  **Kartu keempat diganti lagi 2026-10-24** (pemilik: "Belum di Packing card ini harusnya buat Blm
  bayar bro lebih enak"): isinya sekarang **"Belum Bayar"** — nilai `orderStage(o) === "belum_bayar"`
  (`ORDER_STAGE_LABEL.belum_bayar`), jadi selalu sama dengan tab "Belum Bayar" di panel Order
  Management dan irisan `pending` di donut `Per Status` (Oktober 2026: **6**), caption satu baris
  **"menunggu pembayaran"**, rincian di tooltip kartu. `toPackOrders` dihapus dari komponen; status
  "Belum di Packing"/"Menunggu Pickup" tetap terbaca di tab & filter cepat panel Order Management
  serta menu Transaksi ops — jangan menambahkannya kembali sebagai kartu dashboard tanpa permintaan
  baru. Verifikasi (2026-10-24, sesi admin diputar ulang): `/admin` menampilkan kartu **BELUM BAYAR
  6 / "menunggu pembayaran"** (cocok dengan donut `pending` 6), kartu "Belum di Packing" tidak ada
  lagi, caption keempat kartu tidak terpotong, 0 error console.
- **Grafik "Pendapatan Bulanan" jadi BATANG naik-turun** (`src/components/admin/MonthlyTrendChart.tsx`;
  kurva/area SVG lama diganti HTML-CSS 2026-10-24 mengikuti contoh desain pemilik, tetap **tanpa
  dependency chart baru**): 6 batang Mei–Okt berujung membulat, **batang bulan PERIODE TERPILIH
  selalu HITAM `#111111`** (batang "bulan aktif"; bulan lain abu muda `#d9d9d9`, batang yang
  disorot abu `#6b6b6b`) — **revisi 2026-10-24 (pemilik: "grafik nya warna hitam broo")**: batangnya
  monokrom, hijau `#00a36c`/`#7fd3b1`/`#cdeee0` sudah tidak dipakai (lihat konstanta
  `BAR_ACTIVE`/`BAR_HOVER`/`BAR_REST`); grid 5 garis + sumbu Y ringkas (`20jt`/`800rb`), label bulan di
  bawah tiap batang. Bulan beromzet Rp 0 tidak digambar (batangnya memang nol), bukan dihilangkan
  dari label. **Tooltip melayang** — kartu putih ber-shadow berisi titik hitam + `Pendapatan · <bulan>`
  + nominal tebal + `N pesanan` — menempel di batang bulan terpilih saat tidak ada mouse (dulu
  nilainya hanya teks di titik tertinggi), dan ikut pindah ke batang yang disorot. Judulnya tetap
  bersubjudul "6 bulan terakhir · hanya harga produk (tanpa ongkir)" + tren.
  Angka & aturan hitungnya tidak disentuh — presentasi saja.
  Verifikasi (2026-10-24, `/admin` lewat iframe): 6 batang (Mei–Agu Rp 0 → tanpa batang, Sep 22 px,
  Okt 155 px ≈ 60% dari batas 80jt) dengan warna `rgb(0,163,108)` hanya di Okt, label bulan
  Mei–Okt, sumbu `0/20jt/40jt/60jt/80jt`, tooltip default `PENDAPATAN · OKT / Rp 48.331.123 /
  133 pesanan`. **Belum terverifikasi otomatis**: tooltip pindah saat batang lain DI-HOVER —
  gerakan mouse nyata tidak bisa didorong dari kode preview (`MouseEvent` yang disebar tidak
  memicu `onMouseEnter`), jadi periksa manual dengan kursor.
- **Datanya sekarang 6 bulan ASLI.** Dulu `chartOrders={orders}` = 50 pesanan terbaru, jadi bulan
  lama tampak Rp 0. Sekarang `src/app/admin/page.tsx` mengambil **jendela 6 bulan** (bulan terpilih
  + 5 sebelumnya, `monthRangeWIB` + `monthShift`, `/api/ops/orders?from&to&limit=1000`) bersama
  query bulan terpilih lewat satu `Promise.all`, lalu mengirimnya sebagai prop `chartOrders`;
  `DashboardView` mengelompokkannya per bulan WIB (`monthKeyWIB`) untuk 6 titik yang berakhir di
  bulan terpilih. Prop baru: **`periodValue`** ("YYYY-MM", dasar label & jendela grafik).
- **Satu sumber bulan WIB**: modul baru **`src/lib/month-period.ts`** (`currentMonthWIB`, `monthShift`,
  `monthLabelID`, `monthShortID`, `monthKeyWIB`, `monthRangeWIB`). `src/app/admin/page.tsx` tidak
  lagi menyimpan `currentMonthValue`/`monthLabelParts`/`monthRangeUTC`/regex pergeseran bulan —
  semuanya memanggil modul itu, supaya rentang query, label periode, label grafik, dan chip tren
  tidak bisa berbeda. Dashboard ops masih punya perhitungannya sendiri (belum diubah).
- **Donut `Per Status`** tetap seperti sebelumnya (irisan per status + total di tengah), hanya
  keterangannya ditambah "semua pesanan masuk" dan **persen** per baris legenda.
- **Pesanan DIBATALKAN tidak dihitung sebagai "pesanan masuk"** (permintaan pemilik 2026-10-24:
  "harusnya yg batal jgn di itung dong"). Satu predikat `isCancelledOrder()` di
  `src/components/admin/DashboardView.tsx` dipakai untuk EMPAT angka sekaligus supaya tidak bisa
  beda lagi: kartu **"Pesanan Masuk"** (Oktober 2026: 144 → **132**), angka tengah + irisan donut
  `Per Status` (subjudulnya jadi "{periode} · tanpa pesanan dibatalkan"; irisan `dibatalkan` tidak
  lagi digambar), chip tren **"vs bulan lalu"** (bulan pembanding dihitung dari himpunan yang
  sama — terbukti "+915,4% vs Sep" = 132 vs 13, bukan 132 vs 16), dan jumlah pesanan di tooltip
  grafik tren (`MonthlyTrendChart`). Jumlah pesanan batal tetap terbaca di tooltip kartu
  ("12 dibatalkan tidak dihitung"), di tab **Dibatalkan** panel Order Management, dan di donut
  bulan lain. **Jangan** mengembalikan `orders.length` untuk kartu itu.
  Verifikasi (2026-10-24, sesi admin diputar ulang): kartu "Pesanan Masuk" **132** / "126 transaksi
  diakui"; donut **132 pesanan masuk** (selesai 99 · 75%, dikirim 14 · 11%, diproses 13 · 10%,
  pending 6 · 5%, tanpa baris dibatalkan); klik `<` → September 2026 **13** (16 − 3 batal) dengan
  donut 13 (selesai 13 · 100%); 0 error console.
- **Kartu "Pesanan Masuk" juga TIDAK menghitung pesanan BELUM BAYAR** (permintaan pemilik
  2026-10-24: "blm bayar juga jgn harus nya broo"). Nilai kartunya sekarang `saleCount(orders)`
  (`SALE_STATUSES` — diproses/dikirim/selesai; Oktober 2026: 132 → **126**), keterangan satu baris
  **"tanpa belum bayar & batal"**, tooltipnya menyebut rinciannya ("6 belum bayar dan 12 dibatalkan
  tidak dihitung"), dan chip tren membandingkan himpunan yang sama (126 vs 13 September = 869,2%;
  dulu 132 vs 13 = 915,4%). Pemilik memilih **hanya kartu ini** yang berubah lewat pertanyaan
  klarifikasi — donut `Per Status` (angka tengah 132 + irisan `pending` 6) dan jumlah pesanan di
  tooltip grafik tren **tetap** "semua pesanan minus dibatalkan" (angka mentahnya 132). Keterangan
  kartu di panel Order Management/menu Transaksi sendiri sekarang memakai kalimat kartu dashboard
  (2026-10-24) — lihat bagian "Ongkir J&T". Jadi kartu (126) memang lebih kecil dari donut (132) tepat
  sebesar 6 pesanan belum bayar — disengaja, **jangan** "disamakan". Di kode, `incomingOrders`
  (semua minus batal) hanya dipakai donut + grafik; kartu dan chip-nya memakai `saleOrders` /
  `prevSales`.
  Verifikasi (2026-10-24, sesi admin diputar ulang, tablet 867 px): kartu "Pesanan Masuk" **126** /
  "tanpa belum bayar & batal" · Pendapatan Rp 48.331.123 / "126 transaksi · tanpa ongkir" ·
  Rata-rata Rp 383.580 / "per transaksi diakui" · Belum di Packing 10; donut tetap **132**
  (selesai 99 · 75%, diproses 13 · 10%, dikirim 14 · 11%, pending 6 · 5%) = 126 + 6; klik `<` →
  September kartu **13** (0 belum bayar, 3 batal) dan donut 13; caption keempat kartu **tidak
  terpotong** di 4 kolom desktop maupun 375 px; 0 error console. Kartu "Pesanan masuk" di panel-admin
  **sudah disamakan 2026-10-24** (lihat "Keterangan kartu Transaksi"). **Belum diuji**: angka
  mentah REST (`/api/ops/orders` membalas 401 untuk sesi preview, jadi kecocokan 132 − 6 = 126
  dibuktikan dari donut di halaman yang sama, bukan dari query terpisah).
- **Verifikasi (2026-10-23, sesi admin diputar ulang via preview)**: `npx tsc --noEmit` bersih;
  `curl /admin` & `/id/admin` = 200; di `/admin` kartu berbunyi Pendapatan Rp 48.331.123
  (+615,8% vs Sep) · Pesanan Masuk 143 / "126 transaksi diakui" · Rata-rata Rp 383.580 (−26,1% vs
  Sep) · Belum di Packing 10 — semuanya sama dengan hitungan REST; caption **satu baris dan tidak
  terpotong** di tablet 867 px, mobile 375 px, dan desktop 4 kolom (205 px), tanpa scroll samping di
  ketiganya; grafik menampilkan 6 label bulan Mei–Okt (nilai puncak Rp 48.331.123) dan sorot mouse
  pada titik Mei mengubah label nilainya jadi Rp 0; donut 143 (selesai 99 · 69%, diproses 13 · 9%,
  dikirim 14 · 10%, pending 5 · 3%, dibatalkan 12 · 8%); klik `<` → September 2026
  (Rp 6.752.000 / 16 pesanan masuk / 13 transaksi diakui) lalu `>` kembali ke Oktober; 0 error
  console. **Belum diuji**: tampilan tanpa sesi admin, dan chip tren untuk bulan yang bulan
  sebelumnya kosong (Agustus) — logikanya `previous > 0` (chip disembunyikan), belum dilihat di
  browser.
- **Basis tanggal omzet di Laporan Keuangan saat ini = `orders.created_at`** (bulan WIB, hanya
  `SALE_STATUSES`), sedangkan beban ongkir di halaman ini memakai tanggal pengiriman. Dua basis itu
  memang beda dan sudah dilabeli di UI — jangan disamakan tanpa mengubah Laporan juga.

**Data.** `supabase/migrations/20261023_jnt_invoices.sql` membuat `jnt_invoices` (header bulanan,
satu baris per `period` 'YYYY-MM'), `jnt_invoice_items` (baris per resi, **`awb_no` UNIQUE** = kunci
idempoten; `net_cost`, `has_discount`, `order_number`, `shipping_cost`), index, RLS aktif **tanpa
policy** (data keuangan: hanya service role), plus view **`jnt_ongkir_expense`** (beban net per
bulan) yang adalah SATU sumber untuk Pengeluaran & Laporan Keuangan nanti — jangan catat beban
ongkir J&T sebagai pengeluaran manual supaya tidak terhitung dua kali. **Dijalankan manual** di SQL
Editor Supabase (sandbox tidak punya jalur DDL, sama seperti `jnt-settings.sql`).

**API** (`isOpsAdmin`): `GET /api/ops/ongkir-jnt?period=YYYY-MM` (header + rincian + ringkasan),
`POST` yang sama untuk menyimpan header invoice, dan `POST /api/ops/ongkir-jnt/upload` (multipart
`file` + `period`). Logika berat ada di dua modul: `src/lib/xlsx-lite.ts` (pembaca .xlsx
**tanpa dependency** — zip via `node:zlib` + parser XML; `package-lock.json` proyek ini pernah drift
dan `npm ci` gagal, jadi jangan tambah library hanya demi ini) dan `src/lib/jnt-invoice.ts` (peta
header→item, `toNumber`/`toIsoDate`, ringkasan — modul murni, bisa diuji lewat Node), plus
`src/lib/jnt-invoice-db.ts` (query + pencocokan `orders.awb_no`). Kolom dicari lewat NAMA header,
bukan posisi, jadi urutan kolom ekspor J&T boleh berubah — tapi header wajib memuat
`No. Waybill` + `Biaya Kirim`, kalau tidak request dibalas 400 dengan pesan yang menyebut "Resi Saya".

**Tabel per resi harus muat tanpa geser.** `JntItemsTable.tsx` sempat memakai `min-w-[1000px]`,
sehingga di desktop 1280 px — kolom konten hanya **911 px** setelah sidebar 248 px + `lg:p-8` —
kolom terakhir **Selisih terpotong** walau pembungkusnya `overflow-x-auto` (pemilik melihatnya
sebagai "tabelnya kepotong"). Sekarang `w-full min-w-[760px]`, padding sel `pr-2`, dua header
dipendekkan (`Tgl Kirim`, `Net Dibukukan`), dan kolom Tujuan dipotong `max-w-[150px]`: lebar alami
tabel **853 px**, jadi muat penuh (0 px geser) mulai lebar viewport ~1200 px ke atas dan tidak ada
scroll samping di halaman. Di bawah itu 10 kolom memang tidak bisa dipadatkan lagi → tabel tetap
bisa digeser mendatar (petunjuk "Geser tabel ke samping…", `xl:hidden`). **Jangan** menaikkan
`min-width`-nya lagi atau menghapus pembungkus `overflow-x-auto` tanpa mengukur ulang di 1280 px
(uji: 1280 → 0 px geser, 1024 → 198 px, 375 → 567 px).

**Revisi 2026-10-24 (pemilik: "no resi sama tgl terlalu banyak space kosong, semua tulisan bikin
sejajar").** Dua kolom pertama dipatok selebar isinya (`w-[1%]` + `whitespace-nowrap` di `th`
No. Resi & Tgl Kirim) dan badge **"Tanpa Diskon" dipindah ke baris kedua** di bawah nomor resi
(`mt-1 flex w-fit`, dulu `ml-2 inline-flex` sebaris) — badge yang cuma dipakai 2 resi
(`JO0329572178`, `JO0329677967`) itulah yang melebarkan kolom No. Resi untuk SEMUA baris. Seluruh
baris juga `align-top` (`td`/`th` mewarisi `vertical-align` dari `<tr>`, jadi semua baris kode baru
ikut tanpa menyetel tiap sel); sebelumnya sel memakai `vertical-align` bawaan sehingga sel 2 baris
(badge / nomor pesanan di bawah ongkir) membuat baris pertama tiap kolom tidak sebaris.
Hasil ukur (iframe same-origin di preview, sesi admin diputar ulang, 2026-10-24): lebar kolom
`No. Resi 110 · Tgl Kirim 77 · Tujuan 159 · Layanan 64 · Berat 46 · Biaya Kirim 80 · Diskon 76 ·
Net Dibukukan 105 · Ongkir Customer 128 · Selisih 65` px → tabel **911 px = lebar pembungkus**
(0 px geser) di 1280 px, `vertical-align` semua sel `top` dan garis atas teks pertama tiap sel
dalam satu baris berbeda ≤1 px, 125 baris, tanpa scroll samping di 1280/1024/375 px, 0 error
console. **Jangan** mengembalikan badge itu sebaris dengan nomor resi atau menghapus `align-top`.
Catatan tool: trik **`<iframe src="/ops/ongkir-jnt">`** (same-origin, lalu baca
`frame.contentDocument` / `frame.contentWindow.getComputedStyle` — pakai `contentDocument.createRange()`
untuk mengukur baris teks) juga bekerja untuk route `/ops/*`; `navigate()` tetap gagal di sana dan
sesi admin putaran preview 2026-10-24 bisa membuka halaman ini beserta 125 barisnya, jadi catatan
2026-10-23 yang menyebut `/ops/*` selalu menampilkan login tidak lagi berlaku.

**Idempotensi & pratinjau.** Bulan tagihan setiap baris diambil dari tanggal pengirimannya (satu
file boleh memuat dua bulan; invoice baris dibuat otomatis per bulan). Upload ulang file yang sama →
`new: 0`, `existing: 125`, `failed: 0`, tidak ada baris ganda. Kalau tabelnya belum ada, upload
**tidak** mati: route membalas `tableReady:false` + `saved:false` berisi hasil BACA file (jumlah
resi per bulan, baris gagal, total) dan UI menampilkannya sebagai **pratinjau** dengan peringatan
jelas — tidak ada satu baris pun yang ditulis.

**Verifikasi (2026-10-23).** Pembaca + peta diuji langsung lewat Node terhadap dua ekspor asli
"Resi Saya" milik pemilik: file 50 resi → 50 item, bruto Rp1.654.500, diskon Rp397.875, net
Rp1.256.625; file 125 resi → 125 item, bruto Rp3.207.000, diskon Rp786.000, net Rp2.421.000 (sama
dengan hitungan manual di luar app). Berkas uji bersisi rusak (resi kosong, tanggal tak dikenal,
biaya bukan angka, resi dobel) → 3 item + 4 baris gagal dengan alasannya; header salah → ditolak.
`tsc --noEmit` bersih; `/ops/ongkir-jnt` = 200 (gerbang login ops); `/api/ops/ongkir-jnt` dan
`/upload` tanpa sesi = 401. **BELUM terbukti end-to-end** (dan tidak bisa dari sandbox): simpan
header invoice, tulis baris upload, idempotensi di database, pencocokan `orders.awb_no`, dan angka
margin — semuanya butuh (a) migration dijalankan lebih dulu dan (b) sesi admin ops di browser
preview (putaran sesi yang tersedia bukan sesi admin, jadi `/ops/*` selalu menampilkan login).
Jangan tandai butir-butir itu "verified" sebelum keduanya ada.

**Pertanyaan terbuka untuk J&T.** Ekspor kedua (125 resi) memuat **2 resi bertanda "Tanpa Diskon"**
(`JO0329572178` Rp47.000 dan `JO0329677967` Rp16.000) sedangkan baris lain dapat diskon 25%; kalau
keduanya seharusnya dapat diskon, ada potensi kelebihan bayar ±Rp15.750. Selain itu, invoice periode
yang ditagih belum tentu sama dengan file yang diunggah — filter tanggal portal J&T harus dicek
lewat angka "Total X" sebelum menekan Ekspor, dan `outsidePeriod` di balasan upload menandai baris
yang tanggalnya di luar bulan terpilih.

## Keterangan kartu Transaksi & "tidak ada loading saat pindah menu" (2026-10-24)

Permintaan pemilik: keterangan kartu diganti mengikuti mockup dashboard ops ("biar admin enak baca"),
dan **setiap pindah menu tidak boleh ada layar loading**, diterapkan di tiga dashboard internal
(admin, ops, panel-admin).

**Keterangan kartu** (mockup, menggantikan kalimat "dashboard persis" 2026-10-24 pagi):

| Kartu | Angka besar | Keterangan sekarang |
|-------|-------------|---------------------|
| Total transaksi | `saleCount(orders)` (126) | **"Di luar batal & belum bayar"** (`SALE_BASIS_NOTE` di `src/lib/transaksi.ts`) — revisi 2026-10-24 malam, menggantikan "dari <semua pesanan periode> pesanan masuk <periode>" (mis. "dari 145 pesanan masuk Oktober 2026") |
| Omset bulan ini | `orderRevenue()` total | "Tidak termasuk dibatalkan" |
| Belum bayar | `orderStage() === "belum_bayar"` | "Perlu follow-up" |
| Perlu diproses | tahap belum/sudah dipacking | "Packing + siap kirim" |

Keterangan itu **selalu tampil** — tidak lagi bergantian dengan label periode/teks loading
(`coverageLabel`, `periodCaption`, `sourceLabelText` sudah dihapus). Berkasnya:
`src/app/ops/transaksi/page.jsx` (dipakai `/ops/transaksi` **dan** `/panel-admin/transaksi` lewat
`variant="panel"`) dan `src/components/admin/OrdersView.tsx` (panel Order Management). Angka besar
tetap `saleCount` — **jangan** kembalikan `orders.length` sebagai nilai kartu; jumlah semua pesanan
periode itu hanya muncul di keterangan.

**Kartu dashboard admin (panel Dashboard) ikut disamakan 2026-10-24** (permintaan pemilik:
*"keterangan yg di panel admin samain kaya yg lain di menu transaksi sama dashboard"*) — keterangan
empat kartu `src/components/admin/DashboardView.tsx`: `Pendapatan` → **"Tidak termasuk dibatalkan"**,
`Pesanan Masuk` → **"dari N pesanan masuk <periode>"** (N = `orders.length` periode itu; kalimat dan
angkanya sama persis dengan kartu `Total transaksi` di menu Transaksi, karena keduanya menerima
`dashOrders` yang sama), `Belum Bayar` → **"Perlu follow-up"**. Kartu `Rata-rata Pesanan` **tetap**
"Rata-rata nilai pesanan" — sama seperti kartu `Perlu diproses` di menu Transaksi, tidak punya
padanan di layar lain. Jadi keempat keterangan mockup sekarang terbaca di panel Dashboard **dan**
menu Transaksi; jumlah SEMUA pesanan periode itu (mis. 145) hanya muncul di keterangan, **bukan**
sebagai nilai kartu (`saleCount` tetap nilai besarnya). `npx tsc --noEmit` bersih; tampilan belum
diperiksa ulang di browser (pemilik minta tidak diverifikasi lama).

**Beranda panel admin disamakan 2026-10-24** (permintaan pemilik: *"samakan semua teks caption KPI
di Panel-Admin agar seragam dengan Admin dan Ops"*, lalu jawabannya *"dari 145 pesanan masuk
Oktober 2026 yg ini loh"* + pilihan **"Ikut Admin persis"**): kartu **"Pesanan masuk"** di
`src/app/panel-admin/(panel)/page.tsx` sekarang **persis** kartu *Pesanan Masuk* dashboard admin —
nilai besarnya `saleCount(todayOrders)` (transaksi diakui) dan keterangannya **"dari N pesanan
masuk hari ini"** (N = SEMUA pesanan hari itu); catatan kecil "N transaksi diakui" dihapus (angkanya
sudah jadi nilai besar) dan rinciannya pindah ke tooltip kartu (`hint`), sedangkan chip tren
membandingkan himpunan yang sama (`saleCount` hari ini vs kemarin) seperti di admin. Karena itu
`SALE_COUNT_NOTE` tidak lagi diimpor di file itu. Tiga kartu lain sengaja **tidak** diubah — tidak
punya padanan di Admin/Ops: `Omset hari ini` (keterangan "Dari kemarin" = pembanding harian),
`Perlu dikirim`/"Menunggu resi", dan `Varian menipis`/"Sisa stok 1–5 unit". Caption kartunya kini
~30 karakter sementara `.stFoot` dulu `white-space: nowrap` → `panel.module.css` membuat baris kaki
kartu **membungkus** (`flex-wrap: wrap`, `nowrap` dilepas) seperti caption kartu menu Transaksi yang
juga panjang; tanpa itu keterangannya meluber keluar kartu di layar 4 kolom.
Verifikasi (2026-10-24, sesi admin diputar ulang, `/panel-admin` dimuat lewat iframe same-origin —
`navigate()` memang tidak bekerja untuk route ini): kartu "Pesanan masuk" bernilai **0**
berketerangan **"dari 2 pesanan masuk hari ini"** (hari itu 2 pesanan, keduanya belum diakui → 0,
jadi angkanya memang lebih kecil dari N seperti di admin), catatan kecil "transaksi diakui" hilang,
tooltip berbunyi "0 dari 2 pesanan masuk hari ini (diproses/dikirim/selesai · belum bayar &
dibatalkan tidak dihitung)", chip tren "↘ 100%"; tidak ada kartu statistik yang meluber (tepi kanan
foot 313 ≤ tepi kartu 334 di client 360 px) pada 1280 px, 1050 px, maupun 375 px; `npx tsc --noEmit`
bersih; 0 error console. **Catatan pre-existing**: di 375 px Beranda masih punya geser samping
±48 px dari baris daftar "Pesanan terbaru"/"Stok menipis" (`.listVal` `white-space: nowrap`), bukan
dari kartu KPI — tidak diperbaiki karena di luar permintaan.

**Pindah menu tanpa loading.**

- **Dashboard admin** (`src/app/admin/page.tsx`): panel yang sudah pernah dibuka tetap **terpasang**
  dan cuma disembunyikan (`keepPanels` + pembungkus `KeptPanel`, animasi masuk lama tetap dipakai),
  jadi pindah menu tidak me-render ulang panelnya dan tidak mengambil datanya lagi. Menu dimuat
  lebih awal lewat `preloadPanel` pada **klik** dan **`onMouseEnter`/`onFocus`** item sidebar, dan
  panel awal dari `?panel=` juga ikut di-preload — **wajib**, karena tanpa itu panel dari URL tidak
  dirender sama sekali (screenshot pembuktian: area konten kosong).
- **Panel admin** (`src/app/panel-admin/(panel)/page.tsx`): data Beranda disimpan di cache modul
  (`panelCache` berisi `day` + orders + variants) sehingga kembali ke Beranda langsung menampilkan
  data terakhir tanpa "Memuat…"; cache dibuang kalau hari WIB berganti.
- **Dashboard ops**: tidak diubah — QueryClient global di `OpsShell` sudah memakai
  `staleTime 60 detik` + `gcTime 10 menit` dan sidebar mem-prefetch route saat kursor menyentuh
  menu, jadi kunjungan ulang sudah memakai cache (skeleton tinggal di kunjungan pertama, saat
  datanya memang belum ada).
- **Pitfall** (dua-duanya ketangkap saat verifikasi): `const` yang dipakai di dependency array
  `useEffect` harus dideklarasikan **sebelum** effect-nya (`Cannot access 'preloadPanel' before
  initialization`), dan panel yang hanya dirender lewat `keepPanels` harus ikut diisi saat panel
  awal dipilih dari URL.
- Verifikasi (2026-10-24, iframe same-origin sesuai catatan tool di atas): `/admin?panel=orders` →
  keempat keterangan baru terbaca (`dari 0 pesanan masuk Oktober 2026` saat data belum tiba,
  `Tidak termasuk dibatalkan`, `Perlu follow-up`, `Packing + siap kirim`); `/ops/transaksi` →
  keterangan yang sama; klik **Pelanggan → Dashboard → Pelanggan** → kunjungan pertama memuat data
  (`Memuat…` muncul), kunjungan kedua **tanpa** teks Memuat/skeleton dan langsung menampilkan
  daftar pelanggan (219 baris); 0 error console.

**Revisi 2026-10-24 (malam) — keterangan kartu jadi "Di luar batal & belum bayar".** Pemilik
meminta kalimat "dari 145 pesanan masuk Oktober 2026" diganti **"Di luar batal & belum bayar"**:
angka besarnya memang `saleCount()` (diproses/dikirim/selesai), jadi keterangannya kini menyebut
status yang TIDAK dihitung, bukan jumlah semua pesanan periode itu. Kalimatnya dipusatkan sebagai
konstanta **`SALE_BASIS_NOTE`** di `src/lib/transaksi.ts` supaya tidak bisa beda antar layar lagi —
keempat pemakainya: `src/app/ops/transaksi/page.jsx` (dipakai `/ops/transaksi` **dan**
`/panel-admin/transaksi`), `src/components/admin/OrdersView.tsx` (panel Order Management),
`src/components/admin/DashboardView.tsx` (kartu **Pesanan Masuk**), dan
`src/app/panel-admin/(panel)/page.tsx` (kartu **Pesanan masuk** beranda, dulu "dari N pesanan masuk
hari ini"). Jangan menulis ulang kalimatnya literal di satu layar — impor konstanta itu. Karena
captionnya tidak lagi memuat periode/jumlah, `periodeKartu` + `formatTanggalID` di halaman
Transaksi dihapus (tidak terpakai; `orders.length` tetap dipakai tab tahap, dan jumlah hariannya
tetap terbaca di tooltip kartu beranda panel admin `hint`). `npx tsc --noEmit` bersih.

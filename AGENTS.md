# AGENTS.md — running this repo in the Base44 sandbox

Notes that are not obvious from the manifests.

## What this app is

Next.js 16 (App Router, Turbopack dev) + next-intl + Tailwind 4. All data lives in a
**hosted Supabase project** — there is no local database, ORM, or migration runner in
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
  `package-lock.json`). Change `package.json`/`package-lock.json` → the next container
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
  up empty. `/katalog` has **no** static fallback — an empty product list is the sign
  the Supabase credentials are missing/wrong.
- Optional integrations that degrade silently when unset: Cloudinary (admin image
  upload), RajaOngkir (shipping cost), J&T Express (tariff/order/track), Meta Pixel.

## Media backup (Cloudinary originals)

The Cloudinary account that hosted most media is no longer accessible (its API key/secret
are unknown), so admin image upload is dead while delivery URLs keep working. Copies of
every reachable original live in the Supabase project's **public** Storage bucket
`media-backup` (`image/…`, `video/…`, plus `_manifest.json` mapping original URL →
bucket path → table). Re-run a backup with the Supabase REST + Storage APIs
(`/rest/v1/<table>` to find URLs, strip the Cloudinary transform segment to get the
original, then POST `/storage/v1/object/media-backup/<path>`); one-off scripts belong in
`/tmp`, never in the repo. ~64 older URLs on the clouds `dgtixuop0` / `dfxc4ceya` return
401 at source (testimonials, category/`katalog_info`/`size_guide` images, old order
items) — unfixable without those accounts; product main images are all intact.

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
`/id/garansi/hero-web.png` → 404, which is why the garansi page's own default images
never loaded. Exclude with a trailing slash (`garansi/`) so bare `/<folder>` routes that
start with the same word — `/garansi-retur` must still redirect to `/id/garansi-retur` —
keep working.

## Sandbox-only overrides

- `next.config.ts` appends `allowedDevOrigins: ['3000-' + BASE44_PUBLIC_HOST_SUFFIX]`
  **only when `BASE44_PREVIEW_MODE === '1'`**, because the preview proxies the dev
  server through a different origin and Next otherwise rejects cross-origin dev
  asset/HMR requests (403). Unset/none → identical config to upstream.
  Verify: a `GET` on a `/_next/static/chunks/...` URL with
  `Origin: https://3000-$BASE44_PUBLIC_HOST_SUFFIX` must return 200.

## i18n layout (root vs locale)

`src/app/layout.tsx` is the App Router root layout: it renders `<html>`/`<body>` (fonts,
metadata, JSON-LD) and wraps children in `<Providers>`. `src/app/[locale]/layout.tsx` must
therefore **not** render it again — it only mounts `NextIntlClientProvider` around `children`.

Rendering `<RootLayout>` from the locale layout nests `<html>` inside `<body>` (browser
hydration error) and mounts every provider twice (cart, toast, locale, and — the visible one —
`MetaPixelProvider`, i.e. a duplicate pageview). The root layout has to keep the html shell
because top-level `/admin` (excluded from the locale middleware) also renders under it. Verify
a change here by counting tags in the SSR output: `curl -s .../id/open-order | grep -c '<html'`
must be `1`.

## Rich text messages (i18n)

next-intl 4 treats `<tag>` inside a message as ICU rich text. Reading such a message with
plain `t()` throws and falls back to the raw key (logged as `FORMATTING_ERROR` /
`INVALID_MESSAGE`), which is how the home, about and Sama Quran pages ended up rendering
key names. Rules that now hold:

- HTML in a message must use **closed** ICU tags — `<br></br>`, `<span>…</span>`. A
  self-closing `<br/>` is passed through as literal text, and tag **attributes** are
  rejected outright (`INVALID_TAG`), so styling is re-applied by the handler.
- Read such a message with `t.markup(key, { tag: (chunks) => "<tag>…</tag>" })`; it returns a
  string for `dangerouslySetInnerHTML`. Sites: `CaraPemesanan` (`subtitleLead` + `subtitle`),
  `SamaQuran` (`perjalananTitle`, `values.*`), both `tentang-kami` pages (`storyP1`).
- `useSafeTranslations`' no-provider fallback mirrors `markup`/`rich`/`raw`, so callers keep
  working (and type-checking) when `NextIntlClientProvider` isn't mounted.

## Verify

```bash
curl -s -o /dev/null -w '%{http_code}\n' -L http://localhost:3000/     # expect 200 (redirects to /id)
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/id/katalog # expect 200, and product cards in the browser
# If a route that just worked starts returning 404 right after the container is
# recreated, the bind-mounted .next Turbopack cache has gone stale — `docker compose
# -f docker-compose.base44.yml restart web` restores it (no code change needed).
docker compose -f docker-compose.base44.yml ps                          # web must be (healthy)
```

## Open Order (alur pesanan Create Your Price)

The old Google Form ("OPEN ORDER SAMAQU — Create Your Price") is now a **6-step wizard** on
**/open-order**: daftar produk → detail produk → keranjang → data pemesan → review → pesanan
berhasil, all inside one client component (`src/app/[locale]/(customer)/open-order/page.tsx` is
a thin wrapper around `src/components/open-order/OpenOrderWizard.tsx`). The wizard owns all the
state (cart lines, product draft, customer data, J&T ongkir, submit) and renders one focused
component per step: `StepCatalog`, `StepProduct`, `StepCart`, `StepCustomer`, `StepReview`,
`StepSuccess`, plus the `ui.tsx` primitives and `types.ts`. `OpenOrderForm.tsx` and
`OpenOrderProducts.tsx` were deleted — do not resurrect them.

Presentation follows the **katalog** look (cream `--cream`, espresso `--espresso`, gold `--gold`,
Cormorant serif headings) — on request the wizard was switched off the earlier monochrome style.
The palette lives once in `src/components/open-order/ui.tsx` (`INK`/`MUTED`/`LINE`/`FIELD_BG`/`GOLD`,
plus `Chip`, `Counter`, `PrimaryButton`, …), so a colour change belongs there, not in each step;
step components pass those tokens via inline styles. `StepCatalog` cards mirror the katalog
`ProductCard` (cream-bright card, 3/4 image, serif name, gold "Kain …", outlined "Lihat Detail"
button) and `StepProduct` mirrors the katalog detail page (gold "Detail Produk" eyebrow, serif
title, "Pilih Series / Warna / Ukuran" chip rows, cream "Harga Minimum" card). Indonesian copy is
hardcoded inside the step components and is not part of the i18n flow (the now-unused `openOrder`
keys are still in `src/i18n/messages/{id,en}.json`).

The offering is **derived from the catalog `products` table**, not written by hand. Sejak
**2026-10-14**, Open Order dijadikan seperti pesanan biasa: **semua baris katalog yang kolom
`products.open_order_enabled`-nya true** (default true, jadi produk baru & lama ikut — admin
tinggal mematikan lewat form Produk atau daftar di menu admin "Open Order") tampil di
`/open-order`, **lintas kategori** (Thobe, Kandora, Koko, Vest, Kabak, Cover & Hanger) — bukan
cuma Thobe — dan penjualannya **memotong stok** yang sama dengan menu Produk.

`src/lib/open-order-offering.ts` → `buildOpenOrderProducts(rows, stockRows)` mengelompokkan baris
per **produk utama** (`category::name`) — sama seperti kartu di halaman Katalog, jadi produk Thobe
dengan beberapa series tetap satu kartu — lalu tiap grup membawa `colors`, `series` (boleh
kosong), harga terendah, dan **peta `variants` ke baris `products` asli**: `{ color, label,
series, productId, sizes, media }`, dengan `sizes` dari `product_variants`. `color` adalah warna
varian asli (nilai yang dipakai stok & dikirim ke API); `label` adalah nama tampilannya — untuk
Thobe, yang tersimpan cuma `default`, jadi labelnya diambil dari **nama** produk
(`"Thobe Navy"` → `Navy`). Satu baris katalog = satu kombinasi warna × series, jadi mengubah
harga/menambah warna di katalog sudah cukup — tanpa edit kode. The input type
`OpenOrderCatalogRow` is structural, so the same function serves the client (from `getProducts()`,
which embeds `jenis_kain(*)`, plus a `product_variants` read for the sizes) and the API route
(admin client, same reads) — id produk grup diambil dari baris **terlama** (urutan
`created_at` menaik, sama di klien dan server).

Hanya data non-katalog yang tetap statis di `src/lib/open-order-config.ts`: `OPEN_ORDER_PERIOD`,
`OPEN_ORDER_ADDON` (Cover & Hanger) price/weight, dan `OPEN_ORDER_SIZES` — daftar ukuran S–XXL kini
hanya **cadangan** kalau baris varian tidak punya ukuran; daftar normalnya datang dari
`product_variants`. Berat kirim produk diambil dari baris katalog. Client prices are never trusted
(see the API notes below). `src/lib/open-order-catalog.ts` holds the shared display helpers:
`money`, `priceRange`, `openOrderImage`/`openOrderGallery` (foto per warna+series dari varian),
dan `openOrderVariants(products)` — satu kartu per produk × warna, which is what the step-1 grid
renders, difilter dengan chip **kategori**.

Step 2 (detail produk) shows the **real catalog photos**, not the single thumbnail:
`openOrderGallery(product, color, series)` membaca media varian (baris `products` asli untuk
kombinasi warna + series terpilih, mis. `thobe-navy-bayati`, dengan `images`-nya sendiri) dan
merendernya urut seperti galeri detail katalog, minus video. Selector **series hanya muncul kalau
produknya punya series**, kartu **Create Your Price hanya muncul kalau produknya mengaktifkannya**
(kalau tidak, harga tetap dan tidak ada input), dan chip **ukuran** datang dari `sizes` varian.
Switching a warna or series chip swaps the gallery and resets it to the first photo — dan kalau
ukuran terpilih tidak ada di varian baru, otomatis pindah ke ukuran pertama yang tersedia.

Submissions POST to **`/api/open-order`** (`src/app/api/open-order/route.ts`; the `[locale]/api`
copy is the dead duplicate — the live API is the one under `src/app/api/`). The route re-reads
`products` (+ `jenis_kain`) dan `product_variants` with the admin client, rebuilds the offering via
`buildOpenOrderProducts()` and re-validates product/color/series/size/quantity and the price floor
against it (client prices are never trusted), lalu **memotong stok** dulu (lihat bagian stok di
bawah), baru menulis baris biasa ke **`orders` + `order_items`**, so they appear in the
existing admin dashboard (`/[locale]/admin`, "Pesanan" tab) with the normal status flow:

- `order_number` uses the prefix **`CYO-`** (`SMQ-` = website checkout) — that is how the two
  kinds of order are told apart in the admin list,
- `shipping_method` = `J&T - <service>` and `shipping_cost` = the J&T tariff for the customer's
  kecamatan (see the ongkir note below); it falls back to `manual` / 0 when kecamatan is empty
  or the J&T call fails, and then the admin arranges shipping later,
- `payment_method` `bank` (legacy value, renders as "Transfer Bank"),
- `status` `pending` dan **`stock_reserved` `true`** (sejak 2026-10-14) — penanda bahwa pesanan ini
  sudah memotong stok, dipakai jalur pembatalan & penghapusan supaya stok hanya dikembalikan
  sekali (lihat `src/lib/cancel-order.ts`),
- `shipping_notes` = `IG @username · <customer note>` (each part only
  when filled) — the admin order detail renders that as "Catatan", which is where the Instagram
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
  value with `minimum_price` = the series/product minimum — exactly the pair the admin order detail
  already renders as `Min: … · Dipilih: …`. Kalau produknya **tidak** mengaktifkan CYP, harga dari
  client diabaikan total (dipakai harga katalog) dan kedua kolom CYP diisi `null`. The add-on row
  keeps both columns `null`,
- the Cover & Hanger add-on is one extra `order_items` row (`product_id` `addon-cover-hanger`),
  toggled in step 3 (keranjang) — the wizard has no add-on page section.

**Stok (sejak 2026-10-14)** — Open Order memotong stok yang sama dengan menu Produk, persis
checkout website (`/api/orders`): stok dikurangi DULU secara atomik lewat `samaqu_decrement_stock`
(per baris `products` asli + warna + ukuran); kalau ada satu item gagal / stok kurang, semua
decrement di-rollback (`samaqu_restore_stock`) dan pesanan ditolak **400** dengan pesan jelas —
jadi item lain tidak ikut terpotong. Kalau insert order/order_items gagal setelah stok terpotong,
stok juga di-rollback. Pembatalan mengembalikannya lewat `cancelOrderCompletely()`. Item tanpa
warna/ukuran (`color` kosong atau `-`) dilewati, sama seperti `/api/orders`. Kolom `stock_reserved`
yang membedakan CYO lama (tidak pernah memotong stok → tidak dikembalikan) dari CYO baru.

Ongkir (J&T shipping): the form asks for **Kecamatan**; once ~3+ chars are typed the client
debounces 1s and POSTs `{ city, district, weight }` to **`/api/shipping/jnt-cost`** (the same
J&T Tariff API the checkout uses, via `src/lib/jnt/*`), keeps the cheapest service and shows it
as the `Ongkir` line that feeds the bottom `Total`. Weight counts the current lines at each
product's catalog `weight` × qty, plus 300 g for the Cover & Hanger add-on, min 300 g. The picked method/cost ride
along in the POST body as `shipping: { method, cost }`; `/api/open-order` does **not** re-verify
the tariff (same trust model as `/api/orders`) — it only clamps the cost to ≥ 0 and folds it into
`total`. J&T credentials are **required for a price**: `JNT_TARIFF_KEY` + `JNT_TARIFF_CUS_NAME`,
and the route also gates on `JNT_ORDER_USERNAME`. Without them the route answers **200** with
`{ data: [], configured: false, error: "J&T API belum dikonfigurasi" }` — a missing credential is a
normal state, not a server failure, so the log stays free of a 500 (and of one `console.error` per
keystroke) while the `error` field is kept so the checkout callers behave exactly as before; the route
logs a single `console.warn` per process. `OpenOrderWizard` detects `configured: false` and shows the
fallback message with the ongkir line at `—` without a `console.error` (the order still submits,
admin prices shipping later) — that is the state of this sandbox: no J&T credential is stored, so
live tariffs stay off until credentials are supplied — sekarang admin bisa mengisinya sendiri lewat
form di Pengaturan (lihat "Kredensial J&T Express (form admin)" di bawah). Nilai J&T **testing**
yang dulu dipakai app ini ada di commit `e48a6fe`; nilai asli tidak boleh masuk repo. `JNT_ENV`
defaults to `testing`, dipakai selama kolom `env` di `jnt_settings` masih kosong.

No new table: the hosted Supabase project has **no DDL path** from the sandbox, so a new table
would have needed the user to run SQL by hand. Verified dead ends with the stored credentials:
`SUPABASE_SERVICE_ROLE_KEY` **cannot** run DDL — `/pg/query` and `/pg/meta/query` are 404
("requested path is invalid") and there is no `exec_sql` RPC (`PGRST202`), and PostgREST offers
no DDL verb at all. Running SQL from the sandbox needs a Supabase **Management API** personal
access token (`sbp_…`, sent as `Authorization: Bearer` to
`https://api.supabase.com/v1/projects/<ref>/database/query`, ref = the subdomain of
`NEXT_PUBLIC_SUPABASE_URL`) or the project's **database password** for a direct Postgres
connection; neither ships with this app. Don't re-probe the service-role key for DDL.

Page presentation (not obvious from the code):

- The page still renders **without the navbar**: `src/app/[locale]/(customer)/layout.tsx` skips
  `<Navbar />` for path suffixes in `NAVBAR_HIDDEN_SUFFIXES` (`/open-order`). The wizard brings
  its own sticky header instead (step title, `n/6` counter, progress bar, close → `/` on step 1
  and a back chevron after that) — the old espresso/gold hero is gone.
- Steps 2–5 render in a centred `max-w-2xl` column; step 1 (the product grid + fabric filter
  tabs) uses the full `max-w-5xl` width.
- Step 4 (data pemesan) picks the destination from RajaOngkir via
  `src/components/open-order/LocationPicker.tsx` — Provinsi → Kota/Kabupaten → Kecamatan, fed by
  `/api/shipping/provinces` + `/api/shipping/districts` (the province/city/district lists are
  cached in Supabase `shipping_cache` and do load in this sandbox, key from `store_settings`
  falling back to `RAJAONGKIR_API_KEY`). The picker stores the RajaOngkir **names** in
  `customer.city` / `customer.district`, so ongkir no longer depends on the customer's spelling.
  If the lists can't be loaded it falls back to the old plain Kota + Kecamatan text inputs, so the
  order still submits; the same debounced `/api/shipping/jnt-cost` call and the same graceful
  `configured: false` fallback (`Ongkir —`) apply either way. Langkah 4 juga menampilkan **baris
  Ongkir** sendiri (label service + harga, `Menghitung…` selagi menunggu, `—` + catatan saat gagal)
  tepat di bawah Kode Pos — nilainya dari state wizard yang sama dengan langkah 5, jadi terhitung
  sekali. Sebelum wilayah dipilih, barisnya `—` dengan petunjuk singkat memilih provinsi/kota/kecamatan.
- The period line under the title comes from `store_settings.open_order_period`, diatur di menu admin
  **Open Order** dan dibaca lewat `useStoreSettings()` (`StepCatalog` merendernya sebagai `Periode …`).
  `OPEN_ORDER_PERIOD` di `src/lib/open-order-config.ts` ("8-15 Agustus 2026") kini hanya **nilai
  default/fallback** — dipakai selama kolomnya kosong.
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
  mengambil pesanan lewat `getCustomerOrders()` lalu merendernya. Urutan bloknya: banner status → "Info
  Pengiriman" → "Alamat Pengiriman" (alamat dipotong 2 baris + tombol "Lihat") → kartu produk (baris
  `Total Pesanan` dibuka untuk Ringkasan Pembayaran) → "Status Pesanan" yang dilipat (`<details>`) →
  tombol "Lacak Pesanan" lengket di atas nav bawah (`bottom: var(--mobile-nav-h)`); untuk pesanan
  `pending`/`diproses` ada tombol sekunder **"Batalkan Pesanan"** (putih, teks merah) di bawahnya →
  `POST /api/orders/cancel` lewat `ConfirmModal`, dan setelah berhasil statusnya ditimpa lokal jadi `dibatalkan`.
  Blok "Butuh Bantuan?" (Garansi & Pengembalian / Hubungi Admin / Panduan Ukuran) sudah **dihapus**
  atas permintaan pemilik — jangan ditambahkan lagi di halaman ini.
  Di **desktop** halaman ini jadi satu lembar **"Struk Hangat"**: `.rp-wrap` dibatasi `max-width:600px`
  dan terpusat, latar halaman dibiarkan transparan (krem milik `AkunShell`) sehingga yang tampak hanya
  kertas struknya. Pembungkus `<div className="rp-sheet">` membalut banner → kartu-kartu → aksi:
  **mobile** `display:contents` (tata letak lama persis sama), **desktop** jadi satu lembar krem
  (`#FFFDF8`, border `#EFE6D9`, radius 16, shadow lembut) dengan pemisah antar-blok berupa garis
  putus-putus (`#E7DCCB`) ala struk; kartu di dalamnya dibuat transparan tanpa border
  (`.rp-card{background:none;border:0}`), ringkasan pembayaran memakai krem `#FCF8F1`, dan teks
  sekunder dihangatkan (`#7E746B`). Aturan pemisah harus ditulis **terakhir** di blok `@media` supaya
  menang atas `.rp-card{border:0}`. Breakpoint `<768px` tidak berubah (mobile identik).
  Halaman ini **tidak lagi memakai `STRUK_CSS`/`StrukHeader`** (keduanya masih dipakai halaman lacak —
  jangan hapus, dan perbaikan gaya halaman lacak terpisah). Foto produk memakai `order_items.product_image`
  dengan `object-fit: contain` di atas kotak abu muda **tanpa bingkai/lis** (permintaan pemilik: lis emas
  lama jelek, dan foto tidak boleh terpotong), dengan `FALLBACK_PHOTO` (aset Base44) kalau kolomnya kosong —
  banyak `order_items` lama memang menyimpan `product_image` NULL. Blok "Info Pengiriman" memanggil
  `/api/jnt/track` sekali (hanya bila ada resi) untuk baris update terakhir. Header halaman lama
  (`AkunHeader` dari `AkunShell.tsx`) masih dipakai halaman akun lain, jadi jangan ubah gaya globalnya
  untuk halaman ini.
  visibly changes the amount; ongkir is added in step 5 (review) — dan sudah tampil juga sebagai
  baris tersendiri di langkah 4, tepat di bawah Kode Pos.
- **Checkout Open Order wajib punya akun**: langkah 4 adalah gerbangnya. Kalau belum ada sesi
  customer, langkah 4 merender `StepAuth` (masuk/daftar **inline** — bukan redirect — supaya
  keranjang & data yang sudah diisi di state wizard tidak hilang) dan judul header jadi
  "Masuk / Daftar"; sesi dibaca sekali saat `OpenOrderWizard` mount lewat `getCurrentCustomer()`.
  Setelah masuk/daftar, form data pemesan langsung tampil terisi nama + WhatsApp dari akun (hanya
  field yang masih kosong) dan judul kembali "Data Pemesanan". Kalau project Supabase meminta
  verifikasi email, `signUp` tidak menghasilkan sesi: `StepAuth` pindah ke tab Masuk sambil
  menampilkan pesan cek email.
- `/api/open-order` **menolak** request tanpa sesi (`401`; header `Authorization: Bearer
  <access_token>` diverifikasi `supabaseAdmin.auth.getUser`) dan menolak sesi yang bukan akun
  pelanggan (`403`, dicek dari baris `customers` — `orders.customer_id` ber-FK ke tabel itu, jadi
  insert-nya akan gagal kalau tidak dicek). Order disimpan dengan `customer_id` +
  `customer_email` **dari token**, bukan dari body — order `CYO-` jadi muncul di `/akun/pesanan`.
  (Order checkout website lama maupun baru masih `customer_id: null`; itu di luar cakupan gerbang
  ini.)
  Sebelum gerbang `customers` ini ada, akun auth tanpa baris `customers` membuat insert `orders`
  gagal `23503` (FK `orders_customer_id_fkey`) → `500`. Sekarang kasus itu berhenti di `403`:
  pernah ada **satu akun lama** (dibuat 2026-07-25) yang tidak punya baris `customers`, jadi
  `403` di log bukan tanda gerbangnya rusak — cek dulu `GET /rest/v1/customers?id=eq.<uid>`.
- The admin **Pesanan** panel splits the list into sub-tabs **Pesanan Website** / **Open Order**
  (`orderSource` state): Open Order rows are the `CYO-` numbers, everything else is the website
  checkout, and the status chips (Semua/pending/diproses/selesai) filter inside the selected tab.
  Kedua route dashboard admin — `/admin` (`src/app/admin/page.tsx`, di luar prefix locale lewat
  `src/middleware.ts`) dan `/id/admin` — kini merender **satu komponen yang sama**:
  `src/app/[locale]/admin/page.tsx` cuma `export { default } from "@/app/admin/page"`. Dulu file itu
  salinan penuh dan sudah drift (kartu Pengaturan tidak ikut tersalin), jadi cukup ubah
  `src/app/admin/page.tsx`. **Subhalaman** admin lain (`voucher`, `open-order`, `testimoni`,
  `ukuran-produk`, dll.) masih punya salinan locale sendiri dan tetap perlu diedit di dua tempat —
  kecuali **`produk/tambah`**, yang juga sudah jadi satu komponen bersama
  (`src/components/admin/ProductForm.tsx`, lihat "Form tambah produk admin" di bawah).
  **Drawer detail pesanan** kedua dashboard memakai komponen bersama
  **`src/components/admin/OrderDetailDrawer.tsx`** — panel meluncur dari kanan, pola yang sama dengan
  `ProductDetailDrawer` (`ODR_CSS`, kelas `odr-`, lebar 520 px / penuh di mobile). Isinya satu
  komponen bersama **`src/components/admin/OrderDetailContent.tsx`**, yang memakai susunan & gaya
  halaman detail pesanan customer: banner status berwarna → "Info Pengiriman" (kurir + **Nomor
  Resi J&T**) → **"Metode Pembayaran"** → "Alamat Pengiriman" → kartu produk + baris "Total
  Pesanan" yang dilipat → "Status Pesanan" (linimasa `strukSteps`) → aksi. **Nomor resi dan metode
  pembayaran sengaja jadi blok yang selalu terlihat** (permintaan pemilik: "kok resi-nya ilang",
  "harusnya tampil metode pembayaran") — dulu keduanya hanya ada di dalam ringkasan "Total Pesanan"
  yang terlipat dan resi cuma ditempel di belakang nama kurir (`J&T - EZ: JO…`), jadi terbaca
  seperti hilang. **Resi J&T tidak lagi terisi otomatis saat pesanan masuk** — admin yang
  menerbitkannya lewat tombol **"Atur Pesanan"** di blok aksi drawer (lihat "Atur Pesanan" di
  bawah); resi kosong di drawer berarti pesanan itu memang belum diatur, bukan field-nya yang
  dibuang; halaman detail customer (`RincianPesanan.tsx`) tidak ikut diubah. Header drawer (nomor pesanan + tanggal + tombol X) hidup di
  `OrderDetailDrawer.tsx` saja; nomor pesanan memakai font UI admin (dulu serif Cormorant di header
  modal — permintaan pemilik: "samain kaya yg lain biar seragam"). Drawer tertutup lewat X, klik
  latar, atau `Escape`, dan `z-index`-nya **50** supaya `ConfirmModal` (Hapus Pesanan / Batalkan
  J&T, juga z-50 tapi dirender setelah drawer) tetap tampil di atasnya. Gaya/DOM-nya dipinjam dari
  `RincianPesanan`: kelas `rp-`,
  `RINCIAN_CSS`, dan `FALLBACK_PHOTO` **diekspor dari sana** — ubah salah satunya, halaman customer
  dan drawer admin ikut berubah (itu yang diinginkan: satu sumber gaya). Kontrol khusus admin
  (chip "Ubah Status", WhatsApp, Cetak Label, Batalkan J&T, Hapus Pesanan) memakai kelas `od-` di
  `OD_CSS` file yang sama. Perbedaan yang disengaja dari halaman customer: baris item tetap memakai
  `Kain <kode> · <series> · <warna> · <size> × <qty>` (warna `default` disembunyikan) dengan
  `Min: … · Dipilih: …` untuk Open Order, ditambah baris Email + Catatan di blok alamat. Tombol
  **Lacak Paket** (dulu drawer sengaja tidak memanggil `/api/jnt/track`) sekarang ada di blok aksi —
  lihat "Lacak paket di drawer pesanan & status selesai otomatis" di bawah.
  `order_items` di query kedua dashboard menyertakan `product_image`
  untuk thumbnail (object-fit contain, tanpa bingkai). Perubahan lain pada panel Pesanan tetap harus
  dikerjakan di kedua file.
  **Di bawah breakpoint `lg` daftar pesanan tidak memakai tabel**: kedua dashboard merender
  `src/components/admin/OrdersMobileList.tsx` — kartu ala Shopee: nomor pesanan + **pill tahap**
  (dihitung sendiri oleh komponen dari `src/lib/order-flow.ts`, bukan prop `renderStatus` yang dulu),
  nama pelanggan, `tanggal · total`, lalu **baris pengiriman** (ikon truk + kurir + nomor resi;
  "Resi belum dibuat" disorot oranye untuk tahap Perlu Dikirim). Badan kartunya jadi tombol yang
  membuka drawer detail (dengan chevron) bila prop `onSelect` diberi; kartunya **tanpa tombol
  aksi** — prop `renderActions` (dan `renderStatus` sebelumnya) sudah dihapus, karena semua aksi
  pesanan hanya boleh ada di drawer detail (lihat "Aksi hanya di drawer detail" di bawah). Komponen itu menyembunyikan dirinya sendiri di `lg` (`lg:hidden`),
  sedangkan `<table>`-nya tetap di dalam pembungkus `overflow-x-auto` yang sama dan cukup diberi
  `hidden lg:table` — jangan menambah pembungkus kedua (dua root elemen di dalam ternary
  `{loading ? … : ( … )}` menghasilkan parse error JSX "Expected '</', got 'ident'"). Tombol aksi
  berada **di luar** tombol badan kartu (button bersarang = HTML tidak sah), dan baris tab tahap
  memakai `flex-wrap` supaya "Dibatalkan" tidak terpotong di layar ~370 px.
  **Tata letak drawer detail di mobile** (permintaan pemilik: "kurang rapih, bikin lebih responsif",
  lalu "pastikan responsif di mobile"): `ODR_CSS` membuat drawer selebar penuh di bawah 768 px
  (header lebih rapat, `padding:14px 16px`) — breakpoint-nya sengaja sama (768 px) dengan breakpoint
  "struk" di `RINCIAN_CSS`; `OrderDetailContent`'s `OD_CSS` menambahkan override `max-width:767.98px`
  yang **hanya** berlaku di dalam drawer: `.od-root .rp-root` jadi transparan (latar abu `#F5F6F7`
  milik halaman customer dibuang, kalau tidak ada blok abu di dalam lembar drawer), banner status
  menempel di bawah header drawer (`margin-top:0` + radius 0), chip "Ubah Status" jadi grid 2×2 dan
  tombol aksi jadi baris penuh (flex-wrap membuat 3 chip + 1 dan tombol berlebar pincang). Yang
  Sejak 2026-10-11 (permintaan pemilik: "drawer di detail pesanan jadi jelek, terlalu lebar,
  bagusan yg sebelumnya, biar modern") drawer ≥768 px jadi **520 px** dan **isi struk mengisi lebar
  drawer**: dulu panelnya 640 px sementara `RINCIAN_CSS` membatasi `.rp-wrap` ke 600 px terpusat,
  jadi ada sisa 20 px krem di kiri-kanan yang membuat panel terasa lebar & seperti dua lapis krem
  bertumpuk. Override-nya di blok `@media (min-width:768px)` `OD_CSS`: `.od-root .rp-wrap{max-width:none}`
  + `.od-root .rp-sheet{background:transparent;border:0;border-radius:0;box-shadow:none}` (panelnya
  sendiri yang jadi "kertas", latar `#FFFDF8`, overlay diberi `backdrop-filter:blur(3px)`).
  Jangan menyentuh `RINCIAN_CSS` untuk ini — lembar struk 600 px itu masih dipakai halaman detail
  pesanan customer. Verifikasi (sesi admin diputar ulang): `preview_screenshot({path:'/admin'})` →
  panel Order Management → tombol **Detail** → `.odr-panel` harus `width:520px`, `.rp-wrap`
  `max-width:none`, `.rp-sheet` border/radius `0px`, tanpa error console, dan di 375 px drawer
  100% tanpa scroll samping.
- **Dashboard akun** (`/[locale]/akun`, `src/app/[locale]/akun/page.tsx`) ditata ulang untuk mobile:
  baris "Pesanan Terakhir" = satu baris atas (thumbnail, nama pesanan + `#nomor · tanggal` yang
  dipotong `truncate` satu baris, chevron rata tengah) lalu satu baris penuh di bawahnya berisi
  harga + pill status yang rata dengan tepi kartu (blok `sm:hidden`; pasangan `hidden sm:block`
  dengan kolom kanan harga/pill mempertahankan tata letak desktop persis seperti sebelumnya).
  Kartu "Akses Cepat" menumpuk ikon (36 px) + chevron di baris atas dengan judul + subteks
  didorong ke bawah lewat `mt-auto`, dan `min-h-[112px]` menjaga keempat kartu sejajar walau
  judulnya membungkus dua baris di layar ~370 px.
- **Sidebar akun (desktop) harus muat tanpa scroll** (permintaan pemilik: "harusnya ngga ada scroll
  di menunya, bikin responsif di semua ukuran") — sama seperti sidebar admin yang lebih dulu
  dirapatkan. `AkunShell`'s `<aside>`: `<nav>` memakai **`min-h-0`** (tanpa itu flex item tidak bisa
  mengecil dari isinya, jadi menu luber dan scrollbar muncul) + kelas `akun-side-nav` / `-brand` /
  `-group` / `-item` / `-foot`, dan blok CSS di `src/app/globals.css` yang (a) menyembunyikan
  scrollbar nav (`scrollbar-width: none` + `::-webkit-scrollbar{display:none}`) dan (b)
  merapatkan jarak vertikal lewat kueri `max-height` 820 / 700 / 600 / 520 px (di bawah 520 px
  label grup disembunyikan). Lebar & warna sidebar tidak berubah, dan semua halaman `/akun/*`
  ikut karena semuanya memakai shell yang sama. Kueri itu di luar `@layer` Tailwind, jadi
  menang atas utility `py-*` (jangan dipindah ke dalam layer).
  **Tidak bisa diverifikasi lewat preview**: `/akun/*` butuh sesi **customer**, sedangkan sesi
  yang diputar ulang preview adalah sesi **admin** → selalu mendarat di `/akun/login`. Uji manual:
  masuk sebagai customer di `/id/akun`, lalu kecilkan tinggi jendela (≤700 px, lalu ≤600 px) dan
  pastikan tidak ada bar di menu.
- **Nav bawah ala aplikasi (mobile)** di semua halaman toko: `src/components/MobileBottomNav.tsx`
  (Beranda · Kategori · Open Order · Pesanan · Akun) dipasang oleh
  `src/app/[locale]/(customer)/layout.tsx` dan tampil di bawah breakpoint `lg` — sama dengan navbar
  atas yang beralih ke drawer di sana. Tingginya satu variabel CSS, `--mobile-nav-h`
  (`src/app/globals.css`: 0 px di desktop, 62 px di bawah 1024 px); layout memakai variabel itu untuk
  padding bawah halaman, dan tiga halaman yang punya bar aksi bawah sendiri (keranjang, checkout,
  detail produk) menggeser bar-nya dengan `bottom-[var(--mobile-nav-h)]` supaya tidak bertumpuk.
  Elemen mengambang ikut aturan itu: tombol WhatsApp `AutoCTA` (hanya dipasang di beranda) memakai
  `bottom-[calc(var(--mobile-nav-h)_+_1.5rem)]` — dengan `bottom-6` tombolnya menutupi menu "Akun".
  Route group `src/app/(customer)/` (tanpa locale) sengaja tidak disentuh — middleware me-redirect
  semua path toko ke `/<locale>/…`, jadi pohon itu tidak terpakai.
- **Jendela Open Order diatur dari dashboard admin** (dulu hardcode `OPEN_ORDER_PERIOD`).
  Menu sidebar **Open Order** → `/admin/open-order` (+ salinan `/id/admin/open-order`); kedua route
  hanya merender `src/components/admin/OpenOrderSettingsForm.tsx` di dalam `AdminShell` — formulirnya
  **satu file** supaya dua halaman itu tidak dobel. (Entri sidebar-nya sendiri masih perlu ada di
  `AdminShell`'s `navGroups` **dan** di sidebar dua dashboard admin, karena masing-masing punya sidebar.)
  **Grup & urutan menu wajib identik di kedua sidebar** (`AdminShell`'s `navGroups` dan `navGroups`
  di `src/app/admin/page.tsx`): kalau tidak, menu terlihat "berubah urutan" begitu admin membuka
  salah satu subhalaman. Sejak permintaan pemilik 2026-10-11 ("rapihin menu, yg bisa digabung
  gabungin aja, terus Open Order pindahin ke atas di bawah Order Management") kedua sidebar punya
  **tiga grup yang sama**: **Menu Utama** (Dashboard · Order Management · **Open Order** · Produk ·
  Pelanggan), **Konten** (Konten Website · Biolink · Foto Carousel · Testimoni · Panduan Ukuran ·
  Halaman Garansi &amp; Retur), dan **Lainnya** (Voucher · Pengaturan). Grup "Biolink" lama
  dibubarkan — Biolink/Foto Carousel pindah ke "Konten", dan "Open Order" naik tepat di bawah
  "Order Management". Di dashboard `navGroups` sekarang menyatukan item panel (`panel: Panel`) dan
  item halaman (`href: string`) — pakai pola itu saat menambah menu.
  Sejak 2026-10-11 item panel di **`AdminShell`** mengarah ke **`/admin?panel=<panel>`** (Dashboard
  tetap `/admin` polos), dan `src/app/admin/page.tsx` membaca `?panel=` sekali saat mount untuk
  memilih panel awalnya — dulu keempat item itu semuanya menuju `/admin` polos, jadi klik "Order
  Management" dari subhalaman admin selalu mendarat di Dashboard lebih dulu. Panel baru di sidebar
  subhalaman: tulis href-nya dengan pola `?panel=` itu (urutan & grup tetap harus sama dengan
  sidebar dashboard). Verifikasi tanpa browser:
  `curl -s http://localhost:3000/admin/open-order | grep -o 'href="/admin[^"]*"'` harus sama
  urutannya dengan sidebar dashboard (yang di-SSR spinner, jadi bandingkan dengan sumber `page.tsx`).
  Admin memilih **tanggal mulai + tanggal tutup** (`<input type="date">`) dan **series yang dibuka**
  (chip multi-pilih dari katalog); tidak ada lagi toggle buka/tutup manual.
  Halaman ini memakai pola kartu **Pengaturan** (`SettingsCard`): default **read-only** — tanggal
  tampil sebagai teks ("8 Agustus 2026", atau "Belum diatur"), chip series jadi label `<span>`
  (bukan `<button>`), footer hanya tombol **Edit** — lalu klik **Edit** membuat tanggal jadi input
  dan chip bisa diklik, footer berganti **Simpan + Batal** dan kembali read-only setelah simpan
  berhasil (`original` = nilai tersimpan, dasar Batal + penanda `dirty`; Simpan nonaktif selama
  tidak ada perubahan). Permintaan pemilik 2026-10-11: "button simpan nya harusnya jadi edit gitu
  bro, soalnya kan udah di simpan, bikin kaya yg di pengaturan".
  ~~Tombol **"Buka semua series"**~~ — **sudah dihapus 2026-10-14** bersama seluruh kartu "Series
  yang dibuka": pemilihan produk Open Order sekarang lewat sakelar `products.open_order_enabled`
  (lihat butir "Pilih produk" di bawah), dan kartu tanggal tetap memakai pola Edit/Simpan/Batal
  yang sama.
- Aturan jendela ada di **satu** modul, `src/lib/open-order-window.ts` — dipakai halaman admin
  *dan* publik: `resolveOpenOrderState()` (`before` / `open` / `closed`, dibandingkan sebagai teks
  `YYYY-MM-DD` lokal, bukan objek `Date`, supaya tidak bergeser zona waktu),
  `formatOpenOrderPeriod()` ("8 Agustus 2026 – 15 Agustus 2026"), dan `openOrderSeriesList()`.
  Tanggalnya belum diisi → `open_order_active` lama dipakai sebagai fallback, jadi perilaku lama
  tidak berubah sampai admin mengisi tanggal. `OpenOrderWizard` merender layar pesan (bukan langkah 1)
  untuk `before` ("Open Order belum dibuka" + tanggal mulainya) dan `closed`
  ("Nanti Open Order berikutnya") — murni di klien.
- **Countdown (hitung mundur ala marketplace)** di `/open-order` — komponen
  `src/components/open-order/Countdown.tsx`, dipasang di dua tempat: **banner besar** di langkah 1
  (di bawah baris "Periode …", gaya `banner`) dan **strip ringkas** di header lengket pada langkah
  2–5 (gaya `compact`, disembunyikan di langkah 1 supaya tidak dobel). **Arah timer berubah
  mengikuti status jendela**: `open` → "Berakhir dalam" ke `23:59:59.999 WIB` pada
  `open_order_end_date` (`openOrderDeadline()`); `before` → "Buka dalam" ke `00:00:00 WIB` pada
  `open_order_start_date` (`openOrderStartDeadline()`). Keduanya di `src/lib/open-order-window.ts`
  (satu modul dengan aturan jendela); tanggal di `store_settings` dianggap hari lokal toko
  (WIB = UTC+7), jadi batas akhirnya `16:59:59.999 UTC` hari yang sama dan batas mulainya
  `17:00:00 UTC` hari sebelumnya. Pecahan jam/menit/detik dari `splitCountdown()` (fungsi murni,
  bisa diuji tanpa browser); bagian **hari** muncul hanya kalau sisa waktu > 24 jam. Gaya:
  **kartu putih + aksen emas tipis** (konsisten dengan kartu katalog) — jangan pakai kartu
  gelap/coklat, pemilik bilang jelek. Tiga aturan penting:
  (1) tanggalnya kosong → countdown **tidak tampil sama sekali** (`null`), itu beda dengan
  "waktu habis";
  (2) **status jendela & deadline dibaca di SERVER** (`src/app/[locale]/(customer)/open-order/page.tsx`
  → `store_settings`) lalu dikirim sebagai prop ke `OpenOrderWizard` (`initialState`,
  `startDeadline`, `endDeadline`) — kalau dihitung dari `useStoreSettings()` saja, nilainya baru ada
  setelah hydration sehingga tombol yang seharusnya terkunci sempat bisa diklik (pop-in);
  (3) angka baru dihitung setelah komponen ter-mount (SSR tidak punya jam yang sama dengan klien)
  jadi sebelum mount angkanya `"--"` — mencegah hydration mismatch.
- **Pemesanan terkunci saat jendela belum dibuka** (`before`) — katalog/harga/Create Your Price
  tetap bisa dilihat, tapi **"Tambah ke Pesanan" dimatikan** (desktop + bar sticky mobile, teksnya
  jadi "Belum Bisa Dipesan") dan yang tampil adalah hitung mundur "Buka dalam …" (`StepProduct` +
  `StepCatalog`). Status `closed` tetap memakai layar "Periode Open Order Telah Berakhir" (wizard
  tidak dirender). **Server juga menolak**: `POST /api/open-order` membaca `store_settings` dan
  membalas **403** kalau statusnya `before` atau `closed` — jangan andalkan tombol UI saja, orang
  bisa POST langsung.
- **Pilih produk** (dulu "batasi series"): sejak **2026-10-14** yang menentukan produk mana yang
  tampil di `/open-order` adalah kolom **`products.open_order_enabled`** (default `true`), bukan lagi
  `store_settings.open_order_series`. Dua tempat mengaturnya: **checkbox "Tampilkan di Open Order"**
  di form Produk (tambah + dua halaman edit; produk baru default nyala, dan ikut ke semua baris
  satu grup nama+kategori) dan **daftar "Produk di Open Order"** di menu admin Open Order (sakelar
  per produk, tersimpan langsung). `open_order_series` + `restrictOpenOrderProducts()` +
  `openOrderSeriesList` **sudah tidak dipakai** (kolomnya dibiarkan di DB; `useStoreSettings` tidak
  lagi membawanya). Saringan `open_order_enabled` diterapkan di `buildOpenOrderProducts()` — jadi
  klien dan route `/api/open-order` otomatis memakai aturan yang sama.
- `useStoreSettings()` (`src/lib/store-settings.ts`) membawa `open_order_start_date` dan
  `open_order_end_date` saja.
- Kolom tanggalnya datang dari **`supabase/open-order-settings.sql` yang harus dijalankan manual** di SQL
  editor Supabase (sandbox tidak punya jalur DDL, sama seperti kolom pengaturan lain). Selama belum
  dijalankan, halaman admin menampilkan peringatan dan simpan akan gagal; halaman publik tetap jalan
  dengan `OPEN_ORDER_PERIOD`.
  **Sudah dijalankan untuk `open_order_period` + `open_order_active`** (2026-10-10, peringatan di
  halaman admin hilang dan simpan→muat-ulang terbukti mem-persist).
  **`open_order_start_date` + `open_order_end_date`** ada di file yang sama dan sudah dijalankan.
- **Kolom baru 2026-10-14 — `supabase/migrations/20261014_open_order_products.sql`** (sudah dijalankan
  ke produksi): `products.open_order_enabled BOOLEAN NOT NULL DEFAULT true` (produk ini tampil di
  `/open-order`) dan `orders.stock_reserved BOOLEAN NOT NULL DEFAULT false` (penanda "pesanan ini
  pernah memotong stok"), plus backfill `UPDATE orders SET stock_reserved = true WHERE order_number
  LIKE 'SMQ-%'` — pesanan CYO yang dibuat **sebelum** perubahan ini tidak pernah memotong stok, jadi
  jangan sampai dibatalkan lalu menambah stok. Cek cepat:
  `curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/products?select=id,open_order_enabled&limit=1" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"`.
- `src/types/lucide-react.d.ts` adalah shim tipe tulis-tangan berisi daftar ikon yang boleh diimpor
  proyek ini — ikon lucide baru (di sini `AlertTriangle`, `LayoutGrid`, `Save`) harus ditambahkan ke
  situ, kalau tidak `tsc` gagal dengan TS2305 walaupun ikonnya ada saat runtime. (Karena itu
  `ToggleLeft`/`ToggleRight`/`EyeOff` tidak bisa dipakai — pakai ikon yang sudah ada di shim, atau
  ornamen CSS/titik seperti di daftar "Produk di Open Order".)
- The success screen shows the order number and the "Menunggu Konfirmasi Admin" badge; "Lihat
  Pesanan Saya" points at `/akun/pesanan`, which needs a logged-in customer.

Verify: open `/id/open-order` and click through — product card → warna/ukuran/series + harga
(Create Your Price, minimum = harga series) → TAMBAH KE PESANAN → keranjang → data pemesan (an
empty form is blocked with a message) → SUBMIT PESANAN. Then check
`docker compose -f docker-compose.base44.yml logs web | grep OPEN-ORDER` and confirm the row
under `/id/admin` → Pesanan carries `size`, the postal code and "Min: … · Dipilih: …".
**Delete that test order afterwards** (admin detail → Hapus, or the Supabase REST API) so it
does not pollute the real order list. The price clamp can be checked without the UI: a POST to
`/api/open-order` with a below-minimum `price` must come back with `total` equal to the series
minimum.
```

## Kredensial J&T Express (kartunya sudah dihapus dari dashboard)

Kartu **"Kredensial J&T Express"** dan komponen `src/components/admin/JntCredentialsForm.tsx` sudah
**dihapus dari panel Pengaturan** atas permintaan pemilik — kredensial J&T diatur lewat environment
variable (platform secrets / Vercel), dan `getJntConfig()` memang sudah membacanya dari sana, jadi
integrasi ongkir/AWB/track tidak berubah. Route **`/api/admin/jnt-settings`** dan tabel
`jnt_settings` sengaja dibiarkan (tidak lagi dipakai UI); catatan di bawah masih berlaku kalau
kartunya nanti dihidupkan lagi.

- Disimpan di tabel **`jnt_settings`** (satu baris, `id = 1`), **bukan** `store_settings`:
  `store_settings` punya policy "Public read" dan dibaca anon client (`select("*")` di
  `src/lib/store-settings.ts`), jadi kredensial di sana akan ikut terkirim ke browser. `jnt_settings`
  dibuat **tanpa policy RLS** → hanya service role yang bisa membacanya.
- Tabelnya dibuat lewat **`supabase/jnt-settings.sql`**, dijalankan manual di SQL Editor Supabase
  (sandbox tidak punya jalur DDL). Sebelum dijalankan: form menampilkan peringatan, tombol simpan
  nonaktif, dan GET `/api/admin/jnt-settings` membalas `{ tableReady: false }`. Jalankan dulu
  sebelum memakai form ini.
- Akses lewat **`/api/admin/jnt-settings`** (GET status, POST simpan). Route-nya memverifikasi
  session Supabase **dan** keanggotaan di tabel `admins`, dan hanya mengembalikan status terisi +
  pilihan `env` — nilai kredensial tidak pernah dikirim ke browser (karena itu nilai lama tidak bisa
  ditampilkan; field kosong = jangan diubah).
- `getJntConfig()` di `src/lib/jnt/config.ts` kini **async**: baca `jnt_settings` dengan service role
  (cache 60 detik; `clearJntConfigCache()` dipanggil setelah simpan) → field yang kosong jatuh ke
  environment variable (`JNT_ORDER_USERNAME`, `JNT_TARIFF_KEY`, …). Pemanggilnya sudah `await`
  (`src/lib/jnt/{tariff,order,track,cancel}.ts`, `/api/shipping/jnt-cost`, `/api/jnt/test`), dan
  `getJntBaseUrl(endpoint, env)` menerima env supaya pilihan testing/production dari form ikut
  terpakai.
- Tanpa kredensial sama sekali perilakunya tidak berubah: `/api/shipping/jnt-cost` tetap membalas
  `{ configured: false }` (bukan 500), dan `/api/jnt/test` tidak lagi menyertakan `orderApiKey` di
  responsnya (dulu membocorkan key).

Verify: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/admin/jnt-settings` →
`401` (tanpa session admin). POST `/api/shipping/jnt-cost` tanpa kredensial → `configured: false`.
Simpan-dari-form baru bisa terbukti setelah `supabase/jnt-settings.sql` dijalankan.

**Kredensial J&T sekarang datang dari platform secrets** (2026-10-11): `JNT_ORDER_USERNAME`,
`JNT_ORDER_API_KEY`, `JNT_TARIFF_KEY`, `JNT_TARIFF_CUS_NAME`, `JNT_TRACK_PASSWORD` diisi pemilik
toko lewat kartu secrets Base44 (`/run/base44/app.env`), dibaca `getJntConfig()` dari environment
variable. **Tabel `jnt_settings` masih belum dibuat** (GET `/rest/v1/jnt_settings` masih 404) dan itu
tidak lagi menghalangi ongkir — form admin tetap butuh SQL itu kalau nanti mau dipakai.

Kredensial toko ini **production**, bukan demo: `data` + `sign` yang sama membalas
`{ is_success: "false", message: "fail" }` di `demo-general.inuat-jntexpress.id`, tetapi
`is_success: "true"` di `partner-track.jet.co.id`. Karena itu `JNT_ENV=production` diset di
`.base44/env.defaults` (bukan rahasia, jadi aman di repo; nilai dari dashboard tetap menang).
Kalau ongkir tiba-tiba `fail` lagi, cek `JNT_ENV` dulu sebelum menuduh sign/kredensialnya salah.

## Halaman pesanan customer (`/akun/pesanan`)

Yang tidak kelihatan dari kode:

- **Status di detail pesanan mengikuti `orders.status`**, bukan hardcode: `strukSteps()` di
  `src/lib/akun-format.ts` (dirender `src/components/akun/RincianPesanan.tsx`) memetakan pending → baru dikonfirmasi,
  diproses → diproses, dikirim → diserahkan ke kurir/dalam perjalanan, selesai → semua langkah
  selesai, dibatalkan → linimasa berhenti di langkah pembatalan (banner tone `cancel`). **Dulu langkah 1 & 2
  selalu "done"**, jadi pesanan `pending` di akun tampak sudah diproses sementara admin
  menampilkannya `pending` — itu bug yang diperbaiki, jangan kembalikan hardcode itu.
- **Jam pembatalan pesanan (`waktuBatal` di `src/lib/akun-format.ts`).** Tabel `orders` **tidak
  punya trigger yang mengisi `updated_at`** — dicek 2026-10-11: di semua baris `updated_at` sama
  persis dengan `created_at`, termasuk pesanan yang sudah `dibatalkan`/`diproses`/`selesai`. Dulu
  langkah "Pesanan dibatalkan" menampilkan `updated_at` apa adanya, jadi jamnya selalu menyalin jam
  pesanan dibuat (pemilik melihat "dibuat 13:38, dibatalkan 13:38" pada pesanan yang batalnya
  belakangan). Sekarang jam batalnya punya kolom sendiri:
  - **`orders.cancelled_at`** = jam batal yang akurat, dibuat lewat
    **`supabase/migrations/20261011_order_cancelled_at.sql`** yang dijalankan manual di SQL Editor
    Supabase (sandbox tidak punya jalur DDL). **Belum dijalankan** (dicek 2026-10-11: select
    `id,cancelled_at` → `400` `42703`), jadi selama belum dijalankan linimasa masih memakai
    `updated_at` seperti sebelumnya. File itu sekaligus mem-backfill `cancelled_at = updated_at`
    untuk pesanan `dibatalkan` yang `updated_at` ≠ `created_at` — nilai yang selama ini sudah
    dipakai `waktuBatal`; baris dengan `updated_at` = `created_at` dibiarkan NULL karena jam
    batalnya memang tidak pernah tersimpan.
  - `cancelOrderCompletely()` (`src/lib/cancel-order.ts`) — satu jalur untuk `PATCH
    /api/admin/orders` (action `cancelJnt` **dan** chip status `dibatalkan`), `POST
    /api/orders/cancel`, dan `GET /api/cron/auto-cancel` — menulis `status`, `cancelled_at`, dan
    `updated_at` sekaligus. Selama kolomnya belum ada, update **diulang tanpa `cancelled_at`**
    (`error.message` memuat nama kolomnya) supaya pembatalan tetap jalan — jangan hapus fallback
    itu sebelum SQL-nya dijalankan.
  - `waktuBatal()` memakai `cancelled_at` kalau ada (jam pasti, tampil polos); kalau tidak,
    `updated_at` yang berbeda dari `created_at` (jam sebenarnya sejak ketiga jalur pembatalan
    menulis kolom itu), dan jam terakhir yang tersimpan **dengan penanda `(perkiraan)`** kalau
    `updated_at` masih sama dengan `created_at`. Penandanya wajib: pemilik dua kali melaporkan
    masalah ini — pertama "dibuat 13:38, dibatalkan 13:38" (jam salinan tampil polos), lalu "kok
    ngga ada jam sama tgl" setelah jamnya disembunyikan — jadi jamnya tetap terlihat, tapi tidak
    boleh terbaca sebagai jam pasti.
  - `Order`/`AdminDetailOrder`/`RincianOrder` (`src/app/admin/page.tsx`,
    `src/components/admin/OrderDetailContent.tsx`, `src/components/akun/RincianPesanan.tsx`) ikut
    membawa `cancelled_at`; baris admin yang baru dibatalkan menimpanya lokal, dan
    `RincianPesanan.tsx` menyuntik jam lokal saat customer membatalkan dari halaman pesanan;
  Verifikasi: pesanan uji buatan sendiri (insert REST) → dibatalkan lewat chip "Ubah Status" di
  drawer admin → `updated_at` > `created_at` dan timeline menampilkan jam valid tanpa `(perkiraan)`,
  sedangkan pesanan lama (mis. `SMQ-20261009-386`) menampilkan `9 Okt 2026 • 16:53 (perkiraan)`;
  hapus pesanan uji setelahnya. Cek kolomnya: `curl -s -o /dev/null -w '%{http_code}\n'
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/orders?select=id,cancelled_at&limit=1" -H "apikey:
  $SUPABASE_SERVICE_ROLE_KEY"` → `200` = SQL sudah dijalankan, `400` = belum (perilaku lama).
- Label pill ikut disamakan dengan admin: `pending` = **"Menunggu Pembayaran"** (dipakai daftar
  pesanan, dashboard akun, banner struk, dan modal admin), `dibatalkan` pakai `akun-pill-batal` (merah). Dipakai bersama oleh `/akun` (dashboard),
  list pesanan, dan detail — ubah di `src/lib/akun-format.ts` saja.
- **Foto "Informasi Produk" diambil dari katalog.** Baris `order_items` pesanan Open Order tidak
  menyimpan `product_image` (route `/api/open-order` tidak pernah mengisinya), jadi foto item
  dicocokkan ke baris `products` (sejak 2026-10-14 `order_items.product_id` **adalah** id baris
  `products` asli, jadi pencocokan jadi langsung) dan memakai `getProductThumbnail`. Karena itu
  `getCustomerOrders()` di `src/lib/customer-auth.ts` **wajib memilih `kain, series`** — kalau
  kolomnya tidak ikut di-select, fotonya hilang tanpa error (placeholder ikon lagi).
- **Nomor resi TIDAK dibuat saat pesanan dibuat** (sejak 2026-10-11): `/api/open-order` dan
  `/api/orders` hanya menyimpan pesanan (`awb_no: null` di responsnya) dan tidak lagi memanggil
  J&T. Resi diterbitkan admin lewat **"Atur Pesanan"** — lihat bagian "Atur Pesanan" di bawah.
  Kode area dari nama wilayah RajaOngkir: `getOriginCode("DEPOK")` (= "DPK"),
  `getDestinationCode(city)`, `getReceiverArea(city, district)` — wizard menyimpan nama resmi
  ("Kota Depok", "Beji") dan `area-mapping.ts` membuang prefix administratif, jadi biarkan
  namanya apa adanya. Order lama tetap tanpa resi (tidak ada backfill) sampai admin mengaturnya.
- **Customer bisa membatalkan pesanannya sendiri**: `POST /api/orders/cancel` (body
  `{ orderNumber }`, header `Authorization: Bearer <access_token>`) — verifikasi sesi, pesanan
  harus milik customer itu (kalau bukan → 404, bukan 403), hanya status `pending`/`diproses` yang
  boleh, batalkan pengiriman di J&T dulu baru `status = dibatalkan`. Stok dikembalikan **hanya
  kalau `orders.stock_reserved` true** (sejak 2026-10-14 penanda itu diisi checkout website **dan**
  Open Order) — jadi CYO lama yang belum pernah memotong stok tidak ikut dikembalikan. Tombolnya di blok aksi
  `src/components/akun/RincianPesanan.tsx` (di bawah "Lacak Pesanan") + `ConfirmModal`.

Verify (mobile 374px, akun customer):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/orders/cancel \
  -H 'Content-Type: application/json' -d '{"orderNumber":"CYO-..."}'   # 401 tanpa sesi
```

Lalu di browser: buka `/id/akun/pesanan` → detail pesanan. Timeline harus sama dengan status di
`/id/admin` (Pesanan), foto produk muncul (Cloudinary), kartu **Nomor Resi** terisi begitu pesanan
baru dibuat, dan tombol **Batalkan Pesanan** muncul hanya untuk `pending`/`diproses`. Bikin
pesanan uji sebisa mungkin **dibatalkan lalu dihapus** (admin detail → Hapus, atau REST
`DELETE /rest/v1/orders?order_number=eq.…`) agar daftar pesanan asli tidak kotor.

## Drawer detail produk admin

Detail produk admin kini satu komponen bersama, **`src/components/admin/ProductDetailDrawer.tsx`**
(panel gelap charcoal `#1b1e25`, kartu `#232730`, aksen hijau `#22c55e` / biru `#3b82f6` — permintaan
pemilik "drawer modern", mengikuti referensi desain yang dikirim). Dipakai di **dua tempat**:

- **Drawer dari daftar produk**: `ProductsCatalog` menerima prop `onDetail(id)`; tombol mata di
  kartu memanggilnya (dulu `<Link>` ke halaman detail). Kedua dashboard (`/admin` dan `/id/admin`)
  menyimpan `selectedProductId` dan merender `<ProductDetailDrawer productId={…} onClose={…} />`
  tepat sebelum `<OrderDetailDrawer … />`. Drawer tertutup lewat tombol **Tutup**, klik latar, atau
  `Escape`.
- **Halaman route tetap ada** (`/admin/produk/detail/<id>` + salinan locale) dan sekarang hanya
  merender `ProductDetailPanel` dengan `mode="page"` (lembar terpusat, gaya sama) — jadi tidak ada
  dua tampilan detail yang berbeda. Ubah tampilan detail → ubah komponen itu saja.

**Warna `"default"` jangan ditampilkan**: produk satu warna (semua baris `Thobe …`) menyimpan
`product_variants.color = "default"`, jadi baris varian dan judul blok Media harus menampilkannya
sebagai "Semua" / tanpa nama warna — bukan nilai mentahnya (`default · XS`, `Media (default)`).
Konvensi ini sudah dipakai di blok Riwayat Pesanan (`item.color === "default" ? "" : …`) dan
drawer pesanan; ikuti pola itu. Catatan: kolom `product_variants.series` **tidak ada** di database
ini (`42703`), jadi cabang "Varian Series" tidak pernah aktif dari klien.

Angka drawer semuanya dari data asli: stok & SKU dari `product_variants`, harga dari `products`
(harga minimum bila Create Your Price aktif), penjualan dari `order_items`. Skema **tidak** punya
"stok awal"/"total masuk"/"profit", jadi baris statistiknya memakai angka nyata (Total Pesanan,
Total Transaksi, Varian Menipis) — jangan mengarang kolom yang tidak ada. Gaya ditulis di string
`PD_CSS` (pola sama seperti `RINCIAN_CSS`), kelasnya berawalan `pd-`.

**Verifikasi manual** (route admin tidak bisa dicapai lewat navigasi SPA preview:
`window.__base44_preview.navigate('/admin'|'/id/admin')` mengubah URL tapi konten tidak berganti,
dan full page load di-reset ke route home pada panggilan preview berikutnya — jadi perubahan
dashboard admin **tidak bisa** dibuktikan lewat preview tool, cukup `tsc --noEmit` bersih + curl
`/admin` & `/id/admin` = 200 tanpa error kompilasi di log): buka
`/id/admin` → panel **Produk** → klik tombol mata di kartu produk; drawer harus meluncur dari kanan,
tombol **Tutup** menutupnya, dan `/admin/produk/detail/<id>` menampilkan panel yang sama.
Untuk **drawer detail pesanan**: panel **Order Management** → klik baris pesanan (atau tombol
"Detail"); drawer meluncur dari kanan dengan nomor pesanan (font UI, bukan serif) + tanggal di
header, lalu isi struk (banner status → info pengiriman → alamat → produk → Total Pesanan →
Status Pesanan); chip "Ubah Status" & tombol aksi (WhatsApp / Cetak Label / Hapus) tetap bekerja,
dan tutup lewat **X**, klik latar, atau `Escape`. Ulangi di lebar <768 px: drawer selebar penuh,
chip status 2×2, tombol aksi satu kolom.

## Form tambah produk admin

Dulu form ini dua salinan (~1400 baris) di `src/app/admin/produk/tambah/page.tsx` dan salinan
locale-nya, dan salinan locale sudah tertinggal fitur "Stok dari Produk Dasar". Sekarang **satu**
komponen bersama **`src/components/admin/ProductForm.tsx`**; kedua route cuma
`export { default } from "@/components/admin/ProductForm"`. Ubah form tambah produk → ubah file itu
saja (`produk/edit/[id]` masih salinan terpisah dan **tidak** ikut berubah).

- **SKU produk**: field baru di kartu *Info Dasar* (`sku` state) — dulu produk cuma punya SKU
  per-ukuran, padahal panel detail produk (`ProductDetailDrawer`) menampilkan satu baris "SKU:".
  Tabel `products` **tidak punya kolom `sku`** dan sandbox tidak punya jalur DDL, jadi SKU produk
  disimpan di `product_variants.sku`: nilai per-ukuran dipakai kalau diisi, kalau kosong jatuh ke
  SKU produk (`sku: s.sku.trim() || sku.trim() || null`), dan placeholder kolom SKU tiap ukuran
  menampilkan SKU produk itu. Jangan pindahkan ke kolom `products.sku` tanpa migration yang
  dijalankan manual: select `products.sku` membalas `400` `42703` sampai kolomnya ada
  (`curl -s -o /dev/null -w '%{http_code}\n' "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/products?select=sku&limit=1"`).
- **Tabel ukuran** kini satu komponen `SizeGrid` (dipakai blok series Thobe **dan** varian biasa,
  sebelumnya markahnya disalin dua kali): di bawah `640px` tiap ukuran jadi kartu berlabel — kolom
  tetap 444 px yang lama membuat form melebar keluar layar di HP — dan kembali jadi satu baris 5
  kolom (`84px 84px 1fr 1fr 34px`) di `sm+`. Kelasnya `pf-size-*` di string CSS form.
- Baris field dibuat konsisten dua kolom (`grid sm:grid-cols-2 gap-4`): Nama/Kategori, Slug/SKU
  Produk, Harga Dasar (non-Thobe)/Berat.
- **Chip warna & tombol hapusnya**: chip pemilih warna adalah `<button>` untuk mengaktifkan
  warna, sedangkan kontrol hapus (X) di dalamnya memakai **`<span role="button" tabIndex={0}>`**
  dengan `onClick`/`onKeyDown`, **bukan** `<button>` — tombol di dalam tombol membuat React
  melaporkan `In HTML, <button> cannot be a descendant of <button>` (hydration error) dan
  men-gagalkan hidrasi seluruh halaman. Salinan `produk/edit/[id]` (kedua prefix locale) memakai
  pola yang sama, jadi perbaiki di ketiga tempat.
- Verifikasi: `tsc --noEmit` bersih + `curl /admin/produk/tambah` & `/id/admin/produk/tambah` = `200`
  (HTML SSR-nya memuat field "SKU Produk"). **Tidak bisa lewat preview** (route admin tidak bisa
  dicapai navigasi SPA, dan full page load di-reset ke route home di panggilan berikutnya) — jadi
  tampilan form di HP/desktop dan simpan-SKU harus diuji manual di browser.

## Panel Pengaturan (read-only + Edit) & panel Pelanggan

- Seluruh isi panel **Pengaturan** kini di **`src/components/admin/SettingsSections.tsx`** (satu
  default export `SettingsPanel`), bukan lagi inline di `page.tsx`. Semua kartunya memakai pola yang
  sama: default **read-only** — nilai tampil sebagai teks dan footer hanya punya tombol **Edit** —
  lalu klik Edit membuat field jadi input dan footer jadi **Simpan + Batal** (Batal mengembalikan
  nilai awal). Pembungkusnya `SettingsCard` + `Field` di
  **`src/components/admin/SettingsCard.tsx`**; kartu pengaturan baru sebaiknya memakai keduanya
  (state form & fungsi simpan tetap milik section-nya).
  Kartu yang ikut pola ini: Informasi Toko, Alamat Pengiriman Toko, Provider Pengiriman, Ekspedisi
  Aktif, API Key RajaOngkir, Sosial Media, Meta Pixel. `PaymentMethodsManager` sengaja **tidak**
  ikut — itu pengelola daftar (tambah/hapus per metode), bukan satu form.
- **Alamat Pengiriman Toko** memuat daftar wilayahnya lewat `loadLists()` lalu memasang nilai
  kecamatan *setelah* daftarnya ada (kalau tidak, `<select>` tampil kosong). `Batal` memuat ulang
  daftar kalau provinsi/kota sempat diubah, supaya nilai aslinya tetap punya option yang cocok.
  Di mode read-only label "Memuat…" hanya muncul selama daftarnya masih diambil.
- Panel **Pelanggan** kini `src/components/admin/CustomersView.tsx`: kartu ringkas per pelanggan
  (tanggal lahir, total belanja, jumlah pesanan, belanja terakhir) + tombol **"Riwayat Belanja &
  Alamat (n)"**, plus chip filter "Ulang Tahun Bulan Ini" dan kartu ringkasan di atasnya.
- **Tombol Export di panel Pelanggan** merakit CSV-nya di **`src/lib/customer-csv.ts`**
  (`customersToCsv` + `formatWhatsapp`), bukan lagi inline di `CustomersView`. Permintaan pemilik:
  "pas di export No WA nya malah berantakan" — Excel mengubah digit panjang (`85299954529`) jadi
  notasi ilmiah `8,52999E+10`, jadi No WA sekarang ditulis sebagai teks `+62 852-9995-4529`
  (angka aslinya tidak diubah, cuma awalan `62`/`0` dibuang dulu). Tanda `+`/`-` membuat Excel
  memperlakukannya sebagai teks, dan panjang tiap baris jadi seragam; tanggal lahir tetap
  `YYYY-MM-DD`. File itu sengaja bebas JSX/React supaya bisa diuji langsung tanpa browser:
  `docker compose exec -T web node --input-type=module -e "import {formatWhatsapp} from './src/lib/customer-csv.ts'; console.log(formatWhatsapp('085299954529'))"`
  (Node 22 sudah men-strip tipe TS, jadi impor `.ts` langsung jalan). Ekspor lewat UI sendiri cuma
  bisa dicek sampai "tidak ada error console" — unduhan `blob:` tidak muncul di
  `getNetworkRequests`, jadi isi CSV-nya dibuktikan lewat Node di atas, bukan lewat preview.
- **Drawer detail pelanggan** = `src/components/admin/CustomerDetailDrawer.tsx` (panel netral
  putih/abu tema admin, kelas `cd-`, lebar 460 px / penuh di bawah 768 px, tutup lewat X / klik
  latar / `Escape` — pola sama dengan `ProductDetailDrawer`/`OrderDetailDrawer`). Isinya: header
  (avatar inisial + nama + WhatsApp + badge "Belum daftar") → ringkasan 2×2 (total belanja, jumlah
  pesanan, belanja terakhir, tanggal lahir) → **"Alamat Pengiriman"** → **"Riwayat Belanja"**.
  Alamat diambil dari `orders` (tabel `customers` tidak menyimpan alamat): route
  `/api/admin/customers` men-`select` `shipping_address, shipping_city, shipping_postal_code` lalu
  menggabungkannya jadi satu string `address` per order; drawer men-dedupe alamat unik dan
  mengurutkannya dari yang terakhir dipakai (`Dipakai n×` bila dipakai berkali-kali). Tipe
  `AdminCustomer`/`CustomerOrder` sekarang **diekspor dari drawer** dan diimpor `CustomersView`
  (jangan didefinisikan ulang di CustomersView). Kartu pelanggan tidak lagi membuka riwayat
  belanja inline — satu-satunya jalan ke detail adalah tombol drawer itu.
- Datanya dari **`/api/admin/customers`** (`src/app/api/admin/customers/route.ts`, service role).
  Ini **wajib** lewat route: tabel `customers` punya policy RLS "read own", jadi anon client admin
  tidak bisa membaca pelanggan lain. Route-nya memverifikasi sesi Supabase + keanggotaan tabel
  `admins` (pola sama dengan `/api/admin/jnt-settings`), lalu menggabungkan `customers` dengan
  `orders` — order lama yang `customer_id`-nya null dicocokkan lewat nama, dan pembeli tanpa akun
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
  `curl /id/akun/profil` = `200`, sisanya uji manual — jangan buang panggilan preview untuk itu.
  `birth_date` dibaca dengan fallback tanpa kolom itu kalau migration
  `supabase/migrations/20260910_customer_birth_date.sql` belum dijalankan.
  **Migration itu BELUM dijalankan** (dicek 2026-10-11: `select=id,name,birth_date` → `400`
  `42703 column customers.birth_date does not exist`), jadi tanggal lahir belum tersimpan di mana
  pun. Simpan profil customer (`/[locale]/akun/profil`) menulis `birth_date` langsung dari browser,
  dan tanpa kolomnya PostgREST menolak seluruh update dengan **400** — itulah error
  `rest/v1/customers?id=eq.<uuid>` di console. Sandbox tidak punya jalur DDL, jadi kolomnya dibuat
  lewat SQL Editor Supabase: `ALTER TABLE customers ADD COLUMN IF NOT EXISTS birth_date DATE;`
  (sudah ada di `supabase/migrations/20260910_customer_birth_date.sql`). Selama belum dijalankan,
  halaman profil tetap menyimpan nama/WhatsApp (update diulang tanpa `birth_date`) dan menampilkan
  toast bahwa tanggal lahir gagal disimpan.
  Cek cepat kolom: `curl -s -o /dev/null -w '%{http_code}\n' "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/customers?select=id,birth_date&limit=1" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"`
  → `200` berarti kolomnya sudah ada (`400` = belum).
- **Lookup "user ini pelanggan?" wajib `.maybeSingle()`, bukan `.single()`.** PostgREST membalas
  **`406`** (bukan `400`/`404`) kalau `.single()` tidak menerima tepat satu baris, jadi setiap akun
  **auth tanpa baris `customers`** (mis. sesi admin yang diputar ulang preview, atau akun lama)
  memunculkan `Failed to load resource: 406` di console pada request
  `rest/v1/customers?select=…&id=eq.<uid>` — pesan yang terlihat seperti kerusakan, padahal memang
  bukan pelanggan. `.maybeSingle()` membalas `200` + `null`, jadi hasilnya sama (`customer === null`
  → dropdown menampilkan Masuk/Daftar) tanpa error. Sudah dipakai di `src/components/ProfileDropdown.tsx`,
  `src/lib/use-wishlist.ts`, dan `src/lib/customer-auth.ts` (`loginCustomer`, `getCurrentCustomer`).
  `.single()` hanya untuk baris yang dijamin ada (mis. `store_settings?id=1`).
  Cek cepat: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/admin/customers`
  → `401` tanpa sesi admin.
- Verifikasi panel-panel ini lewat preview: sesi admin user ikut diputar ulang, jadi
  `preview_screenshot({ path: "/admin" })` lalu `preview_execute_code` (klik "Pengaturan"/
  "Pelanggan" — panelnya tombol in-page, bukan route) berhasil. Yang diuji: 7 tombol **Edit** dan
  0 **Simpan/Batal** saat read-only, `Nama Toko` = "SAMAQU" sebagai teks, setelah Edit muncul input
  bernilai sama + Simpan/Batal, Batal kembali ke read-only, kartu J&T tidak ada lagi, dan panel
  Pelanggan memuat (59 pelanggan, 4 kartu ringkasan) tanpa error.

## Daftar pesanan ala Shopee Seller Centre (panel Order Management)

Permintaan pemilik (2026-10-11): "rapihkan flow orderan management broo . pengen setara ecommerce
shopee seller jgn rusak logic nya broo" — daftar pesanan ditata menurut **langkah kerja penjual**,
tanpa menyentuh status ataupun logika database sama sekali.

- **Satu modul tahap**: `src/lib/order-flow.ts` (murni, tanpa React) → `orderStage(order)`
  (`belum_bayar` / `perlu_dikirim` / `dikirim` / `selesai` / `dibatalkan`), `ORDER_STAGE_LABEL`,
  `ORDER_STAGE_TABS`, `ORDER_STAGE_STYLE`, `matchesStage()`, `stageNeedsAdminAction()`, dan
  `shippingLine()`. **Pemetaannya**: `pending` → Belum Bayar; `diproses` **tanpa resi** → Perlu
  Dikirim; `diproses`/`dikirim` **ber-resi** → Dikirim; `selesai`/`dibatalkan` apa adanya. Tidak ada
  status baru yang ditulis ke `orders` dan tidak ada query yang berubah — penamaan + pengelompokan
  lapisan tampilan saja. **Jangan** jadikan tahap ini nilai `status` di database.
- **Satu panel**: seluruh alur panel Pesanan (tab sumber, kotak cari, tab tahap, daftar, tabel)
  pindah dari `src/app/admin/page.tsx` ke **`src/components/admin/OrdersView.tsx`** (file `page.tsx`
  sudah ~1000 baris). Kedua dashboard tetap ikut otomatis karena `/id/admin` cuma
  `export { default } from "@/app/admin/page"`. Props tinggal `orders` + `onSelect(row)`: halaman
  admin mencari ulang pesanan lengkapnya lewat `id` saat baris diklik, jadi `selectedOrder` tetap
  objek dari state `orders` dan drawer + chip status bekerja persis seperti sebelumnya. Prop
  `onArrangeOrder` **sudah dihapus** (aksi pesanan hanya ada di drawer detail — lihat "Aksi hanya di
  drawer detail"); `arrangeOrder` (konfirmasi `ConfirmModal` + `PATCH action: "createJnt"`, **tetap
  digerbangi `diproses` di server**) sekarang hanya dipakai `OrderDetailDrawer`, bertipe
  `{ order_number: string }` — hanya field itu yang dipakainya.
- **Aksi hanya di drawer detail** (permintaan pemilik 2026-10-11: "tabel nya jadi berantakan ini
  broo harus nya atur pesanan hubungi pembeli di detail aja bro, rapihin juga tabel yg di open
  order"): tombol per baris yang dulu ditulis `OrdersView.rowAction()` (**Atur Pesanan** saat Perlu
  Dikirim, **Cetak Label** saat Dikirim ber-resi, **Hubungi Pembeli** saat Belum Bayar) sudah
  **dihapus** bersama helper `waLink()`-nya — daftar pesanan kini cuma menyaring, menampilkan, dan
  membuka detail. Satu-satunya tombol di baris adalah **Detail** (di bawah `lg` seluruh kartunya jadi
  tombol), dan `onClick={(e) => { e.stopPropagation(); onSelect(o); }}` menjaga klik tombol tidak ikut
  memanggil handler barisnya. Semua aksi itu tetap lengkap di `OrderDetailContent` (drawer), jadi
  **jangan** menambahkan tombol aksi ke `OrdersView`/`OrdersMobileList` lagi tanpa permintaan baru —
  kolom aksi yang berisi dua tombol itulah yang membuat tabelnya berantakan. **Jangan** mengubah
  gerbang "Atur Pesanan" di `OrderDetailContent` (masih `status === "diproses"`): `orderStage` hanya
  memberi tahu keadaan pesanan, bukan menggantikan gerbangnya.
- **Kolom "Total" sudah dihapus dari tabel** (permintaan pemilik 2026-10-11: "tabel total mending
  hapus aja deh bro di menu manage pesanan") — kolomnya cuma mengulang angka yang sudah ada di kartu
  dan di total produk/ringkasan drawer. Menghapusnya juga menghapus helper `money()` di
  `OrdersView` (tidak dipakai lagi) dan menurunkan `colSpan` baris kosong `7` → `6`. Kartu
  (`OrdersMobileList`) sengaja **tetap** menampilkan `tanggal · total`. Tabelnya kini tinggal enam
  kolom: `ID · Pelanggan · Tanggal · Pengiriman · Status · Aksi` (`min-w-[860px]` tidak berubah,
  jadi masih muat).
- **Tabel dipepetkan satu baris per sel** supaya tidak berantakan (bagian "rapihin juga tabel yg di
  open order"): `whitespace-nowrap` di kolom ID, Tanggal, dan kolom Aksi; nama pelanggan
  dipotong `max-w-[200px] truncate` (+ `title`); kolom
  Pengiriman `min-w-[150px]`. Nomor Open Order (`CYO-20261011-…`) dan nama panjang tidak lagi membuat
  baris tumbuh tinggi sendiri-sendiri. Tab **Open Order** memakai tabel yang sama persis — tidak ada
  tabel terpisah, jadi perbaikan ini ikut keduanya.
- **Kolom "Pengiriman" (tabel) + baris pengiriman (kartu)** memakai `shippingLine()`: kurir (mis.
  "J&T - EZ") + nomor resi, atau **"Resi belum dibuat"** (oranye, `awaiting`) untuk tahap Perlu
  Dikirim, dan "Tanpa resi" untuk pesanan yang memang tidak pernah ber-resi (banyak `selesai` lama).
  Tabel minimumnya naik `720px` → `860px` (tujuh kolom) dan tetap di dalam pembungkus
  `overflow-x-auto` yang sama.
- **Warna pill tahap** ada di `ORDER_STAGE_STYLE` (Belum Bayar amber, Perlu Dikirim oranye
  `#fff7ed`/`#c2410c`, Dikirim biru, Selesai hijau, Dibatalkan abu). Tab "Perlu Dikirim" disorot
  oranye selama jumlahnya > 0 (`stageNeedsAdminAction`) — pengingat pesanan yang menunggu resi.
  `StatusBadge` + helper `statusLabel`/`money` di `page.tsx` sudah dihapus (digantikan `StageBadge`
  + helper di `OrdersView`), tetapi kelas `badge` (CSS admin) masih dipakai di sidebar & kartu.
- **Verifikasi (2026-10-11, sesi admin diputar ulang, 768 px + desktop)**: `tsc --noEmit` bersih;
  `curl /admin` & `/id/admin` = `200`; tab berbunyi `Semua (35) · Belum Bayar (1) · Perlu Dikirim (2)
  · Dikirim (0) · Selesai (22) · Dibatalkan (10)`; 35 kartu dengan pill tahap + baris pengiriman;
  klik tab **Perlu Dikirim** → 2 baris, semuanya "Perlu Dikirim" + "Resi belum dibuat"; di desktop
  tabel menampilkan tujuh kolom (termasuk `Total` — kolom itu dihapus belakangan, lihat "Kolom
  "Total" sudah dihapus dari tabel" di atas); tidak ada scroll samping di kedua lebar; tanpa error
  console. (Klik **Atur Pesanan** di baris masih ada saat
  pengujian itu, kini sudah dipindah ke drawer detail — lihat "Aksi hanya di drawer detail"; setelah
  pemindahan itu yang bisa dibuktikan hanya `tsc --noEmit` bersih + `curl /admin` & `/id/admin` =
  `200`, karena route admin memang tidak dapat dibuka lewat preview tool.) **Belum** terbukti end-to-end: menekan **konfirmasi** "Atur
  Pesanan" (kredensial J&T toko production — akan menerbitkan pengiriman asli), serta tautan **Cetak
  Label**/**Hubungi Pembeli** (tautan keluar, tidak diklik).
- **Catatan tool preview**: `preview_screenshot({path:'/admin'})` hanya melakukan kunjungan penuh
  kalau halaman preview baru saja di-reset (perintah shell/edit sebelumnya) — kalau dipanggil di
  tengah turn ia mencoba SPA nav dan gagal (`navigation_failed`, URL berubah tapi konten tetap).
  Jadi: **jalankan perintah shell dulu**, baru `preview_screenshot({path:'/admin'})`, lalu
  `preview_execute_code` tanpa shell/edit di antaranya.

## "Atur Pesanan" — resi J&T diterbitkan admin (ala Shopee Seller Centre)

Permintaan pemilik (2026-10-11): alur pengiriman disamakan dengan Shopee Seller — resi/AWB J&T
**tidak lagi terbit saat customer checkout**, tapi saat admin menekan **"Atur Pesanan"** setelah
pembayaran diverifikasi.

- **Checkout berhenti memanggil J&T**: `/api/orders` (checkout website) dan `/api/open-order` tidak
  lagi memanggil `createOrder` dan membalas `awbNo: null`. Logika payload J&T-nya sekarang **satu**
  modul: `src/lib/jnt/order-from-order.ts` → `createJntOrderForOrder(order)` (dulu disalin di dua
  route checkout). Modul itu juga menentukan COD (`payment_methods.method_type`, atau nilai lama
  `'cod'`) dan berat kirim (`orders.weight`; kalau kosong dijumlah dari `products.weight` per
  `order_items`, fallback 1200 g/item — pesanan Open Order menyimpan `weight: null`).
  Salinan mati `src/app/[locale]/api/**` sengaja tidak diubah.
- **Aksi admin**: `PATCH /api/admin/orders` dengan `action: "createJnt"` → guard (404 pesanan tidak
  ada, 400 sudah punya `awb_no`, 400 kalau `dibatalkan`), panggil J&T, lalu simpan `awb_no` +
  `jnt_order_id` **dan ubah status ke `diproses`**. Tombol **"Atur Pesanan"** (kelas `od-a-primary`,
  ikon kotak) ada di blok aksi `OrderDetailContent.tsx`, muncul hanya bila pesanan belum punya resi
  dan statusnya sudah **`diproses`** (permintaan pemilik 2026-10-11: "ini kan orderan menunggu
  pembayaran, tapi kok ada atur pesanan — harusnya munculnya ketika admin ubah ke proses, mirip
  Shopee"; sebelumnya `pending` juga menampilkan tombolnya, jadi pesanan yang belum dibayar/
  diverifikasi sudah menawarkan pembuatan resi). Konsekuensinya admin harus menekan chip
  **Diproses** dulu; petunjuk "Nomor resi belum dibuat…" di blok Info Pengiriman ikut menyesuaikan
  (`canArrange`) supaya tidak menyuruh klik tombol yang belum tampil. Guard route `createJnt`
  **tidak** ikut berubah (masih menolak `dibatalkan`/pesanan ber-`awb_no`) — itu jalur langka yang
  hanya bisa dipanggil langsung, bukan dari UI. Kliknya membuka `ConfirmModal` (label konfirmasinya "Atur
  Pesanan", bukan "Hapus" — `showConfirm` di `src/app/admin/page.tsx` menerima
  `options: { confirmText, danger }`), lalu `arrangeOrder()` meng-update baris tabel + drawer tanpa
  reload. Status `dikirim` tetap datang dari pelacakan, bukan dari sini.
- **Kalau J&T menolak** (kredensial/kode area gagal) route membalas 400 dengan pesan `reason`/`desc`
  dari J&T, status pesanan tidak berubah, dan tombolnya tetap ada untuk dicoba lagi.
- **Pemulihan resi yang tidak sengaja dibatalkan** (kejadian nyata 2026-10-11, `SMQ-20261008-432`):
  J&T **tidak bisa menghidupkan AWB yang sudah di-void** ("Cancelled AWB by Seller" di Riwayat
  Pengiriman), jadi satu-satunya jalur adalah **terbit resi baru**. Karena `createJnt` menolak
  pesanan yang masih ber-`awb_no`, resi mati itu harus dikosongkan lebih dulu lewat REST/PATCH
  `orders` (`awb_no = null`, `jnt_order_id = null`; status dibiarkan `diproses`) — setelah itu
  tombol **Atur Pesanan** muncul lagi dengan petunjuk "Nomor resi belum dibuat…". Pembatalan tadi
  juga sudah mengembalikan stok (khusus `SMQ-`), jadi stok barang itu **dipotong ulang** dengan
  `samaqu_decrement_stock(product_id, color, size, qty)` dari baris `order_items`-nya supaya tidak
  dobel-hitung. Ini perbaikan data sekali jalan (skrip `/tmp`/REST), bukan kode app — jangan
  menambah jalur "un-cancel" di aplikasi tanpa permintaan. Dibuktikan lewat preview (sesi admin
  diputar ulang): drawer `SMQ-20261008-432` → "Nomor resi belum dibuat…" + tombol **Atur Pesanan**
  ada, tombol Lacak/Batalkan/Cetak Label hilang, tanpa error console.
- **`shipping_city` kini menyimpan "Kecamatan, Kota" di kedua jalur** (checkout website dulu hanya
  menyimpan kota, jadi kecamatan hilang dan `receiver_area` J&T cuma bisa ditebak dari kota).
  `splitCityDistrict()` di `order-from-order.ts` memecahnya lagi saat membuat resi; order lama yang
  isinya hanya nama kota tetap jalan (district kosong → lookup per kota).
- **Verifikasi**: `tsc --noEmit` bersih; `curl /admin` & `/id/admin` = `200`. Lewat preview (sesi
  admin diputar ulang): Order Management → baris pesanan tanpa resi (mis. `SMQ-20261007-761`) →
  tombol **Atur Pesanan** ada; pesanan ber-resi (mis. `SMQ-20261008-432`) tidak punya tombol itu;
  klik tombol → `ConfirmModal` muncul, klik **Batal** → tidak ada request `PATCH /api/admin/orders`
  (cek `getNetworkRequests`). Guard route tanpa menyentuh J&T:
  `curl -X PATCH http://localhost:3000/api/admin/orders -H 'Content-Type: application/json'
  -d '{"orderNumber":"SMQ-20261008-432","action":"createJnt"}'` → `400` "sudah punya nomor resi";
  order asing → `404`. **Pembuatan resi yang benar-benar sukses belum diuji otomatis**: kredensial
  J&T toko ini production, jadi mengonfirmasi dialognya akan membuat pengiriman J&T asli — uji
  manual dengan satu pesanan nyata. Setelah gerbang status di atas (2026-10-11) tombolnya **hanya**
untuk `diproses`; verified ulang lewat preview (sesi admin diputar ulang): `pending`
(`SMQ-20261011-643`) → chip Pending, **tanpa** tombol Atur Pesanan; `diproses` tanpa resi
(`SMQ-20261011-371`) → tombol muncul + petunjuk "Klik Atur Pesanan", tanpa error console. Kasus
**`pending` tanpa resi** tidak bisa direproduksi saat itu (satu-satunya pesanan `pending` sudah
 ber-resi) — kondisi `order.status === "diproses"` yang menutupnya.

## Status pesanan vs status pengiriman (revisi 2026-10-14)

Permintaan pemilik: klik "Atur Pesanan" jangan langsung bikin pesanan tampak **Dikirim** — resi
terbit ≠ paket berangkat. Alur baru:

`Perlu Dikirim` (diproses, resi belum ada) → **Atur Pesanan** → `Menunggu Pickup` (resi terbit) →
J&T **pemindaian pertama** → `Dikirim` → paket diterima (J&T `status_code` 200) → `Selesai`.

- **Data**: `orders.shipping_status` (`NULL`→`menunggu_pickup`→`dikirim`→`selesai`) +
  `tracking_status_code/text/city/updated_at`, dan tabel `order_tracking_events`
  (`supabase/migrations/20261014_order_shipping_status.sql`). Riwayat idempoten via `event_key`
  unik (`<awb>|<status_code>|<date_time>`). **Catatan**: `orders.id` di DB ini bertipe **TEXT**
  (bukan UUID) — FK `order_tracking_events.order_id` ikut TEXT.
- **Atur Pesanan** (`PATCH /api/admin/orders` `action:"createJnt"`) sekarang menulis
  `{awb_no, jnt_order_id, status:"diproses", shipping_status:"menunggu_pickup"}` — **tidak** `dikirim`.
- **Satu sumber logika transisi**: `src/lib/jnt/tracking-sync.ts` (`applyTrackingToOrder`) —
  dipakai cron **dan** aksi admin `action:"syncTracking"` (dipicu tombol "Lacak Paket"). Aturan:
  riwayat kosong / API gagal → status tak berubah; pemindaian pertama → `dikirim`; `200` → `selesai`;
  **maju-saja** (respons telat tak memundurkan status); `dibatalkan` tak disentuh; kode tak dikenal
  hanya disimpan (kolom `raw`) tanpa menebak. `src/lib/jnt/track-status.ts` menyediakan `isShipped`
  + `isDelivered` + rank.
- **Tampilan**: `src/lib/order-flow.ts` `orderStage` kini **murni dari `orders.status`** (tidak lagi
  `diproses && awb_no → dikirim`); status pengiriman ditampilkan terpisah lewat `shippingLine`/
  `shippingStatusOf` (pill "Menunggu Pickup"/"Dikirim") di `OrdersView`, `OrdersMobileList`, dan
  `OrderDetailContent` (+ "Tracking terakhir").
- **Sinkronisasi**: **tanpa webhook J&T** → polling `GET /api/cron/sync-tracking` (header
  `Authorization: Bearer $CRON_SECRET`) yang dijadwalkan **cron-job eksternal** milik pemilik
  (bukan Vercel Cron). Belum ada penjadwal di repo.
- **Diuji** (harness memanggil `applyTrackingToOrder` dengan stub + payload track terkontrol,
  lib di-compile dari sumber nyata): resi tanpa scan → tetap `menunggu_pickup`; scan pertama →
  `dikirim` + event tersimpan; API gagal → tak berubah; riwayat sama berulang → idempoten
  (event_key unik diverifikasi di DB: 2 insert identik = 1 baris); sudah `dikirim` + respons lama →
  tak mundur; `200` → `selesai`; `dibatalkan` → tak disentuh. **Produksi (2026-10-13)**: dengan
  kredensial production terbaru, create order ✅ (resi `JO0329847318`), tariff ✅ (Rp68.000),
  track ✅, cancel/void ✅ — semua diuji langsung ke endpoint production. Catatan penting: resi
  baru **langsung** punya entri tracking `status_code 101 = "Manifes"` (otomatis saat order dibuat),
  dan void resi menghasilkan `status_code 162 = "Cancelled AWB by Seller"` — keduanya dikecualikan
  (`JNT_NON_SHIPPING_CODES`) supaya tidak salah menandai "Dikirim".

## Lacak paket di drawer pesanan & status selesai otomatis

Permintaan pemilik (2026-10-11): "di detail tambahin tombol Lacak", "ketika paket sudah diterima
otomatis statusnya selesai sendiri", plus chip filter "dibatalkan" di panel Pesanan.

- **Tab tahap** (dulu chips status mentah `["Semua","pending","diproses","selesai","dibatalkan"]`,
  kini di `src/components/admin/OrdersView.tsx`): `ORDER_STAGE_TABS` di `src/lib/order-flow.ts` —
  Semua · Belum Bayar · Perlu Dikirim · Dikirim · Selesai · Dibatalkan. Satu sumber untuk `/admin`
  dan `/id/admin`. Barisnya tetap `flex-wrap`, jadi enam tab tidak memotong apa pun di ~370 px.
  Setiap tab menampilkan **jumlahnya** (`Perlu Dikirim (2)`) dan **judul daftar ikut tab aktif**
  ("Semua Pesanan" → "Pesanan Perlu Dikirim"; tab Open Order → "Open Order Selesai"). Angkanya dari
  `stageCounts` yang dihitung atas `searchedOrders` (tab sumber yang aktif **setelah** kotak cari),
  jadi selalu cocok dengan baris di bawahnya — bukan query terpisah.
- **Kotak cari pesanan** (permintaan pemilik 2026-10-11: "di menu management order tambahin search
  biar enak, bikin yg modern"): state `orderSearch` + kotak di bawah baris judul/chip, mencocokkan
  `order_number`, `customer_name`, `customer_email`, dan `customer_whatsapp` (substring,
  case-insensitive). Saringannya **sebelum** chip status (AND), angka chip "Semua" ikut
  `searchedOrders.length`, dan pesan kosong dibedakan (`ordersEmptyText`): "Tidak ada pesanan yang
  cocok dengan pencarian" vs "belum ada pesanan". Kotak ini **beda** dari kotak "Cari produk…" di
  topbar (`productSearch`, menggerakkan panel Produk). Verifikasi (sesi admin diputar ulang;
  `preview_screenshot({path:'/admin'})` dulu karena `navigate()` tidak bereaksi di route admin):
  "Sri" → 2 baris (`SMQ-20261011-643` cocok dari email `naniusriyati@…` + `SMQ-20261008-432`) dan
  chip jadi `Semua (2)`/`Pending (1)`/`Diproses (1)`/`Selesai (0)`; "SMQ-20261008-432" → 1 baris;
  teks ngawur → 0 baris + pesan kosong; tombol X mengembalikan 35 baris; tanpa error console.
- **Tipografi admin seragam**: satu aturan di `ADMIN_WF_VARS` (`src/components/admin/admin-theme.ts`,
  `#admin-root h1..h4 { font-family: var(--font-inter) !important; font-style: normal !important }`)
  memaksa SEMUA judul admin memakai font UI, bukan Cormorant serif italic (gaya storefront).
  Dipaksa `!important` karena banyak judul menulis `fontFamily` inline — jadi menghapus satu per satu
  di puluhan file (termasuk salinan locale) tidak perlu; elemen serif yang **bukan** judul (kode
  voucher, nama produk di blok "Preview Produk") sengaja dibiarkan. Verifikasi: `getComputedStyle`
  pada h2 "Semua Pesanan" & "Konten Website" → `fontFamily` Inter, `fontStyle` normal.
- **Tombol Lacak**: `OrderDetailContent.tsx` (drawer detail pesanan, kedua dashboard) punya tombol
  **Lacak Paket** di blok aksi, muncul hanya bila pesanan punya `awb_no`. Tombol membuka panel
  **Riwayat Pengiriman** di dalam drawer yang memanggil `/api/jnt/track?awb=…` sekali (data
  disimpan di state, tutup/buka lagi tidak fetch ulang); riwayat J&T datang terlama-dulu, jadi
  dibalik supaya yang terbaru di atas. Gaya memakai kelas `od-` di `OD_CSS` (bukan komponen
  halaman lacak customer yang butuh sesi customer).
- **Auto "selesai"**: begitu pelacakan menunjukkan paket **diterima penerima**, status pesanan
  otomatis jadi `selesai` tanpa admin mengubahnya:
  - **saat dilihat** — panel Lacak memanggil `onStatusChange("selesai")` (prop drawer yang sudah
    ada → `PATCH /api/admin/orders`) hanya bila `isDelivered()` benar dan status masih
    `pending`/`diproses`/`dikirim` (jadi pesanan `dibatalkan`/`selesai` tidak tersentuh);
  - **di latar belakang** — cron **`/api/cron/sync-tracking`** (`src/app/api/cron/sync-tracking/route.ts`)
    memindai ≤100 pesanan ber-resi berstatus belum final, melacak tiap resi, dan menandai yang
    sudah diterima sebagai `selesai`. Gerbang `CRON_SECRET` sama dengan `/api/cron/auto-cancel`
    (`Authorization: Bearer $CRON_SECRET`; `401` kalau salah/kosong) — **belum ada penjadwal di
    repo**: jadwalkan endpoint ini (mis. tiap jam) bersama `auto-cancel` di penjadwal cron/Vercel
    yang sudah dipakai untuk endpoint itu. Tanpa penjadwal, auto-selesai tetap jalan begitu admin
    membuka panel Lacak.
- **Deteksi "diterima"** ada di satu modul murni **`src/lib/jnt/track-status.ts`** →
  `isDelivered({history})` = ada riwayat dengan `status_code === 200` ("Paket telah diterima" /
  Delivered, per dokumentasi J&T). **Jangan** mencocokkan teks: `status_code` 100 juga berbunyi
  "Paket telah diterima oleh <gerai>" (paket baru diserahkan ke J&T di gerai asal), bukan bukti
  sampai ke penerima. Modulnya cuma impor tipe, jadi dipakai klien & server.
- Verifikasi: `tsc --noEmit` bersih; `curl /admin` & `/id/admin` = `200`; `/api/cron/sync-tracking`
  tanpa/`salah` header = `401`; `isDelivered` diuji lewat Node (200 → true, 100/401/kosong →
  false). Lewat preview (sesi admin diputar ulang): chip **Dibatalkan** tampil, filter menyisakan
  10 pesanan dibatalkan, drawer terbuka, tombol **Lacak Paket** muncul untuk pesanan ber-resi
  `SMQ-20261010-364`, panel Riwayat Pengiriman terisi (`Manifes DEPOK …`), tanpa error console,
  dan tidak ada scroll samping di 375 px. **Belum** terbukti live: status berubah sendiri saat
  paket benar-benar diterima (perlu pesanan yang resinya sudah `status_code 200`) — logikanya
  diuji unit, bukan end-to-end.

## Satu scrollbar untuk panel meluncur (drawer) admin

Permintaan pemilik (2026-10-11): "kok scroll nya jadi ada 2 sih di detail pesanan satu aja broo
jgn 2 gitu cek juga di yg lain, tolong bikin kaya website mahal". Dulu drawer punya scrollbar
sendiri sementara halaman admin di belakangnya masih bisa di-scroll — dua bar terlihat sekaligus.

- **Kunci scroll halaman**: hook bersama **`src/lib/use-scroll-lock.ts`** → `useBodyScrollLock(active)`.
  Dipanggil `OrderDetailDrawer` (`!!order`), `ProductDetailDrawer` (`!!productId` — hanya jalur
  drawer; `ProductDetailPanel` mode `page` tidak ikut terkunci) dan `CustomerDetailDrawer`
  (`!!customer`). Hook menulis `overflow:hidden` ke `<html>` + `<body>` dan menambah
  `padding-right` selebar scrollbar yang hilang supaya tata letak tidak bergeser saat panel dibuka;
  penghitung di modulnya membuat beberapa panel yang terbuka bersamaan (mis. drawer + `ConfirmModal`)
  hanya mengunci sekali dan membuka kunci saat panel terakhir ditutup. Panel baru: pakai hook ini,
  jangan menulis kunci scroll sendiri.
- **Bar ramping**: kelas **`drawer-scroll`** di `src/app/globals.css` (`overscroll-behavior:contain`,
  `scrollbar-width:thin`, `::-webkit-scrollbar` dengan track transparan & thumb membulat) dipasang di
  `.odr-body`, `.pd-body`, `.cd-body`; itu juga yang mencegah scroll panel "menular" ke halaman.
- Verifikasi (sesi admin diputar ulang): `/id/admin` → Order Management → tombol **Detail** →
  `overflow` `<body>` = `hidden`, `window.scrollTo(0,700)` tidak menggeser halaman, `.odr-body`
  berkelas `drawer-scroll` dengan `overscroll-behavior:contain` dan tetap bisa di-scroll, di 768 px
  panel 520 px tanpa scroll samping, lalu setelah drawer ditutup `overflow` body kembali normal dan
  halaman bisa di-scroll lagi. **Catatan tool**: `navigate('/id/admin')` di `preview_execute_code`
  membalas `navigation_failed` (route admin tidak bereaksi ke SPA nav) dan URL-nya tertinggal
  menunjuk `/id/admin` padahal isinya halaman lain — panggil `preview_screenshot({path:'/id/admin'})`
  (yang melakukan kunjungan halaman penuh) dulu sebelum menguji panel admin.

## Satu jalur pembatalan: resi J&T selalu di-void dulu

Permintaan pemilik (2026-10-11): "bagus gimana buat alur yg skrng, kasih yg terbaik aja" —
setelah dibahas, celahnya bukan di cron (order `pending` normalnya belum beresi) melainkan di
chip **"Ubah Status"** drawer admin: chip itu dulu menulis status apa adanya, jadi pesanan beresi
bisa dikembalikan ke `pending` atau ditandai `dibatalkan` sementara resinya tetap hidup di J&T.

- **Satu modul**: `src/lib/cancel-order.ts` → `cancelOrderCompletely(order, remark)`. Urutannya
  void resi J&T (kalau `awb_no`/`jnt_order_id` ada) → stok website dikembalikan → status
  `dibatalkan` + `cancelled_at`/`updated_at` ditulis manual (lihat "Jam pembatalan pesanan" di
  atas). Kalau J&T menolak, status **tidak** diubah dan
  fungsinya mengembalikan `{ success: false, stage: "jnt" }` supaya resi tidak menggantung.
  Dipakai **empat** pemanggil: `PATCH /api/admin/orders` (action `cancelJnt` **dan** status
  `dibatalkan`), `POST /api/orders/cancel` (customer), dan `GET /api/cron/auto-cancel`.
  Jangan tulis ulang urutan void→stok→status di route baru; panggil modul ini.
- **Stok dikembalikan hanya kalau `orders.stock_reserved` true**: `hasStockReservation()` di modul
  itu memakai kolom itu (sejak 2026-10-14), bukan lagi awalan nomor pesanan. Checkout website
  **dan** Open Order sama-sama memotong stok (`samaqu_decrement_stock`) dan sama-sama menandai
  `stock_reserved`; CYO lama tidak, jadi jalur admin & cron tidak lagi **menambah** stok yang tidak
  pernah diambil hanya karena nomornya berawalan `CYO-`.
  Customer hanya bisa membatalkan order miliknya (`customer_id`), dan order website lama/baru
  `customer_id`-nya null → praktis tidak berubah, tapi aturannya sekarang eksplisit.
- **Dua penjagaan di `PATCH /api/admin/orders`** (selain `cancelJnt`): status `pending` **ditolak
  400** kalau pesanan sudah punya resi (`Pesanan ini sudah punya resi J&T (<resi>)…`), dan status
  `dibatalkan` dirutekan ke `cancelOrderCompletely()` — jadi chip "Dibatalkan" kini ikut mem-void
  resi, bukan cuma mengganti status.
- **Klien**: `updateOrderStatus()` di `src/app/admin/page.tsx` mendelegasikan `dibatalkan` untuk
  pesanan ber-`awb_no` ke `cancelJntOrder()` (konfirmasi + void), dan dialog itu memakai
  `{ confirmText: "Ya, Batalkan", danger: true }` (sebelumnya tombolnya berbunyi "Hapus").
  Penjagaan server tetap yang mengikat — klien cuma UX.
- **Pesan error J&T**: `cancelOrder()` hanya melihat `raw.detail[0].status === "Sukses"`, sedangkan
  `raw.desc` bisa berbunyi "Request berhasil" walau `detail[0].reason` menolak; karena itu pesan
  error memakai `detail[0].reason` lebih dulu.
- **Verifikasi (2026-10-11, semua lolos)**: `tsc --noEmit` bersih. Lewat API + baca REST:
  (a) order uji tanpa resi + status `dibatalkan` → 200, `updated_at` > `created_at`;
  (b) order uji pending **beresi** + chip `pending` → 400 (ditolak) dan chip `dibatalkan` → 400
  dengan status tetap `pending` (J&T menolak void);
  (c) order uji `created_at` 25 jam lalu → cron `auto-cancel` → `{cancelled:1}` dan statusnya
  `dibatalkan`; (d) sesi admin diputar ulang: `/id/admin` → Order Management → baris pesanan uji
  → chip "Dibatalkan" membuka dialog "Batalkan di J&T?" berisi nomor AWB, **tidak** ada
  `PATCH /api/admin/orders` selama dialog terbuka, status tetap Pending, dialog/drawer ditutup
  tanpa error console. Semua pesanan uji dihapus lagi setelah uji (tidak ada sisa `TEST*`).
  Perubahan terakhir pada label tombol dialog tidak diuji ulang di browser (jatah panggilan
  preview habis) — hanya `tsc` bersih.
## Alamat pesanan: kecamatan & kode pos (2026-10-11)

Pemilik menemukan pesanan `SMQ-20261011-643` (Damar) alamatnya cuma "Jl.Medokan Asri Barat IV
Blok F No.44, Surabaya" — kecamatan dan kode pos tidak muncul, padahal checkout meminta keduanya.
Dua bug berbeda, keduanya di `src/app/[locale]/(customer)/checkout/page.tsx` (pohon
`src/app/(customer)/` sengaja **tidak** disentuh: tidak terpakai) dan di drawer admin:

- **Kecamatan alamat manual terbuang.** Payload checkout dulu mengirim
  `district: selectedAddr?.kecamatan || ""`, jadi untuk tamu/alamat manual (yang kecamatannya
  diketik di field "Kecamatan") nilainya selalu kosong → `shipping_city` cuma berisi kota dan
  `getReceiverArea()` J&T kehilangan kode area. Sekarang:
  `district: selectedAddr ? selectedAddr.kecamatan || "" : kecamatanName.trim()`, dan karena
  field Kecamatan berlabel wajib, submit manual tanpa kecamatan **ditolak** klien
  (`e.kecamatan = "Kecamatan wajib diisi"`, pesan + border merah ditampilkan seperti field lain).
  `const selectedAddr` diangkat ke atas blok validasi supaya dipakai validasi & payload sekaligus.
- **"Gunakan Alamat Baru" masih memakai alamat tersimpan.** Dulu `selectedAddressId` tidak
  dikosongkan, jadi setelah menekan "+ Gunakan Alamat Baru" kecamatan tetap diambil dari alamat
  tersimpan sementara jalan/kota/kode pos dari field yang diketik — campur dua alamat. Sekarang
  tombol itu `setSelectedAddressId("")`, dan "← Kembali ke alamat tersimpan" memilih ulang alamat
  default lewat `handleSelectAddress` supaya payload tidak tertinggal di mode manual.
- **Kode pos tidak tampil di drawer admin.** Drawer membaca `order.shipping_postal`, padahal
  kolomnya `orders.shipping_postal_code` (API admin pun mengirim nama itu) → kode pos hilang dari
  blok "Alamat Pengiriman". Sudah diperbaiki di `src/components/admin/OrderDetailContent.tsx`
  (tipe + perakit `alamat`) dan tipe `Order` di `src/app/admin/page.tsx`. Halaman customer
  (`RincianPesanan.tsx`) memang sudah benar sejak awal, jadi kode pos selalu terlihat di
  `/akun/pesanan` — yang bolong hanya sisi admin.

Konsekuensi data: kecamatan yang sudah telanjur hilang **tidak bisa dipulihkan** (tidak ada
`saved_addresses` untuk pembeli itu dan kolomnya tidak menyimpan jejaknya) — `SMQ-20261011-643`
masih perlu kecamatan diisi manual/konfirmasi ke pembeli saat resi diterbitkan (kode posnya aman:
`60295`). Pesanan `SMQ-`/`CYO-` baru sudah ikut membaik otomatis.

Verifikasi: `tsc --noEmit` bersih; `/id/checkout` = `200` dan HTML SSR-nya memuat
`data-field="alamat|kecamatan|kota|kodepos"`; `/admin` = `200`; baris REST pesanan menunjukkan
`shipping_postal_code: "60295"` (masukannya ada, cuma tidak dirender). **Belum terbukti di
browser**: klik "Buat Pesanan" dengan kecamatan terisi benar-benar mengirim `district` yang
diketik (jatah panggilan preview habis; `navigate('/id/checkout')` di preview balas
`navigation_failed` — route tidak merender lewat SPA nav, jadi checkout harus dibuka dengan
kunjungan halaman penuh lalu diuji manual).

- **Kredensial production SUDAH BERES (2026-10-13)**: pemilik mengirim kredensial production
  (`WITHSAMAQU-DPK01C`) dan semuanya diverifikasi langsung ke endpoint production — **create order
  ✅** (resi `JO0329847318`), **tariff ✅** (Rp68.000), **track ✅**, **cancel/void ✅**. Diisi di
  `.env.local` (gitignored) + env Vercel; pemilik akan merotasi. Temuan penting: entri tracking
  pertama resi baru adalah `status_code 101 = "Manifes"` (otomatis saat order dibuat) → dikecualikan
  dari pemicu "Dikirim" (lihat bagian "Status pesanan vs status pengiriman").

## Pusat data pelanggan (admin + ops) + sinkron Order→Lead (2026-10-13)

Permintaan pemilik: daftar **Pelanggan** admin urut **terbaru** + **filter**; modul **Pelanggan di
dashboards ops**; dan "order baru bikin lead". Keputusan user = **"tandai closing kalau cocok"**.

- **Satu sumber data**: `src/lib/customer-directory.ts` (`buildCustomerDirectory` + `filterCustomers`
  + `sortCustomers`). Dipakai `GET /api/admin/customers` (`{ customers }`) dan `GET /api/ops/customers`
  (`{ items }`, guard `isOpsAdmin`). Default urut **Terbaru** = aktivitas terakhir (`max(createdAt, lastOrderAt)`).
  Kolom baru: `createdAt` + `cities` (untuk filter Kota).
- **UI bersama**: `src/components/customers/CustomerDirectoryView.tsx` (kelas Tailwind netral/slate —
  BUKAN var tema admin, karena `--fg`/`.card`/`--bd` cuma ada di tema admin) dipakai oleh panel admin
  (`CustomersView`, + stat cards + Export) dan halaman ops `src/app/ops/pelanggan/page.tsx`.
  Filter: **Punya akun/Belum daftar**, **Belanja terakhir (30/90/365 hari)**, **Kota**, **Ulang tahun
  bulan ini**; + pilih urut (Terbaru/Belanja/Nama A–Z).
- **Order→Lead** (`src/lib/ops-lead-sync.ts` `markLeadBoughtForOrder`): order **TIDAK** membuat lead
  baru (kalau tiap order dibikin lead, pembeli masuk antrean Follow-up). Kalau nomor order
  (`normalizeKontak`) cocok dengan lead yang **masih aktif** → lead ditandai `status="closing"`,
  `outcome="buy"`, `followup_status="selesai"` + `lead_activities` "order_created" (idempoten via
  `note_followup` memuat nomor order). Dipanggil di `api/orders` + `api/open-order` (service role,
  try/catch supaya tak menggagalkan order).
- Diuji: filter/urut di dua dashboard (0 error konsol); `markLeadBoughtForOrder` — cocok+aktif →
  closing+buy+aktivitas; terminal / tak cocok / idempoten → tidak berubah.

## Notifikasi WhatsApp (Fonnte) — dua jalur + anti-pesan-ganda (2026-10-15)

Satu modul: `src/lib/fonnte.ts`. Dua jalur token TERPISAH di tabel `fonnte_settings` (satu baris):
`customer_token` + `customer_number` untuk semua pesan ke pembeli, `admin_token` + `admin_number`
untuk pesan internal. Diatur di Pengaturan → dua kartu ("Notifikasi WhatsApp — Customer" dan
"— Admin"), masing-masing punya Simpan + Test Notifikasi. Token tidak pernah dikirim balik ke
browser (hanya disamarkan); kolom lama `token` tetap jadi cadangan transisi, lalu environment
`FONNTE_TOKEN`. Migrasi: `supabase/fonnte-settings-split.sql` + `supabase/order-notify-flags.sql`.

Pesan & pemicunya (semua pesan ke customer TANPA emoji, sapaan "Ka"):

| Pesan | Pemicu | Fungsi |
|-------|--------|--------|
| Pesanan dibuat | checkout website `/api/orders` & `/api/open-order`, SETELAH invoice Mayar dibuat | `notifyCustomerOrderCreated` |
| Pembayaran diterima | webhook Mayar terverifikasi ATAU admin ubah status `pending`→`diproses` (bukan COD) | `notifyCustomerOrderPaid` |
| Pesanan dikirim | scan pertama J&T (status → `dikirim`) | `notifyCustomerOrderShipped` |
| Paket diterima | tracking J&T `delivered` (status → `selesai`) | `notifyCustomerOrderDelivered` |
| Reminder bayar | cron `/api/cron/auto-cancel`, jendela 20–23 jam, sekali saja | `notifyCustomerPaymentReminder` |
| Pesanan dibatalkan | `cancelOrderCompletely()` (admin / customer / auto-cancel) | `notifyCustomerOrderCancelled` + `notifyAdminOrderCancelled` |
| Pesanan baru (admin) | checkout website & Open Order | `notifyAdminNewOrder` |

Anti-pesan-ganda: satu kolom klaim per peristiwa di `orders` (`notify_created_at`,
`paid_notified_at`, `shipped_notified_at`, `delivered_notified_at`, `reminded_at`,
`cancelled_notified_at`). Pengiriman lewat `claimOrderNotification()` / `sendOnce()`
(`src/lib/order-notify.ts`) — satu `UPDATE ... WHERE kolom IS NULL` di database, jadi webhook,
cron, dan aksi admin yang berjalan bersamaan tetap mengirim satu kali. Klaim TIDAK dilepas kalau
Fonnte gagal (lebih baik tidak terkirim daripada dobel): kegagalannya masuk log, dan
`orders.shipped_notify_status` mencatat `sent`/`failed` untuk notifikasi resi.

Jalur pembayaran manual (admin `pending`→`diproses`) ikut menulis `payment_status='paid'` +
`paid_at` secara kondisional (`paid_at is null` di WHERE) — itulah penjaga agar webhook Mayar
yang datang belakangan tidak menandai lunas dua kali. COD dilewati: tanpa instruksi transfer,
tanpa "pembayaran diterima", tanpa reminder.

Reminder ditempel di cron auto-cancel (bukan endpoint/penjadwal baru) karena jadwalnya sudah tiap
jam; jendela 20–23 jam dipilih supaya reminder selalu keluar SEBELUM auto-cancel 24 jam, dengan
jarak 1 jam agar tidak ada pesanan yang diingatkan lalu langsung dibatalkan di eksekusi yang sama.
Link Mayar diperiksa ulang lewat `validMayarPaymentUrl()` (`src/lib/mayar.ts`) — kalau invoice sudah
lunas atau kedaluwarsa, pesan TIDAK memuat link dan jatuh ke instruksi "hubungi admin".

## Dokumentasi vault setelah perubahan (skill `samaqu-docs`)

Setelah pekerjaan yang **mengubah implementasi** — fitur, logic bisnis, skema/migration, API atau
integrasi, autentikasi/hak akses, arsitektur, perbaikan bug yang mengubah perilaku, atau konfigurasi
deploy yang relevan — perbarui dokumentasi Obsidian lewat skill **`samaqu-docs`**
(panggil `/samaqu-docs`, atau ikuti `SKILL.md`-nya). Untuk perubahan kosmetik/refactor internal
tanpa dampak perilaku, tidak perlu menambah catatan.

- **Vault:** `C:\Users\DELL\Downloads\SAMAQU DOC\samaqu doc\` — satu-satunya vault, jangan membuat
  yang baru dan jangan menulis ke lokasi lain.
- **Dokumentasi bukan pengganti pengujian.** Tetap jalankan `npx tsc --noEmit` (dan `npm run build`
  bila menyentuh route/UI); catatan hanya boleh menyebut pengujian yang benar-benar dijalankan.
- **Jangan mengklaim dokumentasi sudah diperbarui** kalau file belum benar-benar ditulis di vault.
- Kalau vault tidak bisa diakses, **laporkan kegagalan** — jangan diam-diam menulis di tempat lain
  dan jangan mengaku sukses.
- **Jangan menulis secret**: password, token, API key, nilai `.env.local`, atau data pelanggan.
  Catatan `SAMAQU - ENV VERCEL` hanya memuat nama variabel, fungsi, scope, dan env yang diperlukan.
- **Utamakan memperbarui** catatan yang sudah ada (jangan menggandakan dokumentasi ENV, database,
  arsitektur, atau fitur). Tautan internal pakai `[[Nama Dokumen]]`.
- **Jangan `git commit`/`push` hanya untuk dokumentasi** kecuali diminta secara terpisah; vault
  berada di luar repo ini.

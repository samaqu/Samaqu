# CATATAN UNTUK AGENT BERIKUTNYA — SAMAQU

Dokumen ini biar agent berikutnya (atau developer baru) tidak bingung: apa yang sudah dibangun,
di mana letaknya, aturan yang harus dipatuhi, dan jebakan teknis yang sudah pernah kena.

> **Token/akses rahasia TIDAK ada di file ini** (biar aman kalau repo-nya publik).
> Semua token (Supabase PAT, Vercel, Base44, dsb) ada di **`.agent-secrets.local.md`** di root repo —
> file itu sudah di-`.gitignore`, jangan pernah di-commit dan jangan ditempel ke chat.

---

## 1. Gambaran besar

- **Website brand** `www.samaqu.id` — Next.js App Router + Supabase + Cloudinary, deploy di Vercel.
  Tema **monokrom** (hitam/putih/abu). Warna semantik yang tetap dipakai: merah untuk `Dibatalkan`,
  hijau untuk WhatsApp.
- **Dashboard internal (ops)** `office.samaqu.id` (juga bisa `samaqu.id/ops`) — shell-nya di
  `src/components/ops/OpsShell.tsx` + `src/app/ops/**`. Ini pengganti app Base44 (Base44 **sudah
  tidak dipakai**). Datanya satu sumber: Supabase yang sama dengan website.
  Ada 3 hal berbeda yang sama-sama bernama "Base44" — jangan ketuker:
  **(a) platform/sandbox** tempat repo ini dijalankan & di-preview (`docker-compose.base44.yml`,
  `.base44/env.defaults`, `/run/base44/app.env`) — ini infra, bukan koneksi aplikasi;
  **(b) app Base44 lama** = dashboard ops versi sebelumnya, sekarang cuma jadi **referensi desain**;
  **(c) nama shim** `base44` di `src/lib/ops-api.ts` — murni penamaan internal supaya halaman hasil
  port tidak perlu diubah; tidak ada SDK/env/endpoint Base44 (semua `fetch` ke `/api/ops/*`).
- **Dashboard admin website** (`/admin`) — punya tema sendiri (`#admin-root`), **jangan diubah**
  kalau tidak diminta.

Prioritas user: dashboard internal **harus mirip/identik** dengan app Base44 (light mode, biru),
dan setiap fitur **harus benar-benar berfungsi** (jangan tombol pajangan, jangan data palsu).

---

## 2. Struktur penting

| Bagian | Lokasi |
|---|---|
| Shell/sidebar/login ops | `src/components/ops/OpsShell.tsx` |
| Footer ops ("© 2026 SAMAQU OFFICE · Engineered by Surya") | `src/components/ops/OpsFooter.tsx` |
| Tema ops (scoped, biar website tidak kena) | `src/app/ops/ops.css` |
| Halaman ops | `src/app/ops/**` (leads, follow-up, master-produk, leads/laporan, rekap-pembelian) |
| API ops | `src/app/api/ops/**` (leads, followups, products, product-variants, stock-in, transactions) |
| Auth ops | `src/lib/ops-auth.ts` (Supabase session + tabel `admins`, hasil di-cache 5 menit) |
| Aturan bisnis follow-up (WIB, status, outcome) | `src/lib/ops-followup.ts` |
| Shim data-layer ala Base44 (`base44.entities.X.list()`) | `src/lib/ops-api.ts` — ini **API kita sendiri**, bukan Base44 |
| Resolusi **stok bersama ala series** (`base_product_id`) | `src/lib/ops-stock.ts` (`resolveStock`) — dipakai bersama oleh `/api/ops/products`, `/api/ops/product-variants`, `/api/ops/dashboard` |
| Logo resmi | `public/logo.svg` (wordmark, rasio 2560×853) |

### Tabel database utama

- `leads` — data lead + kolom follow-up: `pic`, `produk`, `last_contact_at`, `next_followup_at`,
  `followup_status` (`baru`/`dijadwalkan`/`selesai`/`lost`/`dnd`), `outcome`, `note_followup`,
  `lost_reason`, `do_not_contact`.
- `lead_activities` — timeline follow-up; unik `(lead_id, request_id)` untuk anti duplikat.
- `products`, `product_variants` (stok per warna × ukuran; `base_product_id` = baris menumpang
  stok produk basis), `jenis_kain` (master jenis kain; relasi `products.jenis_kain_id` — kolom lama
  `products.kain` sudah tidak dipakai), `stock_in` (barang masuk),
  `orders` + `order_items` (penjualan website, status order bahasa Indonesia: `selesai`,
  `dibatalkan`, `diproses`, `pending`), `admins` (wajib: `user_id`, `email`, `role`).

---

## 3. Aturan yang sudah ditetapkan user (jangan dilanggar tanpa diminta)

1. **Bahasa & gaya**: UI berbahasa Indonesia, gaya dashboard biru/ungu (Base44-like). Tab aktif
   **solid** (bukan gradient) di halaman Produk & Follow-up.
2. **Timezone**: perhitungan "hari ini"/"terlambat" pakai **WIB di server**, bukan timezone browser.
3. **Follow-up Center**: jangan pernah menulis "pesan terkirim" (belum ada integrasi WA resmi),
   jangan auto-complete tugas hanya karena WhatsApp dibuka, jangan auto-buat order.
4. **Angka harus dari data asli**. Kalau data kosong (mis. `stock_in` masih 0 baris), tampilkan 0
   apa adanya — jangan diisi contoh.
5. **Jangan update data massal tanpa izin** (mis. 474 lead lama sengaja belum dijadwalkan).
6. **/ops light mode only**, dan tema website tidak boleh ketularan.

---

## 4. Jebakan teknis yang sudah pernah kejadian (baca sebelum ngoding)

1. **Halaman /ops memakai `initialData: []` + React Query.**
   QueryClient di `OpsShell.tsx` **wajib** tetap memasang `initialDataUpdatedAt: 0`.
   Kalau tidak, array kosong dianggap data segar (`staleTime`), query tidak jalan, dan **semua
   tabel tampil kosong** (ini pernah kejadian dan bikin panik).
2. **PowerShell 5.1 membaca `.ps1` sebagai Windows-1252.** Jangan tulis karakter non-ASCII
   (em dash, `·`, `–`) di dalam skrip `.ps1` — bikin parse error. Kalau perlu kirim teks non-ASCII,
   tulis blok-nya lewat file UTF-8 terpisah lalu dibaca `[IO.File]::ReadAllText(..., UTF8)`.
3. **Edit file besar (`src/app/ops/master-produk/page.jsx`, ±1.800 baris) hati-hati.**
   Pola yang aman: cari anchor unik → hitung batas blok → ganti lewat skrip → **verifikasi** hasilnya.
   Pernah satu kali anchor `) : (` salah tangkap dan menghapus blok besar — pemulihannya:
   `git checkout -- <file>` (working tree bersih = aman, karena semua perubahan sudah di-commit).
   Setelah edit besar: jalankan `git diff --stat` dan cek nama-nama komponen penting masih ada.
4. **Build bisa lama / timeout.** Jalankan `npx tsc --noEmit && npm run build` sebagai background
   task (tool `shell_command` dengan `run_in_background: true`), lalu tunggu hasilnya — jangan
   tunggu di foreground dengan timeout pendek.
5. **Deploy Vercel**: cek statusnya via REST API (lihat `.agent-secrets.local.md`). Kadang
   `git_info_fail` → cukup redeploy.
6. **Region**: function Vercel dipatok `bom1` (`vercel.json` + setting project) supaya dekat dengan
   database Supabase (`ap-south-1`/Mumbai). Sebelum ini function di `iad1` (Washington) dan tiap
   request API 1,4–2,7 detik. **Jangan ubah region tanpa mengukur latency** (script pola pengukuran
   ada di riwayat kerja: ukur `npx`/Invoke-RestMethod ke `/api/ops/*` 3x, ambil rata-rata).
7. **Menguji API /ops**: butuh token admin Supabase (dibuat sementara, lalu dihapus) — caranya ada di
   `.agent-secrets.local.md`. Setelah uji, **pulihkan data produksi** dan laporkan kondisi akhir.
8. **"Stok bersama ala series" — pakai satu resolver, jangan hitung stok mentah sendiri.**
   Baris `product_variants` yang punya `base_product_id` **tidak memegang stok**; angkanya hidup di
   produk basisnya (40 dari 61 produk di DB adalah seri turunan). Resolusinya di
   `src/lib/ops-stock.ts` (`resolveStock`). Kalau pakai `sumStock(v.stock)` mentah, seri turunan
   terbaca 0 → dulu Laporan Stok bilang "41 varian habis" padahal 40 cuma menumpang stok basis.
   Keterangan di UI memakai **nama series** ("Bayati mengikuti Jiharkah"), sama seperti panel admin
   — **bukan** nama produk, karena satu nama produk dipakai banyak series.
9. **Barang Masuk: stok dinaikkan di SERVER, jangan tulis ulang dari klien.**
   `POST /api/ops/stock-in` sudah menaikkan `product_variants.stock` lewat RPC
   `samaqu_increment_stock` (termasuk resolve ke produk basis); form hanya membuat baris `stock_in`.
   Dulu form ikut menulis lewat `base44.entities.ProductVariant.update` yang **tidak ada** di shim,
   jadi simpan *selalu* gagal dengan pesan palsu `"ProductVariant.update is not a function"`
   padahal stoknya sudah tersimpan. Juga: HPP weighted-average wajib dibulatkan (`Math.round`)
   karena `products.hpp` bertipe **integer** (pecahan ditolak: `invalid input syntax for type integer`).
10. **`pending` = belum bayar, BUKAN penjualan.** Stok **tetap dipotong** saat order dibuat
   (checkout website `SMQ-` maupun Open Order `CYO-` → RPC `samaqu_decrement_stock` +
   `orders.stock_reserved = true`; dilepas lagi oleh `/api/cron/auto-cancel` setelah 24 jam —
   ini sengaja, untuk cegah oversell). Tapi angka penjualan hanya dari `diproses`/`selesai`:
   lihat `PAID_ORDER_STATUS` di `src/app/api/ops/dashboard/route.ts`. Di `/api/ops/transactions`
   status barisnya `return` (batal) / `pending` (belum bayar) / `completed` (lunas).
   Catatan: pengembalian stok saat batal ditentukan kolom `orders.stock_reserved`, **bukan**
   awalan nomor pesanan (`src/lib/cancel-order.ts`).

---

## 5. Kondisi data yang perlu diketahui (kalau bikin fitur baru)

- `stock_in` **masih 0 baris** → semua KPI "Barang Masuk" bernilai 0 (bukan bug). Form Barang
  Masuk **sudah berfungsi** (stok naik lewat RPC di server — lihat jebakan #9); kalau diuji, hapus
  lagi baris `stock_in`-nya dan kembalikan stok.
- `products.hpp` masih **0** di semua produk (HPP belum diisi) → margin/nilai stok ikut 0.
- `products.kain` (kolom LAMA) **kosong di semua produk** — jangan dipakai. Sumber jenis kain
  sekarang relasi `products.jenis_kain_id` → tabel `jenis_kain` (5 baris: `B-01`, `B-02`, `A-02`,
  `C.01`, `B02`), terisi di **61/61** produk; di ops tampil sebagai kolom "Jenis Kain".
  `products.series` terisi di **60 dari 61** produk (kecuali `Kandora Superblack`) → kalau kosong
  tampilkan "Belum diatur", jangan dikarang.
- **474 lead lama** belum punya `next_followup_at` → mereka ada di antrean "Perlu Dijadwalkan".
  User belum memutuskan mau jadwalkan massal atau tidak.
- Tab **Barang Keluar** mengambil **semua** baris order supaya sama dengan tabel di bawahnya;
  baris batal diberi badge "Batal", belum bayar diberi badge "Belum bayar". Angka card-nya ikut
  menghitung keduanya (stok memang berkurang), sedangkan **angka penjualan** (omset/HPP/laba/
  terlaris di dashboard, Produk Terlaris, riwayat penjualan detail produk) **hanya dari yang lunas**.
  User belum memutuskan apakah batal/belum bayar mau dikeluarkan juga dari card Barang Keluar.
- **Sisa 1 URL gambar lama** Base44 di `src/components/akun/RincianPesanan.tsx` (bukan koneksi data).

---

## 6. Alur kerja yang biasa dipakai di repo ini

1. Edit kode → `npx tsc --noEmit` (0 error) → `npm run build` (background, tunggu exit 0).
2. `git add -A` → commit (pesan bahasa Indonesia, akhiri trailer
   `Co-authored-by: CommandCodeBot <noreply@commandcode.ai>`) → `git push origin HEAD`.
3. Tunggu deploy READY (poll REST API) → **verifikasi di bundle produksi** (fetch chunk JS lalu
   cari string/kelas baru) atau lewat API untuk data.
4. Kalau mengubah data saat uji: pulihkan, lalu laporkan kondisi akhir data.

---

## 7. Yang belum dikerjakan (kandidat lanjutan)

- Modul ops yang masih "SOON": Dashboard, Transaksi, Return, Pengeluaran, Target Profit, Laporan.
- Template pesan WhatsApp + tombol "Salin Pesan" (butuh tabel `wa_templates`).
- Upload/assign PIC dari UI di halaman Leads (API `set_pic` sudah ada).
- Isi `products.hpp` (butuh data) dan `stock_in` (butuh input barang masuk dari produksi).
- Keputusan user yang masih menggantung: penjadwalan 474 lead lama, apakah batal/belum bayar
  dikeluarkan dari card Barang Keluar, dan apakah card tab Daftar Produk/Barang Masuk/Keluar mau
  diseragamkan jadi putih semua.
- **Buang shim `base44`** di `/ops` (ganti nama `base44` → mis. `opsApi`, atau panggil `/api/ops/*`
  langsung dari 11 berkas pemakai) — user minta ditunda. Konsep/klarifikasi Base44 ada di bagian 1.
- **Kebijakan belum bayar**: sekarang stok dipotong saat order dibuat. Kalau user mau stok baru
  dipotong saat dibayar, pindahkan `samaqu_decrement_stock` dari `/api/orders` + `/api/open-order`
  ke saat status jadi `diproses`, lalu sesuaikan `PAID_ORDER_STATUS`.

---

## 8. Sistem Reseller — Tahap 1 & 2 (2026-10-30)

Fitur baru di folder sendiri: logic `src/lib/reseller/`, API `src/app/api/reseller/**`,
admin `src/app/api/ops/reseller/**`. Tahap 1 = database (migration
`20261030_reseller.sql`), tahap 2 = API server (migration `20261030_reseller_tahap2.sql`).
Keduanya **sudah dijalankan ke produksi** dan lolos smoke test SQL (rollback, 0 data uji).
UI belum ada (tahap 3).

### 8.1 Aturan bisnis (final)

- Reseller dibuat admin (tidak ada pendaftaran publik). Login pakai **OTP WhatsApp**; OTP hanya
  dikirim kalau nomor terdaftar sebagai reseller `active`. Sesi = token acak 30 hari, yang
  disimpan hanya hash-nya (`reseller_sessions`).
- Harga beli = katalog × (1 − `products.reseller_discount_percent`/100), dibulatkan.
  Batas harga jual = max(`minimum_price`, harga beli). Diskon NULL = produk tidak dijual reseller.
- `order_items.price` untuk pesanan reseller DIISI harga beli; `reseller_buy_price` &
  `reseller_sell_price` ikut disimpan. Omset/laba/terlaris lama otomatis benar.
- Saldo tidak pernah disimpan sebagai kolom — selalu SUM `reseller_ledger` (append-only).
  Debit/refund/top up/penarikan hanya lewat RPC tahap 1 (`samaqu_reseller_*`) + `samaqu_reseller_adjust`
  (koreksi admin, wajib catatan).
- Pesanan reseller = **dropship**: notif otomatis (dibuat/lunas/dikirim/diterima/dibatalkan)
  dikirim ke RESELLER, bukan customer akhir. Pengingat ulasan & pembayaran tidak untuk pesanan
  reseller. Klaim kirim sekali: tabel `reseller_notifications` UNIQUE (type, reference).
- Saldo cukup → pesanan `diproses` + lunas (`payment_status=paid`, `paid_at`). Saldo kurang →
  potong semua saldo, sisa dicatat di `reseller_order_payments` + `orders.reseller_shortfall_status
  = pending`, status `pending` sampai admin konfirmasi. Tolak bukti → pesanan dibatalkan lewat
  `cancelOrderCompletely` (stok & saldo kembali).
- Pembatalan reseller (manual/auto-cancel 24 jam/kekurangan ditolak) mengembalikan saldo lewat
  `samaqu_reseller_refund_order` (sekali per pesanan) — dipanggil di `cancelOrderCompletely`
  hanya untuk pesanan ber-`reseller_id`.
- Auto-cancel cron kini also menyasar `RSL-%` (pesanan reseller pending = kekurangan belum dibayar).

### 8.2 Endpoint

Reseller (Bearer token sesi reseller; `status=active`):

| Endpoint | Guna |
|---|---|
| `POST /api/reseller/auth/request-otp` | minta OTP (rate limit 10/jam per IP, respons generik) |
| `POST /api/reseller/auth/verify-otp` | verifikasi OTP → token sesi |
| `POST /api/reseller/auth/logout` | hapus sesi |
| `GET /api/reseller/me` | profil + saldo + pengaturan (BSI, biaya admin) |
| `PATCH /api/reseller/me` | ubah rekening bank |
| `GET /api/reseller/katalog` | produk reseller + varian + stok efektif + harga beli/batas jual |
| `GET /api/reseller/ledger` | mutasi saldo sendiri (`jenis`, `bulan`, paginasi) |
| `GET/POST /api/reseller/topups` | daftar/ajukan top up (`amount`, `proof_url`) |
| `GET/POST /api/reseller/withdrawals` | daftar/ajukan penarikan (rekening dari profil) |
| `POST /api/reseller/ongkir` | cek tarif J&T (`city`, `district`, `weight` gram) |
| `GET/POST /api/reseller/orders` | daftar (paginasi) / buat pesanan |
| `GET /api/reseller/orders/[orderNumber]` | detail pesanan + tracking |
| `POST /api/reseller/orders/[orderNumber]/payment-proof` | upload bukti kekurangan |

Admin ops (`isOpsAdmin`): `GET/POST /api/ops/reseller/resellers`,
`PATCH /api/ops/reseller/resellers/[id]`, `GET /api/ops/reseller/queue` (antrean pending),
`PATCH /api/ops/reseller/topups/[id]`, `PATCH /api/ops/reseller/order-payments/[id]`,
`PATCH /api/ops/reseller/withdrawals/[id]`, `GET/POST /api/ops/reseller/ledger`,
`GET/PATCH /api/ops/reseller/settings`.

### 8.3 Jebakan

- **Atomisitas pesanan reseller** = RPC `samaqu_reseller_create_order` (satu transaksi:
  stok → validasi subtotal → debit saldo → order + item + kekurangan). Jangan pernah memecah
  langkahnya ke beberapa request; kalau RPC gagal, semua sudah otomatis rollback.
- RPC menolak kalau subtotal kiriman server ≠ hitungannya sendiri, dan menolak pesanan kalau stok
  toko di tengah jalan tidak cukup — saldo ikut batal (bukan hanya stok).
- Refund saldo HANYA sekali per pesanan (UNIQUE type+reference di ledger). Refund dipanggil
  SETELAH status pesanan tersimpan — kalau pembatalan gagal, saldo tidak boleh sudah kembali.
- `reseller_ledger` append-only (trigger); koreksi harus lewat `adjustment` baru, bukan edit baris.
- Klaim notif reseller beda dari klaim notif order lama: `cancelled_notified_at` tetap dipakai
  untuk notif admin; reseller memakai `reseller_notifications`.
- Reseller login tidak memakai Supabase Auth. Jangan menambahkan komponen yang mengharapkan
  `supabase.auth.getUser()` untuk reseller — pakai guard `resellerSession()`.
- `resellers.whatsapp` disimpan ternormalisasi (62…); lookup login menormalkan input dulu.

### 8.4 Portal reseller (tahap 3 — UI, 2026-10-30)

Route `/reseller/**` (tanpa locale; middleware mengecualikan `reseller`). Tema monokrom
sendiri di `src/app/reseller/reseller.css` (scoped `.rs-root`, font Inter, aksen hijau/kuning/merah).
Token sesi disimpan di `localStorage: samaqu:reseller-token`; SATU pemanggil API:
`src/lib/reseller/client.ts` (`resellerApi.*`). Format & label status: `src/lib/reseller/format.ts`
(rupiah/tanggal memakai `src/lib/akun-format.ts`).

Halaman (`src/app/reseller/`): `login` (OTP + hitung mundur), dashboard (`page.tsx`),
`pesanan` + `pesanan/baru` + `pesanan/[orderNumber]`, `saldo` (tab jenis + bulan + muat lebih),
`top-up`, `tarik-saldo` (biaya admin dari pengaturan; konfirmasi teks tetap), `katalog`, `profil`.
Komponen di `src/components/reseller/` (shell, panel per halaman, `order/*` untuk Buat Pesanan,
`UploadBukti` scope Cloudinary "reseller").

Endpoint kecil yang ditambahkan untuk UI: `POST /api/reseller/alamat-tebak` (deteksi alamat yang
sama dengan admin, ber-guard reseller + rate limit) dan `GET /api/reseller/stats` (statistik bulan
ini + top up pending). `POST /api/reseller/ongkir` sekarang menerima `items` dan menghitung berat
SERVER (fungsi `sumWeightGramsBySize` yang sama dengan pembuatan pesanan) supaya opsi J&T yang
dipilih cocok saat diverifikasi ulang.

Di luar folder reseller (sengaja, minimal): `middleware.ts` (kecualikan `reseller` dari redirect
locale), `api/cloudinary/sign/route.ts` + `lib/cloudinary.ts` (scope `reseller`, folder `reseller`,
wajib sesi reseller), `types/lucide-react.d.ts` (daftar ikon baru portal).

Jebakan UI: jangan pakai inline `gridTemplateColumns` untuk halaman 2 kolom — pakai class
`.form-grid` supaya mobile jatuh ke satu kolom; bar ringkasan mobile `.review-sticky` disembunyikan
di desktop lewat CSS.

### 8.5 Sisi admin reseller + integrasi (tahap 4 — 30 Oktober 2026)

Halaman admin: `src/app/ops/reseller/page.tsx` (variant "ops") + pembungkus tipis
`src/app/panel-admin/(panel)/reseller/page.tsx` (variant "panel", pola yang sama dengan Transaksi).
Isi di `src/components/reseller/admin/`: `ResellerAdminPage` (kartu atas + 4 tab),
`QueueTab` (antrean top up/bayar kekurangan/penarikan + modal konfirmasi wajib menyebut
reseller & jumlah), `ResellersTab` + `ResellerFormModal` (tambah/ubah/aktif-nonaktif),
`ResellerDrawer` (profil+saldo+mutasi+pesanan), `LedgerTab` + koreksi saldo (catatan wajib),
`SettingsTab` (biaya admin non-BSI + BSI). Pemanggil API admin: `admin/api.ts` (satu file).

Endpoint admin baru (additif): `GET /api/ops/reseller/stats` (kartu + badge) dan
`GET /api/ops/reseller/resellers/[id]` (drawer). PATCH di route yang sama tidak berubah.

Menu: `OpsShell` (Penjualan → Reseller, badge merah antrean) dan `PanelShell`
(Operasional → Reseller, badge via `src/lib/use-reseller-queue.ts`). Dashboard ops punya kartu
"Reseller perlu dicek" → `/ops/reseller?tab=perlu-dicek`.

Integrasi Transaksi: sumber `reseller` di `src/lib/transaksi.ts` (`RSL-` → Reseller) +
`SOURCE_STYLES`; API `/api/ops/transaksi` ikut mengirim `reseller_store_name` dkk. dan
`reseller_sell_price` per item; baris RSL- dapat badge nama toko; drawer detail merender
`ResellerOrderBlock` HANYA kalau `order.reseller_id` terisi.

Label (`/admin/label/[orderNumber]`, re-export dipakai `/panel-admin/label`): kalau
`show_reseller_name_on_label` true DAN API `/api/ops/orders?order_number=` mengirim `reseller`,
blok pengirim diganti nama toko + WA reseller (resi tetap SAMAQU). Tanpa toggle → tampilan lama persis.

Form produk (% diskon reseller + harga minimum semua produk): komponen
`src/components/reseller/admin/ProductResellerFields.tsx` disisip di `ProductForm.tsx` (mode
katalog saja, BUKAN menu Open Order). Menyimpan `reseller_discount_percent` (NULL = tidak dijual)
lewat `priceFieldsFor`; harga minimum non-CYP kini ikut tersimpan. Peringatan kuning bila
`minimum_price < harga beli reseller` — hanya peringatan, tetap bisa simpan.

Jebakan: halaman admin ini belum diverifikasi visual dengan sesi admin (tidak boleh membuat akun
uji di produksi) — yang terverifikasi: tsc bersih + semua route compile 200 di dev server.
Uji manual klik ada di catatan vault [[Sistem Reseller]].

### 8.6 Routing reseller per host (perbaikan 30 Oktober 2026)

**Bug yang pernah terjadi:** menu "Reseller" di office.samaqu.id membuka portal reseller
(`/reseller/login`), bukan halaman admin. Penyebab: `middleware.ts` mengecualikan `reseller`
di MATCHER — sehingga cabang rewrite per host (office → `/ops/...`, admin → `/panel-admin/...`)
tidak pernah berjalan dan request jatuh ke route portal apa adanya.

**Aturan sekarang (satu tempat: `src/middleware.ts`):**
- Portal `/reseller/**` HANYA di domain website (www/samaqu.id). Bypass locale ada di
  `handleRequest` tepat sebelum `intlMiddleware` (bukan lagi lewat matcher).
- office.samaqu.id `/reseller` → rewrite `/ops/reseller` (halaman ADMIN reseller).
- admin.samaqu.id `/reseller` → rewrite `/panel-admin/reseller`.
- `/reseller` ditambahkan ke `SKIP_PREFIXES` pelacak trafik (`web-visit-tracker.ts`) supaya
  kunjungan portal tidak dihitung sebagai trafik toko (perilaku lama saat masih di matcher).
- JANGAN menambahkan `reseller` kembali ke matcher exclusion — itu yang mematikan rewrite host.

**Parity ops ↔ panel admin:** halaman reseller admin satu komponen (`ResellerAdminPage`) tanpa
gating `variant`; guard API sama (`isOpsAdmin`, tabel `admins`). Sudah dicek: tab, tombol
Tambah Reseller, dan modal terbuka normal (render tanpa sesi admin; API 401 seperti seharusnya).

### 8.7 Link portal di template WA reseller (30 Oktober 2026)

Semua template WA reseller (`src/lib/reseller/notify.ts`) sekarang menyertakan tautan polos di
baris sendiri (bisa diklik di WhatsApp): akun dibuat → `/reseller/login` (tepat setelah kalimat
"akun sudah aktif", pengantar "Masuk ke portal reseller di sini:"), top up approved/rejected →
`/reseller/top-up`, penarikan paid/rejected → `/reseller/tarik-saldo`, pesanan dibuat/lunas
(kekurangan dikonfirmasi)/dikirim/diterima/dibatalkan/kekurangan ditolak →
`/reseller/pesanan/<nomor>`. URL dibuat oleh SATU helper `portalUrl()` di file itu memakai
`SITE_URL` (`src/lib/site-config.ts` — domain website, bukan office). Template customer/admin
(`src/lib/fonnte.ts`), pemicu, dan klaim sekali-kirim tidak berubah.

### 8.8 Input rupiah + QRIS portal reseller (30 Oktober 2026)

**RupiahInput** (`src/components/reseller/RupiahInput.tsx`) = SATU komponen input uang untuk portal
& admin reseller. Tampilan "Rp 50.000", nilai ke pemanggil selalu angka bulat, hanya angka yang
bisa diketik (`inputMode=numeric`), kursor dipulihkan berdasarkan jumlah digit di kiri kursor
(tidak loncat saat mengetik/menghapus titik). Dipasang di: jumlah top up (+ chip cepat
100rb/250rb/500rb/1jt), jumlah tarik saldo (max = saldo), harga jual Buat Pesanan, koreksi saldo,
dan biaya admin di Pengaturan.

**QRIS:** `payment_methods.qr_image_url` milik customer TIDAK dipakai — di produksi tidak ada baris
QRIS aktif. Portal reseller memakai pengaturan sendiri `store_settings.reseller_qris_image_url`
(migration `20261030_reseller_qris.sql`, aditif, sudah dijalankan) yang diunggah dari tab
**Pengaturan** admin (upload Cloudinary scope "reseller" — scope itu sekarang menerima sesi
reseller ATAU admin ops; ganti/hapus tersedia; kalau kosong, tab QRIS disembunyikan di portal).

- Komponen pilihan bersama `src/components/reseller/PaymentMethodTabs.tsx` ("Transfer BSI" /
  "QRIS", gambar bisa diperbesar & diunduh) dipakai di Top Up, kotak kekurangan (ringkasan Buat
  Pesanan), panel sukses, dan detail pesanan.
- Metode yang dipilih dicatat di `reseller_topups.payment_method` dan
  `reseller_order_payments.payment_method` (default 'bsi'); tampil sebagai badge di antrean
  "Perlu Dicek". Alur tetap: upload bukti → admin konfirmasi.

Jebakan: jangan menaruh `RupiahInput` di dalam komponen yang memformat ulang angkanya sendiri —
format dilakukan DI DALAM komponen; state pemanggil harus angka (bukan string bertitik).

### 8.9 Pengaturan harga reseller pindah ke tab "Produk & Harga" (30 Oktober 2026)

**Alasan:** pengaturan diskon lewat form Edit Produk terlalu rumit dan katalog portal tetap kosong
walau diskon diisi. Semua pengaturan harga reseller sekarang di satu tab admin.

- **Migration `20261030_reseller_series_pricing.sql`** (aditif, sudah dijalankan): `products.reseller_enabled`
  (bool default false), `products.reseller_min_sell_price` (integer nullable), `store_settings.reseller_default_discount_percent`
  (default 25). Backfill SEKALI: produk dengan `reseller_discount_percent` terisi → `reseller_enabled = true`
  (produksi: 6 dari 111). Backfill dibungkus cek kolom supaya re-run tidak menyalakan lagi series yang
  sengaja dimatikan. `products.minimum_price` TIDAK disentuh.
- **Aturan harga satu sumber** (`src/lib/reseller/pricing.ts`): diskon efektif = khusus series
  (`reseller_discount_percent`) ?? default; harga beli = katalog × (1 − diskon efektif);
  `resellerMinSellPrice` = max(`reseller_min_sell_price`, harga beli) — **`products.minimum_price`
  milik CYP TIDAK dipakai lagi** untuk reseller. Katalog portal & pembuatan pesanan memfilter
  `reseller_enabled = true` (bukan lagi `reseller_discount_percent` terisi).
- **Tab admin "Produk & Harga"** (ops + panel, satu halaman): `DefaultDiscountCard`, `PriceTable`,
  `ProductGroupRow`, `SeriesRow`, `BulkBar` di `src/components/reseller/admin/`; orkestrator `PriceTab`.
  API: `GET/PATCH /api/ops/reseller/catalog` (per baris & massal; hanya kolom reseller yang ditulis).
  Diskon khusus hanya bisa diatur lewat aksi massal ("Set diskon…"/"Pakai default"); toggle & harga
  minimum jual disimpan per baris (tombol Simpan muncul saat berubah). Label "Baru" = series
  dibuat ≤ 7 hari dan belum aktif.
- **Form produk** kembali seperti SEBELUM tahap 4: `ProductResellerFields` dihapus dari
  `ProductForm.tsx` (diff terhadap commit `31aab550` = kosong) dan file komponennya dihapus.
  Catatan §8.5 bagian "Form produk" sudah tidak berlaku.
- **Cache:** `/api/reseller/katalog` `force-dynamic`, klien portal `cache: "no-store"` — perubahan
  harga langsung terlihat saat reseller membuka katalog/Buat Pesanan.

### 8.10 Status penarikan/top up di riwayat saldo (30 Oktober 2026)

**Bug:** baris penarikan di Riwayat Saldo selalu "Saldo ditahan — penarikan diajukan" walau admin
sudah menekan "Sudah ditransfer". Penyebab: `/api/reseller/ledger` hanya membaca `reseller_ledger`
(baris hold tidak pernah berubah), sedangkan status hidup di `reseller_withdrawals` dan (sesuai
aturan uang) "Sudah ditransfer" TIDAK menulis mutasi baru.

**Perbaikan (tampilan/data saja, tanpa mutasi baru):** API ledger reseller kini menggabungkan
baris `withdrawal_*` dengan `reseller_withdrawals` (status, bank + 4 digit, biaya, diterima,
paid_at, alasan) dan baris `topup` dengan `reseller_topups` (status, reviewed_at). Satu helper
`describeLedgerRow` / `topupDisplay` / `withdrawalDisplay` di `src/lib/reseller/format.ts` dipakai
ListPanels (Dashboard + Riwayat Saldo), TopUpPanel, dan TarikSaldoPanel; label status seragam
Menunggu / Dikonfirmasi / Ditransfer / Ditolak (muted "Dikembalikan" untuk baris release).
"Ditahan untuk penarikan" di dashboard tetap dari RPC `samaqu_reseller_saldo` yang menghitung
HANYA penarikan `status = 'pending'` (diverifikasi di SQL — tidak ada perubahan).
Template WA "penarikan ditransfer" menyamarkan rekening jadi "{bank} ••••{4 digit}".

### 8.11 Tab Produk & Harga: foto, semua produk, tabel rapi (30 Oktober 2026)

- **Foto grup rusak:** sebelumnya thumbnail memakai `products.image` mentah (sering kosong/video/URL
  mati) sehingga yang tampil teks alt. Sekarang query di `src/lib/reseller/admin-catalog.ts`
  memakai rantai foto bersama — `product_images` (display_order, lewati video) → `products.images`
  → `products.image` lewat `loadOrderPhotoLookup` + `isVideoUrl`; komponen `ProductThumb` menampilkan
  kotak abu + ikon saat kosong ATAU gagal dimuat (`onError`), `alt=""` (tanpa teks alt).
- **Semua produk masuk:** daftar admin memakai `listAdminCatalog()` di src/lib/reseller (bukan di
  komponen), query TANPA filter visibilitas (katalog website, Open Order, add-on, tersembunyi,
  series turunan semua ikut). API mengirim `is_published` + `open_order_enabled`; UI punya filter
  "Tampil di" (Semua/Katalog website/Open Order/Tersembunyi) dan label visibilitas kecil di tiap
  baris. Aturan tampil katalog website & Open Order tidak diubah.
- **Tabel dirombak:** sel vertical-align middle, baris series ±48px, input min jual compact 140px
  (`RupiahInput compact`, placeholder "Belum diatur"), kolom [checkbox · Series · Harga katalog
  (kanan) · Diskon · Harga beli (kanan) · Min jual · Toggle (tengah) · status], header sticky,
  tanpa scroll horizontal di 1280/panel. Kolom "—" diganti ikon status simpan.
- **Simpan otomatis:** toggle langsung menyimpan; harga minimum tersimpan saat blur/Enter; ikon
  spinner → centang hijau (fade 2 dtk) / tanda gagal + toast. Aksi massal tetap seperti sebelumnya.

### 8.12 Alur top up 3 langkah + halaman bayar bersama (30 Oktober 2026)

**Migration `20261030_reseller_topup_flow.sql` (aditif, sudah dijalankan):**
`reseller_topups.status` kini boleh `menunggu_bayar` | `pending` | `approved` | `rejected` |
`kedaluwarsa` | `dibatalkan` (+ `pay_deadline timestamptz` + index parsial). Bukti boleh kosong
saat `menunggu_bayar`. **Hanya `pending` (bukti sudah diupload) yang masuk antrean admin dan
dihitung "top up belum dikonfirmasi"** — status baru otomatis dikecualikan karena query lama
memfilter `status = 'pending'`. Tidak ada mutasi saldo/ledger untuk top up yang tidak jadi.

**Logic** `src/lib/reseller/topups.ts`: `TOPUP_PAY_WINDOW_MINUTES=60`, `topupDeadlineIso`,
`isPastDeadline`, `expireOverdueTopups(resellerId)` (dipanggil saat list & detail dibaca —
kedaluwarsa tanpa cron baru, tanpa mutasi saldo).

**Alur top up:** `/reseller/top-up` (langkah 1: nominal hero RupiahInput + chip cepat + kartu
metode QRIS/BSI + "Lanjut bayar") → `POST /api/reseller/topups` (tanpa bukti) membuat
`menunggu_bayar` → `/reseller/top-up/[kode]` (bar kuning "Bayar sebelum" + hitung mundur dari
`pay_deadline` server, total + salin, QRIS/BSI + ganti metode, langkah 1-2-3, upload bukti,
"Saya sudah bayar" → `PATCH submit_proof` → `pending`, "Batalkan top up" → `dibatalkan`,
kedaluwarsa → pesan + "Top up lagi", terkirim/dikonfirmasi/ditolak dalam satu halaman).

**Bayar kekurangan pesanan:** `OrderForm` mengarahkan ke `/reseller/pesanan/[nomor]/bayar` saat
saldo kurang. Detail pesanan mengirim `shortfall {amount,status,proof_url,payment_method,deadline}`
(deadline = created_at + 24 jam — SAMA dengan jendela auto-cancel; cron tidak diubah). Upload bukti
ditolak 410 setelah lewat batas. Detail pesanan yang menunggu punya tombol "Bayar sekarang".

**UI:** satu komponen `components/reseller/payment/PaymentPage.tsx` dipakai top up & kekurangan
(termasuk `useCountdown` yang dihitung dari deadline server + digate `mounted` supaya tidak
hydration mismatch). Komponen `PaymentMethodTabs` lama DIHAPUS (QRIS/rekening tidak lagi tampil di
langkah 1/ringkasan); tipe `PaymentMethodChoice` pindah ke `payment/types.ts`.

### 8.13 BSI selalu gratis — bank pakai KODE + dropdown (30 Oktober 2026)

**Deteksi lama:** `isBsiBank` mencocokkan TEKS nama bank (lowercase, buang non-huruf, lalu
`includes("bsi") || includes("banksyariahindonesia")`). Masalahnya: input nama bank bebas, dan
bank lama yang sudah merger ke BSI ("Mandiri Syariah" / "BNI Syariah" / "BRI Syariah") TIDAK
terdeteksi → penarikan ke BSI lama tetap kena biaya Rp2.500.

**Sekarang:** `src/lib/reseller/banks.ts` = satu sumber daftar bank + deteksi:
- Nilai `resellers.bank_name` disimpan sebagai KODE ("BSI", "BCA", "Mandiri", …); opsi "Lainnya"
  menyimpan teks bebas. `isBsiBank()` = kode "BSI" (plus pola teks lama untuk data lama).
- Input nama bank di **Profil → Rekening** (portal) dan **form Tambah/Ubah Reseller admin** kini
  dropdown `BankSelect` (BSI, BCA, BRI, Mandiri, BNI, BTN, CIMB, Permata, Danamon, Muamalat, Jago,
  SeaBank, BJB, Mega, Sinarmas, Panin, OCBC, UOB, BTPN + Lainnya).
- Migration `20261030_reseller_bank_codes.sql` (sudah dijalankan) menormalisasi bank_name lama yang
  mengandung bsi / syariah indonesia / mandiri syariah / bni syariah / bri syariah → "BSI"
  (produksi saat ini 0 baris berubah — belum ada reseller BSI).
- Server tetap menghitung sendiri: `/api/reseller/withdrawals` mengirim `p_is_bsi: isBsiBank(bank_name)`
  ke RPC (biaya dari pengaturan); browser tidak pernah mengirim is_bsi/nominal biaya.
- Tarik Saldo menampilkan rincian eksplisit: "Gratis (sesama BSI)" atau "Rp{biaya} (bank selain BSI)";
  nama bank di riwayat/antrean/drawer tampil sebagai label (kode → label).

### 8.14 Penyederhanaan tab "Produk & Harga" + batas jual = harga beli (30 Oktober 2026)

**Aturan baru:** batas harga jual reseller = **harga beli reseller** (modal), tidak ada lagi kolom
"Min jual reseller". `src/lib/reseller/pricing.ts` → `resellerMinSellPrice()` kini mengembalikan
`resellerBuyPrice()`. Kolom DB `products.reseller_min_sell_price` **tetap ada tapi tidak dipakai**
(tanpa migration); `products.minimum_price` milik CYP juga tetap tidak dipakai reseller.

- **API/katalog:** `min_sell_price` dihapus dari `GET /api/reseller/katalog`, `listAdminCatalog()`,
  `CatalogRow`/`CatalogUpdate` admin, dan `KatalogProduct` klien. `PATCH /api/ops/reseller/catalog`
  hanya menerima `reseller_enabled` + `reseller_discount_percent`.
- **Pesanan:** validasi harga jual di `src/lib/reseller/orders.ts` memakai
  `minSell = resellerMinSellPrice(...)` = harga beli, pesan
  "Harga jual minimal Rp {harga beli} (harga beli kamu)". `OrderForm` & `BarisProduk` portal
  memakai `product.buy_price` yang sama; `PilihProduk` mengisi `sellPrice = buy_price`.
- **Tabel admin 6 kolom:** [checkbox · Series · Harga katalog · Diskon · Harga beli · Dijual].
  Foto produk dihapus (komponen `ProductThumb.tsx` dihapus, `admin-catalog.ts` tidak lagi mengambil
  thumbnail) dan kolom status simpan dihapus — toggle "Dijual" satu-satunya yang menyimpan
  otomatis (`savingId`, `RowSaveState`/timer ikon dihapus dari `PriceTab`). Diskon tetap lewat aksi
  massal; label Baru, filter "Tampil di", dan kartu diskon default tidak berubah.
- **Series kosong:** produk satu-series tanpa nama series menampilkan "Standar" (nama produk sudah
  tampil di baris grup); grup multi-series tanpa nama tetap "—". Baris ±47–53px, sel vertical-align
  middle, header sticky; tabel `min-w-[560px]` di dalam wrapper `max-lg:overflow-x-auto` supaya di
  375px kolom Series tidak runtuh/teks tidak menumpuk; di 1280 tidak ada scroll horizontal.
- **Verifikasi:** `npx tsc --noEmit` EXIT=0; render mock Playwright 1280 & 375 (tanpa akun uji,
  halaman temp dihapus sebelum commit) — 0 console error, tanpa foto/min jual/kolom status, tanpa
  scroll horizontal di 1280. Catatan §8.11 bagian "input min jual" dan "kolom status" tidak berlaku.

### 8.15 Status mutasi reseller di admin — satu helper portal + admin (30 Oktober 2026)

**Bug:** drawer "Detail reseller" (ops & panel admin) dan tab "Mutasi Saldo" membaca `reseller_ledger`
mentah, sehingga penarikan yang sudah ditransfer tetap tampil "Saldo ditahan / penarikan diajukan".
Struktur baris hold tidak pernah berubah (append-only) — status hidup di tabel sumbernya.

**Perbaikan (tampilan + data API saja, tanpa mutasi baru):**
- `describeLedgerRow(row, opts)` di `src/lib/reseller/format.ts` = SATU helper label/badge untuk
  portal & admin. Opsi `fullAccount` (nomor rekening utuh) dan `showActor` ("oleh {admin}") hanya
  dipakai sisi admin; portal tetap tersamar tanpa nama admin.
  - Penarikan menunggu: "Menunggu transfer admin · {waktu ajukan}" + badge kuning "Menunggu".
  - Penarikan ditransfer: "Ditransfer ke {bank} {nomor} · {waktu transfer} · oleh {admin}" +
    "Diterima Rp{bersih} · biaya admin Rp{biaya}" + badge hijau "Ditransfer". Nomor lengkap di
    admin, `••••{4 digit}` di portal.
  - Penarikan ditolak: badge merah "Ditolak" + alasan; baris `withdrawal_release` tetap tampil
    "Penarikan ditolak, saldo dikembalikan".
  - Top up & bayar kekurangan: badge Menunggu / Dikonfirmasi / Ditolak (label topup pending kini
    "Menunggu"); bayar kekurangan ditempelkan ke baris `order_debit` lewat nomor pesanan.
- `src/lib/reseller/ledger-enrich.ts` (baru): `enrichResellerLedger(rows, { revealAccount })`
  menempelkan status terkini dari `reseller_withdrawals`, `reseller_topups`, dan
  `reseller_order_payments` (via `orders.order_number` → `order_id`). Dipakai API portal
  (`/api/reseller/ledger`) dan API admin (`/api/ops/reseller/ledger`,
  `/api/ops/reseller/resellers/[id]`) — hanya SELECT, tidak menulis apa pun.
- Drawer admin: 3 kotak saldo → "Saldo bisa dipakai" (RPC `saldo_tersedia`), "Ditahan (penarikan
  menunggu)" (RPC menghitung HANYA status `pending`), "Total sudah ditarik" (SUM penarikan `paid`,
  field baru `total_withdrawn`). Label "Total" ambigu dihapus. Nomor rekening di drawer & antrean
  penarikan tampil LENGKAP (dibutuhkan admin untuk transfer); penyamaran hanya portal & WA.
- Tab Mutasi Saldo: kolom "Jenis/Catatan" diganti "Mutasi" (judul + badge + deskripsi + baris
  rincian), tetap dengan jumlah dan saldo akhir. Filter jenis/bulan/reseller tidak berubah.

**Verifikasi:** `npx tsc --noEmit` EXIT=0; render mock Playwright 1280 & 375 (drawer + tab, tanpa
akun/data uji; halaman temp dihapus sebelum commit) — status pending/paid/rejected, top up,
kekurangan, nomor lengkap & badge tampil benar, 0 console error. RPC saldo, ledger append-only,
approve/tolak, notifikasi, dan perhitungan saldo TIDAK diubah.

### 8.16 Katalog reseller: produk Open Order/tersembunyi + foto (30 Oktober 2026)

**Bug 1 — produk Open Order tidak muncul.** `src/lib/reseller/katalog.ts` memfilter
`.eq("is_published", true)`, jadi hanya produk "Katalog website" yang lolos. Cek produksi:
7 produk `reseller_enabled = true` → 1 katalog + **6 Open Order**; katalog portal hanya
menampilkan 1. Perbaikan: filter `is_published` DIHAPUS — syarat tampil = `reseller_enabled = true`
saja (Open Order, tersembunyi, add-on ikut). Stok 0 tetap tampil (UI "Stok habis", tombol Pesan
nonaktif). Aturan katalog website & Open Order customer tidak disentuh; `orders.ts` memang tidak
pernah memfilter `is_published` saat validasi pesanan.

**Bug 2 — foto tampil sebagai teks alt "Thobe Broken White".** Katalog memakai `products.image`
mentah; di produksi kolom itu berisi URL **video `.mp4`** → `<img>` gagal dan browser menampilkan
teks alt. Sekarang `getResellerCatalog()` memakai helper bersama `loadOrderPhotoLookup`
(`product_images` menurut `display_order`, lewati video → `products.images` → `products.image`),
satu proses dengan katalog website/order. Komponen baru `src/components/reseller/ProductPhoto.tsx`
menampilkan placeholder netral `NEUTRAL_ITEM_PHOTO` saat URL kosong ATAU `onError`, dengan `alt=""`
(tanpa teks) — dipakai di kartu `KatalogPanel` dan `PilihProduk` (Buat Pesanan). 6 produk
Thobe Black enabled memang belum punya foto → placeholder netral.

**Cache:** `/api/reseller/katalog` sudah `dynamic = "force-dynamic"` dan klien `cache: "no-store"`,
jadi toggle & foto dari admin langsung terlihat saat halaman dibuka ulang.

**Verifikasi:** cek read-only produksi lewat route temp (dihapus sebelum commit): 7/7 enabled masuk
katalog, foto Thobe Broken White kini PNG `02_semua_foto.png`; `tsc` EXIT=0; render mock 1280 & 375
(foto asli, placeholder tanpa alt, stok habis + tombol nonaktif) tanpa error aplikasi.

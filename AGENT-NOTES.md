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

# TEMUAN — Resi JO0330297434 (Order CYO-20261023-511)

Tanggal temuan: 2026-10-31
Sumber data: J&T Tracking API (production, kredensial WITHSAMAQU-DPK01C) + Supabase `orders`, `order_items`, `order_tracking_events`

## 1. Ringkasan

| Field | Nilai |
|---|---|
| Resi (AWB) | **JO0330297434** |
| Nomor pesanan | CYO-20261023-511 |
| Tujuan (order) | MA'HAD SULTHON AL-ISLAMY (MSI) SENTUL-BOGOR, Jl. Raya Sentul, Jl. Bukit Zanbaqah, RT.04/RW.08, Bojong Koneng, Kec. Babakan Madang, Kab. Bogor, Jawa Barat 16810 |
| Kota/Kecamatan (order) | Babakan Madang, Bogor / Babakan Madang |
| Penerima | Fadjrul hakky — +6282246126385 |
| Catatan pengiriman | **"Titip ke ustadz ya kalo saya tidak ada"** |
| Layanan | J&T EZ (1,2 kg) |
| Nilai barang | Rp 333.000 (Thobe Mint — Karim, size M, qty 1) |
| Status J&T | `200` — "Paket telah diterima", 28/10/2026 21:38:54, site PAKANSARI_3 (Cibinong) |
| Status order di sistem | `selesai` / `shipping_status` = `selesai` |

## 2. Masalah

1. J&T menandai resi **delivered** (kode 200) pada 28/10/2026 21:38:54.
2. Penerima (customer) menyatakan **belum menerima paket**.
3. Sistem SAMAQU otomatis mengubah `orders.status` → `selesai` dan mengirim notifikasi "paket diterima" ke customer (`delivered_notified_at` = 2026-10-28 15:00:56 UTC / 22:00 WIB).

## 3. Bukti dari payload J&T (event delivered)

```json
{
  "date_time": "2026-10-28 21:38:54",
  "city_name": "CIBINONG",
  "storeName": "PAKANSARI_3",
  "status":  "Paket telah diterima",
  "status_code": 200,
  "receiver": "Fadjrul hakky",
  "presenter": "FALSE",
  "presentername": "",
  "driverName": "12.12 Muhamad Julfajrin",
  "driverPhone": "",
  "note": ""
}
```

Detail resi:

```json
"delivDriver": {
  "id": "",
  "name": "12.12 Muhamad Julfajrin",
  "phone": "+6283806057149",
  "photo": ""
}
```

Poin penting:

- **`presenter: "FALSE"`** — penanda J&T bahwa paket **tidak diserahkan langsung ke penerima yang namanya tertera** (diserahkan ke pihak lain: sekuriti/resepsionis/ustadz/penitipan). `presentername` kosong, jadi nama pihak yang menerima **tidak tercatat**.
- **`delivDriver.photo` kosong** — tidak ada bukti foto serah terima (POD photo).
- `driverPhone` pada event delivered kosong (padahal ada di event sebelumnya).
- Nama `receiver` = "Fadjrul hakky" hanya nama penerima di waybill, **bukan bukti orang itu yang menandatangani**.

## 4. Kronologi lengkap (semua dari J&T)

| Waktu (WIB) | Kota | Site | Status |
|---|---|---|---|
| 27/10 11:05:10 | DEPOK | — | Manifes (resi terbit) |
| 27/10 21:00:00 | DEPOK | RANGKAPAN_JAYA | Paket diterima di gerai asal |
| 27/10 23:05:18 | DEPOK | RANGKAPAN_JAYA | Berangkat ke DPK_GATEWAY |
| 28/10 00:22:04 | DEPOK | DPK_GATEWAY | Sampai gateway Depok |
| 28/10 01:19:31 | DEPOK | DPK_GATEWAY | Berangkat ke BGR_GATEWAY |
| 28/10 07:12:46 | BOGOR | BGR_GATEWAY | Sampai gateway Bogor |
| 28/10 07:25:40 | BOGOR | BGR_GATEWAY | Berangkat ke PAKANSARI_3 |
| 28/10 09:09:29 | CIBINONG | PAKANSARI_3 | Sampai gerai tujuan |
| 28/10 11:05:47 | CIBINONG | PAKANSARI_3 | **"Akan dikirim ke alamat penerima"** (kurir: 12.12 Muhamad Julfajrin) |
| 28/10 21:38:54 | CIBINONG | PAKANSARI_3 | **"Paket telah diterima" • presenter=FALSE • foto POD kosong** |

Catatan: jarak event "akan dikirim ke alamat penerima" (11:05) ke "diterima" (21:38) = **10 jam 33 menit**. Normalnya delivered dalam beberapa jam setelah keluar kirim.

## 5. Klarifikasi soal "CIBINONG"

"Cibinong" **bukan alamat yang salah** — itu nama kota hub J&T untuk wilayah Kab. Bogor. Mapping internal (`src/lib/jnt/area-data.json`) menetapkan:

```
JAWA BARAT|KAB. BOGOR|BABAKAN MADANG|CIBINONG|CIB|BABAKAN MADANG|CIB037
```

Sehingga create order mengirim `destinationCode = CIB`, `receiverArea = CIB037`. Alamat lengkap yang dikirim ke J&T (`receiverAddress`) sudah benar berisi nama MA'HAD SULTHON Babakan Madang. Jadi tidak ada salah input.

## 6. Kenapa order otomatis "selesai"

`src/lib/jnt/track-status.ts` — fungsi `isDelivered()`:

```ts
export function isDelivered(data: { history?: TrackHistoryItem[] | null } | null | undefined): boolean {
  return !!data?.history?.some((h) => h.status_code === 200);
}
```

Fungsi ini **hanya membaca `status_code === 200`** dan **mengabaikan** `presenter`, `presentername`, dan `delivDriver.photo`. Akibatnya:

- `orders.status` → `selesai`
- `orders.shipping_status` → `selesai`
- notifikasi "paket diterima" terkirim ke customer

## 7. Perbandingan dengan catatan customer

Customer sudah menulis di checkout: **"Titip ke ustadz ya kalo saya tidak ada"**.

Artinya skenario "dititipkan" memang **sudah diantisipasi customer**. Tapi karena `presentername` kosong di data J&T, kita **tidak tahu siapa yang menerima** — bisa ustadz (sesuai permintaan), bisa orang lain. Ini yang perlu diverifikasi ke J&T.

---

# 8. Draf klaim / komplain ke J&T

> **Kepada:** J&T Express — Customer Service / PIC Akun WITHSAMAQU-DPK01C
> **Perihal:** Konfirmasi bukti serah terima (POD) resi JO0330297434 — status delivered, penerima menyatakan belum menerima
>
> Selamat pagi/siang,
>
> Kami dari SAMAQU (akun WITHSAMAQU-DPK01C) ingin mengajukan konfirmasi atas resi berikut:
>
> - **Nomor resi:** JO0330297434
> - **Tanggal kirim:** 27 Oktober 2026
> - **Tujuan:** MA'HAD SULTHON AL-ISLAMY (MSI) SENTUL-BOGOR, Jl. Raya Sentul, Jl. Bukit Zanbaqah, RT.04/RW.08, Bojong Koneng, Kec. Babakan Madang, Kab. Bogor, Jawa Barat 16810
> - **Penerima di waybill:** Fadjrul hakky (+6282246126385)
> - **Status sistem:** Delivered (200) pada **28 Oktober 2026, 21:38:54**, site PAKANSARI_3
>
> Permasalahan: penerima menyatakan **belum menerima paket** hingga saat ini. Pada data tracking resi ini, event delivered tercatat dengan:
> 1. `presenter = FALSE` — paket tidak diserahkan langsung kepada penerima yang namanya tertera di waybill;
> 2. `presentername` **kosong** — nama pihak yang menerima tidak tercatat;
> 3. foto bukti serah terima (`delivDriver.photo`) **kosong**;
> 4. jarak antara status "akan dikirim ke alamat penerima" (11:05) ke "diterima" (21:38) mencapai **10 jam 33 menit**.
>
> Mohon dibantu untuk:
> 1. Mengirimkan **bukti serah terima (POD)**: foto paket saat diserahkan, nama & tanda tangan pihak yang menerima, serta lokasi penyerahan;
> 2. Menjelaskan kepada siapa paket diserahkan oleh kurir **12.12 Muhamad Julfajrin** pada 28/10/2026 pukul 21:38;
> 3. Bila paket diserahkan kepada pihak ketiga (sekuriti/asrama/ustadz), mohon informasikan nama dan posisinya agar dapat kami koordinasikan dengan penerima;
> 4. Bila bukti serah terima tidak dapat ditunjukkan, kami mohon resi ini diproses sebagai **"delivered namun tidak diterima penerima"** dan dibuka klaim sesuai ketentuan yang berlaku.
>
> Adapun penerima telah menuliskan catatan pada pesanan: *"Titip ke ustadz ya kalo saya tidak ada"*, sehingga penyerahan kepada pihak lain dimungkinkan — namun kami tetap membutuhkan nama penerima aktual untuk konfirmasi.
>
> Demikian, terima kasih atas bantuannya.
>
> Hormat kami,
> SAMAQU — Tim Operasional

---

# 9. Rekomendasi tindak lanjut (internal)

1. **Jangan biarkan status `selesai`.** Kembalikan `orders.status` ke `dikirim` sampai ada bukti serah terima, agar tidak dihitung sebagai penjualan final dan tidak memicu review/reminder.
2. **Hubungi customer** (WA +6282246126385) — minta cek ke ustadz/pengurus Ma'had dan sekuriti asrama, karena catatan pengiriman memang meminta "titip ke ustadz".
3. **Kirim klaim ke J&T** (draf di bagian 8) — minta POD foto + nama penerima.
4. **Perbaikan kode (opsional, disarankan):** `track-status.ts` → `isDelivered()` sebaiknya membedakan:
   - `presenter === "FALSE"` → tandai **"dititipkan"**, bukan delivered penuh;
   - `delivDriver.photo` kosong → tidak bisa dipakai sebagai bukti POD;
   - simpan `presenter` / `presentername` ke `order_tracking_events.raw` agar terlihat di UI ops (saat ini sudah tersimpan di `raw`, tapi tidak ditampilkan).
5. **Tampilkan `presenter` & POD photo** di halaman detail order admin supaya kasus serupa langsung terlihat.

-- Impor awal template chat (23 Nov 2026): 6 Script asli Academy (dirapikan: data contoh jadi placeholder, Kak -> Ka) + tiga versi cara order.
-- Aman: hanya jalan bila tabel masih KOSONG.
do $do$
begin
  if exists (select 1 from public.wa_templates) then raise exception 'wa_templates tidak kosong; impor dibatalkan'; end if;
  insert into public.wa_templates (title, category, content, sort_order) values
  ($t$Cara order (versi 1)$t$, $c$Cara Order$c$, $b$Wa'alaikumussalam Ka, terima kasih sudah chat SAMAQU.

Cara ordernya gampang Ka. Kakak pilih produknya, saya bantu pilihkan size yang pas, lalu isi data pengiriman dan transfer, setelah itu pesanan langsung kami proses.

Untuk produknya ada Thobe, Kandora, Koko, dan Vest, katalognya bisa dilihat di samaqu.id/id/katalog.

Kakak lagi cari yang seperti apa?$b$, 10),
  ($t$Cara order (versi 2)$t$, $c$Cara Order$c$, $b$Wa'alaikumussalam Ka, makasih sudah chat SAMAQU.

Ordernya gampang kok Ka. Kakak tinggal pilih produknya, nanti saya bantu pilihkan size yang pas. Habis itu isi data pengiriman, transfer, dan pesanan langsung kami proses.

Kami ada Thobe, Kandora, Koko, sama Vest. Kalau mau lihat-lihat dulu, katalognya di samaqu.id/id/katalog.

Kakak lagi nyari yang kayak gimana?$b$, 20),
  ($t$Cara order (versi 3)$t$, $c$Cara Order$c$, $b$Wa'alaikumussalam Ka, makasih ya sudah chat SAMAQU.

Ordernya simpel kok. Kakak pilih produknya, saya bantu cariin size yang pas, terus isi data pengiriman dan transfer, langsung kami proses.

Ada Thobe, Kandora, Koko, sama Vest Ka, katalognya bisa diintip di samaqu.id/id/katalog.

Kakak lagi nyari yang kayak gimana nih?$b$, 30),
  ($t$Kirim invoice pesanan$t$, $c$Order$c$, $b$Berikut invoice pesanannya ya Ka {nama}.

INVOICE PESANAN SAMAQU

Nama: {nama_lengkap}
No. WA: {no_wa}
Alamat: {alamat}

Pesanan:
1 x {produk}, size {size}
{harga}

Ongkir {layanan}: {ongkir}

Total: {total}

Pembayaran via transfer:
Bank BSI 7153280058
a.n. Ardo Babus Abdullah

Kalau sudah transfer, kirim bukti transfernya di sini ya Ka.$b$, 40),
  ($t$Kirim invoice: kalimat pembuka (variasi 2)$t$, $c$Order$c$, $b$Berikut invoice pesanannya ya Ka, kalau sudah transfer kirim bukti transfernya di sini ya.$b$, 50),
  ($t$Kirim invoice: kalimat pembuka (variasi 3)$t$, $c$Order$c$, $b$Ini invoice pesanannya Ka, mohon dicek dulu, kalau sudah pas silakan transfer dan kirim buktinya di sini ya.$b$, 60),
  ($t$Kirim invoice: kalimat pembuka (variasi 4)$t$, $c$Order$c$, $b$Siap Ka, invoice pesanannya saya kirim di atas ya, kalau sudah transfer kabari saja dengan bukti transfernya.$b$, 70),
  ($t$Kirim invoice: kalimat pembuka (variasi 5)$t$, $c$Order$c$, $b$Terima kasih datanya Ka, berikut invoice pesanannya, setelah transfer boleh kirim bukti transfernya di sini ya.$b$, 80),
  ($t$Perbedaan tipe kain (kirim foto deskripsi kain dulu)$t$, $c$Kain$c$, $b$Ini ya Ka, penjelasan lebih detail untuk perbedaan tipe kain yang kita produksi.$b$, 90),
  ($t$Perbedaan series thobe$t$, $c$Produk$c$, $b$Thobe SAMAQU ada 6 series, Ka:

*Kerah Bulat*
- *Jiharkah*: placket/klep polos, tanpa kancing diamond
- *Imron*: placket/klep dengan aksesoris kancing diamond
- *Bayati*: placket/klep dengan aksesoris eyelet berlubang

*Kerah Kemeja*
- *Nahawand*: placket/klep polos, tanpa kancing diamond
- *Karim*: placket/klep dengan aksesoris kancing diamond
- *Imalah*: aksesoris pin collar, placket/klep polos tanpa kancing diamond

Semua series placket-nya pakai zipper, Ka. Kancing diamond dan eyelet itu aksesorisnya saja.$b$, 100),
  ($t$Menjelaskan Create Your Price (cek Open Order buka dulu)$t$, $c$Create Your Price$c$, $b$Create Your Price adalah program dari SAMAQU yang memberikan kebebasan kepada customer untuk menentukan sendiri harga produk yang ingin dibayarkan, Ka. 😊

Namun, ada batas harga minimum yang sudah ditentukan oleh SAMAQU, jadi harga yang dipilih tidak boleh di bawah harga minimum tersebut. Dan untuk harga minimumnya bisa kakak cek dilink ini : https://www.samaqu.id/id/open-order

Biasanya program ini diterapkan saat periode Open Order. Jadi, Kakak tetap bisa menentukan harga sendiri selama tidak kurang dari harga minimum yang berlaku, ya. 😊$b$, 110),
  ($t$Menjelaskan Create Your Price (variasi 2)$t$, $c$Create Your Price$c$, $b$Jadi, Kakak bebas menentukan harga produk SAMAQU sendiri, asalkan tidak di bawah harga minimum yang sudah kami tentukan😊Dan untuk harga minimumnya bisa kakak cek dilink ini, https://www.samaqu.id/id/open-order$b$, 120),
  ($t$Ringkasan pesanan$t$, $c$Order$c$, $b$Siap Ka, saya rangkum pesanannya ya.

Produk: {produk}
Harga: {harga}
Ukuran: {size}
Jumlah: {jumlah} pcs
Alamat: {alamat}
Ongkir: {ongkir}

Total: {total}

Sudah sesuai semua Ka? Kalau ada yang mau diubah, kabari saja.$b$, 130),
  ($t$Ringkasan pesanan (variasi 2)$t$, $c$Order$c$, $b$Sebelum kami proses, boleh dicek lagi detail pesanannya, Ka?$b$, 140),
  ($t$Konfirmasi pembayaran diterima$t$, $c$Pembayaran$c$, $b$Pembayaran sudah kami terima ya, Ka. Terima kasih sudah berbelanja di Samaqu.
Pesanan Kakak segera kami proses. Nanti kalau resinya sudah tersedia, kami kabari lewat chat ini ya.

Oh iya, boleh disimpan nomor ini dengan nama Samaqu, Ka,  biar info resinya nggak kelewat.$b$, 150),
  ($t$Konfirmasi pembayaran diterima (variasi 2)$t$, $c$Pembayaran$c$, $b$Alhamdulillah pembayarannya sudah masuk, Ka. Pesanan langsung kami teruskan ke tim gudang.$b$, 160);
end
$do$;

-- =====================================================================
-- SAMAQU — Reseller: normalisasi nama bank lama → kode bank (2026-10-30)
--
-- Sistem baru menyimpan bank sebagai KODE ("BSI", "BCA", …) dan mendeteksi
-- BSI dari kode (bukan pencocokan teks). Data lama yang tersimpan sebagai
-- teks dinormalisasi ke "BSI" bila mengandung:
--   bsi · bank syariah indonesia / syariah indonesia ·
--   mandiri syariah · bni syariah · bri syariah (bank lama yang merger ke BSI)
--
-- Hanya menyentuh kolom `resellers.bank_name` (teks). Nomor rekening, nama
-- pemilik, dan data lain TIDAK diubah. Idempoten: baris yang sudah "BSI"
-- dilewati. Riwayat penarikan lama tetap menyimpan snapshot bank-nya sendiri.
-- =====================================================================

update public.resellers
   set bank_name = 'BSI'
 where bank_name is not null
   and bank_name <> 'BSI'
   and (
     lower(bank_name) like '%bsi%'
     or lower(bank_name) like '%syariah indonesia%'
     or lower(bank_name) like '%mandiri syariah%'
     or lower(bank_name) like '%bni syariah%'
     or lower(bank_name) like '%bri syariah%'
   );

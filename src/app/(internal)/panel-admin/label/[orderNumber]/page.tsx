/**
 * Halaman label resi di panel admin (`/panel-admin/label/<no-pesanan>`).
 *
 * Memakai halaman label yang sama dengan `/admin/label/<no-pesanan>` supaya hasil cetaknya
 * identik — tombol "Cetak Resi" di halaman Transaksi mengarah ke sini saat panel dibuka dari
 * host admin (lihat `TransaksiResiPanel`).
 */
export { default } from "@/app/(internal)/admin/label/[orderNumber]/page";

/**
 * Menu "Pre-Order" dashboard ops (/ops/preorder).
 *
 * Sengaja MEMAKAI halaman Transaksi yang sama (`mode="preorder"`) — bukan disalin — supaya form,
 * drawer, alur batal/hapus, dan data pesanan tidak pernah drift. Yang berbeda hanya daftarnya
 * (hanya pre-order), ringkasan kebutuhan barang, dan tombol "Stok sudah ready".
 */
import OpsTransaksi from "@/app/(internal)/ops/transaksi/page";

export default function PreorderPage() {
  return <OpsTransaksi mode="preorder" />;
}

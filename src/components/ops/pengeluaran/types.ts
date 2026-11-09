/** Tipe data modul Pengeluaran (/ops/pengeluaran). */

export type PengeluaranTipe = "packing" | "operasional";

export type ExpenseItem = {
  id: string;
  nama: string;
  satuan: string | null;
  aktif: boolean;
  created_at?: string;
};

export type ExpenseRow = {
  id: string;
  tanggal: string;
  tipe: PengeluaranTipe;
  kategori: string | null;
  deskripsi: string | null;
  item_id: string | null;
  nama_barang: string | null;
  qty: number | null;
  harga_satuan: number | null;
  jumlah: number;
  metode_bayar: string | null;
  catatan: string | null;
  created_by: string | null;
  created_at: string;
};

export type PengeluaranSummary = {
  jumlah_transaksi: number;
  total_kuantitas: number;
  total_biaya: number;
  kategori_terbesar: { kategori: string; jumlah: number } | null;
};

export type PengeluaranResponse = {
  items: ExpenseRow[];
  summary: {
    packing: PengeluaranSummary;
    operasional: PengeluaranSummary;
  };
  periode?: { bulan: number; tahun: number; from: string; to: string };
};

export const EMPTY_SUMMARY: PengeluaranSummary = {
  jumlah_transaksi: 0,
  total_kuantitas: 0,
  total_biaya: 0,
  kategori_terbesar: null,
};

export const EMPTY_RESPONSE: PengeluaranResponse = {
  items: [],
  summary: { packing: EMPTY_SUMMARY, operasional: EMPTY_SUMMARY },
};

/**
 * Form Tambah / Edit Produk di panel admin (`/panel-admin/produk/tambah`).
 *
 * Memakai halaman yang sama dengan ops (`/ops/master-produk/tambah`) yang membungkus komponen
 * bersama `ProductForm mode="ops"`; produk yang mau diedit dikirim lewat state navigasi
 * (`navigate(..., { state: { product } })`).
 */
import "@/app/(internal)/ops/ops.css";
import TambahProdukPage from "@/app/(internal)/ops/master-produk/tambah/page";

export default function PanelTambahProdukPage() {
  return (
    <div className="ops-root panel-ops">
      <TambahProdukPage />
    </div>
  );
}

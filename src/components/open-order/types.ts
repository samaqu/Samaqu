/** State alur Open Order (/open-order) — dipakai lintas langkah wizard. */

export interface ProductDraft {
  productId: string;
  color: string;
  size: string;
  series: string;
  quantity: number;
  /** Harga pilihan customer (Create Your Price), minimal harga series terpilih. */
  price: number;
}

export interface CartLine extends ProductDraft {
  key: number;
  /** Kategori produk (dari katalog) — dipakai menentukan pilihan awal cover add-on. */
  category?: string | null;
}

export interface CustomerData {
  name: string;
  whatsapp: string;
  address: string;
  /** Kode/nama wilayah RajaOngkir — dipilih lewat dropdown di langkah 4 (lihat LocationPicker). */
  provinceId: string;
  cityId: string;
  districtId: string;
  district: string;
  city: string;
  postalCode: string;
  notes: string;
}

export const EMPTY_CUSTOMER: CustomerData = {
  name: "",
  whatsapp: "",
  address: "",
  provinceId: "",
  cityId: "",
  districtId: "",
  district: "",
  city: "",
  postalCode: "",
  notes: "",
};

export interface DraftShipping {
  service: string;
  cost: number;
}

/**
 * Alamat tersimpan customer (tabel `saved_addresses`) — dibaca di langkah 4 supaya customer
 * yang sudah login tidak perlu mengetik ulang alamat, sama seperti halaman checkout.
 */
export interface SavedAddress {
  id: string;
  label: string;
  recipient_name: string;
  phone: string;
  address: string;
  city: string;
  postal_code: string;
  is_default: boolean;
  province?: string | null;
  kecamatan?: string | null;
  district_id?: number | null;
}

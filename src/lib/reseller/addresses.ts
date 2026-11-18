/**
 * Buku alamat reseller — bagian MURNI (aman untuk server dan browser): tipe, validasi masukan,
 * dan pemetaan ke/dari isian form penerima. Penyimpanan ke database ada di `addresses-server.ts`.
 *
 * Alamat tersimpan hanya MENGISI form pesanan; setiap pesanan tetap menyimpan salinan alamatnya sendiri,
 * jadi mengubah atau menghapus alamat tersimpan tidak memengaruhi pesanan lama.
 */

import type { AddressValue } from "@/components/reseller/order/types";

export const MAX_ADDRESSES = 20;

export interface ResellerAddress {
  id: string;
  reseller_id: string;
  label: string;
  recipient_name: string;
  whatsapp: string;
  address: string;
  province: string;
  city: string;
  district: string;
  postal_code: string | null;
  notes: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/** Masukan yang sudah dirapikan (siap dikirim ke fungsi database). */
export interface AddressInput {
  label: string;
  recipient_name: string;
  whatsapp: string;
  address: string;
  province: string;
  city: string;
  district: string;
  postal_code: string;
  notes: string;
  make_default: boolean;
}

const clean = (value: unknown): string => String(value ?? "").replace(/\s+/g, " ").trim();
const digits = (value: string): string => value.replace(/\D/g, "");

/** Validasi + rapikan masukan alamat. Pesan galat berbahasa Indonesia, aman ditampilkan ke admin. */
export function parseAddressInput(raw: unknown): { ok: true; value: AddressInput } | { ok: false; error: string } {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const label = clean(body.label);
  const recipient = clean(body.recipient_name ?? body.name);
  const whatsapp = clean(body.whatsapp);
  const address = String(body.address ?? "").trim();
  const province = clean(body.province);
  const city = clean(body.city);
  const district = clean(body.district);
  const postal = clean(body.postal_code ?? body.postalCode);
  const notes = String(body.notes ?? "").trim();

  if (!label) return { ok: false, error: "Beri label alamat (misal: Toko, Gudang, Rumah)." };
  if (label.length > 40) return { ok: false, error: "Label alamat maksimal 40 huruf." };
  if (!recipient) return { ok: false, error: "Nama penerima wajib diisi." };
  if (recipient.length > 120) return { ok: false, error: "Nama penerima maksimal 120 huruf." };
  const waDigits = digits(whatsapp);
  if (waDigits.length < 9 || waDigits.length > 20) return { ok: false, error: "Nomor WhatsApp penerima tidak valid." };
  if (!address) return { ok: false, error: "Alamat lengkap wajib diisi." };
  if (address.length > 500) return { ok: false, error: "Alamat lengkap maksimal 500 huruf." };
  if (!province || !city || !district) return { ok: false, error: "Pilih provinsi, kota, dan kecamatan." };
  if ([province, city, district].some((part) => part.length > 80)) return { ok: false, error: "Nama wilayah terlalu panjang." };
  if (postal.length > 10) return { ok: false, error: "Kode pos maksimal 10 karakter." };
  if (notes.length > 300) return { ok: false, error: "Catatan maksimal 300 huruf." };

  return {
    ok: true,
    value: {
      label,
      recipient_name: recipient,
      whatsapp,
      address,
      province,
      city,
      district,
      postal_code: postal,
      notes,
      make_default: body.make_default === true,
    },
  };
}

/** Alamat tersimpan -> isian form penerima (nama, WA, alamat, wilayah, kode pos, catatan). */
export function addressToForm(address: ResellerAddress): AddressValue {
  return {
    name: address.recipient_name,
    whatsapp: address.whatsapp,
    province: address.province,
    city: address.city,
    district: address.district,
    postalCode: address.postal_code || "",
    address: address.address,
    notes: address.notes || "",
  };
}

/** Isian form penerima -> masukan alamat (label dan status utama dari pemakai). */
export function formToAddressInput(form: AddressValue, label: string, makeDefault: boolean): AddressInput {
  return {
    label: clean(label),
    recipient_name: clean(form.name),
    whatsapp: clean(form.whatsapp),
    address: form.address.trim(),
    province: clean(form.province),
    city: clean(form.city),
    district: clean(form.district),
    postal_code: clean(form.postalCode),
    notes: form.notes.trim(),
    make_default: makeDefault,
  };
}

/** Satu baris ringkas untuk daftar: "Jl. X No. 1, Tallo, Makassar, Sulawesi Selatan 90211". */
export function addressSummary(address: Pick<ResellerAddress, "address" | "district" | "city" | "province" | "postal_code">): string {
  const region = [address.district, address.city, address.province].filter(Boolean).join(", ");
  return `${[address.address, region].filter(Boolean).join(", ")}${address.postal_code ? ` ${address.postal_code}` : ""}`;
}

/** Apakah form yang sedang diisi sama dengan alamat tersimpan (nomor WA, alamat, dan kecamatan sama)? */
export function sameAddress(saved: ResellerAddress, form: AddressValue): boolean {
  const norm = (text: string) => clean(text).toLowerCase();
  return (
    digits(saved.whatsapp) === digits(form.whatsapp) &&
    norm(saved.address) === norm(form.address) &&
    norm(saved.district) === norm(form.district)
  );
}

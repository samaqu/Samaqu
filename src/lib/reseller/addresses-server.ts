/**
 * Buku alamat reseller — akses database (service role). Aturan "maksimal satu alamat utama" dan
 * "maksimal 20 alamat" ditegakkan atomik oleh fungsi database (reseller dikunci lebih dulu).
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { AddressInput, ResellerAddress } from "./addresses";

export type AddressResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

/** Pesan dari fungsi database sudah berbahasa Indonesia dan aman ditampilkan; sisanya digeneralisasi. */
function mapError(message: string): { error: string; status: number } {
  if (/Maksimal 20 alamat/i.test(message)) return { error: "Maksimal 20 alamat tersimpan per reseller.", status: 409 };
  if (/Alamat tidak ditemukan/i.test(message)) return { error: "Alamat tidak ditemukan.", status: 404 };
  if (/Reseller tidak ditemukan/i.test(message)) return { error: "Reseller tidak ditemukan.", status: 404 };
  if (/check constraint|violates/i.test(message)) return { error: "Isian alamat tidak valid.", status: 400 };
  return { error: "Gagal menyimpan alamat. Coba lagi.", status: 500 };
}

export async function listResellerAddresses(resellerId: string): Promise<AddressResult<ResellerAddress[]>> {
  const supabase = getSupabaseAdmin();
  const { data: reseller, error: resellerError } = await supabase.from("resellers").select("id").eq("id", resellerId).maybeSingle();
  if (resellerError) {
    console.error("[RESELLER-ALAMAT] Gagal membaca reseller:", resellerError.message);
    return { ok: false, error: "Gagal memuat alamat.", status: 500 };
  }
  if (!reseller) return { ok: false, error: "Reseller tidak ditemukan.", status: 404 };

  const { data, error } = await supabase
    .from("reseller_addresses")
    .select("*")
    .eq("reseller_id", resellerId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[RESELLER-ALAMAT] Gagal membaca alamat:", error.message);
    return { ok: false, error: "Gagal memuat alamat.", status: 500 };
  }
  return { ok: true, data: (data ?? []) as ResellerAddress[] };
}

/** Tambah (addressId kosong) atau ubah alamat. */
export async function saveResellerAddress(
  resellerId: string,
  addressId: string | null,
  input: AddressInput,
  actorEmail: string
): Promise<AddressResult<ResellerAddress>> {
  const { data, error } = await getSupabaseAdmin().rpc("samaqu_reseller_address_save", {
    p_id: addressId,
    p_reseller_id: resellerId,
    p_label: input.label,
    p_recipient_name: input.recipient_name,
    p_whatsapp: input.whatsapp,
    p_address: input.address,
    p_province: input.province,
    p_city: input.city,
    p_district: input.district,
    p_postal_code: input.postal_code,
    p_notes: input.notes,
    p_make_default: input.make_default,
    p_actor: actorEmail,
  });
  if (error || !data) {
    console.error("[RESELLER-ALAMAT] Simpan gagal:", error?.message);
    return { ok: false, ...mapError(String(error?.message || "")) };
  }
  return { ok: true, data: data as unknown as ResellerAddress };
}

/** Pastikan alamat milik reseller yang dimaksud (mencegah mengubah alamat reseller lain lewat id). */
async function ownedBy(resellerId: string, addressId: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from("reseller_addresses")
    .select("id")
    .eq("id", addressId)
    .eq("reseller_id", resellerId)
    .maybeSingle();
  return Boolean(data);
}

export async function setDefaultResellerAddress(resellerId: string, addressId: string): Promise<AddressResult<ResellerAddress>> {
  if (!(await ownedBy(resellerId, addressId))) return { ok: false, error: "Alamat tidak ditemukan.", status: 404 };
  const { data, error } = await getSupabaseAdmin().rpc("samaqu_reseller_address_set_default", { p_id: addressId });
  if (error || !data) {
    console.error("[RESELLER-ALAMAT] Jadikan utama gagal:", error?.message);
    return { ok: false, ...mapError(String(error?.message || "")) };
  }
  return { ok: true, data: data as unknown as ResellerAddress };
}

export async function deleteResellerAddress(resellerId: string, addressId: string): Promise<AddressResult<{ promoted_id: string | null }>> {
  if (!(await ownedBy(resellerId, addressId))) return { ok: false, error: "Alamat tidak ditemukan.", status: 404 };
  const { data, error } = await getSupabaseAdmin().rpc("samaqu_reseller_address_delete", { p_id: addressId });
  if (error || !data) {
    console.error("[RESELLER-ALAMAT] Hapus gagal:", error?.message);
    return { ok: false, ...mapError(String(error?.message || "")) };
  }
  return { ok: true, data: { promoted_id: ((data as { promoted_id?: string | null }).promoted_id ?? null) } };
}

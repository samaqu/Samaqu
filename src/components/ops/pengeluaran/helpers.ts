/** Helper format, opsi periode, dan pemanggil API modul Pengeluaran. */

import { BIZ_OFFSET_MS } from "@/lib/ops-followup";

export const BULAN_LABEL = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/** Kategori pengeluaran operasional (dipilih lewat kartu berikon di drawer). */
export const KATEGORI_OPERASIONAL = [
  "Iklan & Promosi",
  "Admin Marketplace",
  "Ongkos Kirim",
  "Gaji Karyawan",
  "Listrik & Air",
  "Sewa Tempat",
  "Maintenance",
  "Tools & Software",
];

/** Saran metode bayar. */
export const METODE_BAYAR = ["Transfer Bank", "Cash", "QRIS", "E-Wallet", "Lainnya"];

export function rupiah(value: number | null | undefined) {
  const number = Math.round(Number(value) || 0);
  return `Rp ${new Intl.NumberFormat("id-ID").format(number)}`;
}

export function angka(value: number | null | undefined) {
  return new Intl.NumberFormat("id-ID").format(Math.round(Number(value) || 0));
}

export function tanggalLabel(value: string | null | undefined) {
  if (!value) return "-";
  const key = String(value).slice(0, 10);
  const date = new Date(`${key}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

/** Bulan & tahun berjalan menurut WIB (default pemilih periode). */
export function currentWibPeriod() {
  const wib = new Date(Date.now() + BIZ_OFFSET_MS);
  return { bulan: wib.getUTCMonth() + 1, tahun: wib.getUTCFullYear() };
}

/** Tanggal hari ini (YYYY-MM-DD) menurut WIB, untuk default form. */
export function todayWibKey() {
  return new Date(Date.now() + BIZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** Pilihan tahun: 2 tahun ke belakang s/d 1 tahun ke depan dari tahun berjalan WIB. */
export function tahunOptions(tahunAktif: number) {
  const now = currentWibPeriod().tahun;
  const from = Math.min(now - 2, tahunAktif);
  const to = Math.max(now + 1, tahunAktif);
  const years: number[] = [];
  for (let year = to; year >= from; year -= 1) years.push(year);
  return years;
}

/** Fetch API ops dengan token sesi admin (pola sama seperti halaman ops lain). */
export async function pengeluaranFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const { supabase } = await import("@/lib/supabase");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.error || `Request gagal (${res.status})`);
  return json as T;
}

export function pesanError(error: unknown) {
  return error instanceof Error ? error.message : "Terjadi kesalahan, coba lagi.";
}

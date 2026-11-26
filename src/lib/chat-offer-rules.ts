/**
 * Aturan TAWARAN proaktif live chat (kabak, bonus cover+hanger, Pre-Order, sambung ke admin WA).
 *
 * Sumber aturannya SAMA dengan bot WhatsApp: bagian "Promo" dan "Tawaran kabak" dari persona
 * di DB Academy (`ai_settings.behavior.systemInstructions`), dibaca (select saja, tidak pernah
 * menulis) lalu dipotong per judul "## ". Admin cukup mengubah persona di satu tempat.
 *
 * Persona itu ditulis untuk tool WhatsApp (kirim_wa, detail_produk, cek_pesanan, ...) yang tidak
 * ada di website, jadi selalu disertai blok ADAPTASI di bawah yang menang kalau bertentangan.
 * Kalau Academy tidak terjangkau / judulnya berubah, dipakai salinan statis (FALLBACK).
 *
 * Server-only. Di-cache 5 menit.
 */

import { WA_MARKER } from "./chat-handoff";
import { statusPromoText } from "./promo/status-promo-text";
import { readPromoAktif } from "./promo/ongkir-promo-server";

const CACHE_TTL_MS = 5 * 60 * 1000;
const FAIL_TTL_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;
const SECTION_PREFIXES = ["Promo", "Tawaran kabak"] as const;
const MAX_SECTION_CHARS = 6000;

const ADAPTASI = `ADAPTASI UNTUK LIVE CHAT WEBSITE (menang kalau bertentangan dengan aturan di atas):
- Di sini TIDAK ada kirim_wa, detail_produk, cek_pesanan, rekap_pesanan, catat_closing, teruskan_admin. Jangan memanggilnya. Alat yang ada: cari_produk, info_series, info_bahan, panduan_ukuran, cari_area_ongkir, cek_ongkir, cek_status_pesanan, hubungi_admin.
- Kabak: cek stok & harga lewat cari_produk kategori Kabak (kartu produk muncul otomatis). Tawarkan SATU kali, hanya saat pelanggan sudah menyebut/menyetujui thobe atau Koko lengan panjang, dan jangan digabung dengan permintaan data. Kalau pelanggan mau lihat: tampilkan lewat cari_produk. Kalau mau memasukkan ke pesanan: arahkan ke katalog atau tombol admin WhatsApp; kamu tidak mencatat pesanan sendiri.
- Bonus free cover + hanger: live chat tidak bisa memastikan pelanggan baru/lama maupun stok cover. Hanya boleh disebut kalau blok STATUS PROMO menyatakannya BERLAKU. Sebut HANYA kalau pelanggan menanyakan promo/diskon atau bilang belum pernah beli, dengan kalimat: "pembelian pertama dapat free cover + hanger thobe, ketersediaannya dipastikan admin saat pesanan diproses." Jangan janjikan lebih dari itu. Pelanggan lama atau ragu: oper ke admin.
- Pre-Order: kalau ukuran/warna yang diminta habis, tawarkan dulu alternatif yang ready. Kalau pelanggan tetap mau yang kosong, boleh bilang "admin bisa bantu cek opsi pre-order". JANGAN menyebut estimasi hari, jadwal, atau harga pre-order; jadwal pasti hanya dari admin.
- Tawaran sambung ke admin: kalau pelanggan ragu, minta nego, ukuran di luar tabel, mau pesan lewat chat, atau soal pre-order, tutup dengan SATU kalimat "Mau lanjut ngobrol dengan admin lewat WhatsApp?" lalu tulis penanda ${WA_MARKER} di paling akhir balasan. Penanda itu otomatis diganti tombol WhatsApp; jangan menulis nomor WhatsApp mentah.
- Maksimal SATU tawaran per balasan (kabak, bonus, pre-order, atau admin), dan jangan menawarkan hal yang sama dua kali dalam satu percakapan.`;

const FALLBACK = `## Promo
Hanya sebut promo yang tercantum BERLAKU di blok STATUS PROMO (promo yang tidak tercantum berarti tidak berlaku). Pembelian pertama dapat free cover + hanger thobe hanya kalau STATUS PROMO menyatakannya berlaku. Tidak ada diskon atau bonus lain di luar blok itu. Ditanya diskon: belum ada, tonjolkan keunggulan produk (+ promo yang berlaku kalau pelanggan baru). Pelanggan yang bilang pernah beli: jangan janjikan bonus.

## Tawaran kabak (cross-sell, SATU kali)
Kabak = kancing manset (cufflink), cocok untuk semua series thobe dan Koko lengan panjang. Tidak untuk Koko lengan pendek, Kandora, Vest. Tawarkan setelah ukuran disepakati dan barang ready: "Oh iya Ka, kalau berkenan, ada kabak yang bisa jadi pelengkap manset thobenya. Mau saya lihatkan?". Cek stok Kabak dulu; kalau semua habis, jangan tawarkan. Jangan tawarkan kalau pelanggan ragu harga/bilang mahal, sedang komplain/tukar size/tanya resi, terburu-buru, atau sudah menolak. Pelanggan menolak atau tidak menjawab: jangan ditawarkan lagi. Larangan: klaim "paling laris" atau "tinggal sedikit", menyebut angka stok, menjanjikan diskon/gratis ongkir untuk kabak.`;

let cached: { text: string; ts: number; ttl: number } | null = null;

export function clearOfferRulesCache() {
  cached = null;
}

/** Ambil bagian persona yang judulnya diawali salah satu prefix; null kalau tidak lengkap. */
export function pickSections(persona: string): string | null {
  const parts = persona.split(/^(?=## )/m);
  const picked: string[] = [];
  for (const prefix of SECTION_PREFIXES) {
    const section = parts.find((p) => p.startsWith(`## ${prefix}`));
    if (!section) return null;
    picked.push(section.trim().slice(0, MAX_SECTION_CHARS));
  }
  return picked.join("\n\n");
}

async function readPersonaSections(): Promise<string | null> {
  const base = String(process.env.ACADEMY_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(process.env.ACADEMY_SERVICE_ROLE_KEY || "");
  if (!base || !key) return null;

  const res = await fetch(`${base}/rest/v1/ai_settings?select=behavior&id=eq.1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;

  const rows = (await res.json().catch(() => [])) as Array<{
    behavior?: { systemInstructions?: unknown };
  }>;
  const persona = rows[0]?.behavior?.systemInstructions;
  return typeof persona === "string" ? pickSections(persona) : null;
}

/** Teks aturan tawaran siap disisipkan ke system prompt live chat. */
export async function getOfferRules(): Promise<string> {
  // STATUS PROMO dibaca TIAP balasan (bukan ikut cache 5 menit) supaya saklar/tanggal dari menu Promo langsung berlaku.
  let status = "";
  try {
    status = "\n\n" + statusPromoText(await readPromoAktif());
  } catch (e) {
    console.error("[CHAT] Gagal membaca status promo:", e);
  }
  return `${await getOfferRulesBase()}${status}`;
}

async function getOfferRulesBase(): Promise<string> {
  if (cached && Date.now() - cached.ts < cached.ttl) return cached.text;

  let sections: string | null = null;
  try {
    sections = await readPersonaSections();
  } catch (e) {
    console.error("[CHAT] Gagal membaca aturan tawaran dari persona Academy, pakai salinan statis:", e);
  }

  const text = `# ATURAN TAWARAN PROAKTIF\n\n${sections ?? FALLBACK}\n\n${ADAPTASI}`;
  cached = { text, ts: Date.now(), ttl: sections ? CACHE_TTL_MS : FAIL_TTL_MS };
  return text;
}

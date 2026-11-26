/**
 * Promo Ongkir customer SAMAQU — SATU fungsi hitung untuk checkout katalog website,
 * draft pesanan bot, dan tool bot (`cek_ongkir` / `rekap_pesanan`).
 * Open Order dan halaman Free Cover Hanger SENGAJA tidak memakai promo ini (keputusan bos): ongkir di sana tetap penuh.
 *
 * Aturan (keputusan bos, 26 Nov 2026):
 *  - Alamat di Jabodetabek      → potongan sebesar tarif J&T, maksimal `jaboMax` per order (default Rp20.000).
 *  - Alamat di luar Jabodetabek → potongan N% dari tarif J&T (default 40), maksimal `luarMax` per order (default Rp40.000),
 *    TANPA pembulatan ke ribuan. Batas berlaku per order, berapa pun jumlah barangnya.
 *  - Sisa ongkir dibayar customer. Customer bayar Rp0 hanya kalau tarif <= batas (label "Gratis ongkir").
 *  - Berlaku untuk semua layanan J&T yang tampil (EZ dan ECO). Reseller tidak ikut (pemanggilnya tidak memakai fungsi ini).
 *  - Masing-masing promo punya saklar + tanggal mulai/selesai (WIB, boleh kosong = tanpa batas).
 *
 * Murni: tanpa jaringan, tanpa database, tanpa data area J&T (kota resmi tujuan dikirim sebagai argumen),
 * jadi gampang diuji. Pembaca pengaturan dari database ada di `ongkir-promo-server.ts`.
 *
 * Saat tidak ada promo yang berlaku, `terapkanPromoKeOpsi` mengembalikan DAFTAR YANG SAMA (referensi sama,
 * tanpa field baru), sehingga respons API persis seperti sebelum fitur ini ada.
 */

export type PromoOngkirSettings = {
  jaboActive: boolean;
  jaboStart: string | null;
  jaboEnd: string | null;
  /** Potongan maksimal (Rp) per order, Jabodetabek. */
  jaboMax: number;
  luarActive: boolean;
  luarStart: string | null;
  luarEnd: string | null;
  luarPercent: number;
  /** Potongan maksimal (Rp) per order, luar Jabodetabek. */
  luarMax: number;
  /** Nama kota resmi (dataset area J&T) yang dihitung sebagai Jabodetabek. */
  jaboCities: string[];
  /** Diskon akun VIP J&T (persen) — hanya untuk memecah angka di laporan. */
  jntDiscountPercent: number;
  fchBotActive: boolean;
  fchBotStart: string | null;
  fchBotEnd: string | null;
};

export const DEFAULT_JABO_CITIES = [
  "KOTA ADM. JAKARTA PUSAT",
  "KOTA ADM. JAKARTA UTARA",
  "KOTA ADM. JAKARTA BARAT",
  "KOTA ADM. JAKARTA SELATAN",
  "KOTA ADM. JAKARTA TIMUR",
  "KAB. ADM. KEP. SERIBU",
  "KOTA BOGOR",
  "KAB. BOGOR",
  "KOTA DEPOK",
  "KOTA TANGERANG",
  "KAB. TANGERANG",
  "KOTA TANGERANG SELATAN",
  "KOTA BEKASI",
  "KAB. BEKASI",
];

/** Nilai bawaan = perilaku SEBELUM fitur ini: promo ongkir mati, bonus cover bot nyala. */
export const DEFAULT_PROMO_SETTINGS: PromoOngkirSettings = {
  jaboActive: false,
  jaboStart: null,
  jaboEnd: null,
  jaboMax: 20000,
  luarActive: false,
  luarStart: null,
  luarEnd: null,
  luarPercent: 40,
  luarMax: 40000,
  jaboCities: DEFAULT_JABO_CITIES,
  jntDiscountPercent: 25,
  fchBotActive: true,
  fchBotStart: null,
  fchBotEnd: null,
};

/** Kolom `store_settings` yang dibaca pembaca pengaturan. */
export const PROMO_ONGKIR_COLUMNS =
  "promo_ongkir_jabo_active, promo_ongkir_jabo_start, promo_ongkir_jabo_end, promo_ongkir_luar_active, promo_ongkir_luar_start, promo_ongkir_luar_end, promo_ongkir_luar_percent, promo_ongkir_jabo_max, promo_ongkir_luar_max, promo_ongkir_jabo_cities, promo_ongkir_jnt_discount_percent, promo_bot_fch_active, promo_bot_fch_start, promo_bot_fch_end";

function dateOrNull(value: unknown): string | null {
  const text = String(value ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function rupiahOr(value: unknown, fallback: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function percentOr(value: unknown, fallback: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : fallback;
}

/** Baris `store_settings` → pengaturan. Kolom kosong/rusak jatuh ke nilai bawaan yang aman. */
export function parsePromoSettings(row: Record<string, unknown> | null | undefined): PromoOngkirSettings {
  if (!row) return DEFAULT_PROMO_SETTINGS;
  const cities = Array.isArray(row.promo_ongkir_jabo_cities)
    ? (row.promo_ongkir_jabo_cities as unknown[]).map((c) => String(c ?? "").trim()).filter(Boolean)
    : [];
  return {
    jaboActive: row.promo_ongkir_jabo_active === true,
    jaboStart: dateOrNull(row.promo_ongkir_jabo_start),
    jaboEnd: dateOrNull(row.promo_ongkir_jabo_end),
    jaboMax: rupiahOr(row.promo_ongkir_jabo_max, DEFAULT_PROMO_SETTINGS.jaboMax),
    luarActive: row.promo_ongkir_luar_active === true,
    luarStart: dateOrNull(row.promo_ongkir_luar_start),
    luarEnd: dateOrNull(row.promo_ongkir_luar_end),
    luarPercent: percentOr(row.promo_ongkir_luar_percent, DEFAULT_PROMO_SETTINGS.luarPercent),
    luarMax: rupiahOr(row.promo_ongkir_luar_max, DEFAULT_PROMO_SETTINGS.luarMax),
    jaboCities: cities.length ? cities : DEFAULT_JABO_CITIES,
    jntDiscountPercent: percentOr(row.promo_ongkir_jnt_discount_percent, DEFAULT_PROMO_SETTINGS.jntDiscountPercent),
    // Bonus cover bot: hanya MATI kalau admin mematikannya. Kolom belum ada / kosong = nyala (perilaku lama).
    fchBotActive: row.promo_bot_fch_active !== false,
    fchBotStart: dateOrNull(row.promo_bot_fch_start),
    fchBotEnd: dateOrNull(row.promo_bot_fch_end),
  };
}

/** Tanggal hari ini menurut WIB (YYYY-MM-DD). */
export function tanggalWib(now: number = Date.now()): string {
  return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Saklar ON dan hari ini ada di dalam rentang (kosong = tanpa batas, batas ikut dihitung). */
export function dalamPeriode(active: boolean, start: string | null, end: string | null, today: string): boolean {
  if (!active) return false;
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
}

export type PromoAktif = {
  today: string;
  jabo: boolean;
  jaboMax: number;
  luar: boolean;
  luarPercent: number;
  luarMax: number;
  fchBot: boolean;
  jaboCities: string[];
  jntDiscountPercent: number;
};

/** Promo mana yang berlaku pada tanggal `today` (WIB). */
export function promoAktif(settings: PromoOngkirSettings, today: string = tanggalWib()): PromoAktif {
  return {
    today,
    jabo: settings.jaboMax > 0 && dalamPeriode(settings.jaboActive, settings.jaboStart, settings.jaboEnd, today),
    jaboMax: settings.jaboMax,
    luar:
      settings.luarPercent > 0 &&
      settings.luarMax > 0 &&
      dalamPeriode(settings.luarActive, settings.luarStart, settings.luarEnd, today),
    luarPercent: settings.luarPercent,
    luarMax: settings.luarMax,
    fchBot: dalamPeriode(settings.fchBotActive, settings.fchBotStart, settings.fchBotEnd, today),
    jaboCities: settings.jaboCities,
    jntDiscountPercent: settings.jntDiscountPercent,
  };
}

const norm = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ");

/** Kota resmi tujuan termasuk daftar Jabodetabek? (cocok persis setelah dirapikan huruf/spasi) */
export function isJabodetabek(kotaResmi: string | null | undefined, cities: string[]): boolean {
  const target = norm(String(kotaResmi ?? ""));
  if (!target) return false;
  return cities.some((city) => norm(city) === target);
}

export type PromoJenis = "jabo" | "luar";

export type HasilPromoOngkir = {
  /** Tarif J&T sebelum promo. */
  original: number;
  /** Potongan (Rp). 0 = tanpa promo. */
  discount: number;
  /** Ongkir yang dibayar customer. */
  pay: number;
  kind: PromoJenis | null;
  /** Label untuk customer; null = tanpa promo. */
  label: string | null;
};

const rpText = (value: number) => `Rp${Math.max(0, Math.round(value)).toLocaleString("id-ID")}`;

/** Label untuk customer: "Gratis ongkir" hanya kalau customer bayar Rp0; selain itu "Hemat ongkir Rp12.000". */
function labelPromo(discount: number, pay: number): string {
  return pay <= 0 ? "Gratis ongkir" : `Hemat ongkir ${rpText(discount)}`;
}

/**
 * Hitung ongkir setelah promo untuk SATU tarif.
 *  - kota resmi tidak dikenal (null) -> tidak ada promo (ragu = ongkir penuh).
 *  - Jabodetabek + promo jabo aktif -> potongan = min(tarif, jaboMax).
 *  - Luar Jabodetabek + promo luar aktif -> potongan = min(round(tarif x persen / 100), luarMax).
 *  - bayar = tarif - potongan.
 */
export function hitungPromoOngkir(input: {
  tarif: number;
  kotaResmi: string | null | undefined;
  promo: PromoAktif;
}): HasilPromoOngkir {
  const original = Math.max(0, Math.round(Number(input.tarif) || 0));
  const none: HasilPromoOngkir = { original, discount: 0, pay: original, kind: null, label: null };
  if (original <= 0 || !String(input.kotaResmi ?? "").trim()) return none;

  if (isJabodetabek(input.kotaResmi, input.promo.jaboCities)) {
    if (!input.promo.jabo) return none;
    const discount = Math.min(original, Math.max(0, Math.round(input.promo.jaboMax)));
    if (discount <= 0) return none;
    const pay = original - discount;
    return { original, discount, pay, kind: "jabo", label: labelPromo(discount, pay) };
  }

  if (!input.promo.luar) return none;
  const persen = Math.round((original * input.promo.luarPercent) / 100);
  const discount = Math.min(original, persen, Math.max(0, Math.round(input.promo.luarMax)));
  if (discount <= 0) return none;
  const pay = original - discount;
  return { original, discount, pay, kind: "luar", label: labelPromo(discount, pay) };
}

export type OpsiOngkirPromo = {
  /** Ongkir yang dibayar customer setelah promo. */
  payCost: number;
  /** Potongan (Rp). */
  discount: number;
  promoKind: PromoJenis;
  promoLabel: string;
};

/**
 * Tambahkan info promo ke daftar opsi tarif J&T. `cost` TIDAK diubah (tetap tarif J&T) supaya semua
 * pemanggil lama tetap benar. Kalau tidak ada promo yang berlaku, mengembalikan `options` APA ADANYA.
 */
export function terapkanPromoKeOpsi<T extends { cost: number }>(
  options: T[],
  kotaResmi: string | null | undefined,
  promo: PromoAktif,
): Array<T | (T & OpsiOngkirPromo)> {
  if (!promo.jabo && !promo.luar) return options;
  let ada = false;
  const hasil = options.map((option) => {
    const h = hitungPromoOngkir({ tarif: option.cost, kotaResmi, promo });
    if (!h.kind || !h.label) return option;
    ada = true;
    return { ...option, payCost: h.pay, discount: h.discount, promoKind: h.kind, promoLabel: h.label };
  });
  return ada ? hasil : options;
}

/**
 * Pecah potongan jadi bagian yang ditanggung diskon akun VIP J&T dan bagian yang ditanggung SAMAQU
 * (hanya untuk laporan). Porsi SAMAQU = potongan - diskon VIP J&T (diskon J&T = persen x tarif asli).
 * Kalau potongan lebih kecil dari diskon J&T (mis. tarif besar dengan batas Rp40.000), hasilnya minus:
 * itu BUKAN subsidi, jadi `samaqu` dibuat 0 dan nilainya dikembalikan di `selisih` (selisih untuk SAMAQU).
 */
export function pecahPotongan(
  original: number,
  discount: number,
  jntDiscountPercent: number,
): { jnt: number; samaqu: number; selisih: number } {
  const o = Math.max(0, Math.round(Number(original) || 0));
  const d = Math.max(0, Math.round(Number(discount) || 0));
  const jntPenuh = Math.round((o * Math.max(0, Math.min(100, jntDiscountPercent))) / 100);
  return { jnt: Math.min(d, jntPenuh), samaqu: Math.max(0, d - jntPenuh), selisih: Math.max(0, jntPenuh - d) };
}

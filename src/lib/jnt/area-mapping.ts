// J&T Area Mapping — full dataset (7.128 areas)
// Source: template jnt terbaru.xlsx
// Row format: LOCAL_PROV|LOCAL_KOTA|LOCAL_KEC|JNT_KOTA|CODE3|JNT_KEC|RECEIVER_AREA

import rawRows from "./area-data.json";

export interface JntAreaRow {
  localProv: string;
  localCity: string;
  localDistrict: string;
  jntCity: string; // sendSiteCode (Tariff Check)
  code3: string; // origin_code / destination_code (Order)
  jntDistrict: string; // destAreaCode (Tariff Check)
  receiverArea: string; // receiver_area (Order)
}

export const JNT_AREAS: JntAreaRow[] = (rawRows as string[]).map((line) => {
  const [localProv, localCity, localDistrict, jntCity, code3, jntDistrict, receiverArea] = line.split("|");
  return { localProv, localCity, localDistrict, jntCity, code3, jntDistrict, receiverArea };
});

const norm = (s: string) => s.trim().toUpperCase();

/**
 * Ejaan kota lokal → ejaan baku di `area-data.json`.
 *
 * Daftar ini EKSPLISIT (bukan pencocokan mirip/tebakan) supaya kode area tidak pernah salah.
 * Contoh nyata: alamat/RajaOngkir menulis "PANGKAJENE DAN KEPULAUAN", sedangkan dataset J&T
 * menulis "KAB. PANGKAJENE KEPULAUAN". Tanpa alias, destination code `PAJ` tidak ketemu
 * walaupun kecamatannya ada.
 */
const CITY_ALIASES: Record<string, string> = {
  "PANGKAJENE DAN KEPULAUAN": "PANGKAJENE KEPULAUAN",
};

const normCity = (s: string) => {
  const key = norm(s);
  return CITY_ALIASES[key] ?? key;
};

/**
 * Ejaan lama nama kecamatan lokal yang masih tersimpan di data pesanan/alamat.
 *
 * Dataset resmi sempat menulis "PALENGGAAN" (typo template L3). Setelah dibakukan menjadi
 * "PALENGAAN", pesanan lama masih membawa ejaan lama dan tidak lagi cocok. Daftar ini sengaja
 * EKSPLISIT — bukan pencocokan mirip/tebakan — supaya kode area tidak pernah salah tebak.
 * Nilai = ejaan baku di `area-data.json`.
 */
const DISTRICT_ALIASES: Record<string, string> = {
  PALENGGAAN: "PALENGAAN",
};

const normDistrict = (s: string) => {
  const key = norm(s);
  return DISTRICT_ALIASES[key] ?? key;
};

/**
 * Nama kota RajaOngkir tidak memakai prefix administratif ("DEPOK"), sedangkan dataset J&T
 * memakainya ("KOTA DEPOK", "KAB. BOGOR", "KOTA ADM. JAKARTA TIMUR"). Prefix itu dibuang
 * supaya kota yang sama bisa dicocokkan — penting untuk nama kecamatan yang muncul di lebih
 * dari satu kota (mis. "CIPAYUNG" ada di Depok dan Jakarta Timur).
 */
export const stripCityPrefix = (city: string) =>
  norm(city)
    // Urutan penting: "KABUPATEN" harus dicek sebelum "KAB" supaya tidak menyisakan "UPATEN".
    // "KAB" tanpa titik pun ikut dibuang karena data alamat di lapangan sering menulis "Kab Bogor".
    .replace(/^(KOTA|KABUPATEN|KAB\.?)?\s*(ADM\.?)?\s*/, "")
    .trim();

// ─── Indexes (built once at module load) ───
const byLocalDistrict = new Map<string, JntAreaRow>(); // "KEC|KOTA"
const byDistrictAndCity = new Map<string, JntAreaRow>(); // "KEC|KOTA-TANPA-PREFIX"
const byLocalDistrictOnly = new Map<string, JntAreaRow[]>(); // "KEC"
const byJntDistrict = new Map<string, JntAreaRow>(); // "JNTKEC|JNTKOTA"
const cityToCode3 = new Map<string, string>(); // "LOCAL_KOTA" | "JNT_KOTA" → code3
/**
 * Kunci tambahan tanpa prefix administratif ("KAB. BOGOR" / "KOTA BOGOR" → "BOGOR") supaya nama
 * kota yang ditulis customer ("Kab bogor", "jakarta barat") tetap ketemu. Nilainya bisa `null`:
 * artinya nama itu dipakai >1 kota dengan kode BEDA (mis. BEKASI → BKI / CKR) — kalau begitu
 * kodenya TIDAK ditebak, kecamatan yang dipakai untuk memastikan.
 */
const cityToCode3NoPrefix = new Map<string, string | null>();
const cityToSendSite = new Map<string, string>(); // same keys → JNT city name
const districtToCode3 = new Map<string, string>(); // "LOCAL_KEC" | "JNT_KEC" → code3
const districtToSendSite = new Map<string, string>(); // "LOCAL_KEC" | "JNT_KEC" → JNT city name

for (const r of JNT_AREAS) {
  const k1 = `${normDistrict(r.localDistrict)}|${normCity(r.localCity)}`;
  if (!byLocalDistrict.has(k1)) byLocalDistrict.set(k1, r);
  const kn = `${normDistrict(r.localDistrict)}|${stripCityPrefix(r.localCity)}`;
  if (!byDistrictAndCity.has(kn)) byDistrictAndCity.set(kn, r);
  const knJnt = `${norm(r.jntDistrict)}|${stripCityPrefix(r.jntCity)}`;
  if (!byDistrictAndCity.has(knJnt)) byDistrictAndCity.set(knJnt, r);
  const k2 = normDistrict(r.localDistrict);
  if (!byLocalDistrictOnly.has(k2)) byLocalDistrictOnly.set(k2, []);
  byLocalDistrictOnly.get(k2)!.push(r);
  const k3 = `${norm(r.jntDistrict)}|${normCity(r.jntCity)}`;
  if (!byJntDistrict.has(k3)) byJntDistrict.set(k3, r);
  const kc = normCity(r.localCity);
  const kj = normCity(r.jntCity);
  if (!cityToCode3.has(kc)) cityToCode3.set(kc, r.code3);
  if (!cityToCode3.has(kj)) cityToCode3.set(kj, r.code3);
  const kcNo = stripCityPrefix(r.localCity);
  const kjNo = stripCityPrefix(r.jntCity);
  for (const key of [kcNo, kjNo]) {
    if (!key) continue;
    const prev = cityToCode3NoPrefix.get(key);
    if (prev === undefined) cityToCode3NoPrefix.set(key, r.code3);
    else if (prev !== null && prev !== r.code3) cityToCode3NoPrefix.set(key, null); // nama ambigu
  }
  if (!cityToSendSite.has(kc)) cityToSendSite.set(kc, r.jntCity);
  if (!cityToSendSite.has(kj)) cityToSendSite.set(kj, r.jntCity);
  const kd = normDistrict(r.localDistrict);
  const kjd = norm(r.jntDistrict);
  if (!districtToCode3.has(kd)) districtToCode3.set(kd, r.code3);
  if (!districtToCode3.has(kjd)) districtToCode3.set(kjd, r.code3);
  if (!districtToSendSite.has(kd)) districtToSendSite.set(kd, r.jntCity);
  if (!districtToSendSite.has(kjd)) districtToSendSite.set(kjd, r.jntCity);
}

function findRow(city: string, district: string): JntAreaRow | null {
  const d = normDistrict(district);
  const c = normCity(city);

  // 1. Exact match: district + city
  const exact =
    byLocalDistrict.get(`${d}|${c}`) ||
    byJntDistrict.get(`${d}|${c}`);
  if (exact) return exact;

  // 2. District + city, mengabaikan prefix administratif kota (nama dari RajaOngkir)
  if (d && c) {
    const cityAware = byDistrictAndCity.get(`${d}|${stripCityPrefix(c)}`);
    if (cityAware) return cityAware;
  }

  // 3. District-only match — HANYA kalau semua kecamatan dengan nama itu menunjuk kode area yang
  //    SAMA. 284 kecamatan dipakai di lebih dari satu kota dengan kode berbeda (mis. PASEH ada di
  //    Bandung & Sumedang) — untuk kasus itu lebih baik KOSONG daripada mengirim kode area yang
  //    salah (ongkir & resi bisa nyasar).
  if (d) {
    const rows = byLocalDistrictOnly.get(d) || [];
    const areas = new Set(rows.map((row) => norm(row.jntDistrict)));
    if (rows.length > 0 && areas.size === 1) return rows[0];
  }

  // Kota saja tidak cukup untuk menentukan kecamatan → jangan menebak.
  return null;
}

/**
 * Order API: 3-char city code for origin/destination_code.
 * `district` opsional: dipakai untuk memastikan saat nama kotanya ambigu
 * (mis. "Bekasi" bisa Kab. atau Kota — kecamatan yang menentukan).
 */
export function getOriginCode(city: string, district = ""): string | null {
  const exact = cityToCode3.get(normCity(city));
  if (exact) return exact;

  const stripped = stripCityPrefix(normCity(city));
  const plain = cityToCode3NoPrefix.get(stripped);
  if (plain) return plain;

  // Nama kota ambigu (nilai `null`) atau tidak terdaftar → coba pastikan lewat kecamatan.
  if (district) {
    const row =
      byDistrictAndCity.get(`${normDistrict(district)}|${stripped}`) ||
      byLocalDistrict.get(`${normDistrict(district)}|${normCity(city)}`) ||
      byJntDistrict.get(`${normDistrict(district)}|${normCity(city)}`);
    if (row) return row.code3;
  }

  return null;
}

export function getDestinationCode(city: string, district = ""): string | null {
  return getOriginCode(city, district);
}

/** Order API: district-level area code e.g. "DPK001" */
export function getReceiverArea(city: string, district: string): string | null {
  return findRow(city, district)?.receiverArea ?? null;
}

/** Tariff Check: origin site name e.g. "DEPOK" */
export function getSendSiteCode(city: string): string | null {
  return cityToSendSite.get(normCity(city)) ?? null;
}

/** Order API: get code3 by district name (e.g. "WOYLA" → "MEH") */
export function getCode3ByDistrict(district: string): string | null {
  return districtToCode3.get(normDistrict(district)) ?? null;
}

/** Tariff Check: get sendSiteCode by district name */
export function getSendSiteCodeByDistrict(district: string): string | null {
  return districtToSendSite.get(normDistrict(district)) ?? null;
}

/**
 * Tariff Check: resolve proper J&T names from local (RajaOngkir) names.
 * Falls back to uppercased inputs when not found (legacy behavior).
 */
export function resolveTariffCodes(
  city: string,
  district: string
): { sendSiteCode: string; destAreaCode: string; found: boolean } {
  const row = findRow(city, district);
  if (row) {
    return { sendSiteCode: row.jntCity.toUpperCase(), destAreaCode: row.jntDistrict.toUpperCase(), found: true };
  }
  return { sendSiteCode: norm(city), destAreaCode: norm(district), found: false };
}

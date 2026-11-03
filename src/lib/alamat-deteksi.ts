/**
 * Deteksi alamat dari teks yang ditempel: "Tempel alamat lengkap, isi otomatis"
 * (referensi: fitur serupa di J&T VIP).
 *
 * Menerima DUA bentuk masukan:
 *  1. teks bebas lama — "Nama · 08xx, Jl…, Kec…, Kota…, Provinsi…" (perilaku lama dipertahankan);
 *  2. hasil copy dari spreadsheet (Excel/Google Sheets) — 4 sel dipisah TAB dengan urutan
 *     Nama | Alamat lengkap | Kecamatan | No HP, sel alamat boleh dibungkus tanda kutip ganda
 *     dan berisi baris baru, dan nomor HP dari sheet sering TANPA angka 0 di depan.
 *
 * Aturan mainnya:
 *  - Nomor HP: 08xx / 628xx / +628xx (spasi/strip boleh) → dinormalkan ke `08xx`; angka murni
 *    yang diawali `8` sepanjang 9–12 digit (nomor sheet tanpa 0) ditambah `0` di depan.
 *  - Nama: kolom pertama (spreadsheet) atau teks sebelum nomor HP; tanda kutip pembungkus dibuang.
 *  - Label eksplisit "Kecamatan:" / "Kec:" / "Kota:" / "Kabupaten:" / "Provinsi:" diprioritaskan.
 *  - Provinsi/Kota/Kecamatan dicocokkan ke daftar wilayah yang dipakai dropdown
 *    (`src/lib/kota.ts`, dataset area J&T). Pencocokan BERPERINGKAT (sama > memuat kata utuh >
 *    typo 1 huruf) dan satu potongan teks tidak dipakai dua kali — mis. frasa provinsi
 *    "DI Yogyakarta" tidak boleh ikut terbaca sebagai kota "Yogyakarta".
 *  - Yang tidak bisa dipastikan DIBIARKAN KOSONG, tidak ditebak (lihat `missing`/`notes`).
 *
 * Modul ini MURNI: sumber wilayah diinjeksi lewat `WilayahSource`, jadi tidak menarik dataset
 * area J&T ke bundle browser, bisa dipakai server (`/api/ops/alamat-tebak`), dan bisa diuji
 * tanpa database.
 */

export type WilayahSource = {
  /** Semua provinsi (bentuk sudah rapi, sama seperti isi dropdown). */
  provinces: string[];
  /** Kota/kabupaten dalam satu provinsi. */
  citiesOf: (province: string) => string[];
  /** Kecamatan dalam satu kota. */
  districtsOf: (city: string) => string[];
  /** Provinsi dari sebuah kota (cadangan kalau kota tidak ada di daftar provinsi). */
  provinceOfCity: (city: string) => string;
  /**
   * Kode pos yang mungkin untuk sebuah (kota, kecamatan) — OPSIONAL, dipakai kalau teks yang
   * ditempel tidak menyebut kode pos. Satu hasil = langsung diisi, banyak hasil = jadi saran.
   */
  postalOf?: (city: string, kecamatan: string) => string[];
};

export type BagianAlamat = "name" | "whatsapp" | "address" | "province" | "city" | "kecamatan" | "postal_code";

export type HasilDeteksi = {
  name: string;
  whatsapp: string;
  street: string;
  province: string;
  city: string;
  kecamatan: string;
  postal_code: string;
  /** Bagian WAJIB yang gagal dideteksi (nama, HP, provinsi, kota, kecamatan). */
  missing: BagianAlamat[];
  /** Bagian yang berhasil diisi → dipakai tombol "Reset" supaya isian manual tidak ikut hilang. */
  filled: BagianAlamat[];
  /** Info netral (abu/biru): kode pos tidak ada di teks, data ganda, kota perlu dipilih manual. */
  notes: string[];
  /** Kode pos tidak ada di teks — info netral, BUKAN peringatan. */
  postal_missing: boolean;
  /** Saran kode pos dari data wilayah (kecamatan dengan lebih dari satu kode pos). Tidak ditebak. */
  postal_options: string[];
};

/* ── Normalisasi teks ── */

const rapikan = (v: unknown) => String(v ?? "").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim();

/** Bentuk pembanding: huruf kecil, tanda baca jadi spasi, spasi dirapikan. */
const normal = (v: unknown) => rapikan(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

/** Tanda kutip berpasangan (lurus & melengkung) yang dipakai spreadsheet. */
const KUTIP = /["\u201C\u201D\u201E\u201F\u2033]/g;

/**
 * Pecah teks jadi sel-sel spreadsheet. Teks di dalam tanda kutip dihitung SATU sel (baris baru
 * di dalamnya jadi koma), di luar kutip TAB memisah kolom dan baris baru memisah baris data.
 */
export function pecahSelSpreadsheet(teks: string): { rows: string[][]; adaTab: boolean } {
  const sumber = String(teks ?? "").replace(KUTIP, '"');
  const rows: string[][] = [];
  let baris: string[] = [];
  let sel = "";
  let dalamKutip = false;
  let adaTab = false;

  const tutupSel = () => {
    baris.push(rapikan(sel));
    sel = "";
  };
  const tutupBaris = () => {
    tutupSel();
    if (baris.some((isi) => isi !== "")) rows.push(baris);
    baris = [];
  };

  for (let i = 0; i < sumber.length; i += 1) {
    const ch = sumber[i];
    if (ch === '"') {
      if (dalamKutip && sumber[i + 1] === '"') {
        sel += '"';
        i += 1;
        continue;
      }
      dalamKutip = !dalamKutip;
      continue;
    }
    if (dalamKutip) {
      sel += ch === "\n" || ch === "\r" ? ", " : ch;
      continue;
    }
    if (ch === "\t") {
      adaTab = true;
      tutupSel();
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && sumber[i + 1] === "\n") i += 1;
      tutupBaris();
      continue;
    }
    sel += ch;
  }
  tutupBaris();

  return { rows, adaTab };
}

/* ── Pencocokan tempat ── */

/** Awalan administratif yang tidak membedakan pencocokan. */
const AWALAN_ADMIN = new Set([
  "prov", "provinsi", "kab", "kabupaten", "kota", "kotamadya", "kodya",
  "kec", "kecamatan", "kel", "kelurahan", "desa", "dsn", "dusun",
  "di", "dki", "daerah", "istimewa", "diy",
]);

/**
 * Awalan yang menandai segmen masih berupa keterangan wilayah ("Kec. Cibinong", "Kab. Bogor").
 * Dipakai saat merapikan alamat lengkap — kelurahan/desa sengaja TIDAK termasuk karena masih
 * dianggap bagian alamat yang perlu ditampilkan.
 */
const AWALAN_WILAYAH_SEGMEN = new Set(["kec", "kecamatan", "kota", "kab", "kabupaten", "prov", "provinsi"]);

/**
 * Alias provinsi yang lazim dipakai orang. Nilainya = nama provinsi seperti yang muncul di
 * dropdown (hasil `prettifyProvince` di `src/lib/kota.ts` — dataset menulis DIY sebagai "DIY").
 */
const ALIAS_PROVINSI: { provinsi: string; alias: string[] }[] = [
  { provinsi: "DKI Jakarta", alias: ["dki jakarta", "jakarta", "jakarta raya"] },
  { provinsi: "DI Yogyakarta", alias: ["diy", "di yogyakarta", "daerah istimewa yogyakarta", "yogyakarta"] },
  { provinsi: "Kepulauan Riau", alias: ["kepri", "kepulauan riau"] },
  { provinsi: "Kepulauan Bangka Belitung", alias: ["babel", "bangka belitung", "kepulauan bangka belitung"] },
  { provinsi: "Nusa Tenggara Barat", alias: ["ntb", "nusa tenggara barat"] },
  { provinsi: "Nusa Tenggara Timur", alias: ["ntt", "nusa tenggara timur"] },
  { provinsi: "Jawa Barat", alias: ["jabar"] },
  { provinsi: "Jawa Tengah", alias: ["jateng"] },
  { provinsi: "Jawa Timur", alias: ["jatim"] },
  { provinsi: "Kalimantan Barat", alias: ["kalbar"] },
  { provinsi: "Kalimantan Selatan", alias: ["kalsel"] },
  { provinsi: "Kalimantan Timur", alias: ["kaltim"] },
  { provinsi: "Kalimantan Tengah", alias: ["kalteng"] },
  { provinsi: "Kalimantan Utara", alias: ["kaltara"] },
  { provinsi: "Sulawesi Selatan", alias: ["sulsel"] },
  { provinsi: "Sulawesi Utara", alias: ["sulut"] },
  { provinsi: "Sulawesi Tengah", alias: ["sulteng"] },
  { provinsi: "Sulawesi Tenggara", alias: ["sultra"] },
  { provinsi: "Sulawesi Barat", alias: ["sulbar"] },
  { provinsi: "Sumatera Utara", alias: ["sumut"] },
  { provinsi: "Sumatera Barat", alias: ["sumbar"] },
  { provinsi: "Sumatera Selatan", alias: ["sumsel"] },
];

/** "Kec. Cibitung" → "cibitung" (awalan administratif dibuang). */
function tanpaAwalan(v: unknown): string {
  const kata = normal(v).split(" ").filter(Boolean);
  while (kata.length > 1 && AWALAN_ADMIN.has(kata[0])) kata.shift();
  return kata.join(" ");
}

function jarak(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i, ...Array(n).fill(0)];
    for (let j = 1; j <= n; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function adaUrutanKata(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    if (needle.every((w, j) => haystack[i + j] === w)) return true;
  }
  return false;
}

/**
 * Skor kecocokan satu frasa teks dengan satu pilihan wilayah:
 * 3 = sama persis (setelah awalan administratif dibuang), 2 = memuat kata utuh, 1 = typo ≤1 huruf, 0 = tidak cocok.
 */
export function skorCocok(kandidat: unknown, pilihan: unknown): number {
  const a = tanpaAwalan(kandidat);
  const b = tanpaAwalan(pilihan);
  if (!a || !b) return 0;
  if (a === b) return 3;
  const kataA = a.split(" ").filter(Boolean);
  const kataB = b.split(" ").filter(Boolean);
  const pendek = a.length <= b.length ? kataA : kataB;
  const panjang = a.length <= b.length ? kataB : kataA;
  if (pendek.join("").length >= 4 && adaUrutanKata(panjang, pendek)) return 2;
  if (pendek.join(" ").length >= 5 && jarak(a, b) <= 1) return 1;
  return 0;
}

type Temuan = { nilai: string; frasa: string; skor: number; segmen: number };

/**
 * Cari frasa tempat di daftar segmen. Kecocokan "sama persis" menang atas "memuat sebagian"
 * (biar "Sleman" tidak kalah oleh "Yogyakarta" dari frasa provinsi), dan segmen yang sudah
 * dipakai (`terpakai`) dilewati supaya satu potongan tidak dibaca dua kali.
 */
function cariTempat(segmen: string[], daftar: string[], terpakai: Set<number> = new Set()): Temuan | null {
  let terbaik: Temuan | null = null;
  for (let i = segmen.length - 1; i >= 0; i -= 1) {
    if (terpakai.has(i)) continue;
    const isi = segmen[i];
    for (const pilihan of daftar) {
      const skor = skorCocok(isi, pilihan);
      if (skor === 0) continue;
      const kataPilihan = tanpaAwalan(pilihan).split(" ").filter(Boolean);
      const pola = new RegExp(`(?:${[...AWALAN_ADMIN].join("|")})?[\\s.]*${kataPilihan.join("[\\s.\\-]+")}`, "i");
      const ketemu = skor === 3 ? null : isi.match(pola);
      const kandidat: Temuan = { nilai: pilihan, frasa: ketemu ? ketemu[0] : isi, skor, segmen: i };
      if (!terbaik || kandidat.skor > terbaik.skor || (kandidat.skor === terbaik.skor && kandidat.segmen > terbaik.segmen)) {
        terbaik = kandidat;
      }
      if (terbaik.skor === 3) return terbaik;
    }
  }
  return terbaik;
}

/* ── Segmentasi & pembersihan alamat ── */

function potongSegmen(teks: string): string[] {
  return String(teks || "")
    .split(/[,;\n|·•]+/)
    .map((bagian) => buangAwalanLabel(rapikan(bagian)))
    .filter(Boolean);
}

/** Hapus SATU kemunculan teks (tanpa peduli besar-kecil huruf). */
function hapusKemunculan(teks: string, potongan: string): string {
  const cari = rapikan(potongan);
  if (!cari) return teks;
  const escaped = cari.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return teks.replace(new RegExp(escaped, "i"), " ");
}

/* ── Nomor HP ── */

const POLA_HP = /(?<!\d)(?:\+?62|0)(?:[\s.-]?\d){6,18}(?!\d)/g;
/** Nomor HP yang menempel kode pos: "082294417599 36513" (bentuk yang lazim dari tempelan CRM). */
const POLA_HP_KODE_POS = /(?<!\d)(?:\+?62|0)(?:[\s.-]?\d){6,12}[\s.-]+\d{5}(?!\d)/g;
/** Nomor sheet TANPA 0 di depan: angka murni diawali 8, panjang 9–12 digit. */
const POLA_HP_TANPA_NOL = /(?<!\d)8\d{8,11}(?!\d)/g;

/**
 * Nomor WA berlabel ("No. WA: 0822-9441-7599", "HP: 62812…"). Label didahulukan supaya nomor
 * yang memang nomor kontak tidak tertukar dengan angka lain di teks.
 */
const POLA_LABEL_HP = /(?:no\.?\s*wa|nomor\s*wa|no\.?\s*hp|nomor\s*hp|whatsapp|\bwa\b|\bhp\b|telp\.?|telepon|tlp\.?)\s*[:.=]?\s*(\+?62[\s.-]?\d(?:[\s.-]?\d){7,14}|0\d(?:[\s.-]?\d){7,14})(?!\d)/i;

function pisahHpDanKodePos(digit: string): { hp: string; sisa: string } {
  const bersih = digit.replace(/^62/, "0");
  if (bersih.length <= 13) return { hp: bersih, sisa: "" };
  const ekor = bersih.slice(-5);
  const kepala = bersih.slice(0, -5);
  if (kepala.length >= 10 && kepala.length <= 13) return { hp: kepala, sisa: ekor };
  return { hp: bersih.slice(0, 13), sisa: bersih.slice(13) };
}

export function cariNomorHp(teks: string): { hp: string; mulai: number; selesai: number; ekor: string } | null {
  const sumber = String(teks || "");
  const berlabel = sumber.match(POLA_LABEL_HP);
  if (berlabel && berlabel.index !== undefined) {
    const digit = berlabel[1].replace(/\D/g, "");
    if (/^(0|62)?8/.test(digit.replace(/^62/, "0"))) {
      const { hp, sisa } = pisahHpDanKodePos(digit);
      if (hp.length >= 10 && hp.length <= 13) {
        const mulai = berlabel.index + berlabel[0].indexOf(berlabel[1]);
        return { hp, mulai, selesai: mulai + berlabel[1].length, ekor: sisa };
      }
    }
  }

  const denganKodePos = [...sumber.matchAll(POLA_HP_KODE_POS)];
  const cocokan = [...denganKodePos, ...[...sumber.matchAll(POLA_HP)].filter((m) => !denganKodePos.some((d) => d.index === m.index))].sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0),
  );
  for (const m of cocokan) {
    const mentah = m[0];
    const digit = mentah.replace(/\D/g, "");
    if (!/^(0|62)?8/.test(digit.replace(/^62/, "0"))) continue;
    if (digit.replace(/^62/, "0").length < 10) continue;
    const { hp, sisa } = pisahHpDanKodePos(digit);
    if (hp.length < 10 || hp.length > 13) continue;
    return { hp, mulai: m.index ?? 0, selesai: (m.index ?? 0) + mentah.length, ekor: sisa };
  }
  return null;
}

/** Nomor HP tanpa 0 di depan (dari sel spreadsheet): "81802008110" → "081802008110". */
export function normalHpTanpaNol(teks: string): string {
  for (const m of String(teks || "").matchAll(POLA_HP_TANPA_NOL)) {
    const hp = `0${m[0]}`;
    if (hp.length >= 10 && hp.length <= 13) return hp;
  }
  return "";
}

/** Isi sel nomor HP: pakai selnya kalau memang nomor, kalau bukan cari satu nomor di dalamnya. */
function hpDariSel(sel: string): string {
  const isi = rapikan(sel);
  if (!isi) return "";
  if (/^[\d\s.+-]+$/.test(isi)) {
    const digit = isi.replace(/\D/g, "");
    if (/^08/.test(digit.replace(/^62/, "0"))) {
      const { hp } = pisahHpDanKodePos(digit);
      if (hp.length >= 10 && hp.length <= 13) return hp;
    }
    const tanpaNol = normalHpTanpaNol(isi);
    if (tanpaNol) return tanpaNol;
    return "";
  }
  const legacy = cariNomorHp(isi);
  if (legacy) return legacy.hp;
  return normalHpTanpaNol(isi);
}

/* ── Kode pos ── */

/** Angka tepat 5 digit yang berdiri sendiri ("45A" & angka 6 digit tidak ikut). */
export function cariKodePos(teks: string): string {
  const cocokan = [...String(teks || "").matchAll(/(?<!\d)\d{5}(?!\d)/g)].map((m) => m[0]);
  return cocokan.length > 0 ? cocokan[cocokan.length - 1] : "";
}

/** Segmen/teks yang memakai label wilayah eksplisit ("Kecamatan: …", "Kota: …"). */
const POLA_LABEL = /(?:kecamatan|kec|kota|kabupaten|kab|provinsi)\s*:/i;

/**
 * Awalan label yang lazim di tempelan CRM/sheet ("Nama Lengkap:", "Alamat Lengkap:", "No. WA:").
 * Dibuang dari tiap segmen supaya teks alamat tidak terkotori dan nama tidak ikut jadi alamat.
 */
const POLA_AWALAN_LABEL = /^\s*(?:nama\s+lengkap|nama\s+penerima|nama|alamat\s+lengkap|alamat|kecamatan|kec|kota(?:\s+atau\s+kabupaten)?|kabupaten|kab|provinsi|kelurahan|kode\s*pos|no\.?\s*wa|nomor\s*wa|whatsapp|no\.?\s*hp|nomor\s*hp|hp|telp|telepon)\s*[:=]\s*/i;

/** Buang awalan label di depan segmen ("No. WA: 0822…" → "0822…"). */
function buangAwalanLabel(isi: string): string {
  return rapikan(isi.replace(POLA_AWALAN_LABEL, ""));
}

/** Ambil nilai setelah label eksplisit, mis. "Kecamatan:  manggala" → "manggala". */
function nilaiLabel(teks: string, pola: RegExp): string {
  const m = String(teks || "").match(pola);
  return m ? rapikan(m[1]) : "";
}

/* ── Deteksi utama ── */

export function deteksiAlamat(teks: string, sumber: WilayahSource): HasilDeteksi {
  const hasil: HasilDeteksi = {
    name: "",
    whatsapp: "",
    street: "",
    province: "",
    city: "",
    kecamatan: "",
    postal_code: "",
    missing: [],
    filled: [],
    notes: [],
    postal_missing: false,
    postal_options: [],
  };

  const { rows, adaTab } = pecahSelSpreadsheet(teks);
  if (rows.length === 0) return hasil;

  // Tanpa TAB = teks bebas lama → semua baris digabung lagi jadi satu blok (perilaku lama).
  const baris = adaTab ? rows[0] : [rows.map((satuBarisRow) => satuBarisRow.join(", ")).join(", ")];
  const satuBaris = baris.join(", ");
  if (!rapikan(satuBaris)) return hasil;

  /* 0 · Lebih dari satu data (baris spreadsheet lain juga berisi nomor HP) → pakai yang pertama */
  if (adaTab) {
    const barisLainBerisiHp = rows.slice(1).some((barisLain) => barisLain.some((sel) => hpDariSel(sel)));
    if (barisLainBerisiHp) hasil.notes.push("Terdeteksi lebih dari 1 data, yang diisi hanya data pertama");
  }

  /* 1 · Nomor HP + 2 · Nama (spreadsheet: kolom 1 nama, kolom terakhir HP) */
  let hp = "";
  let nama = "";
  let teksWilayah = "";
  /** Tempelan berlabel ("Alamat Lengkap: …", "Kecamatan: …") → seluruh teks dinilai sebagai alamat. */
  const adaLabelAlamat = /(?:alamat\s*lengkap|alamat|kecamatan|kec|kelurahan|kota|kabupaten|provinsi)\s*:/i.test(satuBaris);
  /** Potongan per baris/sel (teks bebas dipecah juga per koma) — dipakai mengambil nama yang berdiri sendiri. */
  const potonganBaris = rows
    .flatMap((r) => r.map((sel) => rapikan(sel)))
    .flatMap((sel) => (adaTab ? [sel] : sel.split(/[,;\n|·•]+/).map((bagian) => rapikan(bagian))))
    .filter(Boolean);

  /** Satu potongan dinilai "nama orang" (bukan label wilayah, bukan alamat, bukan angka). */
  const tampakNamaOrang = (potongan: string): boolean => {
    const isi = rapikan(potongan);
    if (!isi || /\d/.test(isi)) return false;
    const kata = normal(isi).split(" ").filter(Boolean);
    if (kata.length < 2 || kata.length > 4) return false;
    // Label wilayah ("Kec. Cibinong", "Kota Depok") bukan nama orang.
    if (AWALAN_ADMIN.has(kata[0])) return false;
    if (sumber.provinces.some((p) => skorCocok(isi, p) > 0)) return false;
    if (/^(?:jl|jln|jalan|gg|gang|rt|rw|kel|desa|dusun|blok|kp|kampung|perum|komplek|apartemen|rusun)\b/i.test(isi)) return false;
    return true;
  };
  /** Sisa 5 digit di ekor nomor HP (HP menempel kode pos, mis. "0878… 16412") → kandidat kode pos. */
  let hpEkor = "";
  if (adaTab && baris.length >= 2) {
    const selHp = baris[baris.length - 1] || "";
    const selAlamat = baris.length >= 4 ? baris[1] : baris.slice(1, baris.length - 1).join(", ") || baris[1] || "";
    hp = hpDariSel(selHp) || hpDariSel(satuBaris);
    hpEkor = cariNomorHp(satuBaris)?.ekor || "";
    nama = rapikan(baris[0] || "");
    // Kolom kecamatan ikut dipakai untuk MENCOCOKKAN (lewat `kandidatKecamatan`), tapi tidak
    // dimasukkan sebagai segmen alamat supaya tidak ikut tampil di alamat lengkap.
    teksWilayah = selAlamat;
  } else {
    const temuan = cariNomorHp(satuBaris);
    hp = temuan?.hp || hpDariSel(satuBaris);
    hpEkor = temuan?.ekor || "";
    const sebelumHp = temuan ? satuBaris.slice(0, temuan.mulai) : "";
    // Tempelan berlabel ("Nama Lengkap: … Alamat Lengkap: …") → nama hanya dari label nama.
    const labelNama = nilaiLabel(satuBaris, /(?:nama\s+lengkap|nama\s+penerima|nama)\s*:\s*([^\n,;|]+)/i);
    // Nama yang berdiri di barisnya sendiri ("Siti Aminah\nJl. Melati…") → pakai baris itu, jangan
    // digabung dengan seluruh teks sebelum nomor HP.
    const barisNama = potonganBaris.find(tampakNamaOrang);
    // Nama yang berdiri sendiri di potongan pertama (dipisah koma/baris): "Indra Ardiansyah, Jalan…".
    const potonganPertama = potonganBaris[0] || "";
    const namaPotonganPertama = tampakNamaOrang(potonganPertama) ? potonganPertama : "";
    nama = rapikan(buangAwalanLabel(labelNama || namaPotonganPertama || barisNama || sebelumHp));
    // Alamat dinilai dari SELURUH teks: label "Alamat Lengkap:" / "Kecamatan:" bisa berada
    // SETELAH nomor WA pada tempelan CRM, dan nomor HP pun bisa berada di akhir baris — kalau hanya
    // potongan sesudah HP yang dipakai, alamatnya bisa kosong sama sekali.
    teksWilayah = buangAwalanLabel(satuBaris);
    // Nomor HP yang sudah dipakai sebagai kontak dibuang dari teks alamat (bentuk bertanda baca
    // "0822-9441-7599" tidak terhapus oleh pengganti nama/HP nanti).
    if (hp) teksWilayah = rapikan(teksWilayah.replace(POLA_HP, " ").replace(/^[,;.\s-]+|[,;.\s-]+$/g, ""));
  }
  // Nama: buang tanda kutip, angka panjang (nomor HP yang kebetulan ikut di kolom nama), dan
  // pemisah di ujung. Huruf besar-kecil DIPERTAHANKAN seperti yang diketik.
  nama = rapikan(nama.replace(KUTIP, " ").replace(/\d{6,}/g, " ").replace(/^[\s·,;|.\-]+|[\s·,;|.\-]+$/g, ""));
  if (hp) {
    hasil.whatsapp = hp;
    hasil.filled.push("whatsapp");
  } else {
    hasil.missing.push("whatsapp");
  }
  if (nama) {
    hasil.name = nama;
    hasil.filled.push("name");
  } else {
    hasil.missing.push("name");
  }

  /* 3 · Label eksplisit (diprioritaskan untuk pencocokan) */
  const labelKecamatan = nilaiLabel(satuBaris, /(?:kecamatan|kec)\s*:\s*([^\n,;|]+)/i);
  const labelKota = nilaiLabel(satuBaris, /(?:kota|kabupaten|kab)\s*:\s*([^\n,;|]+)/i);
  const labelProvinsi = nilaiLabel(satuBaris, /provinsi\s*:\s*([^\n,;|]+)/i);

  /* 4 · Segmen alamat */
  const segmen = potongSegmen(teksWilayah);
  const terpakai = new Set<number>();
  const semuaKota = sumber.provinces.flatMap((provinsi) => sumber.citiesOf(provinsi).map((kota) => ({ provinsi, kota })));

  /* 5 · Provinsi: segmen → label → alias umum (DIY, Jakarta, Kepri, Babel, NTB, …) */
  const provinsiTemuan = cariTempat(segmen, sumber.provinces);
  if (provinsiTemuan) {
    hasil.province = provinsiTemuan.nilai;
    hasil.filled.push("province");
    terpakai.add(provinsiTemuan.segmen);
  } else if (labelProvinsi) {
    const dariLabel = sumber.provinces.find((p) => skorCocok(labelProvinsi, p) > 0);
    if (dariLabel) {
      hasil.province = dariLabel;
      hasil.filled.push("province");
    }
  }
  if (!hasil.province) {
    const teksNormal = normal(satuBaris);
    for (const { provinsi, alias } of ALIAS_PROVINSI) {
      const kena = alias.some((a) => new RegExp(`(?:^|\\s)${a.split(" ").join("[\\s.]+")}(?=\\s|$)`).test(teksNormal));
      if (!kena) continue;
      const pilihan = sumber.provinces.find((p) => skorCocok(p, provinsi) > 0);
      if (pilihan) {
        hasil.province = pilihan;
        hasil.filled.push("province");
        break;
      }
    }
  }

  /* 6 · Kecamatan: label → kolom kecamatan → segmen di dalam provinsi → unik di seluruh dataset */
  const kandidatKecamatan = [labelKecamatan, adaTab && baris.length >= 4 ? baris[2] : ""].map(rapikan).filter(Boolean);
  const kotaDalamProvinsi = hasil.province ? semuaKota.filter((k) => skorCocok(k.provinsi, hasil.province) > 0) : semuaKota;
  let kecamatanKetemu = "";
  for (const kandidat of kandidatKecamatan) {
    for (const { kota } of kotaDalamProvinsi) {
      const ketemu = sumber.districtsOf(kota).find((d) => skorCocok(kandidat, d) > 0);
      if (ketemu) {
        kecamatanKetemu = ketemu;
        break;
      }
    }
    if (kecamatanKetemu) break;
  }
  if (!kecamatanKetemu) {
    const kecamatanUnik = [...new Set(kotaDalamProvinsi.flatMap((k) => sumber.districtsOf(k.kota)))];
    // Segmen yang jelas nama KOTA ("Kota Depok") jangan dianggap kecamatan kalau ada kandidat lain —
    // contoh: "Kel. Sukamaju Kec. Cilodong, Kota Depok" → kecamatan harus Cilodong, bukan Depok.
    const segmenKota = new Set(
      segmen.map((isi, i) => (semuaKota.some((k) => skorCocok(isi, k.kota) === 3) ? i : -1)).filter((i) => i >= 0),
    );
    const dariSegmen = cariTempat(segmen, kecamatanUnik, new Set([...terpakai, ...segmenKota]));
    if (dariSegmen) {
      const sebaranDalamProvinsi = new Set(
        kotaDalamProvinsi.filter((k) => sumber.districtsOf(k.kota).some((d) => skorCocok(dariSegmen.nilai, d) > 0)).map((k) => k.kota),
      );
      const sebaranGlobal = new Set(
        semuaKota.filter((k) => sumber.districtsOf(k.kota).some((d) => skorCocok(dariSegmen.nilai, d) > 0)).map((k) => k.kota),
      );
      const aman = sebaranDalamProvinsi.size <= 1 || sebaranDalamProvinsi.size === sebaranGlobal.size;
      // Jangan "memakan" segmen yang jelas nama KOTA ("Kota Depok") untuk kecamatan bernama sama —
      // kalau dimakan di sini, kota kehilangan segmennya dan jatuh ke kecamatan ambigu (mis. Cirebon).
      const segmenKotaJelas = semuaKota.some((k) => skorCocok(segmen[dariSegmen.segmen], k.kota) === 3);
      // Potongan yang menempelkan kelurahan + kecamatan ("Kel. Sukamaju Kec. Cilodong") juga TIDAK
      // ditandai terpakai — kelurahannya masih dibutuhkan sebagai bagian alamat.
      const frasaKecDiSegmen = new RegExp(`(?:kecamatan|kec)\\.?\\s*${tanpaAwalan(dariSegmen.nilai).split(" ").join("[\\s.\\-]+")}\\s*$`, "i");
      const masihAdaIsiLain = rapikan(segmen[dariSegmen.segmen].replace(frasaKecDiSegmen, "")) !== "";
      if (aman && !segmenKotaJelas) {
        kecamatanKetemu = dariSegmen.nilai;
        if (!masihAdaIsiLain) terpakai.add(dariSegmen.segmen);
      } else if (aman && segmenKotaJelas) {
        // Segmen kota tetap dipakai kota; kecamatan diisi tanpa menandai segmen terpakai.
        kecamatanKetemu = dariSegmen.nilai;
      }
    }
  }
  if (kecamatanKetemu) {
    hasil.kecamatan = kecamatanKetemu;
    hasil.filled.push("kecamatan");
  } else {
    hasil.missing.push("kecamatan");
  }

  /* 7 · Kota: label → segmen (hanya kalau tidak ambigu) → dari kecamatan yang unik dalam provinsi */
  let kotaKetemu = "";
  if (labelKota) {
    const dariLabel = semuaKota.find((k) => skorCocok(labelKota, k.kota) > 0);
    if (dariLabel) kotaKetemu = dariLabel.kota;
  }
  if (!kotaKetemu) {
    const dariSegmen = cariTempat(segmen, semuaKota.map((k) => k.kota), terpakai);
    if (dariSegmen) {
      const sebaranProvinsi = new Set(semuaKota.filter((k) => skorCocok(dariSegmen.nilai, k.kota) > 0).map((k) => k.provinsi));
      // Nama kota "generik" (teks cuma "Jakarta", padahal opsinya Jakarta Selatan/Timur/…)
      // TIDAK diisi di sini — diselesaikan lewat kecamatan di bawah supaya tidak salah kota.
      if (dariSegmen.skor === 3 || sebaranProvinsi.size === 1) {
        kotaKetemu = dariSegmen.nilai;
        terpakai.add(dariSegmen.segmen);
      }
    }
  }
  if (!kotaKetemu && kecamatanKetemu) {
    const kandidat = [
      ...new Set(
        semuaKota
          .filter((k) => !hasil.province || skorCocok(k.provinsi, hasil.province) > 0)
          .filter((k) => sumber.districtsOf(k.kota).some((d) => skorCocok(kecamatanKetemu, d) > 0))
          .map((k) => k.kota),
      ),
    ];
    if (kandidat.length === 1) kotaKetemu = kandidat[0];
    else if (kandidat.length > 1) hasil.notes.push("Kota masih ambigu dari teks, pilih manual");
  }
  if (kotaKetemu) {
    hasil.city = kotaKetemu;
    hasil.filled.push("city");
    if (!hasil.province) {
      const dariData = semuaKota.find((k) => k.kota === kotaKetemu)?.provinsi || rapikan(sumber.provinceOfCity(kotaKetemu));
      const pilihan = sumber.provinces.find((p) => skorCocok(p, dariData) > 0);
      if (pilihan) {
        hasil.province = pilihan;
        hasil.filled.push("province");
      }
    }
  } else {
    hasil.missing.push("city");
  }

  /* 8 · Provinsi dari kecamatan (kalau provinsi belum ada tapi kecamatannya tunggal) */
  if (!hasil.province && kecamatanKetemu) {
    const provinsiKandidat = [
      ...new Set(semuaKota.filter((k) => sumber.districtsOf(k.kota).some((d) => skorCocok(kecamatanKetemu, d) > 0)).map((k) => k.provinsi)),
    ];
    if (provinsiKandidat.length === 1) {
      const pilihan = sumber.provinces.find((p) => skorCocok(p, provinsiKandidat[0]) > 0);
      if (pilihan) {
        hasil.province = pilihan;
        hasil.filled.push("province");
      }
    }
  }

  /* 9 · Kode pos: ekor nomor HP (HP menempel kode pos, mis. "0878… 16412") → angka 5 digit yang
     berdiri sendiri → data wilayah (kecamatan berkode pos tunggal langsung diisi, yang punya
     beberapa kode pos jadi saran pilihan). Aturan validasi kolom Kode Pos tidak diubah. */
  let kodePos = hpEkor && /^\d{5}$/.test(hpEkor) ? hpEkor : cariKodePos(satuBaris);
  let kodePosDariData = false;
  if (!kodePos && hasil.kecamatan && sumber.postalOf) {
    const opsi = sumber.postalOf(hasil.city, hasil.kecamatan);
    if (opsi.length === 1) {
      kodePos = opsi[0];
      kodePosDariData = true;
    } else if (opsi.length > 1) {
      hasil.postal_options = opsi;
    }
  }
  if (kodePos) {
    hasil.postal_code = kodePos;
    hasil.filled.push("postal_code");
    if (kodePosDariData) hasil.notes.push("Kode pos diisi otomatis dari data wilayah, periksa lagi");
  } else {
    hasil.postal_missing = true;
    hasil.notes.push(
      hasil.postal_options.length > 0
        ? `Ada ${hasil.postal_options.length} kode pos untuk ${hasil.kecamatan}, pilih yang sesuai`
        : "Kode pos tidak ada di teks, isi manual jika diperlukan",
    );
  }

  /* 10 · Alamat lengkap: buang segmen terpakai, label, kecamatan/kota/provinsi, kode pos, nama, HP.
     Kecamatan hanya dibuang dari SATU kemunculan (paling belakang) supaya kelurahan dengan nama
     sama tetap ikut tampil. Pengecualian: potongan yang menempelkan kelurahan + kecamatan
     ("Kel. Sukamaju Kec. Cilodong") hanya kata kecamatannya yang dibuang, kelurahannya tetap tampil. */
  const frasaKecamatan = hasil.kecamatan
    ? new RegExp(`(?:kecamatan|kec)\\.?\\s*${tanpaAwalan(hasil.kecamatan).split(" ").join("[\\s.\\-]+")}\\s*$`, "i")
    : null;
  let segmenKecamatanDibuang = -1;
  if (hasil.kecamatan && frasaKecamatan) {
    for (let i = segmen.length - 1; i >= 0; i -= 1) {
      if (terpakai.has(i) || POLA_LABEL.test(segmen[i])) continue;
      const sisaTanpaKecamatan = rapikan(segmen[i].replace(frasaKecamatan, ""));
      // Potongan "Kel. Sukamaju Kec. Cilodong" → masih ada isi lain, jadi bukan segmen kecamatan murni.
      if (frasaKecamatan.test(segmen[i]) && sisaTanpaKecamatan) continue;
      if (skorCocok(segmen[i], hasil.kecamatan) > 0 || normal(segmen[i]).includes(normal(hasil.kecamatan))) {
        segmenKecamatanDibuang = i;
        break;
      }
    }
  }
  const sisa: string[] = [];
  for (let i = 0; i < segmen.length; i += 1) {
    if (terpakai.has(i)) continue;
    // Segmen yang isinya cuma label ("Kecamatan: Pasar Minggu Jakarta") tidak dianggap alamat.
    if (POLA_LABEL.test(segmen[i])) continue;
    // Fragmen label CRM yang ikut terpecah koma ("Alamat Lengkap:Jalan Patunas gang45" → "alamat
    // lengkap:..." → "…) tetap bermula dari label; kalau sisa labelnya tanpa isi, buang.
    let isi = buangAwalanLabel(segmen[i]);
    if (!isi || POLA_LABEL.test(isi)) continue;
    // "Kel. Sukamaju Kec. Cilodong" → buang hanya frasa kecamatannya, kelurahan tetap tampil.
    if (frasaKecamatan) isi = rapikan(isi.replace(frasaKecamatan, ""));
    if (!isi) continue;
    if (i === segmenKecamatanDibuang) isi = hapusKemunculan(isi, hasil.kecamatan);
    // Nama kecamatan/kota/provinsi yang muncul sebagai SEGMEN UTUH ("…, TUNGKAL ILIR, JAMBI, ID,
    // 36513") termasuk bagian wilayah, bukan alamat. Hanya skor 3 (persis) — skor 2 akan ikut
    // membuang jalan yang kebetulan memuat nama kota ("Jl. Raya Bogor KM 20" ≠ Bogor).
    if (hasil.kecamatan && skorCocok(isi, hasil.kecamatan) === 3) continue;
    if (hasil.city && skorCocok(isi, hasil.city) === 3) continue;
    if (hasil.province && skorCocok(isi, hasil.province) === 3) continue;
    // Singkatan/alias provinsi yang berdiri sendiri ("DIY", "JABAR") juga bagian wilayah, bukan
    // alamat. Dibandingkan lewat daftar alias karena `tanpaAwalan` sudah membuang akar "diy".
    const aliasProvinsi = ALIAS_PROVINSI.find(({ provinsi }) => skorCocok(provinsi, hasil.province) > 0);
    if (aliasProvinsi && aliasProvinsi.alias.some((alias) => normal(alias) === normal(isi))) continue;
    // Segmen yang sudah diwakili segmen wilayah lain ("Kec. Cibinong", "Kab. Bogor") cukup dilewati.
    // Kelurahan/desa TIDAK termasuk — "Kel. Sukapura" adalah bagian alamat yang tetap ditampilkan.
    if (AWALAN_WILAYAH_SEGMEN.has(normal(isi).split(" ").filter(Boolean)[0] || "")) continue;
    for (const potongan of [hasil.name, hasil.whatsapp, kodePos]) {
      if (potongan) isi = hapusKemunculan(isi, potongan);
    }
    // Nomor HP yang tertulis dengan tanda hubung/spasi ("0822-9441-7599") tidak terhapus oleh
    // `hapusKemunculan` (yang menghapus bentuk ternormalisasi) → sisir juga bentuk bertanda baca.
    // Hanya dijalankan pada sisa teks yang memang masih memuat nomor (bukan setiap segmen) supaya
    // nama jalan yang mengandung angka 5 digit ("Jl. Raya Bogor KM 20") tidak ikut terpotong.
    isi = isi.replace(POLA_HP, " ");
    isi = rapikan(isi.replace(/^[\s,;.\-]+|[\s,;.\-]+$/g, ""));
    if (!isi) continue;
    // Fragmen label yang tersisa tanpa isi ("kecamatan", "alamat lengkap") bukan bagian alamat.
    if (/^(?:nama(?:\s+lengkap)?|alamat(?:\s+lengkap)?|kecamatan|kec|kota|kabupaten|kab|provinsi|kelurahan|kode\s*pos|no\.?\s*wa|nomor\s*wa|whatsapp|no\.?\s*hp|hp|telp|telepon)$/i.test(isi)) continue;
    if (/^(?:id|indonesia|wni)$/i.test(isi)) continue;
    // Sisa yang isinya cuma potongan nama kota/provinsi (mis. baris "Jakarta 12520" setelah kode
    // pos dibuang) tidak dianggap bagian alamat.
    const kataSisa = normal(isi).split(" ").filter(Boolean);
    const kataInduk = [hasil.city, hasil.province].filter(Boolean).flatMap((induk) => normal(induk).split(" "));
    if (kataSisa.length > 0 && kataSisa.every((kata) => kataInduk.includes(kata))) continue;
    sisa.push(isi);
  }
  hasil.street = sisa.join(", ");
  if (hasil.street) hasil.filled.push("address");

  return hasil;
}

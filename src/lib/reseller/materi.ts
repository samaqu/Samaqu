/**
 * Materi reseller (panduan, pengetahuan produk, teks siap pakai, foto & konten).
 *
 * SATU sumber untuk kategori, tipe, validasi, dan pengurai tautan YouTube — dipakai portal reseller,
 * panel admin, dan API. Murni (tanpa akses database) sehingga bisa dites langsung.
 *
 * Video disimpan sebagai TAUTAN YouTube (unlisted) dan disematkan lewat youtube-nocookie; tidak ada file
 * video yang diunggah ke server SAMAQU.
 */

export type MateriKategori = "panduan" | "produk" | "jualan" | "teks" | "konten" | "faq";
export type MateriTipe = "video" | "artikel" | "teks" | "galeri";
export type MateriStatus = "draft" | "terbit";

export const MATERI_KATEGORI: readonly { key: MateriKategori; label: string; desc: string }[] = [
  { key: "panduan", label: "Panduan Portal", desc: "Cara pakai menu di portal" },
  { key: "produk", label: "Kenali Produk", desc: "Bahan, series, ukuran, perawatan" },
  { key: "jualan", label: "Cara Jualan", desc: "Menawarkan, menjawab, closing" },
  { key: "teks", label: "Teks Siap Pakai", desc: "Caption & template WhatsApp" },
  { key: "konten", label: "Foto & Konten", desc: "Foto dan bahan postingan" },
  { key: "faq", label: "Aturan & FAQ", desc: "Harga, ongkir, kekurangan bayar" },
];

export const MATERI_TIPE: readonly { key: MateriTipe; label: string }[] = [
  { key: "video", label: "Video" },
  { key: "artikel", label: "Artikel" },
  { key: "teks", label: "Teks siap salin" },
  { key: "galeri", label: "Foto" },
];

export interface MateriRow {
  id: string;
  category: MateriKategori;
  type: MateriTipe;
  title: string;
  summary: string | null;
  body: string | null;
  /** Tautan YouTube kanonik (https://youtu.be/ID) untuk tipe video. */
  video_url: string | null;
  /** Daftar URL foto untuk tipe galeri. */
  images: string[];
  sort_order: number;
  status: MateriStatus;
  created_at: string;
  updated_at: string;
}

export const MATERI_LIMITS = { title: 120, summary: 280, body: 8000, images: 12, sortMax: 9999 } as const;

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com", "youtu.be"]);

/** Ambil ID video dari tautan YouTube (watch, youtu.be, shorts, embed, live). null kalau bukan YouTube. */
export function parseYoutubeId(input: unknown): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!YT_HOSTS.has(url.hostname.toLowerCase())) return null;
  let id = "";
  if (url.hostname.toLowerCase() === "youtu.be") {
    id = url.pathname.split("/").filter(Boolean)[0] || "";
  } else if (url.pathname === "/watch") {
    id = url.searchParams.get("v") || "";
  } else {
    const parts = url.pathname.split("/").filter(Boolean);
    if (["shorts", "embed", "live", "v"].includes(parts[0] || "")) id = parts[1] || "";
  }
  return YT_ID.test(id) ? id : null;
}

export const youtubeCanonical = (id: string) => `https://youtu.be/${id}`;
export const youtubeEmbedUrl = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1&autoplay=1`;
export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export interface MateriInput {
  category: MateriKategori;
  type: MateriTipe;
  title: string;
  summary: string | null;
  body: string | null;
  video_url: string | null;
  images: string[];
  sort_order: number;
  status: MateriStatus;
}

/**
 * Validasi + rapikan isian admin. Field yang tidak relevan untuk tipenya dikosongkan
 * (mis. video tidak membawa foto), jadi data di database selalu konsisten.
 */
export function validateMateri(input: unknown): { ok: true; value: MateriInput } | { ok: false; error: string } {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  const category = String(raw.category ?? "") as MateriKategori;
  if (!MATERI_KATEGORI.some((item) => item.key === category)) return { ok: false, error: "Pilih kategori materi." };
  const type = String(raw.type ?? "") as MateriTipe;
  if (!MATERI_TIPE.some((item) => item.key === type)) return { ok: false, error: "Pilih jenis materi." };

  const title = String(raw.title ?? "").trim();
  if (!title) return { ok: false, error: "Judul wajib diisi." };
  if (title.length > MATERI_LIMITS.title) return { ok: false, error: `Judul maksimal ${MATERI_LIMITS.title} huruf.` };

  const summary = String(raw.summary ?? "").trim();
  if (summary.length > MATERI_LIMITS.summary) return { ok: false, error: `Ringkasan maksimal ${MATERI_LIMITS.summary} huruf.` };

  const body = String(raw.body ?? "").replace(/\r\n/g, "\n").trim();
  if (body.length > MATERI_LIMITS.body) return { ok: false, error: `Isi maksimal ${MATERI_LIMITS.body} huruf.` };

  const status = String(raw.status ?? "draft") as MateriStatus;
  if (status !== "draft" && status !== "terbit") return { ok: false, error: "Status harus draft atau terbit." };

  const sortRaw = raw.sort_order === undefined || raw.sort_order === null || raw.sort_order === "" ? 0 : Number(raw.sort_order);
  if (!Number.isFinite(sortRaw) || Math.round(sortRaw) !== sortRaw || sortRaw < 0 || sortRaw > MATERI_LIMITS.sortMax) {
    return { ok: false, error: `Urutan harus angka bulat 0 sampai ${MATERI_LIMITS.sortMax}.` };
  }

  let videoUrl: string | null = null;
  if (type === "video") {
    const id = parseYoutubeId(raw.video_url);
    if (!id) return { ok: false, error: "Tautan video harus dari YouTube (youtu.be/..., youtube.com/watch?v=..., atau youtube.com/shorts/...)." };
    videoUrl = youtubeCanonical(id);
  }

  let images: string[] = [];
  if (type === "galeri") {
    const list = Array.isArray(raw.images) ? raw.images : [];
    images = list.map((item) => String(item ?? "").trim()).filter(Boolean);
    if (images.length === 0) return { ok: false, error: "Tambahkan minimal satu foto." };
    if (images.length > MATERI_LIMITS.images) return { ok: false, error: `Foto maksimal ${MATERI_LIMITS.images}.` };
    if (!images.every(isHttpsUrl)) return { ok: false, error: "Alamat foto harus berawalan https://." };
  }

  if ((type === "artikel" || type === "teks") && !body) {
    return { ok: false, error: type === "teks" ? "Isi teks siap salin wajib diisi." : "Isi artikel wajib diisi." };
  }

  return {
    ok: true,
    value: {
      category,
      type,
      title,
      summary: summary || null,
      // Video/galeri boleh membawa teks pendamping (deskripsi); tipe artikel/teks wajib.
      body: body || null,
      video_url: videoUrl,
      images,
      sort_order: sortRaw,
      status,
    },
  };
}

/** Materi "Baru" = dibuat dalam 14 hari terakhir. */
export function isMateriBaru(createdAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return now.getTime() - created <= 14 * 24 * 3600 * 1000 && now.getTime() >= created - 3600 * 1000;
}

/** Urutan tampil: kategori sesuai daftar, lalu `sort_order` kecil dulu, lalu yang terbaru. */
export function sortMateri<T extends Pick<MateriRow, "category" | "sort_order" | "created_at">>(rows: T[]): T[] {
  const order = new Map(MATERI_KATEGORI.map((item, index) => [item.key, index]));
  return [...rows].sort(
    (a, b) =>
      (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) ||
      a.sort_order - b.sort_order ||
      b.created_at.localeCompare(a.created_at)
  );
}

/* ── Isi artikel / teks siap salin ── */

export type MateriBlok =
  | { t: "h"; text: string }
  | { t: "p"; text: string }
  | { t: "ul"; items: string[] };

/**
 * Isi artikel sederhana (tanpa HTML): baris `## Judul` = subjudul, baris berawalan `- ` = daftar poin,
 * baris kosong = paragraf baru. Mengembalikan blok data (bukan HTML) sehingga tampilan aman dari injeksi.
 */
export function parseBodyMateri(body: string | null | undefined): MateriBlok[] {
  const blocks: MateriBlok[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ t: "p", text: para.join(" ").trim() });
    para = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ t: "ul", items: list });
    list = [];
  };
  for (const rawLine of String(body ?? "").replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushPara();
      flushList();
    } else if (line.startsWith("## ")) {
      flushPara();
      flushList();
      blocks.push({ t: "h", text: line.slice(3).trim() });
    } else if (/^[-•]\s+/.test(line)) {
      flushPara();
      list.push(line.replace(/^[-•]\s+/, "").trim());
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks.filter((block) => (block.t === "ul" ? block.items.length > 0 : block.text.length > 0));
}

/** Teks siap salin boleh berisi beberapa varian dipisah baris `---`; tiap varian punya tombol salinnya sendiri. */
export function pisahVarianTeks(body: string | null | undefined): string[] {
  return String(body ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\n-{3,}\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** URL unduh foto: untuk Cloudinary pakai `fl_attachment` supaya langsung terunduh, selain itu URL apa adanya. */
export function unduhUrl(url: string): string {
  const marker = "/image/upload/";
  if (!url.includes("res.cloudinary.com") || !url.includes(marker) || url.includes("fl_attachment")) return url;
  return url.replace(marker, `${marker}fl_attachment/`);
}

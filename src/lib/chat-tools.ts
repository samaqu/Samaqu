/**
 * Tools (function calling) untuk live chat AI SAMAQU.
 *
 * Harga & stok TIDAK dihafal model — setiap kali butuh, model memanggil tool ini dan
 * datanya diambil langsung dari database. Ini yang membuat jawaban akurat dan tidak
 * mengarang. Modul server-only.
 *
 * Tool mengembalikan dua hal: `text` (untuk dibaca model) dan `products` (opsional,
 * data terstruktur yang dikirim ke widget untuk dirender sebagai kartu produk).
 */

import { getSupabaseAdmin } from "./supabase-admin";
import { getFonnteConfig, resolveAdminTargets, sendFonnteMessage } from "./fonnte";
import { checkTariffSemua } from "./jnt/tariff";
import { layananByCode } from "./jnt/layanan";
import { getJntConfig } from "./jnt/config";
import { getSendSiteCode, resolveTariffCodes, JNT_AREAS } from "./jnt/area-mapping";
import { isVideoUrl } from "./product-thumbnail";
import {
  FALLBACK_ITEM_WEIGHT_GRAMS,
  productWeightMapFromRows,
  sumWeightGramsBySize,
  variantWeightMapFromRows,
} from "./shipping-weight";

export interface ChatProductCard {
  id: string;
  name: string;
  category: string;
  series: string | null;
  price: number;
  cyp: boolean;
  image: string | null;
}

export interface ChatToolResult {
  text: string;
  products?: ChatProductCard[];
  /** Foto (URL) yang harus ditampilkan di balasan asisten. */
  images?: string[];
}

export const CHAT_TOOLS = [
  {
    type: "function",
    function: {
      name: "cari_produk",
      description:
        "Cari produk SAMAQU dari katalog dan lihat harga serta stok terkini. Pakai ini setiap kali butuh info produk, harga, ukuran, warna, atau ketersediaan.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Kata kunci: nama produk, kategori (thobe/kandora/koko/vest/kabak), kain, atau series. Boleh kosong.",
          },
          kategori: { type: "string", description: "Filter kategori (opsional), mis. 'Thobe'." },
          series: { type: "string", description: "Filter series (opsional), mis. 'Nahawand'." },
          product_id: {
            type: "string",
            description:
              "ID produk dari konteks tombol Tanya. Pakai ini untuk produk tertentu; lebih akurat daripada query.",
          },
          max_harga: { type: "number", description: "Batas harga maksimum dalam Rupiah (opsional)." },
          warna: { type: "string", description: "Filter warna (opsional), mis. 'hitam'." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "info_series",
      description:
        "Ambil penjelasan resmi dan FOTO tiap series Thobe (Imron, Jiharkah, Nahawand, Bayati, Imalah). Pakai saat pelanggan bertanya beda series, ciri kerah/placket, atau minta foto series.",
      parameters: {
        type: "object",
        properties: {
          series: {
            type: "string",
            description: "Nama series (opsional), mis. Jiharkah. Kosongkan untuk semua series.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "panduan_ukuran",
      description:
        "Ambil panduan ukuran SAMAQU untuk sebuah kategori. Pakai kalau pelanggan bertanya soal ukuran/pas atau butuh rekomendasi ukuran.",
      parameters: {
        type: "object",
        properties: {
          kategori: { type: "string", description: "Kategori (opsional): Thobe, Kandora, Koko, Vest, Kabak." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cari_area_ongkir",
      description:
        "Cari kecamatan/kota yang dikenali J&T. Pakai ini kalau customer hanya menyebut kecamatan (mis. Cengkareng) atau ejaannya ragu, sebelum memanggil cek_ongkir.",
      parameters: {
        type: "object",
        properties: {
          kata_kunci: {
            type: "string",
            description: "Potongan nama kecamatan/kota, mis. cengkareng, sukmajaya, bandung.",
          },
          limit: { type: "number", description: "Jumlah hasil maksimal (default 10)." },
        },
        required: ["kata_kunci"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cek_ongkir",
      description:
        "Hitung tarif J&T dari Depok ke kota/kecamatan tujuan. Butuh kecamatan + berat_gram, ATAU product_id + ukuran + quantity. Jangan mengarang ongkir; kalau data belum lengkap, minta produk/ukuran/quantity dulu.",
      parameters: {
        type: "object",
        properties: {
          kota: { type: "string", description: "Kota/kabupaten tujuan, mis. Jakarta Barat." },
          kecamatan: { type: "string", description: "Kecamatan tujuan, mis. Cengkareng." },
          berat_gram: {
            type: "number",
            description: "Berat paket dalam gram. Isi kalau customer sudah menyebut berat.",
          },
          product_id: {
            type: "string",
            description: "ID produk dari hasil cari_produk, kalau ongkir dihitung dari produk.",
          },
          warna: { type: "string", description: "Warna varian (opsional)." },
          ukuran: { type: "string", description: "Ukuran varian (opsional), mis. M." },
          quantity: { type: "number", description: "Jumlah unit (default 1)." },
        },
        required: ["kecamatan"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cek_status_pesanan",
      description:
        "Cek status sebuah pesanan (diproses/dikirim/selesai + nomor resi). WAJIB punya nomor pesanan DAN nomor HP yang dipakai saat memesan sebagai verifikasi. Panggil hanya setelah pelanggan menyebutkan keduanya.",
      parameters: {
        type: "object",
        properties: {
          nomor_pesanan: { type: "string", description: "Nomor pesanan, mis. SMQ-20260815-123 atau CYO-..." },
          no_hp: { type: "string", description: "Nomor HP/WhatsApp pemesan, untuk verifikasi." },
        },
        required: ["nomor_pesanan", "no_hp"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "hubungi_admin",
      description:
        "Teruskan percakapan ini ke admin manusia lewat WhatsApp. Pakai kalau pelanggan minta bicara dengan admin, atau masalahnya butuh admin (keluhan, retur/garansi, pembayaran bermasalah, permintaan khusus). Kalau nomor WhatsApp pelanggan belum diketahui, tanyakan dulu sebelum memanggil tool ini.",
      parameters: {
        type: "object",
        properties: {
          ringkasan: { type: "string", description: "Ringkasan singkat masalah/permintaan pelanggan." },
          no_hp: { type: "string", description: "Nomor WhatsApp pelanggan supaya admin bisa membalas (opsional bila belum diberikan)." },
        },
        required: ["ringkasan"],
      },
    },
  },
] as const;

/** Buang karakter yang bisa merusak sintaks filter Supabase, batasi panjang. */
function sanitize(value: unknown, max = 60): string {
  return String(value ?? "")
    .replace(/[%(),]/g, " ")
    .trim()
    .slice(0, max);
}

function rupiah(value: number): string {
  return `Rp ${value.toLocaleString("id-ID")}`;
}

/**
 * Beberapa produk punya `image` berupa video Cloudinary (.mp4), yang tidak bisa dipakai
 * di tag <img>. Ubah ke poster frame JPEG lewat transform Cloudinary (so_0 = frame awal);
 * URL non-video dibiarkan apa adanya.
 */
function toThumbnail(url: string | null): string | null {
  if (!url) return null;
  const isVideo = /\/video\/upload\//.test(url) || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
  if (!isVideo) return url;
  if (!/res\.cloudinary\.com/.test(url)) return null;
  return url.replace("/video/upload/", "/video/upload/so_0/").replace(/\.(mp4|webm|mov|m4v)(\?.*)?$/i, ".jpg");
}

interface VariantRow {
  color: string | null;
  size: string | null;
  stock: number | null;
}

function summarizeStock(variants: VariantRow[]): string {
  const byColor = new Map<string, Map<string, number>>();
  for (const v of variants) {
    const color = v.color && v.color !== "default" ? v.color : "";
    const size = v.size || "-";
    if (!byColor.has(color)) byColor.set(color, new Map());
    const sizes = byColor.get(color)!;
    sizes.set(size, (sizes.get(size) || 0) + (v.stock || 0));
  }
  const parts: string[] = [];
  for (const [color, sizes] of byColor) {
    const sizeText = [...sizes.entries()].map(([size, stock]) => `${size}:${stock}`).join(", ");
    parts.push(color ? `${color} → ${sizeText}` : sizeText);
  }
  return parts.join(" | ") || "stok tidak terkelola";
}

async function cariProduk(args: Record<string, unknown>): Promise<ChatToolResult> {
  const admin = getSupabaseAdmin();
  const term = sanitize(args.query);
  const kategori = sanitize(args.kategori);
  const series = sanitize(args.series);
  const productId = sanitize(args.product_id, 120);
  const warna = sanitize(args.warna).toLowerCase();
  const maxHarga = typeof args.max_harga === "number" ? args.max_harga : Number(args.max_harga) || 0;

  // Stok ikut di-embed dalam SATU query (dulu products lalu product_variants terpisah =
  // dua round-trip berurutan ke database). Hint FK eksplisit karena ada 2 relasi ke products.
  let query = admin
    .from("products")
    .select(
      "id, name, category, kain, series, price, minimum_price, create_your_price_enabled, colors, image, jenis_kain(name, material), product_variants!product_variants_product_id_fkey(color, size, stock)"
    )
    .eq("is_published", true);

  if (productId) {
    // Produk yang pasti dari tombol "Tanya": jangan campur dengan query teks bebas.
    query = query.eq("id", productId);
  } else {
    if (term) query = query.or(`name.ilike.%${term}%,category.ilike.%${term}%,kain.ilike.%${term}%,series.ilike.%${term}%`);
    if (series) query = query.ilike("series", `%${series}%`);
  }
  if (kategori) query = query.ilike("category", `%${kategori}%`);

  const { data, error } = await query.limit(30);
  if (error) {
    console.error("[CHAT-TOOL] cari_produk error:", error.message);
    return { text: "Gagal mengambil data produk. Arahkan pelanggan ke admin." };
  }

  let products = (data || []) as Array<Record<string, unknown>>;

  if (warna) {
    products = products.filter((p) =>
      Array.isArray(p.colors) && (p.colors as string[]).some((c) => c.toLowerCase().includes(warna))
    );
  }
  if (maxHarga > 0) {
    products = products.filter((p) => {
      const price = p.create_your_price_enabled ? Number(p.minimum_price) || 0 : Number(p.price) || 0;
      return price <= maxHarga;
    });
  }

  if (!products.length) {
    return { text: "Tidak ada produk yang cocok dengan kriteria itu. Tawarkan bantuan lain atau arahkan ke admin." };
  }

  products = products.slice(0, 8);

  const byProduct = new Map<string, VariantRow[]>();
  for (const p of products) {
    const variants = Array.isArray(p.product_variants) ? (p.product_variants as VariantRow[]) : [];
    byProduct.set(p.id as string, variants);
  }

  // Foto kartu: ambil foto pertama yang BUKAN video dari `product_images`.
  // `products.image` sering berisi video (00_semua_video.mp4), jadi tidak bisa dipakai langsung.
  const imageIds = products.map((p) => String(p.id));
  const { data: imageRows, error: imageError } = await admin
    .from("product_images")
    .select("product_id, url, is_video, display_order")
    .in("product_id", imageIds)
    .order("display_order");
  if (imageError) console.error("[CHAT-TOOL] product_images error:", imageError.message);

  const imageByProduct = new Map<string, string>();
  for (const row of (imageRows ?? []) as {
    product_id?: string | null;
    url?: string | null;
    is_video?: boolean | null;
  }[]) {
    const productId = String(row.product_id ?? "");
    const url = String(row.url ?? "");
    if (!productId || !url || row.is_video || isVideoUrl(url)) continue;
    if (!imageByProduct.has(productId)) imageByProduct.set(productId, url);
  }

  const cards: ChatProductCard[] = [];
  const lines = products.map((p) => {
    const jenis = p.jenis_kain as { name?: string; material?: string } | null;
    const kain = jenis?.name || (p.kain as string) || "-";
    const colors = Array.isArray(p.colors) ? (p.colors as string[]).join(", ") : "-";
    const cyp = !!p.create_your_price_enabled;
    const price = cyp ? Number(p.minimum_price) || 0 : Number(p.price) || 0;
    const priceLabel = cyp ? `Create Your Price, minimum ${rupiah(price)}` : rupiah(price);
    cards.push({
      id: p.id as string,
      name: p.name as string,
      category: (p.category as string) || "-",
      series: (p.series as string) || null,
      price,
      cyp,
      image:
        imageByProduct.get(String(p.id)) || toThumbnail((p.image as string) || null),
    });
    return `- ${p.name} [${p.category}] (id: ${p.id}) | kain ${kain}${jenis?.material ? ` (${jenis.material})` : ""}${p.series ? ` | series ${p.series}` : ""} | ${priceLabel} | warna: ${colors} | stok (warna → ukuran:jumlah): ${summarizeStock(byProduct.get(p.id as string) || [])}`;
  });

  return {
    text: `Ditemukan ${products.length} produk:\n${lines.join("\n")}`,
    products: cards,
  };
}

const SIZE_GUIDE: Record<string, string> = {
  thobe: "Thobe SAMAQU panjang & longgar. Patokan umum: M (tinggi 160–168 cm), L (168–175), XL (175–182), XXL (182+).",
  kandora: "Kandora potongan longgar. Umumnya sama dengan Thobe: M (160–168 cm), L (168–175), XL (175–182).",
  koko: "Koko potongan regular. M (155–165 cm), L (165–172), XL (172–178), XXL (178+).",
  vest: "Vest dipakai di atas kemeja — pilih sesuai lingkar dada: M (90–96 cm), L (96–102), XL (102–108).",
  kabak: "Kabak longgar; ikuti tinggi badan seperti Thobe.",
};

function panduanUkuran(args: Record<string, unknown>): ChatToolResult {
  const kategori = String(args.kategori || "").toLowerCase().trim();
  const lines = [
    "Panduan ukuran SAMAQU tersedia lengkap (tabel + gambar) di halaman /panduan-ukuran.",
    "Tiap kategori punya tabel ukurannya sendiri (Thobe, Kandora, Koko, Vest, Kabak).",
  ];
  const key = Object.keys(SIZE_GUIDE).find((k) => kategori.includes(k));
  if (key) lines.push(SIZE_GUIDE[key]);
  lines.push(
    "Tips: minta pelanggan menyebut tinggi & berat badan (dan lingkar dada bila perlu), lalu sarankan ukuran. Kalau masih ragu, arahkan konsultasi ke admin lewat WhatsApp."
  );
  return { text: lines.join("\n") };
}

function cariAreaOngkir(args: Record<string, unknown>): ChatToolResult {
  const q = sanitize(args.kata_kunci, 40).toLowerCase();
  if (q.length < 3) {
    return { text: "Kata kunci minimal 3 huruf, mis. cengkareng." };
  }
  const limit = Math.min(20, Math.max(1, Math.round(Number(args.limit) || 10)));
  const terms = [q];
  if (q.startsWith("kecamatan ")) terms.push(q.slice("kecamatan ".length).trim());
  if (q.startsWith("kec. ")) terms.push(q.slice("kec. ".length).trim());
  if (q.startsWith("ke ")) terms.push(q.slice("ke ".length).trim());
  // "kecengkareng" = "ke Cengkareng" yang sering ditulis menyatu.
  if (q.startsWith("ke") && q.length > 4) terms.push(q.slice(2).trim());

  const seen = new Set<string>();
  const rows: string[] = [];

  for (const term of [...new Set(terms)].filter(Boolean)) {
    for (const row of JNT_AREAS) {
      const hay = `${row.localDistrict} ${row.localCity} ${row.localProv}`.toLowerCase();
      if (!hay.includes(term)) continue;
      const key = `${row.localDistrict}|${row.localCity}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(`${row.localDistrict} — ${row.localCity} (${row.localProv})`);
      if (rows.length >= limit) break;
    }
    if (rows.length) break;
  }

  if (!rows.length) {
    return { text: `Tidak ada kecamatan/kota yang cocok dengan "${q}".` };
  }
  return { text: `Hasil pencarian area J&T:\n${rows.join("\n")}` };
}

const shippingCache = new Map<
  string,
  { ts: number; rows: { label: string; cost: number; etd: string }[] }
>();
const SHIPPING_TTL_MS = 5 * 60 * 1000;

async function cekOngkir(args: Record<string, unknown>): Promise<ChatToolResult> {
  const kota = sanitize(args.kota, 60);
  let kecamatan = sanitize(args.kecamatan, 60);
  if (!kecamatan) {
    return { text: "Sebutkan kecamatan tujuan dulu ya, Ka." };
  }

  const qty = Math.min(20, Math.max(1, Math.round(Number(args.quantity) || 1)));
  let weight = Math.round(Number(args.berat_gram) || 0);
  const productId = sanitize(args.product_id, 120);

  if (weight <= 0 && productId) {
    const admin = getSupabaseAdmin();
    const [{ data: product }, { data: variants }] = await Promise.all([
      admin.from("products").select("id, weight").eq("id", productId).maybeSingle(),
      admin
        .from("product_variants")
        .select("product_id, color, size, weight")
        .eq("product_id", productId),
    ]);
    if (!product) {
      return { text: "Produk tidak ditemukan. Cari produk dulu dengan cari_produk." };
    }

    const productWeights = productWeightMapFromRows([product]);
    const variantWeights = variantWeightMapFromRows(variants);
    const { grams, missingQty } = sumWeightGramsBySize(
      [
        {
          productId,
          color: sanitize(args.warna, 60),
          size: sanitize(args.ukuran, 20),
          quantity: qty,
        },
      ],
      productWeights,
      variantWeights,
    );
    weight = Math.max(300, grams + FALLBACK_ITEM_WEIGHT_GRAMS * missingQty);
  }

  if (weight <= 0) {
    return {
      text: "Butuh produk + ukuran + quantity, atau berat paket, untuk menghitung ongkir.",
    };
  }

  const config = await getJntConfig();
  if (!config.orderUsername) {
    return { text: "Ongkir J&T belum dikonfigurasi. Arahkan customer ke admin." };
  }

  let resolved = resolveTariffCodes(kota, kecamatan);
  if (!resolved.found) {
    const alt = kecamatan
      .replace(/^kecamatan\s+/i, "")
      .replace(/^kec\.\s*/i, "")
      .replace(/^ke\s+/i, "")
      .replace(/^ke(?=[a-z])/i, "");
    if (alt && alt !== kecamatan) {
      kecamatan = alt;
      resolved = resolveTariffCodes(kota, kecamatan);
    }
  }
  if (!resolved.found) {
    return {
      text: `Kecamatan "${kecamatan}" belum dikenali J&T. Pakai cari_area_ongkir untuk cek ejaan/kota.`,
    };
  }

  const origin = getSendSiteCode("DEPOK") || "DEPOK";
  const cacheKey = `${origin}-${resolved.destAreaCode}-${weight}`;
  const cached = shippingCache.get(cacheKey);
  let rows = cached && Date.now() - cached.ts < SHIPPING_TTL_MS ? cached.rows : null;

  if (!rows) {
    const options = await checkTariffSemua({
      weight: weight / 1000,
      originCode: origin,
      destAreaCode: resolved.destAreaCode,
    });
    rows = options
      .map((option) => {
        const known = layananByCode(option.serviceCode);
        return {
          label: known?.label || option.name || option.serviceCode,
          cost: Math.round(option.cost),
          etd: option.etd || known?.estimate || "",
        };
      })
      .sort((a, b) => a.cost - b.cost);
    if (rows.length) shippingCache.set(cacheKey, { ts: Date.now(), rows });
  }

  if (!rows.length) {
    return { text: `Tidak ada layanan J&T untuk ${kecamatan}${kota ? `, ${kota}` : ""}.` };
  }

  const lines = rows.map(
    (row) => `- ${row.label} — ${rupiah(row.cost)}${row.etd ? ` — ${row.etd}` : ""}`,
  );
  return {
    text: `Ongkir J&T Depok → ${kecamatan}${kota ? `, ${kota}` : ""} · ${weight} g\n${lines.join("\n")}`,
  };
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu Pembayaran",
  diproses: "Sedang Diproses",
  dikirim: "Sedang Dikirim",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
};

function digits(value: unknown): string {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

/**
 * Pembatas percobaan cek pesanan per sesi — mencegah orang menebak-nebak nomor pesanan.
 * Maks 5 percobaan per 10 menit per sesi (in-memory; cukup untuk meredam brute force).
 */
const orderAttempts = new Map<string, { count: number; resetAt: number }>();
function allowOrderLookup(sessionId: string | null | undefined): boolean {
  const key = sessionId || "anon";
  const now = Date.now();
  const rec = orderAttempts.get(key);
  if (!rec || now > rec.resetAt) {
    orderAttempts.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return true;
  }
  if (rec.count >= 5) return false;
  rec.count += 1;
  return true;
}

/**
 * Cek status pesanan dengan verifikasi nomor HP. Sengaja hanya mengembalikan status &
 * resi — TIDAK alamat/nama — supaya data pribadi tidak bocor lewat chat.
 */
async function cekStatusPesanan(args: Record<string, unknown>, sessionId?: string | null): Promise<ChatToolResult> {
  const orderNo = sanitize(args.nomor_pesanan, 40).toUpperCase().replace(/\s/g, "");
  const phone = digits(args.no_hp);

  if (!orderNo || !phone) {
    return { text: "Untuk cek pesanan, butuh nomor pesanan DAN nomor HP yang dipakai saat memesan." };
  }
  if (!allowOrderLookup(sessionId)) {
    return { text: "Terlalu banyak percobaan cek pesanan. Minta pelanggan mencoba lagi nanti atau menghubungi admin." };
  }

  const admin = getSupabaseAdmin();
  const { data: order, error } = await admin
    .from("orders")
    .select("order_number, status, customer_whatsapp, awb_no, shipping_method")
    .eq("order_number", orderNo)
    .maybeSingle();

  if (error) {
    console.error("[CHAT-TOOL] cek_status_pesanan error:", error.message);
    return { text: "Gagal mengambil data pesanan. Arahkan pelanggan ke admin." };
  }
  if (!order) {
    return { text: `Pesanan "${orderNo}" tidak ditemukan. Minta pelanggan memastikan nomor pesanannya.` };
  }

  // Cocokkan 9 digit terakhir — nomor Indonesia sering ditulis beda prefix (08… / 62… / +62…).
  const tail = (s: string) => s.slice(-9);
  const orderPhone = digits(order.customer_whatsapp);
  if (!orderPhone || tail(orderPhone) !== tail(phone)) {
    return { text: "Nomor HP tidak cocok dengan pesanan tersebut. Minta pelanggan memakai nomor yang dipakai saat memesan." };
  }

  const label = STATUS_LABEL[order.status as string] || (order.status as string);
  const parts = [`Pesanan ${order.order_number} statusnya: ${label}.`];
  // Resi bisa sudah terbit lebih awal (admin "Atur Pesanan" membuat AWB saat status diproses),
  // jadi tampilkan kapan pun nomor resinya ada — bukan hanya saat status "dikirim".
  if (order.awb_no) {
    parts.push(`Nomor resi (${order.shipping_method || "ekspedisi"}): ${order.awb_no}.`);
  }
  if (order.status === "pending") {
    parts.push("Masih menunggu pembayaran; kalau sudah transfer, kirim bukti ke admin lewat WhatsApp.");
  }
  return { text: parts.join(" ") };
}

/**
 * Teruskan percakapan ke admin lewat WhatsApp (Fonnte). Notifikasi memuat ringkasan,
 * nomor WhatsApp pelanggan (bila ada), dan transkrip percakapan terakhir dari route.
 */
async function hubungiAdmin(args: Record<string, unknown>, ctx: ChatToolContext): Promise<ChatToolResult> {
  const ringkasan = sanitize(args.ringkasan, 500);
  const noHp = digits(args.no_hp);
  if (!ringkasan) {
    return { text: "Butuh ringkasan singkat supaya bisa diteruskan ke admin." };
  }

  const config = await getFonnteConfig();
  if (!config.enabled || !config.token) {
    return { text: "Kanal WhatsApp admin belum aktif. Minta pelanggan menghubungi admin lewat nomor toko." };
  }

  const target = await resolveAdminTargets(config.adminNumber);
  if (!target) {
    return { text: "Nomor admin belum diatur. Minta pelanggan menghubungi admin lewat nomor toko." };
  }

  const lines = [
    "\u{1F514} *PERMINTAAN ADMIN \u2014 Live Chat SAMAQU*",
    "",
    `Ringkasan: ${ringkasan}`,
    `No. WhatsApp pelanggan: ${noHp || "(belum diberikan)"}`,
  ];
  if (ctx.transcript) lines.push("", "Percakapan terakhir:", ctx.transcript);

  const ok = await sendFonnteMessage(config.token, target, lines.join("\n"));
  return {
    text: ok
      ? "Percakapan sudah diteruskan ke admin. Beri tahu pelanggan bahwa admin akan segera menghubungi."
      : "Gagal meneruskan ke admin. Minta pelanggan menghubungi admin lewat WhatsApp toko.",
  };
}

/**
 * Penjelasan + foto series dari Product Knowledge Academy.
 *
 * Sumbernya `content_items` type `product` kategori "Product Series" (bukan katalog
 * Samaqu), karena foto resmi per series diunggah admin di sana. Tanpa env Academy,
 * tool mengarahkan pelanggan ke admin.
 */
async function infoSeries(args: Record<string, unknown>): Promise<ChatToolResult> {
  const base = String(process.env.ACADEMY_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(process.env.ACADEMY_SERVICE_ROLE_KEY || "");
  if (!base || !key) {
    return { text: "Data series belum tersedia di server. Arahkan pelanggan ke admin." };
  }

  const res = await fetch(
    `${base}/rest/v1/content_items?select=data&type=eq.product&data->>category=eq.Product%20Series`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" },
  );
  if (!res.ok) {
    console.error("[CHAT-TOOL] info_series gagal:", res.status);
    return { text: "Gagal mengambil data series. Arahkan pelanggan ke admin." };
  }
  const rows = (await res.json().catch(() => [])) as Array<{ data?: Record<string, unknown> }>;
  const all = rows
    .map((row) => row?.data)
    .filter((data): data is Record<string, unknown> => Boolean(data && data.name));
  if (!all.length) {
    return { text: "Data series belum tersedia. Arahkan pelanggan ke admin." };
  }

  const wanted = String(args.series || "").trim().toLowerCase();
  const picked = wanted
    ? all.filter((data) => {
        const name = String(data.name || "").toLowerCase();
        return name.includes(wanted) || wanted.includes(name);
      })
    : all;
  if (!picked.length) {
    return {
      text: `Series "${args.series}" tidak ditemukan. Series yang ada: ${all
        .map((data) => String(data.name || ""))
        .join(", ")}.`,
    };
  }

  const text = picked
    .map((data) =>
      [
        `**${String(data.name || "")}**`,
        data.collar ? `Kerah: ${String(data.collar)}` : "",
        data.placket ? `Placket: ${String(data.placket)}` : "",
        data.description ? `Deskripsi: ${String(data.description)}` : "",
        data.characteristics ? `Ciri: ${String(data.characteristics).replace(/\n/g, "; ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

  const images = [...new Set(picked.map((data) => String(data.image || "").trim()))]
    .filter((url) => /^https:\/\//i.test(url))
    .slice(0, 5);

  return { text, images };
}

/** Konteks opsional dari route (sessionId untuk pembatas percobaan, transcript untuk eskalasi). */
export interface ChatToolContext {
  sessionId?: string | null;
  /** Cuplikan percakapan terakhir, disusun route untuk lampiran eskalasi. */
  transcript?: string;
}

/** Jalankan tool berdasarkan nama & argumen JSON dari model. */
export async function executeChatTool(
  name: string,
  argsJson: string,
  ctx: ChatToolContext = {}
): Promise<ChatToolResult> {
  let args: Record<string, unknown> = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    args = {};
  }

  try {
    switch (name) {
      case "cari_produk":
        return await cariProduk(args);
      case "info_series":
        return await infoSeries(args);
      case "panduan_ukuran":
        return panduanUkuran(args);
      case "cari_area_ongkir":
        return cariAreaOngkir(args);
      case "cek_ongkir":
        return await cekOngkir(args);
      case "cek_status_pesanan":
        return await cekStatusPesanan(args, ctx.sessionId);
      case "hubungi_admin":
        return await hubungiAdmin(args, ctx);
      default:
        return { text: `Tool "${name}" tidak dikenali.` };
    }
  } catch (e) {
    console.error("[CHAT-TOOL] gagal menjalankan", name, e);
    return { text: "Terjadi kesalahan saat mengambil data. Arahkan pelanggan ke admin." };
  }
}

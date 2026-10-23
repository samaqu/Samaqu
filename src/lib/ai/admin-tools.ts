/**
 * Tool READ-ONLY untuk asisten AI admin.
 *
 * Aturan modul ini:
 *  - TERPISAH TOTAL dari `chat-tools.ts` (punya customer). Jangan pernah menambahkan tool
 *    internal ke `CHAT_TOOLS` — route customer itu publik.
 *  - TIDAK ada operasi tulis: hanya `select`. Tidak ada RPC, tidak ada SQL mentah, tidak ada
 *    akses tabel bebas dari model — setiap tool punya query tetap dengan kolom terpilih.
 *  - Semua perhitungan memakai helper operasional yang sudah ada (`resolveStock`, `isSaleOrder`,
 *    `rankTopProducts`, `orderStage`, `shippingLine`, `taskState`, `jakartaMonthBounds`, dst)
 *    supaya angka asisten = angka dashboard, bukan definisi kedua.
 *  - Kolom sensitif (nomor HP, alamat) tidak pernah diambil mentah-mentah; nomor HP disamarkan.
 *
 * Server-only.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { stockStatus } from "@/lib/ops-auth";
import { resolveStock } from "@/lib/ops-stock";
import { rankTopProducts, isSaleOrder } from "@/lib/top-products";
import { SALE_STATUSES, STATUS_LABEL as ORDER_STATUS_LABEL, statusLabel, orderSourceLabel, itemSummary, orderRevenue } from "@/lib/transaksi";
import {
  ORDER_STAGE_LABEL,
  orderStage,
  shippingLine,
  SHIPPING_STATUS_LABEL,
  type OrderStage,
} from "@/lib/order-flow";
import {
  jakartaDayBounds,
  jakartaMonthBounds,
  fmtWibDateTime,
  taskState,
  OUTCOMES,
  STATUS_LABEL as LEAD_STATUS_LABEL,
  type FollowupStatus,
} from "@/lib/ops-followup";

export interface AdminToolResult {
  text: string;
}

/* ───────────────────────── utilitas kecil ───────────────────────── */

/** Buang karakter yang bisa merusak sintaks filter Supabase, batasi panjang. */
function clean(value: unknown, max = 60): string {
  return String(value ?? "")
    .replace(/[%(),]/g, " ")
    .trim()
    .slice(0, max);
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function rupiah(value: number): string {
  return `Rp ${value.toLocaleString("id-ID")}`;
}

/** Samarkan nomor HP/kontak: sisakan awalan & 2 digit akhir. */
function maskContact(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "-";
  const digits = s.replace(/\D/g, "");
  if (digits.length < 6) return s; // username IG dsb. — bukan nomor
  return `${digits.slice(0, 4)}•••${digits.slice(-2)}`;
}

/** Tanggal singkat WIB, mis. "12 Okt 2026". */
const WIB_DATE = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
  year: "numeric",
});
function wibDate(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : WIB_DATE.format(d);
}

const TASK_STATE_LABEL = {
  terlambat: "terlambat",
  hari_ini: "hari ini",
  mendatang: "mendatang",
  nonaktif: "nonaktif",
} as const;

const OUTCOME_LABEL: Record<string, string> = Object.fromEntries(OUTCOMES.map((o) => [o.code, o.label]));

/** Label → kunci status pesanan (model boleh mengirim label Indonesia). */
function orderStatusKey(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  for (const [key, label] of Object.entries(ORDER_STATUS_LABEL)) {
    if (key === lower || label.toLowerCase() === lower) return key;
  }
  const stage = Object.entries(ORDER_STAGE_LABEL).find(([, label]) => label.toLowerCase() === lower);
  if (stage) {
    // Tahap → status tersimpan. Tahap packing & "Belum Bayar" bukan kolom status di database.
    const map: Record<OrderStage, string | null> = {
      belum_bayar: "pending",
      belum_dipacking: "diproses",
      sudah_dipacking: "diproses",
      dikirim: "dikirim",
      selesai: "selesai",
      dibatalkan: "dibatalkan",
    };
    return map[stage[0] as OrderStage];
  }
  return null;
}

/** Kunci status lead dari label ("Dijadwalkan" → "dijadwalkan"). */
function leadStatusKey(value: unknown): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw in LEAD_STATUS_LABEL) return raw;
  const hit = Object.entries(LEAD_STATUS_LABEL).find(([, label]) => label.toLowerCase() === raw);
  return hit ? hit[0] : null;
}

/** Aturan lead aktif — SAMA dengan /api/ops/dashboard (jangan bikin definisi baru). */
const ACTIVE_LEAD = "followup_status.eq.baru,followup_status.eq.dijadwalkan,followup_status.eq.dnd";

/* ─────────────────────────── skema tool ─────────────────────────── */

export const ADMIN_TOOLS = [
  {
    type: "function",
    function: {
      name: "ringkas_operasional",
      description:
         "Ringkasan operasional SAMAQU: omset & jumlah pesanan pada satu PERIODE (hari ini, 7 hari terakhir, bulan ini, bulan lalu, atau tanggal/bulan tertentu), produk terlaris, kondisi stok, dan kondisi leads/follow-up. Pakai untuk pertanyaan seperti 'jumlah orderan hari ini', 'omset hari ini', 'omset bulan ini', 'bagaimana penjualan', 'apa yang perlu dikerjakan'. Untuk pertanyaan harian WAJIB isi periode 'hari_ini' (atau tanggal YYYY-MM-DD), jangan menjawab bahwa data harian tidak tersedia.",
      parameters: {
        type: "object",
        properties: {
          periode: {
            type: "string",
            description: "hari_ini, 7_hari, bulan_ini (default), atau bulan_lalu.",
          },
          tanggal: {
            type: "string",
            description: "Satu hari tertentu, format YYYY-MM-DD (mis. '2026-10-17'). Kalau diisi, periode diabaikan.",
          },
          bulan: {
            type: "string",
            description: "Bulan yang diminta, format YYYY-MM (mis. '2026-10'). Kosongkan untuk bulan berjalan WIB.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cari_transaksi",
      description:
        "Cari pesanan/transaksi. Bisa disaring dengan kata kunci (nomor pesanan, nama pelanggan, atau sebagian nomor HP), status, dan bulan. Pakai untuk pertanyaan soal pesanan tertentu atau daftar pesanan.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Nomor pesanan / nama pelanggan / sebagian nomor HP." },
          status: {
            type: "string",
            description: "Filter status: Belum Bayar, Lunas, Dikirim, Selesai, Dibatalkan (opsional).",
          },
          bulan: { type: "string", description: "Bulan pesanan dibuat, format YYYY-MM (opsional)." },
          tanggal: {
            type: "string",
            description: "Satu hari pesanan dibuat, format YYYY-MM-DD (mis. '2026-10-17') — dipakai untuk pertanyaan harian.",
          },
          limit: { type: "number", description: "Jumlah maksimum baris (1-15, default 8)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "status_pesanan_resi",
      description:
        "Detail satu pesanan: tahap pesanan, status pengiriman, kurir, nomor resi, dan ringkasan item. Pakai kalau ditanya status/kirim/resi pesanan tertentu (butuh nomor pesanan).",
      parameters: {
        type: "object",
        properties: {
          nomor_pesanan: { type: "string", description: "Nomor pesanan, mis. SMQ-20260815-123." },
        },
        required: ["nomor_pesanan"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cari_lead",
      description:
        "Cari lead/follow-up beserta status dan jadwalnya. Pakai untuk pertanyaan soal leads, prospek, follow-up hari ini/terlambat, atau PIC.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Kata kunci kontak atau produk (opsional)." },
          status: { type: "string", description: "Filter status lead: Baru, Dijadwalkan, Selesai, Closed / Lost, Jangan dihubungi (opsional)." },
          limit: { type: "number", description: "Jumlah maksimum baris (1-15, default 8)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "stok_kritis",
      description:
        "Daftar produk dengan stok efektif menipis atau habis (memakai aturan stok bersama series). Pakai untuk pertanyaan stok, restock, atau produk yang perlu ditambah.",
      parameters: {
        type: "object",
        properties: {
          kategori: { type: "string", description: "Filter kategori produk, mis. 'Thobe' (opsional)." },
          limit: { type: "number", description: "Jumlah maksimum baris (1-20, default 10)." },
        },
      },
    },
  },
] as const;

/* ─────────────────────────── implementasi ─────────────────────────── */

/**
 * Rentang waktu (WIB) untuk tool operasional — supaya pertanyaan HARIAN bisa dijawab, bukan
 * cuma bulanan:
 *  - `tanggal` (YYYY-MM-DD) → satu hari tertentu;
 *  - `periode: "hari_ini"` → hari ini;
 *  - `periode: "7_hari"`   → 7 hari terakhir termasuk hari ini;
 *  - `periode: "bulan_lalu"` → bulan sebelumnya;
 *  - selain itu → `bulan` (YYYY-MM) atau bulan berjalan.
 */
function periodeRange(args: Record<string, unknown>): { startIso: string; endIso: string; label: string } {
  const tanggal = typeof args.tanggal === "string" ? args.tanggal.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    const mulai = new Date(`${tanggal}T00:00:00+07:00`);
    if (!Number.isNaN(mulai.getTime())) {
      return {
        startIso: mulai.toISOString(),
        endIso: new Date(mulai.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        label: WIB_DATE.format(mulai),
      };
    }
  }

  const periode = String(args.periode || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (periode === "hari_ini") {
    const hari = jakartaDayBounds();
    return { startIso: hari.startIso, endIso: hari.endIso, label: `hari ini, ${WIB_DATE.format(new Date())}` };
  }
  if (periode === "7_hari") {
    const hari = jakartaDayBounds();
    const mulai = new Date(new Date(hari.endIso).getTime() - 7 * 24 * 60 * 60 * 1000);
    return { startIso: mulai.toISOString(), endIso: hari.endIso, label: "7 hari terakhir" };
  }
  if (periode === "bulan_lalu") {
    const wibSekarang = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const lalu = new Date(Date.UTC(wibSekarang.getUTCFullYear(), wibSekarang.getUTCMonth() - 1, 1));
    const yyyymm = `${lalu.getUTCFullYear()}-${String(lalu.getUTCMonth() + 1).padStart(2, "0")}`;
    return jakartaMonthBounds(yyyymm);
  }

  return jakartaMonthBounds(typeof args.bulan === "string" ? args.bulan : null);
}

async function ringkasOperasional(args: Record<string, unknown>): Promise<AdminToolResult> {
  const admin = getSupabaseAdmin();
  const periode = periodeRange(args);
  const { startIso, endIso } = jakartaDayBounds();

  const countLeads = async (build: (q: any) => any) => {
    const { count } = await build(admin.from("leads").select("id", { count: "exact", head: true }));
    return count || 0;
  };

  const [ordersRes, variantsRes, productsRes, leadTotal, leadBaru, leadHariIni, leadTerlambat, leadUnscheduled, todayTasks] =
    await Promise.all([
      admin.from("orders").select("id, status, total, shipping_cost, created_at").gte("created_at", periode.startIso).lt("created_at", periode.endIso),
      admin.from("product_variants").select("product_id, stock, base_product_id"),
      admin.from("products").select("id, product_type, name, category, series"),
      countLeads((q) => q),
      countLeads((q) => q.gte("created_at", startIso)),
      countLeads((q) => q.is("do_not_contact", false).gte("next_followup_at", startIso).lt("next_followup_at", endIso).or(ACTIVE_LEAD)),
      countLeads((q) => q.is("do_not_contact", false).not("next_followup_at", "is", null).lt("next_followup_at", startIso).or(ACTIVE_LEAD)),
      countLeads((q) => q.is("do_not_contact", false).is("next_followup_at", null).or(ACTIVE_LEAD)),
      admin
        .from("leads")
        .select("id, kontak, produk, pic, next_followup_at, followup_status, outcome, do_not_contact")
        .is("do_not_contact", false)
        .gte("next_followup_at", startIso)
        .lt("next_followup_at", endIso)
        .or(ACTIVE_LEAD)
        .order("next_followup_at", { ascending: true })
        .limit(5),
    ]);

  if (ordersRes.error) {
    console.error("[AI-ADMIN-TOOL] ringkas_operasional orders:", ordersRes.error.message);
    return { text: "Gagal mengambil data pesanan. Coba lagi." };
  }

  const orders = (ordersRes.data || []) as Array<{ id: string; status: string; total: number | null; shipping_cost: number | null; created_at: string }>;
  const valid = orders.filter((o) => SALE_STATUSES.includes(String(o.status || "").toLowerCase()));
  const omset = valid.reduce((s, o) => s + orderRevenue(o), 0);

  // Sebaran per tahap (memakai aturan tahap yang sama dengan daftar Transaksi).
  const perTahap = new Map<string, number>();
  for (const o of orders) {
    const label = ORDER_STAGE_LABEL[orderStage(o)];
    perTahap.set(label, (perTahap.get(label) || 0) + 1);
  }

  // Produk terlaris bulan terpilih — fungsi pusat yang sama dengan dashboard.
  let topLines: string[] = [];
  if (valid.length > 0 && valid.length <= 800) {
    const validIds = valid.map((o) => o.id);
    const { data: items, error: itemsError } = await admin.from("order_items").select("*").in("order_id", validIds);
    if (!itemsError) {
      const saleItems = (items || []) as any[];
      const products = ((productsRes.data || []) as any[]).map((p) => ({
        id: p.id,
        product_type: p.product_type,
      }));
      const top = rankTopProducts({ orders: orders.map((o) => ({ id: o.id, status: o.status, created_at: o.created_at })), items: saleItems, products, limit: 5 });
      topLines = top.map((t) => `- ${t.name}${t.sub ? ` (${t.sub})` : ""}: ${t.units} unit · ${rupiah(t.revenue)}`);
    }
  }

  // Stok memakai resolver bersama (produk series menumpang stok basisnya).
  const { effectiveTotal } = resolveStock((variantsRes.data || []) as any);
  const totals = Object.values(effectiveTotal);
  const totalUnit = totals.reduce((a, b) => a + b, 0);
  const varianHabis = totals.filter((n) => n === 0).length;
  const varianMenipis = totals.filter((n) => n > 0 && n <= 5).length;

  const tasks = (todayTasks.data || []) as any[];
  const taskLines = tasks
    .filter((l) => taskState(l) !== "nonaktif")
    .map(
      (l) =>
        `- ${maskContact(l.kontak)} · ${String(l.produk || "-")} · ${fmtWibDateTime(l.next_followup_at)} · PIC ${String(l.pic || "belum diatur")}`
    );

  const lines: string[] = [
    `Periode: ${periode.label} (WIB).`,
    "",
    "PENJUALAN",
    `- Omset (pesanan lunas): ${rupiah(omset)} dari ${valid.length} transaksi${valid.length ? ` · rata-rata ${rupiah(Math.round(omset / valid.length))}` : ""}`,
    `- Total pesanan periode ini: ${orders.length}`,
    ...[...perTahap.entries()].map(([label, n]) => `  · ${label}: ${n}`),
    "",
    "STOK",
    `- Total unit tersedia: ${totalUnit.toLocaleString("id-ID")}`,
    `- Produk stok habis: ${varianHabis} · menipis (≤5): ${varianMenipis}`,
    "",
    "LEADS / FOLLOW-UP",
    `- Total lead: ${leadTotal} · baru hari ini: ${leadBaru}`,
    `- Jadwal follow-up hari ini: ${leadHariIni} · terlambat: ${leadTerlambat} · belum dijadwalkan: ${leadUnscheduled}`,
  ];

  if (taskLines.length) lines.push("", "TUGAS HARI INI (maks 5)", ...taskLines);
  if (topLines.length) lines.push("", `PRODUK TERLARIS (${periode.label.toUpperCase()}, unit)`, ...topLines);

  return { text: lines.join("\n") };
}

async function cariTransaksi(args: Record<string, unknown>): Promise<AdminToolResult> {
  const admin = getSupabaseAdmin();
  const term = clean(args.query);
  const statusKey = orderStatusKey(args.status);
  const limit = clampInt(args.limit, 8, 1, 15);
  const bulan = typeof args.bulan === "string" && args.bulan.trim() ? jakartaMonthBounds(args.bulan) : null;
  // Filter per HARI — dipakai untuk pertanyaan "pesanan tanggal 17 Oktober" dsb.
  const tanggalDiminta = typeof args.tanggal === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.tanggal.trim());

  let query = admin
    .from("orders")
    .select("order_number, customer_name, customer_whatsapp, status, total, created_at, source, shipping_method, awb_no, shipping_status")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (tanggalDiminta) {
    const rentang = periodeRange(args);
    query = query.gte("created_at", rentang.startIso).lt("created_at", rentang.endIso);
  } else if (bulan) {
    query = query.gte("created_at", bulan.startIso).lt("created_at", bulan.endIso);
  }
  if (statusKey) query = query.eq("status", statusKey);
  if (term) {
    const digits = term.replace(/\D/g, "");
    const parts = [`order_number.ilike.%${term}%`, `customer_name.ilike.%${term}%`];
    if (digits.length >= 4) parts.push(`customer_whatsapp.ilike.%${digits}%`);
    query = query.or(parts.join(","));
  }

  const { data, error } = await query;
  if (error) {
    console.error("[AI-ADMIN-TOOL] cari_transaksi:", error.message);
    return { text: "Gagal mengambil data transaksi. Coba lagi." };
  }

  const rows = (data || []) as any[];
  if (!rows.length) {
    const ket = [term ? `kata kunci "${term}"` : null, args.status ? `status ${String(args.status)}` : null, bulan ? `bulan ${bulan.label}` : null]
      .filter(Boolean)
      .join(", ");
    return { text: `Tidak ada pesanan yang cocok${ket ? ` (${ket})` : ""}.` };
  }

  const lines = rows.map((o) => {
    const ship = shippingLine(o);
    return `- ${o.order_number} · ${wibDate(o.created_at)} · ${String(o.customer_name || "-")} (${maskContact(o.customer_whatsapp)}) · ${rupiah(Number(o.total) || 0)} · ${statusLabel(o.status)} · ${orderSourceLabel(o)} · ${ship.courier}${ship.resi && ship.resi !== "Tanpa resi" ? ` (${ship.resi})` : ""}${ship.status ? ` · ${ship.status}` : ""}`;
  });

  return {
    text: `Ditemukan ${rows.length} pesanan${bulan ? ` pada ${bulan.label}` : ""}${args.status ? ` dengan status ${String(args.status)}` : ""}:\n${lines.join("\n")}`,
  };
}

async function statusPesananResi(args: Record<string, unknown>): Promise<AdminToolResult> {
  const admin = getSupabaseAdmin();
  const orderNo = clean(args.nomor_pesanan, 40).toUpperCase().replace(/\s/g, "");
  if (!orderNo) return { text: "Butuh nomor pesanan untuk memeriksa status & resi." };

  const { data, error } = await admin
    .from("orders")
    .select(
      "order_number, customer_name, status, shipping_status, shipping_method, awb_no, total, created_at, source, order_items(series, kain, product_name, quantity)"
    )
    .eq("order_number", orderNo)
    .maybeSingle();

  if (error) {
    console.error("[AI-ADMIN-TOOL] status_pesanan_resi:", error.message);
    return { text: "Gagal mengambil data pesanan. Coba lagi." };
  }
  if (!data) return { text: `Pesanan "${orderNo}" tidak ditemukan.` };

  const order = data as any;
  const ship = shippingLine(order);
  const items = Array.isArray(order.order_items) ? order.order_items : [];

  const lines = [
    `Pesanan ${order.order_number} (${wibDate(order.created_at)}, sumber ${orderSourceLabel(order)})`,
    `- Pelanggan: ${String(order.customer_name || "-")}`,
    `- Tahap pesanan: ${ORDER_STAGE_LABEL[orderStage(order)]} (status tersimpan: ${statusLabel(order.status)})`,
    `- Nilai: ${rupiah(Number(order.total) || 0)}`,
    `- Item: ${itemSummary(items)}`,
    `- Pengiriman: ${ship.courier} · resi ${ship.resi}${ship.status ? ` · ${ship.status}` : ""}${ship.awaiting ? " (res belum dibuat, menunggu diproses admin)" : ""}`,
  ];
  if (order.status === "dibatalkan") lines.push("- Pesanan dibatalkan: tidak ada progres pengiriman.");

  return { text: lines.join("\n") };
}

async function cariLead(args: Record<string, unknown>): Promise<AdminToolResult> {
  const admin = getSupabaseAdmin();
  const term = clean(args.query);
  const statusKey = leadStatusKey(args.status);
  const limit = clampInt(args.limit, 8, 1, 15);

  let query = admin
    .from("leads")
    .select("kontak, produk, pic, sumber, followup_status, outcome, next_followup_at, do_not_contact, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (statusKey) query = query.eq("followup_status", statusKey);
  if (term) query = query.or(`kontak.ilike.%${term}%,produk.ilike.%${term}%`);

  const { data, error } = await query;
  if (error) {
    console.error("[AI-ADMIN-TOOL] cari_lead:", error.message);
    return { text: "Gagal mengambil data leads. Coba lagi." };
  }

  const rows = (data || []) as any[];
  if (!rows.length) {
    return { text: `Tidak ada lead yang cocok${term ? ` dengan kata kunci "${term}"` : ""}${args.status ? ` berstatus ${String(args.status)}` : ""}.` };
  }

  const lines = rows.map((l) => {
    const status = LEAD_STATUS_LABEL[(l.followup_status || "baru") as FollowupStatus] || String(l.followup_status || "-");
    const task = taskState(l);
    const outcome = l.outcome ? OUTCOME_LABEL[String(l.outcome)] || String(l.outcome) : null;
    return `- ${maskContact(l.kontak)} · ${String(l.produk || "-")} · ${status}${outcome ? ` · hasil: ${outcome}` : ""} · jadwal ${fmtWibDateTime(l.next_followup_at)} (${TASK_STATE_LABEL[task]}) · PIC ${String(l.pic || "belum diatur")}`;
  });

  return { text: `Ditemukan ${rows.length} lead:\n${lines.join("\n")}` };
}

/**
 * Batas panjang teks hasil tool yang dikirim ke model (R3).
 *
 * Tool bisa mengembalikan daftar panjang (mis. 15 pesanan). Tanpa batas, konteks membengkak
 * tiap putaran tool sehingga biaya naik dan jawaban melebar. Pemotongan dilakukan di batas
 * BARIS supaya struktur daftar tidak rusak, dan selalu diberi penanda "hasil dipotong"
 * supaya model tidak menyimpulkan daftar itu lengkap.
 */
export const MAX_TOOL_RESULT_CHARS = 4000;

export function capToolResult(text: string): string {
  const value = String(text ?? "");
  if (value.length <= MAX_TOOL_RESULT_CHARS) return value;

  // Penanda disiapkan lebih dulu lalu ruangnya dikurangi, supaya TOTAL hasil (data + penanda)
  // tetap ≤ batas — bukan cuma bagian datanya.
  const marker = `\n\n[HASIL DIPOTONG: daftar di atas TIDAK LENGKAP karena melebihi ${MAX_TOOL_RESULT_CHARS} karakter. Katakan kepada admin bahwa data yang ditampilkan tidak lengkap, lalu sarankan mempersempit pencarian (kata kunci/periode/jumlah) atau membuka menu terkait.]`;
  const room = Math.max(200, MAX_TOOL_RESULT_CHARS - marker.length);
  const cutAt = value.lastIndexOf("\n", room);
  const head = value.slice(0, cutAt > room * 0.6 ? cutAt : room);
  return `${head}${marker}`;
}

export interface StockProductRow {
  id: string;
  name?: string | null;
  category?: string | null;
  series?: string | null;
  is_published?: boolean | null;
}

export interface StockClassification {
  /** Produk dengan data stok dan stok efektif ≤ 5. */
  kritis: Array<{ product: StockProductRow; stok: number; status: "habis" | "menipis" }>;
  /** Produk tanpa baris varian sama sekali → stok TIDAK BOLEH dianggap 0/habis. */
  belumDiatur: StockProductRow[];
}

/**
 * Kelompokkan stok produk memakai definisi yang sama dengan dashboard: `resolveStock`.
 *
 * PENTING: produk yang tidak ada di `effectiveTotal` berarti BELUM punya baris
 * `product_variants` (atau hanya punya varian turunan). Sebelumnya nilai seperti ini
 * dianggap 0 sehingga muncul sebagai "HABIS" — padahal artinya "stok belum diatur"
 * (lihat R1 pada audit pra-produksi). Produk seperti itu dipisahkan, bukan dihitung habis.
 */
export function classifyStock(
  products: StockProductRow[],
  effectiveTotal: Record<string, number>,
  kategori?: string
): StockClassification {
  const kritis: StockClassification["kritis"] = [];
  const belumDiatur: StockProductRow[] = [];

  for (const product of products || []) {
    const id = String(product?.id ?? "");
    if (!id) continue;
    if (kategori && !String(product.category || "").toLowerCase().includes(kategori)) continue;

    if (!Object.prototype.hasOwnProperty.call(effectiveTotal, id)) {
      belumDiatur.push(product);
      continue;
    }

    const stok = Number(effectiveTotal[id]) || 0;
    if (stok <= 5) {
      kritis.push({ product, stok, status: stockStatus(stok) === "habis" ? "habis" : "menipis" });
    }
  }

  kritis.sort((a, b) => a.stok - b.stok || String(a.product.name || "").localeCompare(String(b.product.name || "")));
  belumDiatur.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  return { kritis, belumDiatur };
}

async function stokKritis(args: Record<string, unknown>): Promise<AdminToolResult> {
  const admin = getSupabaseAdmin();
  const limit = clampInt(args.limit, 10, 1, 20);
  const kategori = clean(args.kategori).toLowerCase();

  const [variantsRes, productsRes] = await Promise.all([
    admin.from("product_variants").select("product_id, stock, base_product_id"),
    admin.from("products").select("id, name, category, series, is_published"),
  ]);

  if (variantsRes.error || productsRes.error) {
    console.error("[AI-ADMIN-TOOL] stok_kritis:", variantsRes.error?.message || productsRes.error?.message);
    return { text: "Gagal mengambil data stok. Coba lagi." };
  }

  const { effectiveTotal } = resolveStock((variantsRes.data || []) as any);
  const { kritis, belumDiatur } = classifyStock((productsRes.data || []) as any, effectiveTotal, kategori);

  const scope = kategori ? ` kategori "${kategori}"` : "";
  const lines: string[] = [];

  const habis = kritis.filter((r) => r.status === "habis").length;
  const menipis = kritis.length - habis;

  if (kritis.length) {
    lines.push(
      `${kritis.length} produk${scope} perlu perhatian stok (${habis} habis, ${menipis} menipis) — memakai aturan stok bersama series:`
    );
    lines.push(
      ...kritis
        .slice(0, limit)
        .map(
          (r) =>
            `- ${String(r.product.name || "-")} [${String(r.product.category || "-")}${r.product.series ? ` · ${r.product.series}` : ""}] · stok efektif ${r.stok} · ${r.status === "habis" ? "HABIS" : "menipis"}${r.product.is_published === false ? " · belum dipublikasikan" : ""}`
        )
    );
    if (kritis.length > limit) lines.push(`(+${kritis.length - limit} produk lain tidak ditampilkan; naikkan "limit" bila perlu)`);
  } else {
    lines.push(`Tidak ada produk${scope} dengan stok menipis/habis (≤5) saat ini.`);
  }

  // Dipisah supaya tidak terbaca sebagai "habis": stok belum diatur ≠ stok nol.
  if (belumDiatur.length) {
    lines.push(
      "",
      `${belumDiatur.length} produk${scope} belum punya data stok (belum ada varian/ukuran): status "Stok belum diatur" — BUKAN habis.`
    );
    lines.push(...belumDiatur.slice(0, 5).map((p) => `- ${String(p.name || "-")} [${String(p.category || "-")}] · Stok belum diatur`));
    if (belumDiatur.length > 5) lines.push(`(+${belumDiatur.length - 5} produk lain belum diatur)`);
  }

  return { text: lines.join("\n") };
}

/* ───────────────────────────── dispatcher ───────────────────────────── */

/** Jalankan tool read-only berdasarkan nama & argumen JSON dari model. */
export async function executeAdminTool(name: string, argsJson: string): Promise<AdminToolResult> {
  let args: Record<string, unknown> = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    args = {};
  }

  try {
    let result: AdminToolResult;
    switch (name) {
      case "ringkas_operasional":
        result = await ringkasOperasional(args);
        break;
      case "cari_transaksi":
        result = await cariTransaksi(args);
        break;
      case "status_pesanan_resi":
        result = await statusPesananResi(args);
        break;
      case "cari_lead":
        result = await cariLead(args);
        break;
      case "stok_kritis":
        result = await stokKritis(args);
        break;
      default:
        return { text: `Tool "${name}" tidak dikenali.` };
    }
    // R3: semua hasil tool dipotong (batas baris + penanda) sebelum masuk konteks model,
    // di satu tempat supaya tool baru otomatis ikut dibatasi.
    return { text: capToolResult(result.text) };
  } catch (e) {
    console.error("[AI-ADMIN-TOOL] gagal menjalankan", name, e);
    return { text: "Terjadi kesalahan saat mengambil data. Coba lagi." };
  }
}

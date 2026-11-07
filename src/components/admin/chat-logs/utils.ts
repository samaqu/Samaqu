import type { ChatLog, ProductInfo, SessionGroup, StatusTone } from "./types";

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function dateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dateLabel(iso: string): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const key = dateKey(iso);
  if (key === dateKey(today.toISOString())) return "Hari Ini";
  if (key === dateKey(yesterday.toISOString())) return "Kemarin";

  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return key;
  }
}

export function initialOf(name: string | null | undefined): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "P";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

export function waDigits(phone: string | null | undefined): string {
  return String(phone || "")
    .replace(/\D/g, "")
    .replace(/^0/, "62");
}

export function formatRupiah(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}

export function groupSessions(logs: ChatLog[]): SessionGroup[] {
  const map = new Map<string, ChatLog[]>();
  for (const log of logs) {
    const key = log.session_id || `single-${log.id}`;
    const list = map.get(key) || [];
    list.push(log);
    map.set(key, list);
  }

  return [...map.entries()]
    .map(([key, items]) => {
      const sorted = [...items].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const latest = sorted[sorted.length - 1];
      const name = [...sorted].reverse().find((item) => item.customer_name)?.customer_name || null;
      const phone = [...sorted].reverse().find((item) => item.customer_phone)?.customer_phone || null;
      return {
        key,
        items: sorted,
        name,
        phone,
        firstAt: sorted[0]?.created_at || latest.created_at,
        lastAt: latest.created_at,
        escalated: sorted.some((item) => item.escalated === true),
        errors: sorted.filter((item) => !!item.error).length,
      };
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export function groupSessionsByDate(sessions: SessionGroup[]): { label: string; sessions: SessionGroup[] }[] {
  const map = new Map<string, SessionGroup[]>();
  for (const session of sessions) {
    const label = dateLabel(session.lastAt);
    const list = map.get(label) || [];
    list.push(session);
    map.set(label, list);
  }
  return [...map.entries()].map(([label, items]) => ({ label, sessions: items }));
}

export function groupLogsByDate(items: ChatLog[]): { label: string; items: ChatLog[] }[] {
  const map = new Map<string, ChatLog[]>();
  for (const item of items) {
    const label = dateLabel(item.created_at);
    const list = map.get(label) || [];
    list.push(item);
    map.set(label, list);
  }
  return [...map.entries()].map(([label, logs]) => ({ label, items: logs }));
}

export function statusOfLog(log: ChatLog): StatusTone {
  if (log.error) return "failed";
  if (log.escalated) return "escalated";
  return "answered";
}

export function statusOfSession(session: SessionGroup): StatusTone {
  if (session.escalated) return "escalated";
  if (session.errors > 0) return "failed";
  return "answered";
}

const TOOL_LABELS: Record<string, string> = {
  cari_produk: "Cek produk",
  panduan_ukuran: "Panduan ukuran",
  cek_status_pesanan: "Cek pesanan",
  hubungi_admin: "Teruskan admin",
  cek_ongkir: "Cek ongkir",
  cari_area_ongkir: "Cari area",
};

export function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] || tool;
}

const PRODUCT_WORD = /\b(Thobe|Kandora|Koko|Vest|Kabak)\b/i;
const KNOWN_SERIES = ["Jiharkah", "Imron", "Bayati", "Nahawand", "Karim", "Imalah"];
const SERIES_RE = new RegExp(`\\b(${KNOWN_SERIES.join("|")})\\b`, "i");

/**
 * Ambil produk yang dibahas dari teks jawaban AI.
 * Catatan: `chat_logs` belum menyimpan hasil tool `cari_produk` secara terstruktur,
 * jadi kartu hanya muncul kalau jawaban memuat nama produk + harga/series.
 */
export function extractProducts(items: ChatLog[]): ProductInfo[] {
  const out: ProductInfo[] = [];
  const seen = new Set<string>();

  for (const log of items) {
    const answer = log.answer || "";
    if (!answer) continue;
    const usedProductTool = (log.tools_used || []).includes("cari_produk");
    if (!usedProductTool && !PRODUCT_WORD.test(answer)) continue;

    for (const rawLine of answer.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (!/Rp\s?\d/i.test(line) && !PRODUCT_WORD.test(line)) continue;

      const bold = [...line.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1].trim());
      let name = bold.find(
        (value) =>
          PRODUCT_WORD.test(value) &&
          !KNOWN_SERIES.some((series) => series.toLowerCase() === value.toLowerCase()),
      );

      if (!name) {
        const match = line.match(/\b(Thobe|Kandora|Koko|Vest|Kabak)\s+([A-Za-z][A-Za-z ]{1,40})/i);
        if (match) name = `${match[1]} ${match[2]}`.trim();
      }
      if (!name) continue;

      name = name.replace(/[·|,–—-].*$/, "").trim();
      if (!name) continue;

      const priceMatch = line.match(/Rp\s?([\d.]+)/i);
      const price = priceMatch ? Number(priceMatch[1].replace(/\./g, "")) : null;
      const series = line.match(SERIES_RE)?.[1] || null;
      const kainMatch = line.match(/\bkain\s+([A-Za-z0-9/ .-]+?)(?:\s*[·|—,;-]|$)/i);
      const kain = kainMatch ? kainMatch[1].trim() : null;

      const key = `${name.toLowerCase()}|${(series || "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name,
        series,
        kain,
        price: Number.isFinite(price || NaN) ? price : null,
      });
      if (out.length >= 4) return out;
    }
  }

  return out;
}

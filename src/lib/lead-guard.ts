/**
 * Aturan kepemilikan lead (MURNI, tanpa dependensi server; dipakai tampilan dan server).
 *
 * Tiap lead punya PIC (kolom `leads.pic`, berisi nama depan admin, mis. "Lea", atau "Agent" untuk bot).
 *  - Owner dan Leader (akun manusia) boleh mengubah/menghapus SEMUA lead.
 *  - Admin biasa hanya boleh mengubah/menghapus lead yang PIC-nya dirinya sendiri.
 *  - Lead ber-PIC "Agent" atau kosong = urusan Owner/Leader (read-only untuk admin biasa).
 *  - Akun bot (`is_bot`) TIDAK pernah dianggap Owner walau perannya owner.
 * Daftar lead tetap tampil di semua akun; yang dikunci hanya ubah dan hapus.
 */

export interface LeadActor {
  /** Nama tampil di Tim Admin (`admins.display_name`), mis. "Lea Virani". */
  name: string;
  email: string;
  /** Peran ternormalisasi (owner | leader | admin | ...). */
  role: string;
  isBot?: boolean;
}

/** Owner atau Leader manusia: boleh mengelola semua lead. */
export function canManageAllLeads(actor: LeadActor): boolean {
  return !actor.isBot && (actor.role === "owner" || actor.role === "leader");
}

const norm = (v: string | null | undefined) => String(v ?? "").trim().toLowerCase();

/** Nama yang dianggap "diri sendiri" di kolom PIC: nama tampil, nama depan, email, dan bagian depan email. */
export function picAliases(actor: LeadActor): string[] {
  const full = norm(actor.name);
  const first = full.split(/\s+/)[0] || "";
  const email = norm(actor.email);
  return [...new Set([full, first, email, email.split("@")[0]].filter(Boolean))];
}

/** Nilai PIC yang dituliskan otomatis untuk lead baru: nama depan ("Lea Virani" -> "Lea"), sama dengan data lama. */
export function picValueFor(actor: LeadActor): string {
  const first = String(actor.name ?? "").trim().split(/\s+/)[0];
  return first || String(actor.email ?? "").split("@")[0] || "Admin";
}

/** PIC lead ini adalah akun tersebut? PIC kosong tidak pernah cocok dengan siapa pun. */
export function isOwnLead(actor: LeadActor, pic: string | null | undefined): boolean {
  const p = norm(pic);
  return p !== "" && picAliases(actor).includes(p);
}

export type LeadAccess = { ok: true } | { ok: false; message: string };

/** Boleh mengubah/menghapus lead dengan PIC ini? */
export function canModifyLead(actor: LeadActor, pic: string | null | undefined): LeadAccess {
  if (canManageAllLeads(actor)) return { ok: true };
  if (isOwnLead(actor, pic)) return { ok: true };
  const owner = String(pic ?? "").trim();
  return {
    ok: false,
    message: owner
      ? `Lead ini milik ${owner}, hanya bisa dilihat. Yang boleh mengubah atau menghapus: ${owner}, Owner, dan Leader.`
      : "Lead ini belum punya PIC, hanya Owner dan Leader yang boleh mengubah atau menghapusnya.",
  };
}

/* ───────────────────────────── riwayat perubahan ───────────────────────────── */

const LABELS: Record<string, string> = {
  tanggal: "Tanggal",
  jam: "Jam",
  kontak: "Kontak",
  sumber: "Sumber",
  status: "Status",
  nominal: "Nominal",
  catatan: "Catatan",
  produk: "Produk",
  pic: "PIC",
  next_followup_at: "Jadwal follow-up",
};

const STATUS_LABEL: Record<string, string> = { closing: "Closing", belum_closing: "Belum Closing" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function show(field: string, value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === "") return "(kosong)";
  if (field === "nominal") return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
  if (field === "status") return STATUS_LABEL[String(value)] || String(value);
  if (field === "next_followup_at") {
    const ms = Date.parse(String(value));
    if (!Number.isFinite(ms)) return String(value);
    const w = new Date(ms + 7 * 3600_000);
    const hh = String(w.getUTCHours()).padStart(2, "0");
    const mm = String(w.getUTCMinutes()).padStart(2, "0");
    return `${w.getUTCDate()} ${MONTHS[w.getUTCMonth()]} ${hh}.${mm}`;
  }
  const text = String(value).trim();
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function comparable(field: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (field === "nominal") return String(Number(value) || 0);
  if (field === "next_followup_at") {
    const ms = Date.parse(String(value));
    return Number.isFinite(ms) ? String(ms) : String(value);
  }
  return String(value).trim();
}

/** Daftar perubahan yang terbaca manusia, mis. ["Nominal: Rp 0 -> Rp 450.000", "PIC: Lea -> Agent"]. Kosong bila tidak ada yang berubah. */
export function describeLeadChanges(before: Record<string, unknown>, patch: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const field of Object.keys(LABELS)) {
    if (patch[field] === undefined) continue;
    if (comparable(field, before[field]) === comparable(field, patch[field])) continue;
    lines.push(`${LABELS[field]}: ${show(field, before[field])} -> ${show(field, patch[field])}`);
  }
  return lines;
}

/**
 * Label PIC chat di Inbox WA (murni, diuji).
 *  - Chat punya pemilik          → "PIC: nama".
 *  - Belum ada pemilik, menunggu → "Antrean (menunggu admin)".
 *  - Dijawab bot (tidak diambil alih admin, tidak menunggu, pesan terakhir dari kita) → "PIC: Bot".
 *  - Selain itu (mis. pesan pelanggan terakhir yang dilewati bot di jam kerja admin) → tidak ada label.
 * Hanya TAMPILAN: tidak ada pemilik palsu di database, jadi gembok PIC dan alur "membalas mengambil alih dari bot" tidak berubah.
 */

export interface PicLabelInput {
  owner?: { name: string } | null;
  pending: number;
  handover: boolean;
  lastFrom?: "customer" | "kita";
}

export function picLabel(c: PicLabelInput): { text: string; color: string } | null {
  if (c.owner) return { text: `PIC: ${c.owner.name}`, color: "#4338ca" };
  if (c.pending > 0) return { text: "Antrean (menunggu admin)", color: "#b45309" };
  if (!c.handover && c.lastFrom === "kita") return { text: "PIC: Bot", color: "#0f766e" };
  return null;
}

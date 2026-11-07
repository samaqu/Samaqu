import { normalizeKontak } from "@/lib/ops-followup";

/**
 * Metrik percakapan AI Performance Center.
 *
 * Semua angka dihitung dari percakapan UNIK per periode (satu nomor = satu
 * percakapan), bukan per pesan. Ditaruh di sini supaya route dan komponen tidak
 * masing-masing punya rumus sendiri — satu tempat untuk menambah metrik baru.
 */

export type EscalationRef = { sender?: string | null };

export type ConversationMetricInput = {
  /** Nomor pengirim semua pesan masuk pada periode (boleh duplikat). */
  senders: Array<string | null | undefined>;
  /** Jumlah pesan masuk pada periode. */
  messages: number;
  /** Baris `wa_escalations` yang dibuat ATAU dibalas pada periode. */
  escalations: EscalationRef[];
  /** Kontak semua lead baru pada periode. */
  leadContacts: Array<string | null | undefined>;
};

export type AiConversationMetrics = {
  conversations: number;
  messages: number;
  /** Percakapan unik yang tidak butuh admin. */
  aiHandled: number;
  /** Percakapan unik yang handover ke admin / pernah dibalas admin. */
  needsAdmin: number;
  /** Persentase `aiHandled` dari total percakapan (0–100, 1 desimal). */
  aiShare: number;
  /** Persentase `needsAdmin` dari total percakapan (0–100, 1 desimal). */
  needsAdminShare: number;
  /** Lead periode itu yang nomornya ada di percakapan WA periode itu. */
  leadsFromChat: number;
  totalLeads: number;
  /** Persentase `leadsFromChat` dari seluruh lead baru periode itu. */
  leadsFromChatShare: number;
};

/** Persentase 1 desimal; total 0 → 0 supaya tidak pernah NaN. */
export function shareOf(part: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.round((Math.max(0, part) / total) * 1000) / 10;
}

const senderKey = (value?: string | null) => normalizeKontak(value);

export function getAiConversationMetrics(
  input: ConversationMetricInput,
): AiConversationMetrics {
  const conversationKeys = new Set(
    input.senders.map(senderKey).filter((value): value is string => Boolean(value)),
  );

  // Handover dihitung sekali per nomor, walaupun eskalasinya berkali-kali.
  const needsAdminKeys = new Set<string>();
  for (const row of input.escalations) {
    const key = senderKey(row.sender);
    if (key && conversationKeys.has(key)) needsAdminKeys.add(key);
  }

  const leadKeys = input.leadContacts
    .map(senderKey)
    .filter((value): value is string => Boolean(value));

  const conversations = conversationKeys.size;
  const needsAdmin = needsAdminKeys.size;
  const aiHandled = Math.max(0, conversations - needsAdmin);
  const leadsFromChat = leadKeys.filter((value) => conversationKeys.has(value)).length;

  return {
    conversations,
    messages: input.messages,
    aiHandled,
    needsAdmin,
    aiShare: shareOf(aiHandled, conversations),
    needsAdminShare: shareOf(needsAdmin, conversations),
    leadsFromChat,
    totalLeads: leadKeys.length,
    leadsFromChatShare: shareOf(leadsFromChat, leadKeys.length),
  };
}

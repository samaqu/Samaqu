"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Loader2,
  MessageSquare,
  Pencil,
  RefreshCw,
  Send,
  ShoppingBag,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ops/ui/use-toast";
import DraftEditor from "./DraftEditor";

type Tab = "ai" | "transaksi";

type Message = {
  id: string;
  created_at: string;
  message: string | null;
  reply_text: string | null;
  status: string;
  media_url: string | null;
};

type Escalation = {
  id: string;
  inbox_id: string | null;
  sender: string;
  sender_name: string | null;
  customer_message: string | null;
  summary: string;
  reason: string | null;
  status: "open" | "claimed" | "answered" | "closed" | "skipped";
  instruction: string | null;
  instruction_scope: "customer" | "global";
  draft_reply: string | null;
  reply_text: string | null;
  replied_at: string | null;
  created_at: string;
  messages?: Message[];
};

type Draft = {
  id: string;
  status: string;
  customer_name: string | null;
  customer_whatsapp: string | null;
  proof_url: string | null;
  proof_key: string | null;
  payload: any;
  created_at: string;
  approved_order_number: string | null;
};

type Data = {
  escalations: Escalation[];
  drafts: Draft[];
  counts: { escalations: number; drafts: number };
};

const money = (value: unknown) => "Rp" + Number(value || 0).toLocaleString("id-ID");
const time = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  });
const phone = (value: string) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.startsWith("62") ? `0${digits.slice(2)}` : digits;
};
const totalDraft = (payload: any) => {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const subtotal = items.reduce(
    (sum: number, item: any) => sum + (Number(item?.price) || 0) * (Number(item?.quantity) || 0),
    0,
  );
  return subtotal + (Number(payload?.shipping_cost) || 0) - (Number(payload?.discount) || 0);
};

async function api(body?: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch("/api/ops/perlu-review", {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `Request gagal (${res.status})`);
  return json;
}

function Badge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    open: { label: "Baru", bg: "#FBEFD9", color: "#8A5A12" },
    claimed: { label: "Ditangani", bg: "#E8F0FC", color: "#1D4F91" },
    answered: { label: "Dijawab", bg: "#E3F2E8", color: "#22603A" },
    closed: { label: "Selesai", bg: "#F1F0EC", color: "#6B6A64" },
    pending: { label: "Menunggu review", bg: "#FBEFD9", color: "#8A5A12" },
  };
  const item = map[status] || map.closed;
  return (
    <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: item.bg, color: item.color }}>
      {item.label}
    </span>
  );
}

export default function PerluReviewView() {
  const [tab, setTab] = useState<Tab>("ai");
  const [data, setData] = useState<Data>({ escalations: [], drafts: [], counts: { escalations: 0, drafts: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const [instruction, setInstruction] = useState("");
  const [scope, setScope] = useState<"customer" | "global">("customer");
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<{ kind: "approve" | "reject" | "delete"; draft: Draft } | null>(null);
  const [rejectReason, setRejectReason] = useState("Data belum sesuai");
  const [proofOpen, setProofOpen] = useState(false);
  const [proofError, setProofError] = useState(false);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const json = (await api()) as Data;
      setData(json);
      setSelectedId((current) => current || json.escalations[0]?.id || "");
      setSelectedDraftId((current) => current || json.drafts[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat antrean.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => data.escalations.find((item) => item.id === selectedId) || null,
    [data.escalations, selectedId],
  );
  const selectedDraft = useMemo(
    () => data.drafts.find((item) => item.id === selectedDraftId) || null,
    [data.drafts, selectedDraftId],
  );

  useEffect(() => {
    if (!selected) return;
    setInstruction(selected.instruction || "");
    setScope(selected.instruction_scope || "customer");
    setPreview(selected.draft_reply || "");
    setNotice("");
  }, [selected]);

  const notify = (title: string, description?: string, variant: "success" | "destructive" | "default" = "success") => {
    setNotice(title);
    toast({ title, description, variant });
  };

  const run = async (action: string, body: Record<string, unknown>) => {
    setBusy(action);
    setError("");
    setNotice("");
    try {
      const json = await api({ action, ...body });
      await load();
      return json;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Aksi gagal.";
      setError(message);
      toast({ title: "Aksi gagal", description: message, variant: "destructive" });
      return null;
    } finally {
      setBusy("");
    }
  };

  const makeDraft = async () => {
    if (!selected || !instruction.trim()) return;
    const json = await run("escalation_draft", {
      id: selected.id,
      instruction: instruction.trim(),
      scope,
    });
    if (json?.reply) setPreview(String(json.reply));
  };

  const sendReply = async () => {
    if (!selected || !preview.trim() || !instruction.trim()) return;
    await run("escalation_send", {
      id: selected.id,
      instruction: instruction.trim(),
      reply: preview.trim(),
      scope,
      topic: selected.reason || "Instruksi admin",
    });
    notify("Balasan terkirim", "Instruksi disimpan sebagai pelajaran untuk AI.");
  };

  const askApprove = () => {
    if (selectedDraft) setDialog({ kind: "approve", draft: selectedDraft });
  };

  const askReject = () => {
    if (selectedDraft) {
      setRejectReason("Data belum sesuai");
      setDialog({ kind: "reject", draft: selectedDraft });
    }
  };

  const askDelete = () => {
    if (selectedDraft) setDialog({ kind: "delete", draft: selectedDraft });
  };

  const confirmDialog = async () => {
    if (!dialog) return;
    if (dialog.kind === "approve") {
      const json = await run("draft_approve", { id: dialog.draft.id });
      if (json?.order_number) notify(`Order ${json.order_number} dibuat`, "Stok sudah dipotong dan transaksi masuk.");
    } else if (dialog.kind === "delete") {
      setSelectedDraftId("");
      const json = await run("draft_delete", { id: dialog.draft.id });
      if (json) notify("Draft dihapus", "Tidak ada order atau stok yang berubah.");
    } else {
      const reason = rejectReason.trim();
      if (!reason) return;
      const json = await run("draft_reject", { id: dialog.draft.id, reason });
      if (json) notify("Draft ditolak", "Tidak ada order atau stok yang berubah.");
    }
    setDialog(null);
  };

  return (
    <section className="flex h-[calc(100dvh-140px)] min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black" style={{ color: "#141414" }}>
            Perlu Review
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#6B6A64" }}>
            Kasus AI yang butuh instruksi admin dan draft transaksi yang menunggu persetujuan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-xs font-semibold"
          style={{ borderColor: "#E7E6E1", color: "#141414" }}
        >
          <RefreshCw size={15} /> Muat ulang
        </button>
      </div>

      <div className="inline-flex w-fit shrink-0 gap-1 rounded-xl border bg-white p-1" style={{ borderColor: "#E7E6E1" }}>
        {[
          { id: "ai" as const, label: "Pertanyaan AI", count: data.counts.escalations, icon: MessageSquare },
          { id: "transaksi" as const, label: "Transaksi", count: data.counts.drafts, icon: ShoppingBag },
        ].map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition"
              style={{ background: active ? "#141414" : "transparent", color: active ? "#fff" : "#6B6A64" }}
            >
              <Icon size={15} /> {item.label}
              <span className="rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: active ? "#3a3a38" : "#F1F0EC" }}>
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {error ? (
        <div className="rounded-xl border px-3 py-2 text-xs font-semibold" style={{ background: "#FCE8E8", borderColor: "#F3CFCB", color: "#9B2C2C" }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 rounded-2xl border bg-white text-sm" style={{ borderColor: "#E7E6E1", color: "#6B6A64" }}>
          <Loader2 className="animate-spin" size={18} /> Memuat antrean...
        </div>
      ) : tab === "ai" ? (
        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-white" style={{ borderColor: "#E7E6E1" }}>
            <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: "#E7E6E1" }}>
              <p className="text-sm font-bold" style={{ color: "#141414" }}>Antrean pertanyaan</p>
              <p className="mt-0.5 text-[11px]" style={{ color: "#6B6A64" }}>{data.escalations.length} kasus</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {data.escalations.length === 0 ? (
                <p className="p-4 text-center text-xs" style={{ color: "#6B6A64" }}>Belum ada pertanyaan yang perlu review.</p>
              ) : (
                data.escalations.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className="mb-1.5 w-full rounded-xl border p-3 text-left transition"
                    style={{
                      borderColor: item.id === selectedId ? "#C8A45D" : "#E7E6E1",
                      background: item.id === selectedId ? "#FBF6EA" : "#fff",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-bold" style={{ color: "#141414" }}>{item.sender_name || phone(item.sender)}</p>
                      <Badge status={item.status} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px]" style={{ color: "#6B6A64" }}>{item.summary}</p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="h-full min-h-0 overflow-y-auto rounded-2xl border bg-white" style={{ borderColor: "#E7E6E1" }}>
            {!selected ? (
              <div className="flex h-full min-h-[300px] items-center justify-center p-6 text-center text-sm" style={{ color: "#6B6A64" }}>
                Pilih kasus di kiri.
              </div>
            ) : (
              <div className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3" style={{ borderColor: "#E7E6E1" }}>
                  <div>
                    <p className="text-lg font-black" style={{ color: "#141414" }}>{selected.sender_name || phone(selected.sender)}</p>
                    <p className="text-xs" style={{ color: "#6B6A64" }}>{phone(selected.sender)} · {time(selected.created_at)}</p>
                  </div>
                  <Badge status={selected.status} />
                </div>

                <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto rounded-xl p-3" style={{ background: "#FAF9F6" }}>
                  {(selected.messages || []).map((message) => (
                    <div key={message.id}>
                      {message.message ? (
                        <div className="max-w-[85%] rounded-xl border bg-white px-3 py-2 text-xs" style={{ borderColor: "#E7E6E1", color: "#141414" }}>
                          {message.message}
                          {message.media_url ? <a href={message.media_url} target="_blank" rel="noreferrer" className="mt-1 block text-[10px] font-semibold underline" style={{ color: "#1F7A4D" }}>Lihat lampiran</a> : null}
                          <div className="mt-1 text-[10px]" style={{ color: "#9A9892" }}>{time(message.created_at)}</div>
                        </div>
                      ) : null}
                      {message.reply_text ? (
                        <div className="ml-auto mt-1 max-w-[85%] rounded-xl px-3 py-2 text-xs" style={{ background: "#141414", color: "#fff" }}>
                          {message.reply_text}
                          <div className="mt-1 text-[10px]" style={{ color: "#BDBBB4" }}>AI · {time(message.created_at)}</div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                {selected.status === "answered" || selected.status === "closed" ? (
                  <div className="mt-4 grid gap-3">
                    <div className="flex items-start gap-3 rounded-xl border p-4" style={{ background: "#E3F2E8", borderColor: "#CFE6D9" }}>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white" style={{ color: "#1F7A4D" }}>
                        <Check size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-black" style={{ color: "#22603A" }}>
                          {selected.status === "closed" ? "Selesai" : "Sudah dijawab & tersimpan"}
                        </p>
                        <p className="mt-0.5 text-xs" style={{ color: "#22603A" }}>
                          {selected.status === "closed"
                            ? "Kasus ini sudah ditutup."
                            : "Balasan sudah dikirim ke customer. Instruksi tersimpan sebagai pelajaran."}
                          {selected.replied_at ? ` · ${time(selected.replied_at)}` : ""}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: "#8A8880" }}>Balasan yang terkirim</p>
                      <div className="max-w-[90%] rounded-xl px-3 py-2.5 text-sm" style={{ background: "#141414", color: "#fff" }}>
                        {selected.reply_text || preview || "-"}
                      </div>
                    </div>

                    <div>
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: "#8A8880" }}>Instruksi tersimpan</p>
                      <div className="rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: "#E7E6E1", color: "#141414", background: "#FAF9F6" }}>
                        {selected.instruction || instruction || "-"}
                      </div>
                      <p className="mt-1.5 text-[11px] font-semibold" style={{ color: "#6B6A64" }}>
                        {selected.instruction_scope === "global"
                          ? "Berlaku untuk semua customer."
                          : "Berlaku khusus untuk nomor ini."}
                      </p>
                    </div>

                    {selected.status === "answered" ? (
                      <button
                        type="button"
                        onClick={() => void run("escalation_close", { id: selected.id })}
                        disabled={Boolean(busy)}
                        className="inline-flex h-9 w-fit items-center gap-2 rounded-xl border px-3 text-xs font-bold disabled:opacity-50"
                        style={{ borderColor: "#E7E6E1", color: "#6B6A64", background: "#fff" }}
                      >
                        {busy === "escalation_close" ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />} Tandai selesai
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3">
                    <div>
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: "#8A8880" }}>Instruksi untuk AI</p>
                      <textarea
                        value={instruction}
                        onChange={(event) => setInstruction(event.target.value)}
                        rows={3}
                        placeholder="Contoh: Customer ini tetap dapat free cover + hanger walau pembelian kedua."
                        className="w-full resize-y rounded-xl border px-3 py-2 text-sm outline-none"
                        style={{ borderColor: "#E7E6E1", color: "#141414" }}
                      />
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs font-semibold" style={{ color: "#6B6A64" }}>
                      <input type="checkbox" checked={scope === "global"} onChange={(event) => setScope(event.target.checked ? "global" : "customer")} />
                      Berlaku untuk semua customer (bukan hanya nomor ini)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void makeDraft()} disabled={Boolean(busy) || !instruction.trim()} className="inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-bold disabled:opacity-50" style={{ background: "#FBF6EA", color: "#6B4D12", border: "1px solid #E8D4A4" }}>
                        {busy === "escalation_draft" ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />} Minta AI susun
                      </button>
                      <button type="button" onClick={() => void sendReply()} disabled={Boolean(busy) || !preview.trim() || !instruction.trim()} className="inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-bold text-white disabled:opacity-50" style={{ background: "#1F7A4D" }}>
                        {busy === "escalation_send" ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />} Kirim ke customer
                      </button>
                      <button type="button" onClick={() => void run("escalation_close", { id: selected.id })} disabled={Boolean(busy)} className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-bold disabled:opacity-50" style={{ borderColor: "#E7E6E1", color: "#6B6A64" }}>
                        <X size={14} /> Tutup
                      </button>
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: "#8A8880" }}>Preview balasan AI</p>
                      <textarea
                        value={preview}
                        onChange={(event) => setPreview(event.target.value)}
                        rows={4}
                        placeholder="Klik Minta AI susun, lalu edit jika perlu."
                        className="w-full resize-y rounded-xl border px-3 py-2 text-sm outline-none"
                        style={{ borderColor: "#E7E6E1", color: "#141414" }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-white" style={{ borderColor: "#E7E6E1" }}>
            <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: "#E7E6E1" }}>
              <p className="text-sm font-bold" style={{ color: "#141414" }}>Draft transaksi</p>
              <p className="mt-0.5 text-[11px]" style={{ color: "#6B6A64" }}>{data.drafts.length} menunggu review</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {data.drafts.length === 0 ? (
                <p className="p-4 text-center text-xs" style={{ color: "#6B6A64" }}>Belum ada draft transaksi.</p>
              ) : (
                data.drafts.map((draft) => (
                  <button
                    key={draft.id}
                    type="button"
                    onClick={() => setSelectedDraftId(draft.id)}
                    className="mb-1.5 w-full rounded-xl border p-3 text-left"
                    style={{ borderColor: draft.id === selectedDraftId ? "#C8A45D" : "#E7E6E1", background: draft.id === selectedDraftId ? "#FBF6EA" : "#fff" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-bold" style={{ color: "#141414" }}>{draft.customer_name || phone(draft.customer_whatsapp || "")}</p>
                      <Badge status={draft.status} />
                    </div>
                    <p className="mt-1 text-[11px]" style={{ color: "#6B6A64" }}>{money(totalDraft(draft.payload))} · {time(draft.created_at)}</p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="h-full min-h-0 overflow-y-auto rounded-2xl border bg-white p-4" style={{ borderColor: "#E7E6E1" }}>
            {!selectedDraft ? (
              <div className="flex h-full min-h-[300px] items-center justify-center text-sm" style={{ color: "#6B6A64" }}>Pilih draft di kiri.</div>
            ) : (
              <DraftDetail
                draft={selectedDraft}
                busy={Boolean(busy)}
                onApprove={askApprove}
                onReject={askReject}
                onViewProof={() => {
                  setProofError(false);
                  setProofOpen(true);
                }}
                onEdit={() => setEditDraft(selectedDraft)}
                onDelete={askDelete}
              />
            )}
          </div>
        </div>
      )}

      {editDraft ? (
        <DraftEditor
          draft={editDraft}
          onClose={() => setEditDraft(null)}
          onSaved={() => {
            setEditDraft(null);
            notify("Draft diperbarui", "Stok belum berubah. Stok dipotong saat Setujui.");
            void load();
          }}
        />
      ) : null}

      {proofOpen && selectedDraft ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onMouseDown={() => setProofOpen(false)}
        >
          <div
            className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl"
            style={{ borderColor: "#E7E6E1" }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-3" style={{ borderColor: "#E7E6E1" }}>
              <div>
                <p className="text-sm font-bold" style={{ color: "#141414" }}>Bukti transfer</p>
                <p className="text-[11px]" style={{ color: "#6B6A64" }}>{selectedDraft.customer_name || "Customer"}</p>
              </div>
              <button
                type="button"
                onClick={() => setProofOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border"
                style={{ borderColor: "#E7E6E1", color: "#6B6A64" }}
                aria-label="Tutup bukti transfer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex min-h-[240px] items-center justify-center overflow-auto bg-[#111]" style={{ maxHeight: "70dvh" }}>
              {!selectedDraft.proof_url || proofError ? (
                <div className="px-6 py-10 text-center">
                  <p className="text-sm font-bold text-white">Bukti transfer tidak tersedia</p>
                  <p className="mt-1 text-xs text-white/60">Link lama dari Fonnte sudah kedaluwarsa. Bukti baru akan disimpan di R2.</p>
                </div>
              ) : (
                <img
                  src={selectedDraft.proof_url}
                  alt="Bukti transfer"
                  className="max-h-[70dvh] w-auto max-w-full object-contain"
                  onError={() => setProofError(true)}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {dialog ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
          onMouseDown={() => {
            if (!busy) setDialog(null);
          }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border bg-white shadow-2xl"
            style={{ borderColor: "#E7E6E1" }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3 p-5 pb-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: dialog.kind === "approve" ? "#E3F2E8" : "#FCE8E8",
                  color: dialog.kind === "approve" ? "#1F7A4D" : "#9B2C2C",
                }}
              >
                {dialog.kind === "approve" ? <Check size={20} /> : dialog.kind === "delete" ? <Trash2 size={19} /> : <X size={20} />}
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-black" style={{ color: "#141414" }}>
                  {dialog.kind === "approve" ? "Setujui draft transaksi?" : dialog.kind === "delete" ? "Hapus draft transaksi?" : "Tolak draft transaksi?"}
                </h2>
                <p className="mt-1 text-sm" style={{ color: "#6B6A64" }}>
                  {dialog.kind === "approve"
                    ? `${dialog.draft.customer_name || "Customer"} · ${money(totalDraft(dialog.draft.payload))}`
                    : dialog.kind === "delete"
                      ? "Draft akan dihapus dari antrean."
                      : "Draft akan ditolak dan tidak membuat order."}
                </p>
              </div>
            </div>

            {dialog.kind === "approve" ? (
              <div className="mx-5 rounded-xl border px-3 py-2.5 text-xs" style={{ background: "#FBF6EA", borderColor: "#E8D4A4", color: "#6B4D12" }}>
                Stok akan dipotong, order dibuat, dan status menjadi <b>Lunas</b>. Pastikan bukti transfer dan alamat sudah benar.
              </div>
            ) : dialog.kind === "delete" ? (
              <div className="mx-5 rounded-xl border px-3 py-2.5 text-xs" style={{ background: "#FCE8E8", borderColor: "#F3CFCB", color: "#9B2C2C" }}>
                Draft dihapus permanen. <b>Tidak ada order atau stok yang berubah.</b>
              </div>
            ) : (
              <div className="mx-5">
                <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#8A8880" }}>
                  Alasan penolakan
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  rows={3}
                  autoFocus
                  className="mt-1.5 w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: "#E7E6E1", color: "#141414" }}
                />
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2 border-t p-4" style={{ borderColor: "#E7E6E1" }}>
              <button
                type="button"
                onClick={() => setDialog(null)}
                disabled={Boolean(busy)}
                className="h-10 rounded-xl border px-4 text-xs font-bold disabled:opacity-50"
                style={{ borderColor: "#E7E6E1", color: "#6B6A64", background: "#fff" }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void confirmDialog()}
                disabled={Boolean(busy) || (dialog.kind === "reject" && !rejectReason.trim())}
                className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-bold text-white disabled:opacity-50"
                style={{ background: dialog.kind === "approve" ? "#1F7A4D" : "#9B2C2C" }}
              >
                {busy ? <Loader2 className="animate-spin" size={15} /> : dialog.kind === "approve" ? <Check size={15} /> : dialog.kind === "delete" ? <Trash2 size={15} /> : <X size={15} />}
                {dialog.kind === "approve" ? "Setujui & Proses" : dialog.kind === "delete" ? "Hapus draft" : "Tolak draft"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function DraftDetail({
  draft,
  busy,
  onApprove,
  onReject,
  onViewProof,
  onEdit,
  onDelete,
}: {
  draft: Draft;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onViewProof: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const payload = draft.payload || {};
  const shipping = payload.shipping || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const address = [
    payload.customer_name,
    payload.customer_whatsapp,
    shipping.address,
    shipping.kecamatan ? `Kec. ${shipping.kecamatan}` : "",
    shipping.city,
    shipping.province,
    shipping.postal_code,
  ].filter(Boolean).join(" · ");

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3" style={{ borderColor: "#E7E6E1" }}>
        <div>
          <p className="text-lg font-black" style={{ color: "#141414" }}>{draft.customer_name || "Tanpa nama"}</p>
          <p className="text-xs" style={{ color: "#6B6A64" }}>{phone(draft.customer_whatsapp || "")} · {time(draft.created_at)}</p>
        </div>
        <Badge status={draft.status} />
      </div>

      <div className="mt-4 grid gap-3">
        <div className="rounded-xl border p-3" style={{ borderColor: "#E7E6E1" }}>
          <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#8A8880" }}>Alamat & pengiriman</p>
          <p className="mt-1 text-sm" style={{ color: "#141414" }}>{shipping.address || "-"}</p>
          <p className="mt-0.5 text-xs" style={{ color: "#6B6A64" }}>
            {[shipping.kecamatan, shipping.city, shipping.province, shipping.postal_code].filter(Boolean).join(" · ")}
          </p>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(address)}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold"
            style={{ color: "#1F7A4D" }}
          >
            <Copy size={14} /> Copy alamat
          </button>
        </div>

        <div className="rounded-xl border p-3" style={{ borderColor: "#E7E6E1" }}>
          <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#8A8880" }}>Pesanan</p>
          <div className="mt-1 space-y-1 text-sm">
            {items.map((item: any, index: number) => (
              <div key={index} className="flex justify-between gap-2">
                <span style={{ color: "#141414" }}>{item.product_name || item.product_id} · {item.color || "default"} · {item.size} × {item.quantity}</span>
                <span className="shrink-0 font-semibold" style={{ color: "#141414" }}>{item.price ? money(Number(item.price) * Number(item.quantity || 1)) : "-"}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between border-t pt-2 text-xs" style={{ borderColor: "#E7E6E1", color: "#6B6A64" }}>
            <span>Ongkir {payload.shipping_method || ""}</span><span>{money(payload.shipping_cost)}</span>
          </div>
          <div className="mt-1 flex justify-between text-sm font-bold" style={{ color: "#1F7A4D" }}>
            <span>Total</span><span>{money(totalDraft(payload))}</span>
          </div>
        </div>

        {draft.proof_url ? (
          <button type="button" onClick={onViewProof} className="inline-flex w-fit items-center gap-2 text-xs font-bold" style={{ color: "#1F7A4D" }}>
            <span className="text-base leading-none">&#128247;</span> Lihat bukti transfer
          </button>
        ) : (
          <p className="text-xs" style={{ color: "#9A9892" }}>Bukti transfer tidak tersedia.</p>
        )}

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <button type="button" onClick={onEdit} disabled={busy} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold disabled:opacity-50" style={{ borderColor: "#E7E6E1", color: "#141414", background: "#fff" }}>
            <Pencil size={15} /> Edit
          </button>
          <button type="button" onClick={onApprove} disabled={busy} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold text-white disabled:opacity-50" style={{ background: "#1F7A4D" }}>
            {busy ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />} Setujui & Proses
          </button>
          <button type="button" onClick={onReject} disabled={busy} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold disabled:opacity-50" style={{ borderColor: "#F3CFCB", color: "#9B2C2C", background: "#fff" }}>
            <X size={15} /> Tolak
          </button>
          <button type="button" onClick={onDelete} disabled={busy} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold disabled:opacity-50" style={{ borderColor: "#E7E6E1", color: "#7A4A4A", background: "#fff" }}>
            <Trash2 size={15} /> Hapus
          </button>
          <p className="w-full text-[11px]" style={{ color: "#6B6A64" }}>
            Stok dan order baru dibuat setelah tombol Setujui & Proses. Draft tidak mengubah stok.
          </p>
        </div>
      </div>
    </div>
  );
}

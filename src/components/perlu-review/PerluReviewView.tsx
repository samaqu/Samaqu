"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Loader2,
  Pencil,
  Scissors,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PERLU_REVIEW_EVENT } from "@/lib/use-pending-drafts";
import { isPotongPanjangLine } from "@/lib/layanan";
import { toast } from "@/components/ops/ui/use-toast";
import DuplicateOrderWarning from "@/components/ops/transaksi/DuplicateOrderWarning";
import type { DuplicateMatch } from "@/lib/duplicate-order";
import DraftEditor from "./DraftEditor";
import DraftList from "./DraftList";
import DraftDetailHeader from "./DraftDetailHeader";
import RecipientCard from "./RecipientCard";
import PaymentProofCard from "./PaymentProofCard";
import OrderSummaryCard from "./OrderSummaryCard";
import ActionBar from "./ActionBar";

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
  drafts: Draft[];
  counts: { drafts: number };
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
  if (!res.ok) {
    const error = new Error(json?.error || `Request gagal (${res.status})`) as Error & { code?: string; data?: any };
    error.code = json?.code;
    error.data = json;
    throw error;
  }
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
  const [data, setData] = useState<Data>({ drafts: [], counts: { drafts: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<{ kind: "approve" | "reject" | "delete"; draft: Draft } | null>(null);
  /** Pesanan terbuka yang mirip dengan draft yang mau disetujui (pengaman order dobel). */
  const [dupMatches, setDupMatches] = useState<DuplicateMatch[] | null>(null);
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

  const selectedDraft = useMemo(
    () => data.drafts.find((item) => item.id === selectedDraftId) || null,
    [data.drafts, selectedDraftId],
  );

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
      // Kemungkinan order dobel: bukan error — kembalikan daftar pesanan mirip supaya dialog Setujui
      // menampilkannya dan admin memilih "Tetap setujui". Draft sudah dikembalikan ke antrean oleh server.
      const dup = e as { code?: string; data?: { matches?: DuplicateMatch[] } };
      if (dup?.code === "possible_duplicate") return { duplicate: true, matches: dup.data?.matches || [] };
      const message = e instanceof Error ? e.message : "Aksi gagal.";
      setError(message);
      toast({ title: "Aksi gagal", description: message, variant: "destructive" });
      return null;
    } finally {
      setBusy("");
    }
  };

  // Peringatan order dobel hanya berlaku untuk dialog yang sedang terbuka.
  useEffect(() => {
    setDupMatches(null);
  }, [dialog]);

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
      const json = await run("draft_approve", { id: dialog.draft.id, ...(dupMatches ? { confirm_duplicate: true } : {}) });
      if (json?.duplicate) {
        setDupMatches(json.matches);
        return; // dialog tetap terbuka: admin memeriksa lalu memilih "Tetap setujui" atau Batal
      }
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
    // Badge menu "Perlu Review" langsung menyesuaikan setelah aksi.
    window.dispatchEvent(new Event(PERLU_REVIEW_EVENT));
    setDialog(null);
  };

  return (
    <section className="flex min-h-0 flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-black" style={{ color: "#141414" }}>
            Perlu Review
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed" style={{ color: "#6B6A64" }}>
            Draft transaksi yang dicatat AI dan menunggu persetujuan. Pertanyaan customer yang butuh admin dijawab di Chat Academy.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <button
            type="button"
            onClick={() => void load()}
            className="h-9 px-1 text-[11px] font-bold underline-offset-4 hover:underline"
            style={{ color: "#6B6A64" }}
          >
            Muat ulang
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border px-3 py-2 text-xs font-semibold" style={{ background: "#FCE8E8", borderColor: "#F3CFCB", color: "#9B2C2C" }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-1 items-center justify-center rounded-2xl border bg-white text-sm" style={{ borderColor: "#E7E6E1", color: "#6B6A64" }}>
          Memuat antrean...
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <DraftList drafts={data.drafts} selectedId={selectedDraftId} onSelect={setSelectedDraftId} />

          <div className="min-w-0">
            {!selectedDraft ? (
              <div className="flex min-h-[320px] items-center justify-center rounded-2xl border bg-white px-6 text-center text-sm" style={{ borderColor: "#E7E6E1", color: "#8A8880" }}>
                Pilih draft di kiri untuk melihat detail.
              </div>
            ) : (
              <div className="rounded-2xl border bg-white shadow-[0_1px_3px_rgba(20,20,20,0.04)]" style={{ borderColor: "#E7E6E1" }}>
                <DraftDetailHeader draft={selectedDraft} />
                <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-2">
                  <RecipientCard draft={selectedDraft} />
                  <PaymentProofCard
                    proofUrl={selectedDraft.proof_url}
                    onView={() => {
                      setProofError(false);
                      setProofOpen(true);
                    }}
                  />
                  <div className="lg:col-span-2">
                    <OrderSummaryCard draft={selectedDraft} />
                  </div>
                </div>
                <ActionBar
                  busy={Boolean(busy)}
                  onEdit={() => setEditDraft(selectedDraft)}
                  onApprove={askApprove}
                  onReject={askReject}
                  onDelete={askDelete}
                />
              </div>
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
                className="rounded-lg border px-3 py-1.5 text-[11px] font-bold"
                style={{ borderColor: "#E7E6E1", color: "#6B6A64" }}
              >
                Tutup
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
            <div className="p-5 pb-3">
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

            {dialog.kind === "approve" ? (
              <div className="space-y-2.5">
                {dupMatches ? (
                  <div className="mx-5">
                    <DuplicateOrderWarning matches={dupMatches} />
                  </div>
                ) : null}
                <div className="mx-5 rounded-xl border px-3 py-2.5 text-xs" style={{ background: "#FBF6EA", borderColor: "#E8D4A4", color: "#6B4D12" }}>
                  Stok akan dipotong, order dibuat, dan status menjadi <b>Lunas</b>. Pastikan bukti transfer dan alamat sudah benar.
                </div>
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
                {busy ? "Memproses..." : dialog.kind === "approve" ? (dupMatches ? "Tetap setujui" : "Setujui & Proses") : dialog.kind === "delete" ? "Hapus draft" : "Tolak draft"}
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
                <span className="inline-flex items-center gap-1" style={{ color: "#141414" }}>
                  {isPotongPanjangLine(item) ? <Scissors size={13} aria-hidden /> : null}
                  {item.product_name || item.product_id} · {item.color || "default"} · {item.size} × {item.quantity}
                </span>
                <span className="shrink-0 font-semibold" style={{ color: "#141414" }}>{item.price ? money(Number(item.price) * Number(item.quantity || 1)) : "-"}</span>
              </div>
            ))}
          </div>
          {payload.notes ? (
            <p className="mt-2 text-xs" style={{ color: "#6B6A64" }}>Catatan: {payload.notes}</p>
          ) : null}
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

"use client";

import { useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import {
  AdminApiError,
  opsResellerApi,
  type QueueOrderPayment,
  type QueuePayload,
  type QueueTopup,
  type QueueWithdrawal,
} from "./api";
import { rupiah, tglJamID } from "@/lib/reseller/format";
import { ConfirmActionModal, Modal } from "./Modal";

type Chip = "semua" | "topup" | "kekurangan" | "penarikan";

const CHIPS: { key: Chip; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "topup", label: "Top up" },
  { key: "kekurangan", label: "Bayar kekurangan" },
  { key: "penarikan", label: "Penarikan" },
];

function maskWa(value: string | null | undefined): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length <= 4) return digits || "-";
  return `${digits.slice(0, 4)}••••${digits.slice(-3)}`;
}

/** Label metode pembayaran yang dipilih reseller (data lama default "bsi"). */
function methodBadge(method: string | null | undefined) {
  const isQris = method === "qris";
  return (
    <span
      className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
        isQris ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {isQris ? "QRIS" : "Transfer BSI"}
    </span>
  );
}

function maskAccountNumber(value: string | null | undefined): string {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length > 4 ? `••••${digits.slice(-4)}` : digits || "—";
}

function resellerCell(row: { resellers: { store_name: string; owner_name: string; whatsapp: string | null } | null }) {
  const name = row.resellers?.store_name || "—";
  return (
    <div>
      <div className="font-bold text-slate-900 text-[13px]">{name}</div>
      <div className="text-[11px] text-slate-500">
        {maskWa(row.resellers?.whatsapp)}
        {row.resellers?.owner_name ? ` · ${row.resellers.owner_name}` : ""}
      </div>
    </div>
  );
}

const TYPE_STYLE: Record<string, { label: string; cls: string }> = {
  topup: { label: "Top up", cls: "bg-blue-100 text-blue-700" },
  kekurangan: { label: "Bayar kekurangan", cls: "bg-amber-100 text-amber-700" },
  penarikan: { label: "Penarikan", cls: "bg-violet-100 text-violet-700" },
};

export default function QueueTab({
  queue,
  loading,
  onChanged,
}: {
  queue: QueuePayload | null;
  loading: boolean;
  onChanged: () => void;
}) {
  const [chip, setChip] = useState<Chip>("semua");
  const [proof, setProof] = useState<string | null>(null);
  const [action, setAction] = useState<
    | { kind: "topup-approve" | "topup-reject"; row: QueueTopup }
    | { kind: "kekurangan-approve" | "kekurangan-reject"; row: QueueOrderPayment }
    | { kind: "penarikan-approve" | "penarikan-reject"; row: QueueWithdrawal }
    | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const total = queue ? queue.topups.length + queue.order_payments.length + queue.withdrawals.length : 0;
  const shown =
    chip === "semua"
      ? total
      : chip === "topup"
        ? queue?.topups.length ?? 0
        : chip === "kekurangan"
          ? queue?.order_payments.length ?? 0
          : queue?.withdrawals.length ?? 0;

  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    setBusy(true);
    try {
      await fn();
      setAction(null);
      onChanged();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Aksi gagal. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {CHIPS.map((item) => {
          const count =
            !queue || item.key === "semua"
              ? total
              : item.key === "topup"
                ? queue.topups.length
                : item.key === "kekurangan"
                  ? queue.order_payments.length
                  : queue.withdrawals.length;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setChip(item.key)}
              className={`px-3.5 py-2 rounded-xl text-[13px] font-bold border transition-all ${
                chip === item.key
                  ? "bg-[#18181b] text-white border-[#18181b]"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {item.label}
              <span className={`ml-1.5 text-[11px] ${chip === item.key ? "text-white/70" : "text-slate-400"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {error ? <div className="px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm font-semibold">{error}</div> : null}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading && !queue ? (
          <div className="p-10 text-center text-slate-400 text-sm">Memuat antrean…</div>
        ) : shown === 0 ? (
          <div className="p-10 text-center">
            <p className="font-bold text-slate-700">Semua beres. Tidak ada yang perlu dicek.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-2.5">Jenis</th>
                  <th className="px-4 py-2.5">Reseller</th>
                  <th className="px-4 py-2.5">Detail</th>
                  <th className="px-4 py-2.5 text-right">Jumlah</th>
                  <th className="px-4 py-2.5">Masuk</th>
                  <th className="px-4 py-2.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {queue?.topups.map((row) =>
                  chip === "semua" || chip === "topup" ? (
                    <tr key={`t-${row.id}`} className="border-b border-slate-100">
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold ${TYPE_STYLE.topup.cls}`}>
                          Top up
                        </span>
                      </td>
                      <td className="px-4 py-3">{resellerCell(row)}</td>
                      <td className="px-4 py-3 text-[12px] text-slate-500">
                        {row.code}
                        <div>{methodBadge(row.payment_method)}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">{rupiah(row.amount)}</td>
                      <td className="px-4 py-3 text-[12px] text-slate-500">{tglJamID(row.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          {row.proof_url ? (
                            <button className="px-2.5 py-1.5 rounded-lg text-[12px] font-bold bg-slate-100 hover:bg-slate-200 inline-flex items-center gap-1" onClick={() => setProof(row.proof_url)}>
                              <ImageIcon size={13} /> Bukti
                            </button>
                          ) : null}
                          <button className="px-2.5 py-1.5 rounded-lg text-[12px] font-bold bg-red-50 text-red-700 hover:bg-red-100" onClick={() => setAction({ kind: "topup-reject", row })}>
                            Tolak
                          </button>
                          <button className="px-2.5 py-1.5 rounded-lg text-[12px] font-bold bg-blue-600 text-white hover:bg-blue-700" onClick={() => setAction({ kind: "topup-approve", row })}>
                            Uang masuk
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : null
                )}
                {queue?.order_payments.map((row) =>
                  chip === "semua" || chip === "kekurangan" ? (
                    <tr key={`p-${row.id}`} className="border-b border-slate-100">
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold ${TYPE_STYLE.kekurangan.cls}`}>
                          Bayar kekurangan
                        </span>
                      </td>
                      <td className="px-4 py-3">{resellerCell(row)}</td>
                      <td className="px-4 py-3 text-[12px] text-slate-500">
                        Pesanan {row.orders?.order_number || "—"}
                        <div>{methodBadge(row.payment_method)}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">{rupiah(row.amount)}</td>
                      <td className="px-4 py-3 text-[12px] text-slate-500">{tglJamID(row.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          {row.proof_url ? (
                            <button className="px-2.5 py-1.5 rounded-lg text-[12px] font-bold bg-slate-100 hover:bg-slate-200 inline-flex items-center gap-1" onClick={() => setProof(row.proof_url)}>
                              <ImageIcon size={13} /> Bukti
                            </button>
                          ) : null}
                          <button className="px-2.5 py-1.5 rounded-lg text-[12px] font-bold bg-red-50 text-red-700 hover:bg-red-100" onClick={() => setAction({ kind: "kekurangan-reject", row })}>
                            Tolak
                          </button>
                          <button className="px-2.5 py-1.5 rounded-lg text-[12px] font-bold bg-blue-600 text-white hover:bg-blue-700" onClick={() => setAction({ kind: "kekurangan-approve", row })}>
                            Uang masuk
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : null
                )}
                {queue?.withdrawals.map((row) =>
                  chip === "semua" || chip === "penarikan" ? (
                    <tr key={`w-${row.id}`} className="border-b border-slate-100">
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold ${TYPE_STYLE.penarikan.cls}`}>
                          Penarikan
                        </span>
                      </td>
                      <td className="px-4 py-3">{resellerCell(row)}</td>
                      <td className="px-4 py-3 text-[12px] text-slate-500">
                        {row.bank_name} {maskAccountNumber(row.bank_number)} a.n. {row.bank_holder}
                        <br />
                        Biaya admin {rupiah(row.admin_fee)} · transfer <b>{rupiah(row.transfer_amount)}</b>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-bold text-slate-900">{rupiah(row.amount)}</div>
                        <div className="text-[11px] text-slate-500">ditahan</div>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-slate-500">{tglJamID(row.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button className="px-2.5 py-1.5 rounded-lg text-[12px] font-bold bg-red-50 text-red-700 hover:bg-red-100" onClick={() => setAction({ kind: "penarikan-reject", row })}>
                            Tolak
                          </button>
                          <button className="px-2.5 py-1.5 rounded-lg text-[12px] font-bold bg-blue-600 text-white hover:bg-blue-700" onClick={() => setAction({ kind: "penarikan-approve", row })}>
                            Sudah ditransfer
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : null
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {proof ? (
        <Modal title="Bukti transfer" onClose={() => setProof(null)} width={560}>
          <img src={proof} alt="Bukti transfer" className="w-full rounded-xl border border-slate-200" />
        </Modal>
      ) : null}

      {action ? (
        <ConfirmActionModal
          title={
            action.kind.startsWith("topup")
              ? action.kind === "topup-approve"
                ? "Konfirmasi top up"
                : "Tolak top up"
              : action.kind.startsWith("kekurangan")
                ? action.kind === "kekurangan-approve"
                  ? "Konfirmasi bayar kekurangan"
                  : "Tolak bayar kekurangan"
                : action.kind === "penarikan-approve"
                  ? "Konfirmasi penarikan"
                  : "Tolak penarikan"
          }
          description={
            action.kind.startsWith("topup")
              ? action.kind === "topup-approve"
                ? `Konfirmasi top up ${rupiah((action.row as QueueTopup).amount)} dari ${(action.row as QueueTopup).resellers?.store_name || "reseller"}? Saldo reseller langsung bertambah.`
                : `Tolak top up ${rupiah((action.row as QueueTopup).amount)} dari ${(action.row as QueueTopup).resellers?.store_name || "reseller"}? Tulis alasan untuk reseller.`
              : action.kind.startsWith("kekurangan")
                ? action.kind === "kekurangan-approve"
                  ? `Konfirmasi transfer ${rupiah((action.row as QueueOrderPayment).amount)} untuk pesanan ${(action.row as QueueOrderPayment).orders?.order_number || ""}? Pesanan langsung diproses.`
                  : `Pesanan ${(action.row as QueueOrderPayment).orders?.order_number || ""} akan dibatalkan, saldo dan stok dikembalikan. Tulis alasan untuk reseller.`
                : action.kind === "penarikan-approve"
                  ? `Sudah transfer ${rupiah((action.row as QueueWithdrawal).transfer_amount)} ke ${(action.row as QueueWithdrawal).bank_name} ${maskAccountNumber((action.row as QueueWithdrawal).bank_number)} a.n. ${(action.row as QueueWithdrawal).bank_holder}? Tindakan ini tidak bisa dibatalkan.`
                  : `Tolak penarikan ${rupiah((action.row as QueueWithdrawal).amount)} dari ${(action.row as QueueWithdrawal).resellers?.store_name || "reseller"}? Saldo yang ditahan kembali ke saldo reseller.`
          }
          tone={action.kind.endsWith("approve") ? "primary" : "danger"}
          confirmLabel={action.kind.endsWith("approve") ? "Ya, lanjutkan" : "Tolak"}
          requireReason={action.kind.endsWith("reject")}
          busy={busy}
          onClose={() => setAction(null)}
          onConfirm={async (reason) => {
            const approve = action.kind.endsWith("approve");
            if (action.kind.startsWith("topup")) {
              await run(
                () => opsResellerApi.reviewTopup((action.row as QueueTopup).id, approve ? "approve" : "reject", approve ? undefined : reason)
              );
            } else if (action.kind.startsWith("kekurangan")) {
              await run(
                () => opsResellerApi.reviewOrderPayment((action.row as QueueOrderPayment).id, approve ? "approve" : "reject", approve ? undefined : reason)
              );
            } else {
              await run(
                () => opsResellerApi.reviewWithdrawal((action.row as QueueWithdrawal).id, approve ? "approve" : "reject", approve ? undefined : reason)
              );
            }
          }}
        />
      ) : null}
    </div>
  );
}

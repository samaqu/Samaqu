"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminApiError, opsResellerApi, type LedgerRow, type ResellerAdminRow } from "./api";
import { describeLedgerRow, rupiah, tglJamID } from "@/lib/reseller/format";
import MutationBadge from "./MutationBadge";
import RupiahInput from "@/components/reseller/RupiahInput";
import { Modal } from "./Modal";

const LEDGER_TYPES: { key: string; label: string }[] = [
  { key: "", label: "Semua jenis" },
  { key: "topup", label: "Top up" },
  { key: "order_debit", label: "Pesanan" },
  { key: "order_refund", label: "Refund pesanan" },
  { key: "withdrawal_hold", label: "Tarik saldo" },
  { key: "withdrawal_release", label: "Penarikan ditolak" },
  { key: "adjustment", label: "Koreksi admin" },
];

function currentMonth(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);
}

/** Mutasi saldo semua reseller + koreksi manual (wajib catatan). */
export default function LedgerTab({
  resellers,
  onChanged,
}: {
  resellers: ResellerAdminRow[];
  onChanged: () => void;
}) {
  const [resellerId, setResellerId] = useState("");
  const [jenis, setJenis] = useState("");
  const [bulan, setBulan] = useState(currentMonth());
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await opsResellerApi.ledger({ reseller_id: resellerId || undefined, jenis: jenis || undefined, bulan, pageSize: 100 });
      setRows(res.data);
      setTotal(res.total);
    } catch {
      setError("Gagal memuat mutasi saldo.");
    } finally {
      setLoading(false);
    }
  }, [resellerId, jenis, bulan]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="px-3 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700"
          value={resellerId}
          onChange={(e) => setResellerId(e.target.value)}
          aria-label="Filter reseller"
        >
          <option value="">Semua reseller</option>
          {resellers.map((row) => (
            <option key={row.id} value={row.id}>
              {row.store_name}
            </option>
          ))}
        </select>
        <select
          className="px-3 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700"
          value={jenis}
          onChange={(e) => setJenis(e.target.value)}
          aria-label="Filter jenis"
        >
          {LEDGER_TYPES.map((type) => (
            <option key={type.key} value={type.key}>
              {type.label}
            </option>
          ))}
        </select>
        <input
          type="month"
          className="px-3 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700"
          value={bulan}
          onChange={(e) => setBulan(e.target.value)}
          aria-label="Filter bulan"
        />
        <button
          type="button"
          onClick={() => setAdjustOpen(true)}
          className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700"
        >
          Koreksi saldo
        </button>
      </div>

      {error ? <div className="px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm font-semibold">{error}</div> : null}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Memuat mutasi…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-bold text-slate-700">Belum ada mutasi pada filter ini.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-2.5">Tanggal</th>
                  <th className="px-4 py-2.5">Reseller</th>
                  <th className="px-4 py-2.5">Mutasi</th>
                  <th className="px-4 py-2.5 text-right">Jumlah</th>
                  <th className="px-4 py-2.5 text-right">Saldo akhir</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const view = describeLedgerRow(row, { fullAccount: true, showActor: true });
                  return (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="px-4 py-3 text-[12px] text-slate-500">{tglJamID(row.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 text-[13px]">{row.resellers?.store_name || "—"}</div>
                        <div className="text-[11px] text-slate-500">{row.resellers?.owner_name || ""}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[12px] font-bold text-slate-800">{view.title}</span>
                          <MutationBadge status={view.badge} />
                        </div>
                        <div className="text-[11px] text-slate-500">{view.description}</div>
                        {view.extra ? <div className="text-[11px] text-slate-400">{view.extra}</div> : null}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${row.amount >= 0 ? "text-emerald-600" : "text-slate-900"}`}>
                        {row.amount >= 0 ? "+" : "−"}
                        {rupiah(Math.abs(row.amount))}
                      </td>
                      <td className="px-4 py-3 text-right text-[12px] font-semibold text-slate-700">{rupiah(row.balance_after)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {total > rows.length ? (
              <p className="px-4 py-2.5 text-[11px] text-slate-400 border-t border-slate-100">
                Menampilkan {rows.length} dari {total} mutasi — persempit filter untuk melihat sisanya.
              </p>
            ) : null}
          </div>
        )}
      </div>

      {adjustOpen ? (
        <KoreksiSaldoModal
          resellers={resellers}
          onClose={() => setAdjustOpen(false)}
          onSaved={() => {
            setAdjustOpen(false);
            load();
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

function KoreksiSaldoModal({
  resellers,
  onClose,
  onSaved,
}: {
  resellers: ResellerAdminRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [resellerId, setResellerId] = useState("");
  const [direction, setDirection] = useState<"add" | "sub">("add");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!resellerId) return setError("Pilih reseller dulu.");
    if (!amount || amount < 1) return setError("Jumlah koreksi tidak valid.");
    if (!note.trim()) return setError("Catatan koreksi wajib diisi.");
    setBusy(true);
    try {
      await opsResellerApi.adjust({
        reseller_id: resellerId,
        amount: direction === "add" ? amount : -amount,
        note: note.trim(),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Gagal menyimpan koreksi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Koreksi saldo" onClose={onClose} width={460}>
      <div className="space-y-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Reseller</label>
          <select
            className="w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-lg text-sm font-semibold text-slate-900"
            value={resellerId}
            onChange={(e) => setResellerId(e.target.value)}
          >
            <option value="">— Pilih reseller —</option>
            {resellers.map((row) => (
              <option key={row.id} value={row.id}>
                {row.store_name} ({row.owner_name})
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Arah</label>
            <select
              className="w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-lg text-sm font-semibold text-slate-900"
              value={direction}
              onChange={(e) => setDirection(e.target.value as "add" | "sub")}
            >
              <option value="add">Tambah saldo</option>
              <option value="sub">Kurangi saldo</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Jumlah (Rp)</label>
            <RupiahInput value={amount} onChange={setAmount} placeholder="100.000" />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
            Catatan <span className="text-red-500">*</span>
          </label>
          <textarea
            className="w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-lg text-sm font-semibold text-slate-900"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Alasan koreksi (wajib)"
          />
        </div>
        <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Koreksi tercatat permanen di mutasi saldo dan tidak bisa dihapus.
        </p>
        {error ? <p className="text-sm text-red-600 font-semibold">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200">
            Batal
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Menyimpan…" : "Simpan koreksi"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

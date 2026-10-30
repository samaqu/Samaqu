"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { AdminApiError, opsResellerApi, type ResellerAdminRow } from "./api";
import { rupiah } from "@/lib/reseller/format";
import { ConfirmActionModal } from "./Modal";
import ResellerFormModal from "./ResellerFormModal";

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active: { label: "Aktif", cls: "bg-emerald-100 text-emerald-700" },
  suspended: { label: "Nonaktif", cls: "bg-amber-100 text-amber-700" },
  rejected: { label: "Ditolak", cls: "bg-red-100 text-red-700" },
  pending: { label: "Menunggu", cls: "bg-slate-100 text-slate-600" },
};

export default function ResellersTab({
  rows,
  loading,
  onChanged,
  onOpenDetail,
}: {
  rows: ResellerAdminRow[];
  loading: boolean;
  onChanged: () => void;
  onOpenDetail: (row: ResellerAdminRow) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [form, setForm] = useState<{ open: boolean; initial: ResellerAdminRow | null }>({ open: false, initial: null });
  const [toggle, setToggle] = useState<ResellerAdminRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!needle) return true;
      return (
        row.store_name.toLowerCase().includes(needle) ||
        row.owner_name.toLowerCase().includes(needle) ||
        String(row.whatsapp || "").includes(needle) ||
        String(row.city || "").toLowerCase().includes(needle)
      );
    });
  }, [rows, query, status]);

  const setActive = async (row: ResellerAdminRow, active: boolean) => {
    setBusy(true);
    setError("");
    try {
      await opsResellerApi.updateReseller(row.id, { status: active ? "active" : "suspended" });
      setToggle(null);
      onChanged();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Gagal mengubah status.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full pl-9 pr-3 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            placeholder="Cari nama toko, pemilik, WA, kota…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="px-3 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter status"
        >
          <option value="all">Semua status</option>
          <option value="active">Aktif</option>
          <option value="suspended">Nonaktif</option>
          <option value="rejected">Ditolak</option>
        </select>
        <button
          type="button"
          onClick={() => setForm({ open: true, initial: null })}
          className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 inline-flex items-center gap-1.5"
        >
          <Plus size={15} /> Tambah Reseller
        </button>
      </div>

      {error ? <div className="px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm font-semibold">{error}</div> : null}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Memuat reseller…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-bold text-slate-700">Belum ada reseller.</p>
            <p className="text-sm text-slate-500 mt-1">Klik "Tambah Reseller" untuk membuat akun reseller pertama.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-2.5">Toko</th>
                  <th className="px-4 py-2.5">WhatsApp</th>
                  <th className="px-4 py-2.5">Kota</th>
                  <th className="px-4 py-2.5 text-right">Saldo</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const badge = STATUS_BADGE[row.status] || STATUS_BADGE.pending;
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                      onClick={() => onOpenDetail(row)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 text-[13px]">{row.store_name}</div>
                        <div className="text-[11px] text-slate-500">{row.owner_name}</div>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-slate-600">{row.whatsapp || "—"}</td>
                      <td className="px-4 py-3 text-[12px] text-slate-600">{row.city || "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-bold text-slate-900 text-[13px]">{rupiah(row.saldo?.saldo_tersedia ?? 0)}</div>
                        {(row.saldo?.saldo_ditahan ?? 0) > 0 ? (
                          <div className="text-[11px] text-amber-600">ditahan {rupiah(row.saldo?.saldo_ditahan ?? 0)}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="px-2.5 py-1.5 rounded-lg text-[12px] font-bold bg-slate-100 hover:bg-slate-200"
                            onClick={() => setForm({ open: true, initial: row })}
                          >
                            Ubah
                          </button>
                          <button
                            className={`px-2.5 py-1.5 rounded-lg text-[12px] font-bold ${
                              row.status === "active"
                                ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            }`}
                            onClick={() => setToggle(row)}
                          >
                            {row.status === "active" ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {form.open ? (
        <ResellerFormModal
          initial={form.initial}
          onClose={() => setForm({ open: false, initial: null })}
          onSaved={onChanged}
        />
      ) : null}

      {toggle ? (
        <ConfirmActionModal
          title={toggle.status === "active" ? "Nonaktifkan reseller" : "Aktifkan reseller"}
          description={
            toggle.status === "active"
              ? `Nonaktifkan ${toggle.store_name}? Reseller tidak bisa login sampai diaktifkan lagi.`
              : `Aktifkan kembali ${toggle.store_name}? Reseller bisa login dan berjualan lagi.`
          }
          confirmLabel={toggle.status === "active" ? "Nonaktifkan" : "Aktifkan"}
          tone={toggle.status === "active" ? "danger" : "primary"}
          busy={busy}
          onClose={() => setToggle(null)}
          onConfirm={() => setActive(toggle, toggle.status !== "active")}
        />
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Coins, Package, Search, ShieldCheck, TrendingUp, Users2 } from "lucide-react";
import { useToast } from "@/components/AdminToast";
import {
  AdminPageHeader,
  AdminTable,
  AdminTh,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  StatusBadge,
  StatCard,
  adminFetch,
  fmtDate,
  money,
  num,
} from "./affiliate-admin-ui";

/**
 * Admin → Affiliate → Data Affiliate.
 *
 * Daftar affiliate: status pendaftaran/akun, kode referral, dan performa
 * (pesanan, omzet, komisi). Admin bisa menyetujui / menolak / menonaktifkan.
 */

interface AffiliateRow {
  id: string;
  affiliateCode: string;
  fullName: string;
  displayName: string | null;
  email: string;
  phone: string | null;
  status: string;
  rejectReason: string | null;
  primaryChannel: string | null;
  channelHandle: string | null;
  contentDescription: string | null;
  approvedAt: string | null;
  createdAt: string;
  links: number;
  clicks: number;
  orders: number;
  completedOrders: number;
  sales: number;
  commission: { pending: number; approved: number; paid: number; rejected: number; total: number };
}

interface Payload {
  affiliates: AffiliateRow[];
  totals: {
    affiliates: number;
    active: number;
    pending: number;
    clicks: number;
    orders: number;
    sales: number;
    commission: number;
    paid: number;
  };
}

export default function AffiliateDataView() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [rejecting, setRejecting] = useState<AffiliateRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState("");
  const { showToast } = useToast();

  const load = async () => {
    try {
      const json = await adminFetch<Payload>("/api/admin/affiliate/affiliates");
      setData(json);
      setError("");
    } catch (e) {
      console.error("[ADMIN-AFFILIATE] Gagal memuat data affiliate:", e);
      setError(e instanceof Error ? e.message : "Gagal memuat data affiliate.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    const list = data?.affiliates || [];
    const q = query.trim().toLowerCase();
    return list.filter((a) => {
      if (statusFilter && a.status !== statusFilter) return false;
      if (!q) return true;
      return [a.fullName, a.email, a.affiliateCode, a.phone || "", a.primaryChannel || "", a.channelHandle || ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [data, query, statusFilter]);

  const act = async (affiliate: AffiliateRow, action: string, reason?: string) => {
    setBusy(affiliate.id);
    try {
      await adminFetch("/api/admin/affiliate/affiliates", {
        method: "PATCH",
        body: JSON.stringify({ id: affiliate.id, action, reason }),
      });
      showToast("success", "Status affiliate diperbarui.");
      setRejecting(null);
      setRejectReason("");
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Gagal menyimpan perubahan.");
    } finally {
      setBusy("");
    }
  };

  if (loading) return <LoadingBlock />;

  const totals = data?.totals;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Data Affiliate"
        sub="Daftar affiliate, status pendaftaran, kode referral, dan performa penjualan."
      />

      {error && <ErrorBlock message={error} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Users2 size={16} strokeWidth={1.9} />} label="Total Affiliate" value={num(totals?.affiliates)} sub={`${num(totals?.active)} aktif`} />
        <StatCard icon={<ShieldCheck size={16} strokeWidth={1.9} />} label="Menunggu Persetujuan" value={num(totals?.pending)} />
        <StatCard icon={<TrendingUp size={16} strokeWidth={1.9} />} label="Omzet Teratribusi" value={money(totals?.sales)} sub={`${num(totals?.orders)} pesanan`} />
        <StatCard icon={<Coins size={16} strokeWidth={1.9} />} label="Komisi Dihasilkan" value={money(totals?.commission)} sub={`${money(totals?.paid)} dibayarkan`} />
      </div>

      <div className="card">
        <div className="flex items-center gap-3 flex-wrap p-3" style={{ borderBottom: "1px solid var(--bd)" }}>
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--fg3)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama, email, atau kode referral…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg outline-none"
              style={{ background: "var(--sub)", border: "1px solid var(--bd)", color: "var(--fg)" }}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg outline-none"
            style={{ background: "var(--sub)", border: "1px solid var(--bd)", color: "var(--fg)" }}
          >
            <option value="">Semua Status</option>
            <option value="menunggu">Menunggu Persetujuan</option>
            <option value="aktif">Aktif</option>
            <option value="ditolak">Ditolak</option>
            <option value="nonaktif">Nonaktif</option>
          </select>
        </div>

        {rows.length === 0 ? (
          <EmptyBlock message="Belum ada affiliate yang cocok." />
        ) : (
          <AdminTable head={["Affiliate", "Kode Referral", "Status", "Pesanan", "Omzet", "Komisi", "Daftar"]}>
            {rows.map((a) => (
              <tr key={a.id}>
                <AdminTh>
                  <div className="font-semibold" style={{ color: "var(--fg)" }}>{a.fullName}</div>
                  <div className="text-[11px]" style={{ color: "var(--fg3)" }}>{a.email}{a.phone ? ` · ${a.phone}` : ""}</div>
                  {a.primaryChannel ? (
                    <div className="text-[11px] truncate max-w-[240px]" style={{ color: "var(--fg3)" }}>
                      {a.primaryChannel}
                      {a.channelHandle ? ` · ${a.channelHandle}` : ""}
                    </div>
                  ) : null}
                  {a.contentDescription ? (
                    <div
                      className="text-[11px] truncate max-w-[240px]"
                      style={{ color: "var(--fg3)" }}
                      title={a.contentDescription}
                    >
                      {a.contentDescription}
                    </div>
                  ) : null}
                </AdminTh>
                <AdminTh>
                  <code className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--sub)", color: "var(--fg2)" }}>
                    {a.affiliateCode}
                  </code>
                </AdminTh>
                <AdminTh><StatusBadge status={a.status} kind="affiliate" /></AdminTh>
                <AdminTh>
                  <div className="font-semibold" style={{ color: "var(--fg)" }}>{num(a.orders)}</div>
                  <div className="text-[11px]" style={{ color: "var(--fg3)" }}>{num(a.completedOrders)} selesai</div>
                </AdminTh>
                <AdminTh className="font-semibold" >{money(a.sales)}</AdminTh>
                <AdminTh>
                  <div className="font-semibold" style={{ color: "var(--fg)" }}>{money(a.commission.total)}</div>
                  <div className="text-[11px]" style={{ color: "var(--fg3)" }}>
                    {money(a.commission.pending)} menunggu · {money(a.commission.approved)} tersedia
                  </div>
                </AdminTh>
                <AdminTh>
                  <div className="flex items-center gap-1.5">
                    {a.status === "menunggu" && (
                      <>
                        <button
                          disabled={busy === a.id}
                          onClick={() => act(a, "approve")}
                          className="px-2.5 py-1 text-[11px] font-semibold rounded-lg disabled:opacity-50"
                          style={{ background: "var(--su)", color: "#fff" }}
                        >
                          Setujui
                        </button>
                        <button
                          disabled={busy === a.id}
                          onClick={() => { setRejecting(a); setRejectReason(""); }}
                          className="px-2.5 py-1 text-[11px] font-semibold rounded-lg"
                          style={{ background: "#fef2f2", color: "#b91c1c" }}
                        >
                          Tolak
                        </button>
                      </>
                    )}
                    {a.status === "aktif" && (
                      <button
                        disabled={busy === a.id}
                        onClick={() => act(a, "deactivate")}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-lg"
                        style={{ background: "var(--sub)", color: "var(--fg2)" }}
                      >
                        Nonaktifkan
                      </button>
                    )}
                    {(a.status === "nonaktif" || a.status === "ditolak") && (
                      <button
                        disabled={busy === a.id}
                        onClick={() => act(a, "activate")}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-lg"
                        style={{ background: "var(--sub)", color: "var(--fg)" }}
                      >
                        Aktifkan
                      </button>
                    )}
                  </div>
                  <div className="text-[10px] mt-1" style={{ color: "var(--fg3)" }}>
                    Daftar {fmtDate(a.createdAt)}
                  </div>
                </AdminTh>
              </tr>
            ))}
          </AdminTable>
        )}
      </div>

      {rejecting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(17,24,39,.45)" }}>
          <div className="card p-5 w-full max-w-md">
            <h3 className="text-base font-bold" style={{ color: "var(--fg)" }}>Alasan penolakan</h3>
            <p className="text-xs mt-1" style={{ color: "var(--fg2)" }}>
              Alasan ini akan dilihat admin dan tersimpan di riwayat aktivitas affiliate.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Contoh: Data profil tidak lengkap"
              className="w-full mt-3 p-3 text-sm rounded-lg outline-none"
              style={{ background: "var(--sub)", border: "1px solid var(--bd)", color: "var(--fg)" }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setRejecting(null)}
                className="px-3 py-2 text-sm font-semibold rounded-lg"
                style={{ background: "var(--sub)", color: "var(--fg)" }}
              >
                Batal
              </button>
              <button
                disabled={busy === rejecting.id}
                onClick={() => {
                  if (!rejectReason.trim()) {
                    showToast("error", "Alasan penolakan wajib diisi.");
                    return;
                  }
                  act(rejecting, "reject", rejectReason.trim());
                }}
                className="px-3 py-2 text-sm font-semibold rounded-lg disabled:opacity-50"
                style={{ background: "#b91c1c", color: "#fff" }}
              >
                Tolak Affiliate
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card p-4 flex items-start gap-2 text-xs" style={{ color: "var(--fg2)" }}>
        <Package size={15} className="shrink-0 mt-0.5" />
        <span>
          Affiliate baru bisa membuat tautan & earns komisi setelah disetujui. Aturan komisi
          (persentase, masa validasi, minimum pencairan) diatur di halaman <b>Pengaturan Komisi</b>.
        </span>
      </div>
    </div>
  );
}

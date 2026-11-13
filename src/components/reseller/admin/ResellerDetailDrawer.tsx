"use client";

/**
 * Drawer "Detail Reseller" panel admin — bentuk SAMA dengan Detail Pesanan di menu Transaksi
 * (`PanelDetailShell` + kelas `dp-*`: header bergradasi, kartu bertumpuk, baris label/nilai),
 * jadi admin tidak melihat dua gaya yang berbeda.
 *
 * Murni tampilan + satu aksi baru: ketuk nomor pesanan untuk membuka Detail Transaksi pesanan itu.
 * Data dari `opsResellerApi.resellerDetail`; tidak menulis apa pun.
 */

import { useEffect, useState, type ReactNode } from "react";
import { Award, Gem, Medal, Receipt, Store, User, Wallet } from "lucide-react";
import { PanelDetailShell } from "@/components/ops/transaksi/PanelDetailPesanan";
import { opsResellerApi, type ResellerAdminRow, type ResellerDetail } from "./api";
import { describeLedgerRow, rupiah, tglJamID } from "@/lib/reseller/format";
import { bankDisplayName } from "@/lib/reseller/banks";
import type { LevelKey, LevelSummary } from "@/lib/reseller/level";
import MutationBadge from "./MutationBadge";

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "err" | "muted" }> = {
  active: { label: "Aktif", tone: "ok" },
  suspended: { label: "Nonaktif", tone: "warn" },
  rejected: { label: "Ditolak", tone: "err" },
  pending: { label: "Menunggu", tone: "muted" },
};

const ORDER_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "err" | "muted" }> = {
  pending: { label: "Menunggu", tone: "warn" },
  diproses: { label: "Diproses", tone: "ok" },
  dikirim: { label: "Dikirim", tone: "ok" },
  selesai: { label: "Selesai", tone: "ok" },
  dibatalkan: { label: "Dibatalkan", tone: "err" },
};

const LEVEL_ICON: Record<LevelKey, typeof Medal> = { silver: Medal, gold: Award, platinum: Gem };

/** 2.500.000 -> "Rp2,5 jt" untuk kalimat progres. */
function ringkas(amount: number): string {
  if (amount >= 1_000_000) return `Rp${String(Math.round((amount / 1_000_000) * 10) / 10).replace(".", ",")} jt`;
  if (amount >= 10_000) return `Rp${Math.round(amount / 1000)} rb`;
  return rupiah(amount);
}

function Kartu({ icon, judul, aside, children }: { icon: ReactNode; judul: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="dp-kartu">
      <div className="dp-kepala">
        <div className="dp-kepala-kiri">
          <span className="dp-kepala-ikon">{icon}</span>
          <span className="dp-kepala-judul">{judul}</span>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Baris({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dp-baris">
      <span className="dp-baris-label">{label}</span>
      <span className="dp-baris-nilai">{children}</span>
    </div>
  );
}

function LevelKartu({ level }: { level: LevelSummary }) {
  const Icon = LEVEL_ICON[level.key];
  return (
    <div className="rsd-level">
      <div className="rsd-level-top">
        <span className={`rsd-level-badge ${level.key}`}>
          <Icon size={18} />
        </span>
        <div className="rsd-level-txt">
          <b>
            {level.label} {level.manual ? <span className="rsd-pill warn">Manual</span> : null}
          </b>
          <small>Rata-rata belanja {rupiah(level.rata_rata)} / bulan</small>
        </div>
      </div>
      <div className="rsd-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level.progress}>
        <span className={level.next ? level.next.key : level.key} style={{ width: `${level.progress}%` }} />
      </div>
      {level.manual ? (
        <p className="rsd-level-note">
          Level ditetapkan admin. Menurut belanja: <b>{level.tiers.find((tier) => tier.key === level.computed_key)?.label ?? "—"}</b>. Ubah lewat
          tombol Ubah di daftar reseller.
        </p>
      ) : null}
      <p className="rsd-level-note">
        {level.next
          ? `Naik ke ${level.next.label} di rata-rata ${ringkas(level.next.min)} / bulan. Kurang ${ringkas(level.sisa)}.`
          : "Sudah di level tertinggi."}{" "}
        <span>{level.bulan_dihitung >= 3 ? "Dihitung dari 3 bulan terakhir." : "Dihitung sejak bergabung."}</span>
      </p>
    </div>
  );
}

export default function ResellerDetailDrawer({
  row,
  defaultDiscount,
  tema,
  onClose,
  onOpenOrder,
}: {
  row: ResellerAdminRow;
  /** Diskon default pengaturan reseller (persen), dipakai kalau reseller tanpa diskon khusus. */
  defaultDiscount: number;
  /** `mono` = dashboard ops; `warna` = panel admin (sama dengan Detail Transaksi). */
  tema: "mono" | "warna";
  onClose: () => void;
  /** Buka Detail Transaksi untuk satu nomor pesanan. */
  onOpenOrder: (orderNumber: string) => void;
}) {
  const [detail, setDetail] = useState<ResellerDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setDetail(null);
    setError("");
    opsResellerApi
      .resellerDetail(row.id)
      .then((res) => alive && setDetail(res))
      .catch(() => alive && setError("Gagal memuat detail reseller."));
    return () => {
      alive = false;
    };
  }, [row.id]);

  return (
    <PanelDetailShell open onClose={onClose} tema={tema}>
      <ResellerDetailView
        row={row}
        detail={detail}
        error={error}
        defaultDiscount={defaultDiscount}
        tema={tema}
        onClose={onClose}
        onOpenOrder={onOpenOrder}
      />
    </PanelDetailShell>
  );
}

/** Isi drawer (tanpa pemuatan data) — dipisah supaya bisa dirender/dites langsung. */
export function ResellerDetailView({
  row,
  detail,
  error,
  defaultDiscount,
  tema,
  onClose,
  onOpenOrder,
}: {
  row: ResellerAdminRow;
  detail: ResellerDetail | null;
  error: string;
  defaultDiscount: number;
  tema: "mono" | "warna";
  onClose: () => void;
  onOpenOrder: (orderNumber: string) => void;
}) {
  const reseller = detail?.reseller ?? row;
  const status = STATUS[reseller.status] || STATUS.pending;
  const level = detail?.level ?? row.level ?? null;
  const khusus =
    reseller.discount_percent !== null && reseller.discount_percent !== undefined && String(reseller.discount_percent).trim() !== "";

  return (
    <>
      <style>{RSD_CSS}</style>
      <div className={`dp-wrap${tema === "mono" ? " tema-mono" : ""}`}>
        <div className="dp-header">
          <div className="dp-header-txt">
            <span className="dp-sumber">Detail Reseller</span>
            <h1 className="dp-judul">{row.store_name}</h1>
          </div>
          <button type="button" className="dp-tutup" onClick={onClose} aria-label="Tutup">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="dp-isi">
          {error ? <p className="rsd-err">{error}</p> : null}
          {!detail && !error ? <p className="dp-kosong-teks" style={{ padding: "12px 4px" }}>Memuat…</p> : null}

          {detail ? (
            <>
              {/* 1. Profil + status */}
              <Kartu icon={<Store size={14} />} judul="Profil toko" aside={<span className={`rsd-pill ${status.tone}`}>{status.label}</span>}>
                <Baris label="Pemilik">{reseller.owner_name}</Baris>
                <Baris label="WhatsApp">{reseller.whatsapp || "—"}</Baris>
                <Baris label="Kota">{reseller.city || "—"}</Baris>
                <Baris label="Bergabung">{tglJamID(reseller.created_at)}</Baris>
              </Kartu>

              {/* 2. Level */}
              {level ? (
                <Kartu icon={<Award size={14} />} judul="Level reseller">
                  <LevelKartu level={level} />
                </Kartu>
              ) : null}

              {/* 3. Saldo + diskon */}
              <Kartu icon={<Wallet size={14} />} judul="Saldo & diskon">
                <div className="dp-ringkas">
                  <div className="dp-ringkas-baris">
                    <span>Saldo bisa dipakai</span>
                    <b>{rupiah(detail.saldo.saldo_tersedia)}</b>
                  </div>
                  <div className="dp-ringkas-baris">
                    <span>Ditahan (penarikan menunggu)</span>
                    <b>{rupiah(detail.saldo.saldo_ditahan)}</b>
                  </div>
                  <div className="dp-ringkas-garis" />
                  <div className="dp-ringkas-baris">
                    <span>Total sudah ditarik</span>
                    <b>{rupiah(detail.total_withdrawn)}</b>
                  </div>
                </div>
                <Baris label="Diskon">
                  {khusus ? Number(reseller.discount_percent) : defaultDiscount}%{" "}
                  <span className={`rsd-pill ${khusus ? "ok" : "muted"}`}>{khusus ? "khusus" : "default"}</span>
                </Baris>
              </Kartu>

              {/* 4. Pesanan terakhir — ketuk untuk membuka Detail Transaksi */}
              <Kartu icon={<Receipt size={14} />} judul="Pesanan terakhir">
                {detail.orders.length === 0 ? (
                  <p className="dp-kosong-teks">Belum ada pesanan.</p>
                ) : (
                  <div className="rsd-orders">
                    {detail.orders.map((order) => {
                      const st = ORDER_STATUS[order.status] || { label: order.status, tone: "muted" as const };
                      return (
                        <button type="button" className="rsd-order" key={order.id} onClick={() => onOpenOrder(order.order_number)}>
                          <span className="rsd-order-main">
                            <b>{order.order_number}</b>
                            <small>
                              {order.customer_name || "—"} · {tglJamID(order.created_at)}
                            </small>
                          </span>
                          <span className="rsd-order-side">
                            <b>{rupiah(order.total)}</b>
                            <span className={`rsd-pill ${st.tone}`}>{st.label}</span>
                          </span>
                          <span className="rsd-chev" aria-hidden="true">›</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Kartu>

              {/* 5. Mutasi terakhir */}
              <Kartu icon={<Wallet size={14} />} judul="Mutasi terakhir">
                {detail.ledger.length === 0 ? (
                  <p className="dp-kosong-teks">Belum ada mutasi saldo.</p>
                ) : (
                  <div className="rsd-ledger">
                    {detail.ledger.map((item) => {
                      const view = describeLedgerRow(item, { fullAccount: true, showActor: true });
                      return (
                        <div className="rsd-led" key={item.id}>
                          <div className="rsd-led-main">
                            <div className="rsd-led-title">
                              <b>{view.title}</b>
                              <MutationBadge status={view.badge} />
                            </div>
                            <small>{view.description}</small>
                            {view.extra ? <small className="soft">{view.extra}</small> : null}
                          </div>
                          <div className="rsd-led-side">
                            <b className={item.amount >= 0 ? "plus" : ""}>
                              {item.amount >= 0 ? "+" : "−"}
                              {rupiah(Math.abs(item.amount))}
                            </b>
                            <small>saldo {rupiah(item.balance_after)}</small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Kartu>

              {/* 6. Rekening */}
              <Kartu icon={<User size={14} />} judul="Rekening penarikan">
                <Baris label="Bank">{bankDisplayName(reseller.bank_name) || "—"}</Baris>
                <Baris label="No. rekening">{reseller.bank_number || "—"}</Baris>
                <Baris label="Atas nama">{reseller.bank_holder || "—"}</Baris>
              </Kartu>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

/* Gaya tambahan (level, pesanan yang bisa diketuk, mutasi). Kerangka & kartu memakai dp-* milik PanelDetailShell. */
const RSD_CSS = `
.rsd-err{margin:0;padding:10px 12px;border-radius:12px;background:#fdebf0;color:#a3355f;font-size:12px;font-weight:800}
.rsd-pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:900;background:#eef1f5;color:#4a586b;white-space:nowrap}
.rsd-pill.ok{background:#e3f6ec;color:#1b7347}
.rsd-pill.warn{background:#fff3d6;color:#8a5600}
.rsd-pill.err{background:#fdebf0;color:#a3355f}
.rsd-level{display:flex;flex-direction:column;gap:8px}
.rsd-level-top{display:flex;align-items:center;gap:10px}
.rsd-level-badge{flex:none;display:grid;place-items:center;width:38px;height:38px;border-radius:12px}
.rsd-level-badge.silver{background:linear-gradient(135deg,#f1f5f9,#cbd5e1);color:#334155}
.rsd-level-badge.gold{background:linear-gradient(135deg,#fef3c7,#f59e0b);color:#78350f}
.rsd-level-badge.platinum{background:linear-gradient(135deg,#e0e7ff,#818cf8);color:#1e1b4b}
.rsd-level-txt{display:flex;flex-direction:column;gap:1px;min-width:0}
.rsd-level-txt b{font-size:16px;font-weight:900;line-height:1.2}
.rsd-level-txt small{font-size:11px;font-weight:700;color:#6b7a8c}
.rsd-bar{height:8px;border-radius:999px;background:#eef1f5;overflow:hidden}
.rsd-bar span{display:block;height:100%;min-width:8px;border-radius:999px}
.rsd-bar span.silver{background:linear-gradient(90deg,#94a3b8,#64748b)}
.rsd-bar span.gold{background:linear-gradient(90deg,#fbbf24,#d97706)}
.rsd-bar span.platinum{background:linear-gradient(90deg,#818cf8,#4f46e5)}
.rsd-level-note{margin:0;font-size:11.5px;font-weight:700;color:#3d4a5c;line-height:1.45}
.rsd-level-note span{color:#8a97a6;font-weight:600}
.rsd-orders{display:flex;flex-direction:column}
.rsd-order{display:flex;align-items:center;gap:8px;width:100%;padding:8px 2px;border:0;border-top:1px solid #f1f4f8;background:none;text-align:left;font:inherit;cursor:pointer;color:inherit}
.rsd-order:first-child{border-top:0}
.rsd-order:hover{background:rgba(120,140,170,.07)}
.rsd-order-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px}
.rsd-order-main b{font-size:12px;font-weight:900;font-family:ui-monospace,monospace;overflow-wrap:anywhere}
.rsd-order-main small{font-size:10.5px;font-weight:600;color:#8a97a6}
.rsd-order-side{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:3px}
.rsd-order-side b{font-size:12px;font-weight:900}
.rsd-chev{flex:none;font-size:18px;font-weight:700;color:#9aa6b4;line-height:1}
.rsd-ledger{display:flex;flex-direction:column}
.rsd-led{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid #f1f4f8}
.rsd-led:first-child{border-top:0}
.rsd-led-main{display:flex;flex-direction:column;gap:1px;min-width:0}
.rsd-led-title{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.rsd-led-title b{font-size:12px;font-weight:900}
.rsd-led small{font-size:10.5px;font-weight:600;color:#6b7a8c;line-height:1.35}
.rsd-led small.soft{color:#9aa6b4}
.rsd-led-side{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:1px;text-align:right}
.rsd-led-side b{font-size:12px;font-weight:900}
.rsd-led-side b.plus{color:#1b7347}
`;

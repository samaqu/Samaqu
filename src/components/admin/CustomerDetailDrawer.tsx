"use client";

/**
 * Detail pelanggan admin — drawer yang meluncur dari kanan, pola yang sama dengan
 * `OrderDetailDrawer`/`ProductDetailDrawer`. Isinya rangkuman pelanggan, **alamat
 * pengiriman** yang dipakai di pesanannya, dan **riwayat belanja** lengkap.
 *
 * Warnanya mengikuti tema admin lain (putih + netral: #fff / #f5f5f5 / #e8e8e8 / #1c1c1c)
 * supaya seragam. Alamat diambil dari `orders.shipping_address/city/postal_code` karena
 * tabel `customers` tidak menyimpan alamat.
 */

import { useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cake, MapPin, Phone, ShoppingBag, X } from "lucide-react";
import { useBodyScrollLock } from "@/lib/use-scroll-lock";

export type CustomerOrder = {
  order_number: string;
  created_at: string;
  total: number;
  status: string;
  items: string[];
  address?: string | null;
  /** Alasan pembatalan (null untuk pesanan lama yang dibatalkan sebelum kolomnya ada). */
  cancelReason?: string | null;
};

export type AdminCustomer = {
  key: string;
  id: string | null;
  name: string;
  whatsapp: string;
  birthDate: string | null;
  registered: boolean;
  orders: CustomerOrder[];
  ordersCount: number;
  /** Pesanan yang benar-benar jadi transaksi (aturan menu Transaksi). */
  paidOrdersCount?: number;
  totalSpend: number;
  lastOrderAt: string | null;
};

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function money(n: number) {
  return "Rp " + (n || 0).toLocaleString("id-ID");
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function formatBirth(iso: string | null) {
  if (!iso) return "Belum diisi";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "Belum diisi";
  return `${d} ${BULAN[m - 1]} ${y}`;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  selesai: { bg: "#ecfdf5", color: "#047857", border: "#d1fae5" },
  diproses: { bg: "#fffbeb", color: "#b45309", border: "#fef3c7" },
  dikirim: { bg: "#eff6ff", color: "#1d4ed8", border: "#dbeafe" },
  menunggu: { bg: "#fffbeb", color: "#b45309", border: "#fef3c7" },
  pending: { bg: "#fffbeb", color: "#b45309", border: "#fef3c7" },
  dibatalkan: { bg: "#f4f4f5", color: "#52525b", border: "#e4e4e7" },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[(status || "").toLowerCase()] || STATUS_STYLES.pending;
  return <span className="cd-pill" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>{status}</span>;
}

export default function CustomerDetailDrawer({
  customer,
  onClose,
}: {
  customer: AdminCustomer | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!customer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [customer, onClose]);

  // Halaman di belakang panel ikut dikunci selama drawer terbuka (satu scrollbar saja).
  useBodyScrollLock(!!customer);

  // Satu alamat bisa dipakai berkali-kali — tampilkan unik, urut dari yang terbaru dipakai.
  const addresses = useMemo(() => {
    const seen = new Map<string, { address: string; count: number; lastAt: string }>();
    for (const o of customer?.orders ?? []) {
      const a = o.address?.trim();
      if (!a) continue;
      const prev = seen.get(a);
      if (prev) {
        prev.count += 1;
        if (o.created_at > prev.lastAt) prev.lastAt = o.created_at;
      } else {
        seen.set(a, { address: a, count: 1, lastAt: o.created_at });
      }
    }
    return Array.from(seen.values()).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  }, [customer]);

  const initials = (customer?.name || "").trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("") || "?";

  return (
    <AnimatePresence>
      {customer && (
        <motion.div
          key="customer-detail-drawer"
          className="cd-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className="cd-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="cd-head">
              <div className="cd-avatar">{initials}</div>
              <div className="cd-head-txt">
                <div className="cd-name-row">
                  <h2 className="cd-name">{customer.name}</h2>
                  {!customer.registered && <span className="cd-badge">Belum daftar</span>}
                </div>
                <p className="cd-sub">
                  <Phone size={12} strokeWidth={1.9} /> {customer.whatsapp || "Tanpa nomor"}
                </p>
              </div>
              <button onClick={onClose} className="cd-x" aria-label="Tutup">
                <X size={18} />
              </button>
            </header>

            <div className="cd-body drawer-scroll">
              {/* Ringkasan */}
              <div className="cd-grid2">
                <div className="cd-card cd-stat">
                  <p className="cd-stat-label">
                    Total Belanja
                    {(customer.paidOrdersCount ?? 0) === 0 && customer.ordersCount > 0 ? " · belum ada yang lunas" : ""}
                  </p>
                  <p className="cd-stat-value">{money(customer.totalSpend)}</p>
                </div>
                <div className="cd-card cd-stat">
                  <p className="cd-stat-label">
                    Jumlah Pesanan
                    {(customer.paidOrdersCount ?? 0) !== customer.ordersCount
                      ? ` · ${customer.paidOrdersCount ?? 0} lunas`
                      : ""}
                  </p>
                  <p className="cd-stat-value">{customer.ordersCount}</p>
                </div>
                <div className="cd-card cd-stat">
                  <p className="cd-stat-label">Belanja Terakhir</p>
                  <p className="cd-stat-value cd-stat-sm">{customer.lastOrderAt ? formatDate(customer.lastOrderAt) : "—"}</p>
                </div>
                <div className="cd-card cd-stat">
                  <p className="cd-stat-label">Tanggal Lahir</p>
                  <p className="cd-stat-value cd-stat-sm">
                    <Cake size={14} strokeWidth={2} className="cd-inline-ico" /> {formatBirth(customer.birthDate)}
                  </p>
                </div>
              </div>

              {/* Alamat pengiriman */}
              <div className="cd-card cd-block">
                <p className="cd-section-title">
                  <MapPin size={14} strokeWidth={2.2} /> Alamat Pengiriman
                </p>
                {addresses.length === 0 ? (
                  <p className="cd-empty">Belum ada alamat — pelanggan ini belum pernah memesan.</p>
                ) : (
                  <ul className="cd-addr-list">
                    {addresses.map((a) => (
                      <li key={a.address} className="cd-addr">
                        <MapPin size={14} strokeWidth={2} className="cd-addr-ico" />
                        <div className="min-w-0">
                          <p className="cd-addr-text">{a.address}</p>
                          <p className="cd-addr-meta">
                            {a.count > 1 ? `Dipakai ${a.count}× · terakhir ${formatDate(a.lastAt)}` : `Terakhir ${formatDate(a.lastAt)}`}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Riwayat belanja */}
              <div className="cd-card cd-block">
                <p className="cd-section-title">
                  <ShoppingBag size={14} strokeWidth={2.2} /> Riwayat Belanja ({customer.orders.length})
                </p>
                {customer.orders.length === 0 ? (
                  <p className="cd-empty">Belum ada pesanan.</p>
                ) : (
                  <ul className="cd-order-list">
                    {customer.orders.map((o) => (
                      <li key={o.order_number} className="cd-order">
                        <div className="min-w-0">
                          <p className="cd-order-num">{o.order_number}</p>
                          <p className="cd-order-items">
                            {formatDate(o.created_at)}
                            {o.items.length > 0 && ` · ${o.items.slice(0, 2).join(", ")}${o.items.length > 2 ? ` +${o.items.length - 2} lainnya` : ""}`}
                          </p>
                          {/batal/i.test(o.status) ? (
                            <p className="cd-order-reason">
                              {o.cancelReason
                                ? `Alasan batal: ${o.cancelReason}`
                                : "Alasan batal tidak tercatat (data lama)"}
                            </p>
                          ) : null}
                        </div>
                        <div className="cd-order-right">
                          <span className="cd-order-total">{money(o.total)}</span>
                          <StatusPill status={o.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Gaya ditulis sebagai <style> biasa (pola sama dengan PD_CSS/ODR_CSS):
                `style jsx global` dengan isi variabel tidak punya id statis, jadi CSS-nya dibuang. */}
            <style>{CD_CSS}</style>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const CD_CSS = `
.cd-overlay{position:fixed;inset:0;z-index:50;display:flex;justify-content:flex-end;background:rgba(15,15,15,.4)}
.cd-panel{width:460px;max-width:100%;height:100%;display:flex;flex-direction:column;background:#ffffff;color:#1c1c1c;box-shadow:-24px 0 60px -24px rgba(0,0,0,.25)}
.cd-head{flex:none;display:flex;align-items:center;gap:12px;padding:18px 20px;border-bottom:1px solid #e8e8e8}
.cd-avatar{width:44px;height:44px;flex:none;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:.85rem;font-weight:800;color:#fff;background:#1c1c1c}
.cd-head-txt{min-width:0;flex:1}
.cd-name-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cd-name{margin:0;font-size:1rem;font-weight:800;color:#1c1c1c;overflow-wrap:anywhere}
.cd-badge{font-size:.62rem;font-weight:800;padding:.16rem .5rem;border-radius:999px;background:#f5f5f5;color:#5f5f5d}
.cd-sub{margin:4px 0 0;display:flex;align-items:center;gap:5px;font-size:.74rem;font-weight:600;color:#9a9a98}
.cd-x{margin-left:auto;flex:none;padding:6px;border-radius:8px;border:1px solid transparent;background:transparent;color:#9a9a98;cursor:pointer}
.cd-x:hover{background:#f5f5f5;color:#1c1c1c}

.cd-body{flex:1;min-height:0;overflow-y:auto;padding:18px 20px 22px;display:flex;flex-direction:column;gap:14px}
.cd-card{background:#ffffff;border:1px solid #e8e8e8;border-radius:12px}
.cd-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cd-stat{padding:13px 14px}
.cd-stat-label{margin:0;font-size:.62rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#9a9a98}
.cd-stat-value{margin:5px 0 0;font-size:1.15rem;font-weight:800;color:#1c1c1c;display:flex;align-items:center;gap:6px}
.cd-stat-sm{font-size:.85rem}
.cd-inline-ico{color:#9a9a98;flex:none}

.cd-block{padding:14px}
.cd-section-title{display:flex;align-items:center;gap:7px;margin:0 0 10px;font-size:.7rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#1c1c1c}
.cd-section-title svg{color:#9a9a98}
.cd-empty{margin:0;font-size:.74rem;font-weight:600;color:#5f5f5d}

.cd-addr-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.cd-addr{display:flex;align-items:flex-start;gap:9px;padding:10px 0;border-top:1px solid #e8e8e8}
.cd-addr:first-child{border-top:0;padding-top:0}
.cd-addr-ico{margin-top:2px;flex:none;color:#9a9a98}
.cd-addr-text{margin:0;font-size:.8rem;font-weight:600;line-height:1.45;color:#1c1c1c;overflow-wrap:anywhere}
.cd-addr-meta{margin:3px 0 0;font-size:.68rem;font-weight:600;color:#9a9a98}

.cd-order-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.cd-order{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid #e8e8e8}
.cd-order:first-child{border-top:0;padding-top:0}
.cd-order-num{margin:0;font-size:.8rem;font-weight:800;color:#1c1c1c;overflow-wrap:anywhere}
.cd-order-items{margin:3px 0 0;font-size:.68rem;font-weight:600;color:#9a9a98}
.cd-order-reason{margin:2px 0 0;font-size:.66rem;font-weight:700;color:#b42318;overflow-wrap:anywhere}
.cd-order-right{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0}
.cd-order-total{font-size:.78rem;font-weight:800;color:#1c1c1c;white-space:nowrap}
.cd-pill{font-size:.62rem;font-weight:800;padding:.16rem .5rem;border-radius:999px;white-space:nowrap}

@media (max-width:767.98px){
 .cd-panel{width:100%}
 .cd-head{padding:14px 16px}
 .cd-body{padding:16px}
}
`;

"use client";

/**
 * Detail lead (panel samping) untuk menu Leads.
 *
 * Gayanya sengaja SAMA dengan detail Transaksi: memakai kerangka `PanelDetailShell` dan kelas
 * `dp-*` dari PanelDetailPesanan, jadi header, kartu, baris, dan footer terlihat satu keluarga.
 *
 * Isinya hanya data yang tercatat: info lead (tabel `leads`) dan riwayat transaksi sah nomor yang
 * sama (tabel `orders`, dihitung server di /api/ops/leads/repeat). Tidak menulis apa pun.
 */

import { useEffect } from "react";
import { CheckCircle2, Clock, MessageCircle, Pencil, Receipt, Repeat, Users } from "lucide-react";
import { PanelDetailShell } from "@/components/ops/transaksi/PanelDetailPesanan";
import { formatRupiah, formatTanggalSingkatID } from "@/components/ops/transaksi/transaksi-format";
import { waNumber } from "@/lib/whatsapp";
import { wibDateOf } from "@/lib/leads-repeat";

const STATUS_ORDER = { diproses: "Diproses", dikirim: "Dikirim", selesai: "Selesai" };
const MAX_CHIP_ITEM = 3;

/** Info kartu status di atas: ditentukan dari riwayat transaksi nomor ini. */
function statusInfo(history) {
  if (history?.repeat) {
    return {
      judul: `Customer repeat · ${history.count} transaksi`,
      catatan: `Total belanja Rp ${formatRupiah(history.spend)}`,
      ikon: <Repeat size={17} strokeWidth={2} />,
      bg: "#e1f5ea",
      warna: "#1b7347",
    };
  }
  if (history) {
    return {
      judul: "Closing · 1 transaksi",
      catatan: `Total belanja Rp ${formatRupiah(history.spend)}`,
      ikon: <CheckCircle2 size={17} strokeWidth={2} />,
      bg: "#e8f3fb",
      warna: "#2774a8",
    };
  }
  return {
    judul: "Belum ada transaksi",
    catatan: "Belum ada pesanan sah dari nomor ini",
    ikon: <Clock size={17} strokeWidth={2} />,
    bg: "#fff3d6",
    warna: "#a46a00",
  };
}

export default function LeadDetailDrawer({ open, lead, history, tema = "mono", onClose, onEdit }) {
  // Tutup dengan Escape; scroll halaman dikunci selama drawer terbuka (sama seperti Transaksi).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    const { body, documentElement } = document;
    const gap = window.innerWidth - documentElement.clientWidth;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      window.removeEventListener("keydown", onKey);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [open, onClose]);

  if (!lead) {
    return (
      <PanelDetailShell open={false} onClose={onClose} tema={tema}>
        {null}
      </PanelDetailShell>
    );
  }

  const info = statusInfo(history);
  const wa = waNumber(lead.kontak || "");
  const canChat = /^628[1-9][0-9]{6,10}$/.test(wa);
  const chat = () => {
    if (canChat) window.open(`https://wa.me/${wa}`, "_blank", "noopener,noreferrer");
  };
  const closing = lead.status === "closing";

  return (
    <PanelDetailShell open={open} onClose={onClose} tema={tema}>
      <div className={`dp-wrap${tema === "mono" ? " tema-mono" : ""}`}>
        <div className="dp-header">
          <div className="dp-header-txt">
            <span className="dp-sumber">{lead.sumber || "Lead"}</span>
            <h1 className="dp-judul">Detail Lead</h1>
          </div>
          <button type="button" className="dp-tutup" onClick={onClose} aria-label="Tutup">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="dp-isi">
          {/* Kartu status: repeat / closing / belum ada transaksi. */}
          <section className="dp-kartu dp-status-kartu">
            <div className="dp-status">
              <div className="dp-status-kiri">
                <div className="dp-status-ikon" style={{ background: info.bg, color: info.warna }}>
                  {info.ikon}
                </div>
                <div className="dp-status-teks">
                  <span className="dp-status-judul">{info.judul}</span>
                  <span className="dp-status-catatan">{info.catatan}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Informasi lead. */}
          <section className="dp-kartu">
            <div className="dp-kepala">
              <div className="dp-kepala-kiri">
                <span className="dp-kepala-ikon">
                  <Users size={14} strokeWidth={2} />
                </span>
                <span className="dp-kepala-judul">Informasi Lead</span>
              </div>
              <button
                type="button"
                className="dp-wa"
                onClick={chat}
                disabled={!canChat}
                style={canChat ? undefined : { opacity: 0.4, cursor: "not-allowed" }}
                aria-label="Chat WhatsApp"
              >
                <MessageCircle size={14} strokeWidth={2} />
              </button>
            </div>
            <div className="dp-baris dp-baris-detail">
              <span className="dp-baris-label">Kontak</span>
              <span className="dp-baris-nilai">{lead.kontak}</span>
            </div>
            <div className="dp-baris dp-baris-detail">
              <span className="dp-baris-label">Masuk</span>
              <span className="dp-baris-nilai">
                {formatTanggalSingkatID(lead.tanggal)}
                {lead.jam ? ` · ${lead.jam}` : ""}
              </span>
            </div>
            <div className="dp-baris dp-baris-detail">
              <span className="dp-baris-label">Sumber</span>
              <span className="dp-baris-nilai">{lead.sumber || "-"}</span>
            </div>
            <div className="dp-baris dp-baris-detail">
              <span className="dp-baris-label">PIC</span>
              <span className={`dp-baris-nilai${lead.pic ? "" : " kosong"}`}>{lead.pic || "-"}</span>
            </div>
            <div className="dp-baris dp-baris-detail">
              <span className="dp-baris-label">Status</span>
              <span className="dp-baris-nilai">{closing ? "Closing" : "Belum Closing"}</span>
            </div>
            {closing && lead.nominal ? (
              <div className="dp-baris dp-baris-detail">
                <span className="dp-baris-label">Nominal closing</span>
                <span className="dp-baris-nilai">Rp {formatRupiah(lead.nominal)}</span>
              </div>
            ) : null}
            {lead.produk ? (
              <div className="dp-baris dp-baris-detail">
                <span className="dp-baris-label">Produk</span>
                <span className="dp-baris-nilai">{lead.produk}</span>
              </div>
            ) : null}
            {lead.catatan ? (
              <div className="dp-baris dp-baris-detail">
                <span className="dp-baris-label">Catatan</span>
                <span className="dp-baris-nilai">{lead.catatan}</span>
              </div>
            ) : null}
          </section>

          {/* Riwayat pesanan nomor ini. */}
          <section className="dp-kartu">
            <div className="dp-kepala">
              <div className="dp-kepala-kiri">
                <span className="dp-kepala-ikon pink">
                  <Receipt size={14} strokeWidth={2} />
                </span>
                <span className="dp-kepala-judul">Riwayat Pesanan</span>
              </div>
              {history ? <span className="dp-lencana layanan">{history.count} transaksi</span> : null}
            </div>

            {!history ? <p className="dp-kosong-teks">Belum ada transaksi sah dari nomor ini.</p> : null}
            {history?.orders.map((order) => {
              const shown = order.items.slice(0, MAX_CHIP_ITEM);
              const rest = order.items.length - shown.length;
              return (
                <div className="dp-item" key={order.order_number}>
                  <div className="dp-item-foto" aria-hidden="true">
                    <Receipt size={18} strokeWidth={1.8} />
                  </div>
                  <div className="dp-item-teks">
                    <span className="dp-item-nama">{order.order_number}</span>
                    <div className="dp-item-chips">
                      <span className="dp-chip">{formatTanggalSingkatID(wibDateOf(order.created_at))}</span>
                      <span className="dp-chip kain">{STATUS_ORDER[order.status] || order.status}</span>
                      {order.first ? <span className="dp-chip">Order pertama</span> : <span className="dp-chip kain">Repeat</span>}
                      {order.closing ? <span className="dp-chip">Closing lead ini</span> : null}
                    </div>
                    {shown.length > 0 ? (
                      <div className="dp-item-chips">
                        {shown.map((text, index) => (
                          <span className="dp-chip" key={`${text}-${index}`}>
                            {text}
                          </span>
                        ))}
                        {rest > 0 ? <span className="dp-chip">+{rest} lagi</span> : null}
                      </div>
                    ) : null}
                  </div>
                  <span className="dp-item-harga">Rp {formatRupiah(order.total)}</span>
                </div>
              );
            })}

            {history ? (
              <div className="dp-ringkas">
                <div className="dp-ringkas-baris">
                  <span>Order pertama</span>
                  <span>{formatTanggalSingkatID(wibDateOf(history.first_order_at))}</span>
                </div>
                <div className="dp-ringkas-baris">
                  <span>Terakhir beli</span>
                  <span>{formatTanggalSingkatID(wibDateOf(history.last_order_at))}</span>
                </div>
                <div className="dp-ringkas-baris">
                  <span>Rata-rata per transaksi</span>
                  <span>Rp {formatRupiah(Math.round(history.spend / history.count))}</span>
                </div>
                <div className="dp-ringkas-garis" />
                <div className="dp-ringkas-total">
                  <span>Total Belanja</span>
                  <span>Rp {formatRupiah(history.spend)}</span>
                </div>
              </div>
            ) : null}
          </section>

          {/* Footer: Ubah Lead (sekunder) + Chat WhatsApp (utama). */}
          <div className="dp-footer">
            <div className="dp-footer-baris">
              <button type="button" className="dp-tombol sekunder" onClick={() => onEdit?.(lead)}>
                <Pencil size={13} /> Ubah Lead
              </button>
            </div>
            <button
              type="button"
              className="dp-tombol utama"
              onClick={chat}
              disabled={!canChat}
              title={canChat ? undefined : "Kontak ini bukan nomor WhatsApp"}
            >
              <MessageCircle size={13} /> Chat WhatsApp
            </button>
          </div>
        </div>
      </div>
    </PanelDetailShell>
  );
}

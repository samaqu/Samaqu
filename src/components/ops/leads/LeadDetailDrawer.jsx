"use client";

/**
 * Detail lead (panel samping) untuk menu Leads.
 *
 * Gayanya sengaja SAMA dengan detail Transaksi: memakai kerangka `PanelDetailShell` dan kelas
 * `dp-*` dari PanelDetailPesanan, jadi header, kartu, baris, dan footer terlihat satu keluarga.
 * Kartu pesanan meniru kartu "Informasi Produk" di Transaksi (foto, nama, chip varian, harga,
 * lalu subtotal / ongkir / total).
 *
 * Isinya hanya data yang tercatat: info lead (tabel `leads`) dan riwayat transaksi sah nomor yang
 * sama (tabel `orders`, dihitung server di /api/ops/leads/repeat). Tidak menulis apa pun.
 */

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, FileText, MapPin, MessageCircle, Pencil, Repeat, ShoppingBag, Users } from "lucide-react";
import { PanelDetailShell, rupiah } from "@/components/ops/transaksi/PanelDetailPesanan";
import { formatRupiah, formatTanggalSingkatID } from "@/components/ops/transaksi/transaksi-format";
import { NEUTRAL_ITEM_PHOTO } from "@/lib/order-photo";
import { waNumber } from "@/lib/whatsapp";
import { wibDateOf } from "@/lib/leads-repeat";

const STATUS_ORDER = { diproses: "Diproses", dikirim: "Dikirim", selesai: "Selesai" };

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

/** Satu pesanan: gaya "Informasi Produk" Transaksi + penanda urutan (pertama / repeat ke-N). */
function KartuPesanan({ order, urutan }) {
  return (
    <section className="dp-kartu">
      <div className="dp-kepala">
        <div className="dp-kepala-kiri">
          <span className="dp-kepala-ikon">
            <ShoppingBag size={14} strokeWidth={2} />
          </span>
          <span className="dp-kepala-judul">{order.order_number}</span>
        </div>
      </div>

      <div className="dp-item-chips">
        <span className="dp-chip">{formatTanggalSingkatID(wibDateOf(order.created_at))}</span>
        <span className="dp-chip kain">{STATUS_ORDER[order.status] || order.status}</span>
        {order.first ? <span className="dp-chip">Order pertama</span> : <span className="dp-chip kain">Repeat · ke-{urutan}</span>}
        {order.closing ? <span className="dp-chip">Closing lead ini</span> : null}
      </div>

      {order.lines.length === 0 ? <p className="dp-kosong-teks">Tidak ada produk tercatat.</p> : null}
      {order.lines.map((line) => (
        <div className="dp-item" key={line.key}>
          <div className="dp-item-foto">
            <img src={line.foto || NEUTRAL_ITEM_PHOTO} alt={line.nama} loading="lazy" decoding="async" />
          </div>
          <div className="dp-item-teks">
            <span className="dp-item-nama">{line.nama}</span>
            <div className="dp-item-chips">
              {line.chips.map((chip) => (
                <span className={`dp-chip ${chip.jenis === "kain" ? "kain" : ""}`} key={chip.teks}>
                  {chip.teks}
                </span>
              ))}
            </div>
          </div>
          <span className="dp-item-harga">Rp {formatRupiah(line.harga)}</span>
        </div>
      ))}

      <div className="dp-ringkas">
        <div className="dp-ringkas-baris">
          <span>Subtotal produk</span>
          <span>{rupiah(order.subtotal)}</span>
        </div>
        <div className="dp-ringkas-baris">
          <span>Ongkir</span>
          <span>{rupiah(order.shipping_cost)}</span>
        </div>
        {order.discount > 0 ? (
          <div className="dp-ringkas-baris">
            <span>Diskon / voucher</span>
            <span className="hijau">- {rupiah(order.discount)}</span>
          </div>
        ) : null}
        <div className="dp-ringkas-garis" />
        <div className="dp-ringkas-total">
          <span>Total Pesanan</span>
          <span>{rupiah(order.total)}</span>
        </div>
      </div>
    </section>
  );
}

export default function LeadDetailDrawer({ open, lead, history, tema = "mono", onClose, onEdit }) {
  const [tersalin, setTersalin] = useState(false);

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

  // Umpan balik "Tersalin" hanya sesaat dan direset tiap ganti lead.
  useEffect(() => {
    setTersalin(false);
  }, [lead?.id]);

  if (!lead) {
    return (
      <PanelDetailShell open={false} onClose={onClose} tema={tema}>
        {null}
      </PanelDetailShell>
    );
  }

  const info = statusInfo(history);
  const alamat = history?.address || null;
  const wa = waNumber(lead.kontak || "");
  const canChat = /^628[1-9][0-9]{6,10}$/.test(wa);
  const chat = () => {
    if (canChat) window.open(`https://wa.me/${wa}`, "_blank", "noopener,noreferrer");
  };
  const closing = lead.status === "closing";

  const salinAlamat = async () => {
    if (!alamat) return;
    const teks = [alamat.nama ? `${alamat.nama}${alamat.telepon ? ` · ${alamat.telepon}` : ""}` : alamat.telepon, alamat.lengkap]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(teks);
      setTersalin(true);
      window.setTimeout(() => setTersalin(false), 1600);
    } catch {
      /* clipboard bisa diblokir browser */
    }
  };

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
            {/* Produk yang sebenarnya dibeli tampil di kartu pesanan (dari transaksi). Isian form lead
                hanya ditampilkan sebagai "diminati" kalau belum ada transaksi sama sekali. */}
            {lead.produk && !history ? (
              <div className="dp-baris dp-baris-detail">
                <span className="dp-baris-label">Produk diminati</span>
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

          {/* Alamat pengiriman: dari transaksi terbaru nomor ini. */}
          <section className="dp-kartu">
            <div className="dp-kepala">
              <div className="dp-kepala-kiri">
                <span className="dp-kepala-ikon pink">
                  <MapPin size={14} strokeWidth={2} />
                </span>
                <span className="dp-kepala-judul">Alamat Pengiriman</span>
              </div>
              {alamat ? (
                <button type="button" className="dp-mini" onClick={salinAlamat}>
                  {tersalin ? "Tersalin" : "Salin"}
                </button>
              ) : null}
            </div>
            {alamat ? (
              <div>
                <p className="dp-alamat-nama">
                  {alamat.nama || "Penerima"}
                  {alamat.telepon ? <span className="dp-alamat-hp"> · {alamat.telepon}</span> : null}
                </p>
                <p className="dp-alamat-jalan">{alamat.lengkap}</p>
                {alamat.catatan ? <p className="dp-catatan">Catatan pengiriman: {alamat.catatan}</p> : null}
              </div>
            ) : (
              <p className="dp-kosong-teks">{history ? "Alamat belum tercatat di transaksi." : "Belum ada alamat, belum ada transaksi."}</p>
            )}
          </section>

          {/* Satu kartu per pesanan (terbaru di atas). */}
          {history ? (
            history.orders.map((order, index) => (
              <KartuPesanan key={order.order_number} order={order} urutan={history.count - index} />
            ))
          ) : (
            <section className="dp-kartu">
              <div className="dp-kepala">
                <div className="dp-kepala-kiri">
                  <span className="dp-kepala-ikon">
                    <ShoppingBag size={14} strokeWidth={2} />
                  </span>
                  <span className="dp-kepala-judul">Informasi Produk</span>
                </div>
              </div>
              <p className="dp-kosong-teks">Belum ada transaksi sah dari nomor ini.</p>
            </section>
          )}

          {/* Ringkasan belanja: hanya berguna kalau lebih dari satu transaksi. */}
          {history?.repeat ? (
            <section className="dp-kartu">
              <div className="dp-kepala">
                <div className="dp-kepala-kiri">
                  <span className="dp-kepala-ikon">
                    <FileText size={14} strokeWidth={2} />
                  </span>
                  <span className="dp-kepala-judul">Ringkasan Belanja</span>
                </div>
              </div>
              <div className="dp-ringkas">
                <div className="dp-ringkas-baris">
                  <span>Jumlah transaksi</span>
                  <span>{history.count}</span>
                </div>
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
                  <span>{rupiah(Math.round(history.spend / history.count))}</span>
                </div>
                <div className="dp-ringkas-garis" />
                <div className="dp-ringkas-total">
                  <span>Total Belanja</span>
                  <span>{rupiah(history.spend)}</span>
                </div>
              </div>
            </section>
          ) : null}

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

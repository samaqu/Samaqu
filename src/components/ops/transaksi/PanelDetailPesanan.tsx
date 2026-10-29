"use client";

/**
 * Drawer "Detail Pesanan" panel Admin Operasional (ala marketplace).
 *
 * Murni tampilan: seluruh data & aksi tetap milik `TransaksiDetailDrawer` (logic status, resi,
 * pembatalan, stok tidak disentuh). Dashboard ops tidak memakai komponen ini.
 */

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Box,
  Check,
  XCircle,
  Clock,
  CreditCard,
  MapPin,
  MessageCircle,
  ShoppingBag,
  Truck,
  Wallet,
} from "lucide-react";
import { localPhone } from "@/lib/whatsapp";

const WIB = "Asia/Jakarta";
/** Batas auto-cancel yang sama dengan cron: 24 jam sejak pesanan dibuat. */
const BATAS_AUTOCANCEL_MS = 24 * 60 * 60 * 1000;

export function rupiah(n?: number | null): string {
  return `Rp${(n || 0).toLocaleString("id-ID")}`;
}

/** Sisa waktu auto-cancel (detik) → "HH:MM:SS". */
export function hitungMundur(secondsLeft: number): string {
  const total = Math.max(0, Math.floor(secondsLeft));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/** Tanggal + jam WIB ringkas: "29 Okt • 10.56". */
export function jamWIB(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const tanggal = d.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: WIB });
  const jam = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: WIB });
  return `${tanggal} • ${jam}`;
}

const TAHAP: Record<string, { judul: string; catatan: string; ikon: (s: number) => ReactNode }> = {
  belum_bayar: { judul: "Menunggu pembayaran", catatan: "Batalkan otomatis kalau lewat waktu", ikon: (s) => <Clock size={s} /> },
  belum_dipacking: { judul: "Sedang disiapkan", catatan: "Pesanan sudah dibayar, siap dikemas", ikon: (s) => <Box size={s} /> },
  sudah_dipacking: { judul: "Menunggu penjemputan", catatan: "Resi sudah dibuat, paket menunggu kurir", ikon: (s) => <Box size={s} /> },
  dikirim: { judul: "Dalam pengiriman", catatan: "Paket sedang menuju alamat pembeli", ikon: (s) => <Truck size={s} /> },
  selesai: { judul: "Selesai", catatan: "Pesanan sudah diterima pembeli", ikon: (s) => <Check size={s} /> },
  dibatalkan: { judul: "Dibatalkan", catatan: "Pesanan ini sudah dibatalkan", ikon: (s) => <XCircle size={s} /> },
};

/** Jumlah langkah stepper yang sudah dilewati (0–4). */
export function levelLangkah(tahap: string): number {
  return ({ belum_bayar: 0, belum_dipacking: 1, sudah_dipacking: 2, dikirim: 3, selesai: 4 } as Record<string, number>)[tahap] ?? 0;
}

const IKON_LANGKAH: ReactNode[] = [
  <Wallet size={14} key="0" />,
  <Box size={14} key="1" />,
  <Truck size={14} key="2" />,
  <Check size={14} key="3" />,
];

export interface ItemTampilan {
  key: string;
  nama: string;
  chips: string[];
  harga: string;
  foto: string;
}

export interface AksiFooter {
  key: string;
  label: string;
  jenis: "utama" | "sekunder" | "bahaya";
  onClick: () => void;
  disabled?: boolean;
}

export default function PanelDetailPesanan({
  sumber,
  tahap,
  createdAt,
  nama,
  telepon,
  alamat,
  kurir,
  layanan,
  resi,
  resiKosong,
  onLacak,
  onSalinResi,
  resiTersalin,
  berat,
  items,
  subtotal,
  ongkir,
  diskon,
  total,
  metodeBayar,
  waktuPesan,
  waktuBayar,
  nomorPesanan,
  onSalinNomor,
  nomorTersalin,
  onChat,
  ekstra,
  children,
}: {
  sumber: string;
  tahap: string;
  /** Jam pesanan dibuat — dasar hitung mundur auto-cancel 24 jam. */
  createdAt: string;
  nama: string;
  telepon: string;
  alamat: string;
  kurir: string;
  layanan: string;
  resi: string;
  resiKosong: string;
  onLacak: () => void;
  onSalinResi: () => void;
  resiTersalin: boolean;
  berat: string;
  items: ItemTampilan[];
  subtotal: number;
  ongkir: number;
  diskon: number;
  total: number;
  metodeBayar: string;
  waktuPesan: string;
  waktuBayar: string | null;
  nomorPesanan: string;
  onSalinNomor: () => void;
  nomorTersalin: boolean;
  onChat: () => void;
  /** Peringatan / catatan tambahan di kartu terakhir. */
  ekstra?: ReactNode;
  /** Blok resi J&T asli (buat resi, cetak) — logic lama, hanya dipindah posisinya. */
  children?: ReactNode;
}) {
  const info = TAHAP[tahap] || TAHAP.belum_dipacking;
  const level = levelLangkah(tahap);

  // Hitung mundur berjalan per detik, hanya untuk pesanan yang belum dibayar.
  const [sekarang, setSekarang] = useState(() => Date.now());
  const belumBayar = tahap === "belum_bayar";
  useEffect(() => {
    if (!belumBayar) return undefined;
    const timer = window.setInterval(() => setSekarang(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [belumBayar]);

  const mulai = new Date(createdAt).getTime();
  const sisaDetik = belumBayar && Number.isFinite(mulai) ? Math.max(0, (mulai + BATAS_AUTOCANCEL_MS - sekarang) / 1000) : null;
  const mendesak = sisaDetik !== null && sisaDetik < 3600;

  return (
    <div className="dp-wrap">
      <div className="dp-header">
        <p className="dp-sumber">{sumber}</p>
        <h2 className="dp-judul">Detail Pesanan</h2>
      </div>

      <div className="dp-isi">
        <section className="dp-kartu dp-melayang">
          <div className="dp-status">
            <span className={`dp-status-ikon${tahap === "dibatalkan" ? " batal" : ""}`}>{info.ikon(19)}</span>
            <div className="dp-status-teks">
              <b>{info.judul}</b>
              <p>{info.catatan}</p>
            </div>
            {sisaDetik !== null ? <span className={`dp-hitung${mendesak ? " mendesak" : ""}`}>{hitungMundur(sisaDetik)}</span> : null}
          </div>

          {tahap !== "dibatalkan" ? (
            <div className="dp-langkah">
              {["Dibayar", "Dikemas", "Dikirim", "Selesai"].map((label, i) => (
                <div key={label} className={`dp-langkah-item${i < level ? " lewat" : ""}`}>
                  <span className="dp-langkah-dot">{IKON_LANGKAH[i]}</span>
                  <span className="dp-langkah-label">{label}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="dp-kartu">
          <div className="dp-kepala">
            <span className="dp-kepala-ikon">
              <Truck size={16} />
            </span>
            <b>Info Pengiriman</b>
            <span className="dp-kepala-kanan">
              <span className="dp-lencana kurir">{kurir}</span>
              <span className="dp-lencana layanan">{layanan}</span>
            </span>
          </div>

          <div className="dp-resi">
            <div className="dp-resi-teks">
              <span>No. Resi</span>
              {resi ? <b>{resi}</b> : <b className="kosong">{resiKosong}</b>}
            </div>
            <div className="dp-resi-tombol">
              <button type="button" className="dp-mini" onClick={onSalinResi} disabled={!resi}>
                {resiTersalin ? "Tersalin" : "Salin"}
              </button>
              <button type="button" className="dp-mini" onClick={onLacak} disabled={!resi}>
                Lacak
              </button>
            </div>
          </div>

          <div className="dp-chip-baris">
            <span className="dp-chip">{berat}</span>
          </div>

          {children ? <div className="dp-resi-panel">{children}</div> : null}

          <div className="dp-garis" />

          <div className="dp-kepala">
            <span className="dp-kepala-ikon">
              <MapPin size={16} />
            </span>
            <b>Alamat Pengiriman</b>
          </div>
          <div className="dp-alamat">
            <div className="dp-alamat-teks">
              <b>
                {nama}
                {telepon ? <span> • {localPhone(telepon)}</span> : null}
              </b>
              <p>{alamat || "Alamat belum diisi."}</p>
            </div>
            <button type="button" className="dp-wa" onClick={onChat} aria-label="Chat WhatsApp customer">
              <MessageCircle size={17} />
            </button>
          </div>
        </section>

        <section className="dp-kartu">
          <div className="dp-kepala">
            <span className="dp-kepala-ikon">
              <ShoppingBag size={16} />
            </span>
            <b>Produk</b>
          </div>

          {items.length === 0 ? <p className="dp-kosong-teks">Tidak ada produk tercatat.</p> : null}
          {items.map((item) => (
            <div className="dp-item" key={item.key}>
              <div className="dp-item-foto">
                <img src={item.foto} alt={item.nama} loading="lazy" decoding="async" />
              </div>
              <div className="dp-item-teks">
                <b>{item.nama}</b>
                <span className="dp-item-chips">
                  {item.chips.map((chip) => (
                    <span className="dp-chip" key={chip}>
                      {chip}
                    </span>
                  ))}
                </span>
              </div>
              <b className="dp-item-harga">{item.harga}</b>
            </div>
          ))}

          <div className="dp-ringkas">
            <div className="dp-ringkas-baris">
              <span>Subtotal produk</span>
              <span>{rupiah(subtotal)}</span>
            </div>
            <div className="dp-ringkas-baris">
              <span>Ongkir</span>
              <span>{rupiah(ongkir)}</span>
            </div>
            {diskon > 0 ? (
              <div className="dp-ringkas-baris">
                <span>Diskon / voucher</span>
                <span className="hijau">- {rupiah(diskon)}</span>
              </div>
            ) : null}
            <div className="dp-ringkas-baris total">
              <span>Total Pesanan</span>
              <span>{rupiah(total)}</span>
            </div>
          </div>
        </section>

        <section className="dp-kartu">
          <div className="dp-nomor">
            <div>
              <span>No. Pesanan</span>
              <b>{nomorPesanan}</b>
            </div>
            <button type="button" className="dp-mini biru" onClick={onSalinNomor}>
              {nomorTersalin ? "Tersalin" : "Salin"}
            </button>
          </div>
          <div className="dp-info">
            <div className="dp-info-baris">
              <span>Pembayaran</span>
              <b>
                <CreditCard size={13} /> {metodeBayar}
              </b>
            </div>
            <div className="dp-info-baris">
              <span>Dipesan</span>
              <b>{waktuPesan}</b>
            </div>
            <div className="dp-info-baris">
              <span>Dibayar</span>
              <b>{waktuBayar || <em>Belum</em>}</b>
            </div>
          </div>
        </section>

        {ekstra ? <section className="dp-kartu dp-ekstra">{ekstra}</section> : null}
      </div>
    </div>
  );
}

export function PanelDetailFooter({ aksi }: { aksi: AksiFooter[] }) {
  if (!aksi || aksi.length === 0) return null;
  return (
    <div className="dp-footer">
      {aksi.map((a) => (
        <button key={a.key} type="button" className={`dp-tombol ${a.jenis}`} onClick={a.onClick} disabled={a.disabled}>
          {a.label}
        </button>
      ))}
    </div>
  );
}

/** Kerangka drawer: overlay + panel geser. Header/isi/footer dirender oleh anak. */
export function PanelDetailShell({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="dp-overlay" onClick={onClose} />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.24, ease: "easeOut" }}
            className="dp-panel"
            role="dialog"
            aria-label="Detail Pesanan"
          >
            {children}
            <style>{DP_CSS}</style>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

const DP_CSS = `
.dp-overlay{position:fixed;inset:0;z-index:9998;background:rgba(18,32,48,.45);backdrop-filter:blur(3px)}
.dp-panel{position:fixed;inset-block:0;right:0;z-index:9999;display:flex;flex-direction:column;width:100%;max-width:100vw;background:#f4f7fb;overflow:hidden;box-shadow:-24px 0 60px -24px rgba(18,32,48,.4)}
@media (min-width:640px){.dp-panel{width:560px;max-width:560px}}

.dp-wrap{display:flex;flex-direction:column;flex:1;min-height:0}
.dp-header{flex:none;padding:16px 20px 30px;background:linear-gradient(135deg,#3f86b8 0%,#2f6f9e 60%,#2a628c 100%);color:#fff}
.dp-sumber{margin:0;font-size:10.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:rgba(255,255,255,.82)}
.dp-judul{margin:2px 0 0;font-size:1.34rem;font-weight:800;letter-spacing:-.01em;color:#fff}
.dp-tutup{display:grid;place-items:center;width:32px;height:32px;border:0;border-radius:50%;background:#f1f4f7;color:#425466;cursor:pointer}
.dp-tutup:hover{background:#e6ebf0}

.dp-isi{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:14px;padding:0 16px 20px;scrollbar-width:none}
.dp-isi::-webkit-scrollbar{display:none}

.dp-kartu{background:#fff;border-radius:18px;padding:16px 18px;box-shadow:0 10px 30px -22px rgba(34,58,86,.45)}
.dp-melayang{margin-top:-18px;position:relative;z-index:1}

.dp-status{display:flex;align-items:center;gap:11px}
.dp-status-ikon{flex:none;display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:#fdf3e3;color:#b07a1e}
.dp-status-ikon.batal{background:#fdecef;color:#c03a52}
.dp-status-teks{flex:1;min-width:0}
.dp-status-teks b{display:block;font-size:14px;font-weight:800;color:#2a1a22;line-height:1.25}
.dp-status-teks p{margin:2px 0 0;font-size:11.5px;font-weight:500;color:#8a7d83;line-height:1.35}
.dp-hitung{flex:none;font-size:13px;font-weight:800;font-variant-numeric:tabular-nums;padding:7px 11px;border-radius:11px;background:#fdf3e3;color:#8a6516}
.dp-hitung.mendesak{background:#fdecef;color:#c03a52}

.dp-langkah{display:flex;align-items:flex-start;margin-top:16px}
.dp-langkah-item{position:relative;flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
.dp-langkah-item::before{content:"";position:absolute;top:13px;left:-50%;width:100%;height:2px;background:#edf0f3}
.dp-langkah-item:first-child::before{display:none}
.dp-langkah-item.lewat::before{background:#bfd9ee}
.dp-langkah-dot{position:relative;z-index:1;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#f1f4f7;color:#b4bcc6}
.dp-langkah-item.lewat .dp-langkah-dot{background:#2f6f9e;color:#fff}
.dp-langkah-label{font-size:10.5px;font-weight:600;color:#a9b2bd;line-height:1.2}
.dp-langkah-item.lewat .dp-langkah-label{color:#2a1a22;font-weight:700}

.dp-kepala{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.dp-kepala b{font-size:13.5px;font-weight:800;color:#2a1a22}
.dp-kepala-ikon{display:grid;place-items:center;width:26px;height:26px;border-radius:9px;background:#eaf3fa;color:#2f6f9e}
.dp-kepala-kanan{margin-left:auto;display:flex;align-items:center;gap:6px}

.dp-lencana{font-size:10.5px;font-weight:800;padding:4px 9px;border-radius:999px;white-space:nowrap}
.dp-lencana.kurir{background:#c8102e;color:#fff}
.dp-lencana.layanan{background:#e9f7ef;color:#1f6f45}
.dp-chip{display:inline-block;font-size:10.5px;font-weight:700;padding:4px 9px;border-radius:999px;background:#f1f5f9;color:#425466;white-space:nowrap}

.dp-resi{display:flex;align-items:center;gap:10px;background:#f6f8fa;border-radius:14px;padding:12px 14px}
.dp-resi-teks{flex:1;min-width:0}
.dp-resi-teks span{display:block;font-size:9.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9aa4b0}
.dp-resi-teks b{display:block;margin-top:2px;font-size:14px;font-weight:800;color:#2a1a22;overflow-wrap:anywhere}
.dp-resi-teks b.kosong{color:#b0b8c2;font-weight:700}
.dp-resi-tombol{flex:none;display:flex;gap:6px}
.dp-mini{font-size:11px;font-weight:800;padding:7px 12px;border-radius:999px;border:0;background:#fff;color:#2f6f9e;box-shadow:0 1px 3px rgba(34,58,86,.12);cursor:pointer}
.dp-mini:hover:not(:disabled){background:#f2f8fc}
.dp-mini:disabled{opacity:.55;cursor:not-allowed;box-shadow:none;background:#eef1f4;color:#98a2ae}
.dp-mini.biru{background:#eaf3fa;color:#2f6f9e;box-shadow:none}
.dp-chip-baris{margin-top:9px;display:flex;gap:6px;flex-wrap:wrap}
.dp-resi-panel:empty{display:none}
.dp-garis{margin:14px 0;border-top:1.5px dashed #e4e9ee}

.dp-alamat{display:flex;align-items:flex-start;gap:10px}
.dp-alamat-teks{flex:1;min-width:0}
.dp-alamat-teks b{display:block;font-size:12.5px;font-weight:800;color:#2a1a22;line-height:1.35}
.dp-alamat-teks b span{font-weight:600;color:#8a7d83}
.dp-alamat-teks p{margin:3px 0 0;font-size:12px;font-weight:500;color:#5c6672;line-height:1.45}
.dp-wa{flex:none;display:grid;place-items:center;width:38px;height:38px;border:0;border-radius:50%;background:#e7f7ec;color:#1f8a4c;cursor:pointer}
.dp-wa:hover{background:#d6f1df}

.dp-item{display:flex;align-items:flex-start;gap:11px;padding:2px 0}
.dp-item-foto{flex:none;width:52px;height:62px;border-radius:12px;overflow:hidden;background:#f6f3f4}
.dp-item-foto img{width:100%;height:100%;object-fit:cover;display:block}
.dp-item-teks{flex:1;min-width:0}
.dp-item-teks b{display:block;font-size:12.5px;font-weight:800;color:#2a1a22;line-height:1.3}
.dp-item-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.dp-item-harga{flex:none;font-size:12.5px;font-weight:800;color:#2a1a22;white-space:nowrap}
.dp-kosong-teks{margin:0;font-size:12px;color:#8a7d83}

.dp-ringkas{margin-top:13px;background:#f7f9fb;border-radius:14px;padding:12px 14px}
.dp-ringkas-baris{display:flex;justify-content:space-between;gap:10px;font-size:12px;font-weight:600;color:#5c6672;padding:3px 0}
.dp-ringkas-baris .hijau{color:#1f8a4c;font-weight:700}
.dp-ringkas-baris.total{margin-top:7px;padding-top:9px;border-top:1px solid #e6ebf0;font-size:13px;font-weight:800;color:#2a1a22}
.dp-ringkas-baris.total span:last-child{font-size:17px;font-weight:800;color:#2f6f9e}

.dp-nomor{display:flex;align-items:center;gap:10px}
.dp-nomor > div{flex:1;min-width:0}
.dp-nomor span{display:block;font-size:9.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#9aa4b0}
.dp-nomor b{display:block;margin-top:2px;font-size:13.5px;font-weight:800;color:#2a1a22;overflow-wrap:anywhere}
/* Info pesanan ditumpuk ke bawah (bukan tiga kotak ke samping) supaya No. Pesanan tidak
   berdesakan dengan metode pembayaran yang namanya panjang. */
.dp-info{margin-top:12px;display:flex;flex-direction:column;gap:2px}
.dp-info-baris{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #f1f4f7}
.dp-info-baris:last-child{border-bottom:0;padding-bottom:0}
.dp-info-baris span{flex:none;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#9aa4b0}
.dp-info-baris b{display:flex;align-items:center;gap:5px;min-width:0;font-size:12.5px;font-weight:800;color:#2a1a22;line-height:1.3;text-align:right;overflow-wrap:anywhere}
.dp-info-baris b em{font-style:normal;font-weight:600;color:#8a7d83}

.dp-footer{flex:none;display:flex;flex-wrap:wrap;gap:8px;padding:12px 16px 16px;background:#fff;border-radius:20px 20px 0 0;box-shadow:0 -12px 28px -20px rgba(34,58,86,.4)}
.dp-tombol{display:inline-flex;align-items:center;justify-content:center;flex:1 1 0;min-width:0;min-height:42px;padding:10px 12px;border:0;border-radius:999px;font-size:12.5px;font-weight:800;line-height:1.2;cursor:pointer;transition:filter .15s}
.dp-tombol:hover:not(:disabled){filter:brightness(.97)}
.dp-tombol:disabled{opacity:.5;cursor:not-allowed}
.dp-tombol.utama{flex-grow:1.6;background:#2f6f9e;color:#fff}
.dp-tombol.sekunder{background:#e9f3fb;color:#2f6f9e}
.dp-tombol.bahaya{background:#fdeef1;color:#c03a52}

/* Catatan & peringatan di kartu ekstra. */
.dp-warning{padding:10px 12px;border-radius:12px;border:1px solid #f3dfae;background:#fff8e6;color:#7a5200;font-size:11.5px;font-weight:600;line-height:1.5}
.dp-catatan{margin:10px 0 0;font-size:11.5px;font-weight:600;color:#5c6672;line-height:1.5}
.dp-error{margin:8px 0 0;font-size:11.5px;font-weight:700;color:#c03a52}

/* Blok asli (form resi HBO / riwayat lacak) dirapikan di dalam kartu. */
.dp-ekstra .od-root,.dp-ekstra .rp-root{padding:0;background:transparent;min-height:0}
.dp-ekstra .rp-act{position:static;background:none;padding:0}
.dp-ekstra .od-acts{gap:8px;margin-top:10px;padding-top:10px}
.dp-ekstra .od-title{font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;color:#9aa4b0;margin-bottom:8px}
.dp-ekstra .od-a{flex:1 1 calc(50% - 4px);min-height:38px;border-radius:999px;border:0;background:#eef3f8;color:#425466;font-size:12px;font-weight:800}
.dp-ekstra .od-a-primary{background:#2f6f9e;color:#fff}
.dp-ekstra .od-a-danger{background:#fdeef1;color:#c03a52}
.dp-ekstra .od-link{width:100%;border:0;background:none;padding:8px 0 0;font-size:12px;font-weight:800;color:#2f6f9e;cursor:pointer}

/* Modal Lacak. */
.dp-md{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(18,32,48,.45);backdrop-filter:blur(3px)}
.dp-mc{width:100%;max-width:440px;max-height:80vh;overflow-y:auto;background:#fff;border-radius:20px;box-shadow:0 24px 60px -24px rgba(18,32,48,.5)}
.dp-mh{position:sticky;top:0;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 18px;background:#fff;border-bottom:1px solid #eef1f4}
.dp-mh small{display:block;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9aa4b0}
.dp-mh h3{margin:2px 0 0;font-size:15px;font-weight:800;color:#2a1a22}
.dp-mh b{color:#2a1a22;text-transform:none;letter-spacing:0}
.dp-md-note{margin:0;padding:20px 18px;font-size:12.5px;font-weight:600;color:#8a7d83}
.dp-md-note.is-error{color:#c03a52}
.dp-trk{margin:0;padding:6px 18px 18px;list-style:none}
.dp-trk li{padding:10px 0;border-bottom:1px solid #f1f4f7}
.dp-trk li:last-child{border-bottom:0}
.dp-trk b{display:block;font-size:12px;font-weight:800;color:#425466}
.dp-trk li.is-latest b{color:#2f6f9e}
.dp-trk small{display:block;margin-top:2px;font-size:11px;font-weight:500;color:#8a7d83}

@media (max-width:639.98px){
  .dp-header{padding:14px 16px 28px}
  .dp-isi{padding:0 12px 18px}
  .dp-kartu{padding:14px 15px;border-radius:16px}
  .dp-footer{padding:10px 12px 14px;border-radius:18px 18px 0 0}
}
`;

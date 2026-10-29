"use client";

/**
 * Drawer "Detail Pesanan" panel Admin Operasional — mengikuti `mockup-detail-pesanan.html`.
 *
 * Murni tampilan: seluruh data & aksi tetap milik `TransaksiDetailDrawer` (logic status, resi,
 * pembatalan, stok tidak disentuh). Dashboard ops tidak memakai komponen ini.
 *
 * Ukuran, jarak, warna, radius, bayangan, dan ketebalan huruf disalin dari mockup.
 */

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MapPin, MessageCircle, ShoppingBag, Truck } from "lucide-react";
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

/** Tanggal + jam WIB ringkas: "29 Okt · 10.56". */
export function jamWIB(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const tanggal = d.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: WIB });
  const jam = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: WIB });
  return `${tanggal} · ${jam}`;
}

/* ── Ikon (bentuk & stroke sama dengan mockup) ── */
function Svg({ size, stroke, children }: { size: number; stroke: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const IkonBayar = ({ size = 15, stroke = 2.4 }: { size?: number; stroke?: number }) => (
  <Svg size={size} stroke={stroke}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M3 10h18" />
  </Svg>
);

const IkonKemas = ({ size = 15, stroke = 2.2 }: { size?: number; stroke?: number }) => (
  <Svg size={size} stroke={stroke}>
    <path d="M4 7l8-4 8 4v10l-8 4-8-4z" />
    <path d="M4 7l8 4 8-4M12 11v10" />
  </Svg>
);

const IkonKirim = ({ size = 15, stroke = 2.2 }: { size?: number; stroke?: number }) => (
  <Svg size={size} stroke={stroke}>
    <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
    <circle cx="7" cy="17.5" r="1.8" />
    <circle cx="17" cy="17.5" r="1.8" />
  </Svg>
);

const IkonSelesai = ({ size = 15, stroke = 2.4 }: { size?: number; stroke?: number }) => (
  <Svg size={size} stroke={stroke}>
    <path d="M5 12l5 5L20 7" />
  </Svg>
);

const IkonJam = ({ size = 22 }: { size?: number }) => (
  <Svg size={size} stroke={2}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2M9 2h6" />
  </Svg>
);

const IkonBatal = ({ size = 22 }: { size?: number }) => (
  <Svg size={size} stroke={2}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m6.5 6.5 11 11" />
  </Svg>
);

/** Judul, catatan, ikon, dan nada warna kartu status per tahap. */
const TAHAP: Record<
  string,
  { judul: string; catatan: string; ikon: ReactNode; ikonBg: string; ikonWarna: string; nada: string }
> = {
  belum_bayar: {
    judul: "Menunggu pembayaran",
    catatan: "Batal otomatis kalau lewat waktu",
    ikon: <IkonJam />,
    ikonBg: "#fff3d6",
    ikonWarna: "#a46a00",
    nada: "kuning",
  },
  belum_dipacking: {
    judul: "Sedang disiapkan",
    catatan: "Pesanan sudah dibayar, siap dikemas",
    ikon: <IkonKemas size={22} stroke={2} />,
    ikonBg: "#e8f3fb",
    ikonWarna: "#2774a8",
    nada: "biru",
  },
  sudah_dipacking: {
    judul: "Menunggu penjemputan",
    catatan: "Resi sudah dibuat, paket menunggu kurir",
    ikon: <Truck size={22} strokeWidth={2} />,
    ikonBg: "#e8f3fb",
    ikonWarna: "#2774a8",
    nada: "biru",
  },
  dikirim: {
    judul: "Dalam pengiriman",
    catatan: "Paket sedang menuju alamat pembeli",
    ikon: <Truck size={22} strokeWidth={2} />,
    ikonBg: "#e8f3fb",
    ikonWarna: "#2774a8",
    nada: "biru",
  },
  selesai: {
    judul: "Selesai",
    catatan: "Pesanan sudah diterima pembeli",
    ikon: <IkonSelesai size={22} stroke={2.4} />,
    ikonBg: "#e1f5ea",
    ikonWarna: "#1b7347",
    nada: "hijau",
  },
  dibatalkan: {
    judul: "Dibatalkan",
    catatan: "Pesanan ini sudah dibatalkan",
    ikon: <IkonBatal />,
    ikonBg: "#fde8ee",
    ikonWarna: "#a3355f",
    nada: "merah",
  },
};

/** Jumlah langkah stepper yang sudah lewat (0–4); langkah `level` = sedang berjalan. */
export function levelLangkah(tahap: string): number {
  return (
    { belum_bayar: 0, belum_dipacking: 1, sudah_dipacking: 2, dikirim: 3, selesai: 4 } as Record<string, number>
  )[tahap] ?? 0;
}

export interface ItemTampilan {
  key: string;
  nama: string;
  chips: { teks: string; jenis: "kain" | "netral" }[];
  harga: string;
  foto: string;
}

export interface AksiFooter {
  key: string;
  label: string;
  jenis: "utama" | "sekunder" | "bahaya";
  onClick: () => void;
  disabled?: boolean;
  /** Keterangan saat tombol mati (mis. alasan Ubah terkunci). */
  hint?: string;
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
  resiCatatan,
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
  onClose,
  aksi = [],
  tema = "warna",
  ekstra,
  children,
}: {
  /**
   * `warna` = panel admin (pastel biru). `mono` = dashboard /admin & ops: seluruh aksen
   * jadi hitam-putih/abu, termasuk kartu status dan stepper.
   */
  tema?: "warna" | "mono";
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
  /** Chip keterangan resi di sebelah chip berat (mis. "Resi otomatis setelah bayar"). */
  resiCatatan: string;
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
  /** Tombol tutup drawer (perilaku sama dengan tombol tutup sebelumnya). */
  onClose: () => void;
  /** Aksi bawah (bahaya → sekunder → utama). Ikut ke-scroll bersama isi, tidak menempel. */
  aksi?: AksiFooter[];
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
  const sisaDetik =
    belumBayar && Number.isFinite(mulai) ? Math.max(0, (mulai + BATAS_AUTOCANCEL_MS - sekarang) / 1000) : null;

  return (
    <div className={`dp-wrap${tema === "mono" ? " tema-mono" : ""}`}>
      {/* Header ikut ke-scroll (tidak sticky); kartu status menimpa bagian bawahnya. */}
      <div className="dp-header">
        <div className="dp-header-txt">
          <span className="dp-sumber">{sumber}</span>
          <h1 className="dp-judul">Detail Pesanan</h1>
        </div>
        <button type="button" className="dp-tutup" onClick={onClose} aria-label="Tutup">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="dp-isi">
        <section className={`dp-kartu dp-status-kartu nada-${info.nada}`}>
          <div className="dp-status">
            <div className="dp-status-kiri">
              <div className="dp-status-ikon" style={{ background: info.ikonBg, color: info.ikonWarna }}>
                {info.ikon}
              </div>
              <div className="dp-status-teks">
                <span className="dp-status-judul">{info.judul}</span>
                <span className="dp-status-catatan">{info.catatan}</span>
              </div>
            </div>
            {sisaDetik !== null ? <span className="dp-hitung">{hitungMundur(sisaDetik)}</span> : null}
          </div>

          {tahap !== "dibatalkan" ? (
            <div className="dp-langkah">
              {["Dibayar", "Dikemas", "Dikirim", "Selesai"].map((label, i) => {
                const aktif = i === level && level < 4;
                const lewat = i < level;
                return (
                  <div className="dp-langkah-grup" key={label}>
                    {i > 0 ? <span className="dp-langkah-garis" /> : null}
                    <div className={`dp-langkah-item${lewat ? " lewat" : ""}${aktif ? " aktif" : ""}`}>
                      <span className="dp-langkah-dot">
                        {i === 0 ? <IkonBayar /> : null}
                        {i === 1 ? <IkonKemas /> : null}
                        {i === 2 ? <IkonKirim /> : null}
                        {i === 3 ? <IkonSelesai /> : null}
                      </span>
                      <span className="dp-langkah-label">{label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>

        <section className="dp-kartu-gabung">
          <div className="dp-blok">
            <div className="dp-kepala">
              <div className="dp-kepala-kiri">
                <span className="dp-kepala-ikon">
                  <IkonKirim size={18} stroke={2} />
                </span>
                <span className="dp-kepala-judul">Info Pengiriman</span>
              </div>
              <div className="dp-lencana-grup">
                <span className="dp-lencana kurir">{kurir}</span>
                <span className="dp-lencana layanan">{layanan}</span>
              </div>
            </div>

            <div className="dp-resi">
              <div className="dp-resi-teks">
                <span className="dp-resi-label">NO. RESI</span>
                {resi ? (
                  <span className="dp-resi-nomor">{resi}</span>
                ) : (
                  <span className="dp-resi-nomor kosong">{resiKosong}</span>
                )}
              </div>
              <div className="dp-resi-tombol">
                <button type="button" className="dp-pil" onClick={onSalinResi} disabled={!resi}>
                  {resiTersalin ? "Tersalin" : "Salin"}
                </button>
                <button type="button" className="dp-pil" onClick={onLacak} disabled={!resi}>
                  Lacak
                </button>
              </div>
            </div>

            <div className="dp-chip-baris">
              <span className="dp-chip">{berat}</span>
              <span className="dp-chip">{resiCatatan}</span>
            </div>
          </div>

          {children ? <div className="dp-resi-panel">{children}</div> : null}

          <div className="dp-garis" />

          <div className="dp-blok">
            <div className="dp-kepala">
              <div className="dp-kepala-kiri">
                <span className="dp-kepala-ikon pink">
                  <MapPin size={18} strokeWidth={2} />
                </span>
                <span className="dp-kepala-judul">Alamat Pengiriman</span>
              </div>
            </div>
            <div className="dp-alamat">
              <div className="dp-alamat-teks">
                <span className="dp-alamat-nama">
                  {nama}
                  {telepon ? <span className="dp-alamat-hp"> · {localPhone(telepon)}</span> : null}
                </span>
                <span className="dp-alamat-jalan">{alamat || "Alamat belum diisi."}</span>
              </div>
              <button type="button" className="dp-wa" onClick={onChat} aria-label="Chat WhatsApp customer">
                <MessageCircle size={20} strokeWidth={2} />
              </button>
            </div>
          </div>
        </section>

        <section className="dp-kartu">
          <div className="dp-kepala">
            <div className="dp-kepala-kiri">
              <span className="dp-kepala-ikon">
                <ShoppingBag size={18} strokeWidth={2} />
              </span>
              <span className="dp-kepala-judul">Produk</span>
            </div>
          </div>

          {items.length === 0 ? <p className="dp-kosong-teks">Tidak ada produk tercatat.</p> : null}
          {items.map((item) => (
            <div className="dp-item" key={item.key}>
              <div className="dp-item-foto">
                <img src={item.foto} alt={item.nama} loading="lazy" decoding="async" />
              </div>
              <div className="dp-item-teks">
                <span className="dp-item-nama">{item.nama}</span>
                <div className="dp-item-chips">
                  {item.chips.map((chip) => (
                    <span className={`dp-chip ${chip.jenis === "kain" ? "kain" : ""}`} key={chip.teks}>
                      {chip.teks}
                    </span>
                  ))}
                </div>
              </div>
              <span className="dp-item-harga">{item.harga}</span>
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
            <div className="dp-ringkas-garis" />
            <div className="dp-ringkas-total">
              <span>Total Pesanan</span>
              <span>{rupiah(total)}</span>
            </div>
          </div>
        </section>

        <section className="dp-kartu">
          <div className="dp-nomor">
            <div className="dp-nomor-teks">
              <span className="dp-nomor-label">NO. PESANAN</span>
              <span className="dp-nomor-isi">{nomorPesanan}</span>
            </div>
            <button type="button" className="dp-pil biru" onClick={onSalinNomor}>
              {nomorTersalin ? "Tersalin" : "Salin"}
            </button>
          </div>
          {/* Susunan sama dengan drawer /admin (OrderDetailPanel `.kv`): label di kiri,
              nilai rata kanan, satu baris per data — bukan tiga kotak ke samping. */}
          <div className="dp-kv">
            <div className="dp-kv-baris">
              <span>Metode Pembayaran</span>
              <b>{metodeBayar}</b>
            </div>
            <div className="dp-kv-baris">
              <span>Waktu Pemesanan</span>
              <b>{waktuPesan}</b>
            </div>
            <div className="dp-kv-baris">
              <span>Waktu Pembayaran</span>
              <b className={waktuBayar ? undefined : "kosong"}>{waktuBayar || "Belum"}</b>
            </div>
          </div>
        </section>

        {ekstra ? <section className="dp-kartu dp-ekstra">{ekstra}</section> : null}

        {/* Footer duduk di ujung isi dan ikut ke-scroll (position static), sama seperti
            tombol-tombol di drawer /admin — bukan menempel di bawah layar. */}
        <PanelDetailFooter aksi={aksi} />
      </div>
    </div>
  );
}

export function PanelDetailFooter({ aksi }: { aksi: AksiFooter[] }) {
  if (!aksi || aksi.length === 0) return null;
  // Aksi utama turun ke barisnya sendiri selebar drawer (paling gampang ditekan), aksi
  // pendamping (bahaya/sekunder) berbagi satu baris di atasnya — pola yang sama dengan
  // bottom bar aplikasi. Urutan array tetap diatur pemanggil.
  const pendamping = aksi.filter((a) => a.jenis !== "utama");
  const utama = aksi.filter((a) => a.jenis === "utama");
  return (
    <div className="dp-footer">
      {pendamping.length > 0 ? (
        <div className="dp-footer-baris">
          {pendamping.map((a) => (
            <button
              key={a.key}
              type="button"
              className={`dp-tombol ${a.jenis}`}
              onClick={a.onClick}
              disabled={a.disabled}
              title={a.disabled && a.hint ? a.hint : undefined}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
      {utama.map((a) => (
        <button key={a.key} type="button" className={`dp-tombol ${a.jenis}`} onClick={a.onClick} disabled={a.disabled}>
          {a.label}
        </button>
      ))}
    </div>
  );
}

/** Kerangka drawer: overlay + panel geser. Header/isi/footer dirender oleh anak. */
export function PanelDetailShell({
  open,
  onClose,
  tema = "warna",
  embed = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** `mono` untuk dashboard /admin & ops (hitam-putih). */
  tema?: "warna" | "mono";
  /** Dipakai saat shell ditanam di drawer lain (/admin & ops) yang sudah punya panel. */
  embed?: boolean;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="dp-overlay"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.24, ease: "easeOut" }}
            className={`dp-panel${tema === "mono" ? " tema-mono" : ""}${embed ? " is-embed" : ""}`}
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

/* Nilai di bawah ini disalin dari mockup-detail-pesanan.html (ukuran, jarak, warna, radius,
   bayangan, ketebalan huruf). Kalau mockup berubah, ubah di sini juga. */
const DP_CSS = `
.dp-overlay{position:fixed;inset:0;z-index:9998;background:rgba(18,32,48,.45);backdrop-filter:blur(3px)}
.dp-panel{position:fixed;inset-block:0;right:0;z-index:9999;display:flex;flex-direction:column;width:100%;max-width:100vw;background:#f4f7fb;color:#24324a;border-left:1px solid #e8eef5;overflow:hidden;box-shadow:-24px 0 60px -24px rgba(18,32,48,.4)}
/* Di dalam drawer yang sudah punya panel sendiri (/admin & ops), panel ini tidak lagi fixed:
   induknya ber-transform (framer-motion), jadi position:fixed terkurung dan area scroll mati.
   Sekarang ia mengisi penuh wadah induk dan yang men-scroll adalah .dp-wrap. */
.dp-panel.is-embed{position:relative;inset:auto;z-index:auto;width:100%;max-width:100%;height:100%;border-left:0;box-shadow:none}
.dp-panel.tema-mono{background:#fff;border-left-color:#e5e7eb}
@media (min-width:640px){.dp-panel{width:560px;max-width:560px}}

/* Satu kolom scroll: header ikut ke-scroll, bukan sticky. */
.dp-wrap{display:flex;flex-direction:column;flex:1;min-height:0;height:100%;overflow-y:auto;overflow-x:hidden;scrollbar-width:none}
.dp-wrap::-webkit-scrollbar{display:none}

.dp-header{flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:24px 24px 72px;background:linear-gradient(135deg,#2774a8 0%,#4b9bd1 60%,#8cc5ea 100%)}
.dp-header-txt{display:flex;flex-direction:column;gap:6px;min-width:0}
.dp-sumber{font-size:13px;font-weight:800;color:rgba(255,255,255,.85)}
.dp-judul{margin:0;font-size:26px;font-weight:900;line-height:1.15;letter-spacing:-.01em;color:#fff}
.dp-tutup{flex:none;display:grid;place-items:center;width:44px;height:44px;border-radius:999px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.18);color:#fff;cursor:pointer;transition:background .15s}
.dp-tutup:hover{background:rgba(255,255,255,.3)}

/* margin-top negatif: kartu status menimpa bagian bawah header. */
.dp-isi{flex:1;display:flex;flex-direction:column;gap:14px;padding:0 20px 20px;margin-top:-56px;position:relative}

.dp-kartu{background:#fff;border-radius:24px;padding:18px 20px;display:flex;flex-direction:column;gap:14px;box-shadow:0 6px 20px rgba(36,50,74,.06)}
.dp-status-kartu{border-radius:26px;padding:20px;gap:18px;box-shadow:0 16px 40px rgba(36,50,74,.12)}

.dp-status{display:flex;align-items:center;justify-content:space-between;gap:12px}
.dp-status-kiri{display:flex;align-items:center;gap:12px;min-width:0}
.dp-status-ikon{flex:none;display:grid;place-items:center;width:46px;height:46px;border-radius:16px}
.dp-status-teks{display:flex;flex-direction:column;gap:2px;min-width:0}
.dp-status-judul{font-size:17px;font-weight:900;line-height:1.25}
.dp-status-catatan{font-size:13px;font-weight:700;color:#5a6b80;line-height:1.3}
.dp-hitung{flex:none;font-size:18px;font-weight:900;color:#8a5600;background:#fff3d6;padding:8px 12px;border-radius:14px;font-variant-numeric:tabular-nums}
.dp-status-kartu.nada-merah .dp-hitung{background:#fdebf0;color:#a3355f}

/* Stepper: langkah 25% + garis 2px di antaranya (persis mockup). */
.dp-langkah{display:flex;align-items:center}
.dp-langkah-grup{display:flex;align-items:center;flex:1;min-width:0}
.dp-langkah-grup:first-child{flex:0 0 25%}
.dp-langkah-garis{flex:1;height:2px;background:#e4e9ef}
.dp-langkah-item{display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;min-width:0}
.dp-langkah-dot{display:grid;place-items:center;width:34px;height:34px;border-radius:999px;background:#f2f5f8;color:#9aa6b4;box-sizing:border-box}
.dp-langkah-label{font-size:12px;font-weight:700;color:#5a6b80;text-align:center;white-space:nowrap}

/* Langkah lewat: biru. Langkah aktif: kuning berbingkai (mockup: "Dibayar"). */
.dp-langkah-item.lewat .dp-langkah-dot{background:#e8f3fb;color:#2774a8}
.dp-langkah-item.lewat .dp-langkah-label{font-weight:900;color:#2774a8}
.dp-langkah-item.aktif .dp-langkah-dot{background:#fff3d6;border:2px solid #f0b443;color:#a46a00}
.dp-langkah-item.aktif .dp-langkah-label{font-weight:900;color:#8a5600}
.dp-status-kartu.nada-biru .dp-langkah-item.aktif .dp-langkah-dot{background:#e8f3fb;border-color:#7fb6dc;color:#2774a8}
.dp-status-kartu.nada-biru .dp-langkah-item.aktif .dp-langkah-label{color:#2774a8}
.dp-status-kartu.nada-hijau .dp-langkah-item.aktif .dp-langkah-dot{background:#e1f5ea;border-color:#5cbb8e;color:#1b7347}
.dp-status-kartu.nada-hijau .dp-langkah-item.aktif .dp-langkah-label{color:#1b7347}
.dp-status-kartu.nada-merah .dp-langkah-item.aktif .dp-langkah-dot{background:#fde8ee;border-color:#e0a2bb;color:#a3355f}
.dp-status-kartu.nada-merah .dp-langkah-item.aktif .dp-langkah-label{color:#a3355f}

/* Kartu gabungan pengiriman + alamat (satu kartu, dibelah garis putus-putus). */
.dp-kartu-gabung{background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 6px 20px rgba(36,50,74,.06)}
.dp-blok{padding:18px 20px;display:flex;flex-direction:column;gap:14px}
.dp-garis{border-top:2px dashed #e4e9ef;margin:0 20px}

.dp-kepala{display:flex;align-items:center;justify-content:space-between;gap:10px}
.dp-kepala-kiri{display:flex;align-items:center;gap:10px;min-width:0}
.dp-kepala-ikon{flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:12px;background:#e8f3fb;color:#2774a8}
.dp-kepala-ikon.pink{background:#fde8ee;color:#a3355f}
.dp-kepala-judul{font-size:16px;font-weight:900}
.dp-lencana-grup{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}

.dp-lencana{font-size:12px;font-weight:900;padding:4px 10px;border-radius:999px;white-space:nowrap}
.dp-lencana.kurir{background:#c8102e;color:#fff}
.dp-lencana.layanan{background:#e8f3fb;color:#2774a8;font-weight:800}

/* Blok No. Resi: latar gradasi lembut seperti mockup. */
.dp-resi{display:flex;align-items:center;justify-content:space-between;gap:12px;background:linear-gradient(135deg,#f3f8fc,#fbf5f8);border-radius:18px;padding:14px 16px}
.dp-resi-teks{display:flex;flex-direction:column;gap:3px;min-width:0}
.dp-resi-label{font-size:12px;font-weight:800;color:#5a6b80;letter-spacing:.04em}
.dp-resi-nomor{font-size:18px;font-weight:900;color:#24324a;overflow-wrap:anywhere}
.dp-resi-nomor.kosong{color:#9aa6b4}
.dp-resi-tombol{display:flex;gap:6px;flex:none}

.dp-pil{height:38px;padding:0 12px;border:0;border-radius:999px;background:#fff;font:inherit;font-size:12px;font-weight:800;color:#5a6b80;cursor:pointer}
.dp-pil:hover:not(:disabled){color:#2774a8}
.dp-pil:disabled{cursor:not-allowed;color:#5a6b80}
.dp-pil.biru{padding:0 14px;background:#e8f3fb;font-size:13px;color:#2774a8}

.dp-chip-baris{display:flex;gap:8px;flex-wrap:wrap}
.dp-chip{font-size:12px;font-weight:800;color:#3d4a5c;background:#f3f5f8;padding:5px 11px;border-radius:999px;white-space:nowrap}
.dp-item-chips .dp-chip{padding:3px 10px}
.dp-chip.kain{background:#e8f3fb;color:#2774a8}
/* Panel resi J&T asli (buat resi, ubah resi HBO, tandai dikirim) — logic lama, hanya dipindah.
   Nomor resi & status terbarunya sudah tampil di blok gradasi di atas, jadi panelnya dipanggil
   dengan prop compact (lihat TransaksiResiPanel) dan hanya mengeluarkan aksinya. */
.dp-resi-panel:empty{display:none}
.dp-resi-panel{padding:0 20px 18px}
.dp-resi-panel > *:last-child{margin-bottom:0}
.dp-resi-panel .rp-act{position:static;background:none;padding:0}

.dp-alamat{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.dp-alamat-teks{display:flex;flex-direction:column;gap:4px;min-width:0}
.dp-alamat-nama{font-size:15px;font-weight:900}
.dp-alamat-hp{font-weight:700;color:#5a6b80}
.dp-alamat-jalan{font-size:14px;font-weight:600;color:#3d4a5c;line-height:1.55}
.dp-wa{flex:none;display:grid;place-items:center;width:44px;height:44px;border:0;border-radius:14px;background:#e1f5ea;color:#1b7347;cursor:pointer}
.dp-wa:hover{background:#d3efdf}

.dp-item{display:flex;align-items:center;gap:14px}
.dp-item-foto{flex:none;display:grid;place-items:center;width:66px;height:80px;border-radius:16px;overflow:hidden;background:linear-gradient(160deg,#eef6fc,#fdf1f5)}
.dp-item-foto img{width:100%;height:100%;object-fit:cover;display:block}
.dp-item-teks{display:flex;flex-direction:column;gap:7px;flex:1;min-width:0}
.dp-item-nama{font-size:15px;font-weight:900;line-height:1.3}
.dp-item-chips{display:flex;gap:6px;flex-wrap:wrap}
.dp-item-harga{flex:none;font-size:15px;font-weight:900;white-space:nowrap}
.dp-kosong-teks{margin:0;font-size:14px;font-weight:600;color:#5a6b80}

.dp-ringkas{display:flex;flex-direction:column;gap:8px;background:#f7f9fb;border-radius:18px;padding:14px 16px}
.dp-ringkas-baris{display:flex;justify-content:space-between;gap:10px;font-size:14px;font-weight:600;color:#3d4a5c}
.dp-ringkas-baris .hijau{color:#1b7347;font-weight:700}
.dp-ringkas-garis{height:1px;background:#e4e9ef;margin:4px 0}
.dp-ringkas-total{display:flex;justify-content:space-between;align-items:center;gap:10px}
.dp-ringkas-total span:first-child{font-size:15px;font-weight:900}
.dp-ringkas-total span:last-child{font-size:22px;font-weight:900;color:#2774a8}

.dp-nomor{display:flex;align-items:center;justify-content:space-between;gap:10px}
.dp-nomor-teks{display:flex;flex-direction:column;gap:2px;min-width:0}
.dp-nomor-label{font-size:12px;font-weight:800;color:#5a6b80;letter-spacing:.04em}
.dp-nomor-isi{font-size:16px;font-weight:900;overflow-wrap:anywhere}
/* Info pesanan: satu baris per data, label kiri nilai kanan — sama dengan baris kv di
   drawer /admin (OrderDetailPanel), bukan tiga kotak ke samping. */
.dp-kv{display:flex;flex-direction:column;gap:0}
.dp-kv-baris{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:7px 0;font-size:14px;border-bottom:1px solid #eef2f6}
.dp-kv-baris:last-child{border-bottom:0;padding-bottom:0}
.dp-kv-baris span{flex:none;color:#5a6b80;font-weight:600}
.dp-kv-baris b{min-width:0;font-weight:900;text-align:right;overflow-wrap:anywhere}
.dp-kv-baris b.kosong{color:#9aa6b4;font-weight:800}

/* Footer duduk di ujung isi (ikut ke-scroll, position static) seperti tombol di drawer
   /admin — bukan menempel di bawah layar. Gaya tetap bottom bar: kartu putih membulat. */
.dp-footer{flex:none;display:flex;flex-direction:column;gap:10px;margin-top:4px;padding:14px 16px 16px;background:#fff;border-radius:20px;box-shadow:0 6px 20px rgba(36,50,74,.06)}
.dp-footer-baris{display:flex;gap:10px}
.dp-tombol{flex:1 1 0;min-width:0;height:46px;padding:0 16px;border:0;border-radius:14px;font:inherit;font-size:14px;font-weight:800;line-height:1;letter-spacing:-.01em;cursor:pointer;transition:transform .12s,filter .15s,box-shadow .15s}
.dp-tombol:hover:not(:disabled){filter:brightness(.97)}
.dp-tombol:active:not(:disabled){transform:scale(.985)}
.dp-tombol:disabled{opacity:.45;cursor:not-allowed}
/* Batalkan: teks merah di atas dasar netral — tidak berteriak, tapi jelas berbeda. */
.dp-tombol.bahaya{background:#fff;color:#b42f2f;box-shadow:inset 0 0 0 1px #f2dcdc}
.dp-tombol.bahaya:hover:not(:disabled){background:#fef7f7}
/* Ubah: biru muda lembut. */
.dp-tombol.sekunder{background:#eef6fc;color:#2774a8}
.dp-tombol.sekunder:hover:not(:disabled){background:#e3f0fa}
/* Aksi utama: satu-satunya bidang berwarna penuh, selebar drawer. */
.dp-tombol.utama{flex:0 0 auto;width:100%;height:52px;font-size:15px;font-weight:900;border-radius:16px;background:linear-gradient(135deg,#2774a8,#3a8fc6);color:#fff;box-shadow:0 8px 20px -6px rgba(39,116,168,.55)}
.dp-tombol.utama:hover:not(:disabled){filter:brightness(1.03)}

/* Catatan & peringatan di kartu ekstra. */
.dp-warning{padding:10px 12px;border-radius:12px;border:1px solid #f3dfae;background:#fff8e6;color:#7a5200;font-size:12.5px;font-weight:700;line-height:1.5}
.dp-catatan{margin:8px 0 0;font-size:12.5px;font-weight:700;color:#5a6b80;line-height:1.5}
.dp-error{margin:8px 0 0;font-size:12.5px;font-weight:800;color:#b42f2f}

/* Blok asli (form resi HBO / riwayat lacak) dirapikan di dalam kartu. */
.dp-ekstra .od-root,.dp-ekstra .rp-root{padding:0;background:transparent;min-height:0}
.dp-ekstra .rp-act{position:static;background:none;padding:0}
.dp-ekstra .od-acts{gap:8px;margin-top:10px;padding-top:10px}
.dp-ekstra .od-title{font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:900;color:#9aa6b4;margin-bottom:8px}
.dp-ekstra .od-a{flex:1 1 calc(50% - 4px);min-height:38px;border-radius:999px;border:0;background:#f3f5f8;color:#3d4a5c;font-size:12px;font-weight:800}
.dp-ekstra .od-a-primary{background:#2774a8;color:#fff}
.dp-ekstra .od-a-danger{background:#fdf0f0;color:#b42f2f}
.dp-ekstra .od-link{width:100%;border:0;background:none;padding:8px 0 0;font-size:12px;font-weight:800;color:#2774a8;cursor:pointer}

/* Modal Lacak. */
.dp-md{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(36,50,74,.45);backdrop-filter:blur(3px)}
.dp-mc{width:100%;max-width:440px;max-height:80vh;overflow-y:auto;background:#fff;border-radius:24px;box-shadow:0 24px 60px -24px rgba(36,50,74,.5)}
.dp-mh{position:sticky;top:0;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px;background:#fff;border-bottom:1px solid #e4e9ef}
.dp-mh small{display:block;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#5a6b80}
.dp-mh h3{margin:2px 0 0;font-size:17px;font-weight:900;color:#24324a}
.dp-mh b{color:#24324a;text-transform:none;letter-spacing:0}
.dp-mh .dp-tutup{width:36px;height:36px;border-color:#c9d7e4;background:#f3f5f8;color:#24324a}
.dp-md-note{margin:0;padding:20px;font-size:13px;font-weight:700;color:#5a6b80}
.dp-md-note.is-error{color:#b42f2f}
.dp-trk{margin:0;padding:6px 20px 20px;list-style:none}
.dp-trk li{padding:10px 0;border-bottom:1px solid #eef2f6}
.dp-trk li:last-child{border-bottom:0}
.dp-trk b{display:block;font-size:13px;font-weight:900;color:#3d4a5c}
.dp-trk li.is-latest b{color:#2774a8}
.dp-trk small{display:block;margin-top:2px;font-size:12px;font-weight:600;color:#5a6b80}

/* ── Tema MONO (dashboard /admin & ops) ──
   Seluruh aksen jadi hitam-putih/abu: header, kartu status, stepper, resi, tombol.
   Semua hijau/kuning/merah diganti skala abu yang berbeda terang-gelap, jadi tahap
   pesanan tetap bisa dibedakan tanpa warna. */
.dp-wrap.tema-mono{background:#fff;color:#111827}
.tema-mono .dp-header{background:linear-gradient(135deg,#111827 0%,#1f2937 60%,#374151 100%)}
.tema-mono .dp-tutup{border-color:rgba(255,255,255,.35);background:rgba(255,255,255,.14)}
.tema-mono .dp-kartu,
.tema-mono .dp-kartu-gabung{box-shadow:0 6px 20px rgba(17,24,39,.06)}
.tema-mono .dp-status-kartu{box-shadow:0 16px 40px rgba(17,24,39,.1)}

/* Ikon status: hanya beda tingkat gelapnya. */
.tema-mono .dp-status-ikon{background:#f3f4f6 !important;color:#111827 !important}
.tema-mono .dp-hitung{background:#f3f4f6;color:#111827}
.tema-mono .dp-status-catatan{color:#6b7280}
.tema-mono .dp-status-judul{color:#111827}

/* Stepper mono: lewat = hitam, aktif = hitam berbingkai, belum = abu. */
.tema-mono .dp-langkah-garis{background:#e5e7eb}
.tema-mono .dp-langkah-dot{background:#f3f4f6;color:#9ca3af}
.tema-mono .dp-langkah-item.lewat .dp-langkah-dot{background:#111827;color:#fff}
.tema-mono .dp-langkah-item.lewat .dp-langkah-label{color:#111827}
.tema-mono .dp-langkah-item.aktif .dp-langkah-dot{background:#fff;border:2px solid #111827;color:#111827}
.tema-mono .dp-langkah-item.aktif .dp-langkah-label{color:#111827;font-weight:900}
.tema-mono .dp-langkah-label{color:#9ca3af}

.tema-mono .dp-kepala-ikon{background:#f3f4f6;color:#111827}
.tema-mono .dp-kepala-ikon.pink{background:#f3f4f6;color:#111827}
.tema-mono .dp-kepala-judul{color:#111827}

.tema-mono .dp-lencana.kurir{background:#111827;color:#fff}
.tema-mono .dp-lencana.layanan{background:#f3f4f6;color:#374151}
.tema-mono .dp-resi{background:linear-gradient(135deg,#f9fafb,#f3f4f6)}
.tema-mono .dp-resi-label{color:#6b7280}
.tema-mono .dp-resi-nomor{color:#111827}
.tema-mono .dp-resi-nomor.kosong{color:#9ca3af}
.tema-mono .dp-pil{background:#fff;color:#374151;box-shadow:inset 0 0 0 1px #e5e7eb}
.tema-mono .dp-pil:hover:not(:disabled){background:#f9fafb;color:#111827}
.tema-mono .dp-pil.biru{background:#f3f4f6;color:#111827;box-shadow:none}
.tema-mono .dp-chip{background:#f3f4f6;color:#374151}
.tema-mono .dp-chip.kain{background:#e5e7eb;color:#111827}

.tema-mono .dp-alamat-hp{color:#6b7280}
.tema-mono .dp-alamat-jalan{color:#374151}
.tema-mono .dp-wa{background:#f3f4f6;color:#111827}
.tema-mono .dp-wa:hover{background:#e5e7eb}

.tema-mono .dp-item-foto{background:linear-gradient(160deg,#f9fafb,#f3f4f6)}
.tema-mono .dp-kosong-teks{color:#6b7280}

.tema-mono .dp-ringkas{background:#f9fafb}
.tema-mono .dp-ringkas-baris{color:#374151}
.tema-mono .dp-ringkas-baris .hijau{color:#374151}
.tema-mono .dp-ringkas-total span:last-child{color:#111827}
.tema-mono .dp-kv-baris span{color:#6b7280}
.tema-mono .dp-kv-baris b{color:#111827}
.tema-mono .dp-kv-baris b.kosong{color:#9ca3af}

/* Tombol: utama jadi hitam pekat, sekunder abu, bahaya abu bergaris. */
.tema-mono .dp-tombol.bahaya{background:#fff;color:#374151;box-shadow:inset 0 0 0 1px #e5e7eb}
.tema-mono .dp-tombol.bahaya:hover:not(:disabled){background:#f9fafb}
.tema-mono .dp-tombol.sekunder{background:#f3f4f6;color:#111827}
.tema-mono .dp-tombol.sekunder:hover:not(:disabled){background:#e5e7eb}
.tema-mono .dp-tombol.utama{background:linear-gradient(135deg,#111827,#374151);color:#fff;box-shadow:0 8px 20px -6px rgba(17,24,39,.5)}

.tema-mono .dp-warning{background:#f9fafb;border-color:#e5e7eb;color:#374151}
.tema-mono .dp-catatan{color:#6b7280}
.tema-mono .dp-error{color:#111827}

/* Layar sempit: jarak & huruf sedikit dikecilkan, struktur tetap sama. */
@media (max-width:639.98px){
  .dp-header{padding:20px 18px 64px}
  .dp-judul{font-size:23px}
  .dp-isi{padding:0 14px 18px;margin-top:-50px}
  .dp-status-kartu{padding:18px}
  .dp-kartu{padding:16px;border-radius:22px}
  .dp-blok{padding:16px}
  .dp-garis{margin:0 16px}
  .dp-status-judul{font-size:16px}
  .dp-resi{flex-wrap:wrap}
  .dp-kv-baris{font-size:13.5px}
  .dp-langkah-label{font-size:11px}
  .dp-footer{padding:12px;border-radius:18px}
  .dp-tombol{height:44px;padding:0 12px;font-size:13.5px}
  .dp-tombol.utama{height:50px}
}
`;

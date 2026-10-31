"use client";

/**
 * Drawer "Detail Pesanan" — SATU layout untuk tiga tempat, beda warna saja:
 *  - panel admin (/panel-admin/transaksi) : tema "warna" (biru)
 *  - dashboard ops & /admin               : tema "mono" (hitam-putih)
 *
 * Murni tampilan. Semua data & aksi (handler, fetch, kondisi tombol) tetap milik pemanggil:
 * TransaksiDetailDrawer (panel admin & ops) dan OrderDetailContent (/admin).
 * Ukuran sengaja rapat/compact supaya tidak ada ruang kosong.
 */

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, FileText, MapPin, MessageCircle, Package, ShoppingBag, Truck } from "lucide-react";
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

/* ── Ikon langkah stepper ── */
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

const IkonCek = ({ size = 11 }: { size?: number }) => (
  <Svg size={size} stroke={3}>
    <path d="M5 12l5 5L20 7" />
  </Svg>
);

const IkonJam = ({ size = 18 }: { size?: number }) => (
  <Svg size={size} stroke={2}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2M9 2h6" />
  </Svg>
);

/* Ikon baris (barcode, activity, scale, printer). Ditulis sebagai SVG lokal karena build
   lucide di repo ini belum mengekspor keempatnya di peta tipe. */
const IkonBarcode = ({ size = 13 }: { size?: number }) => (
  <Svg size={size} stroke={1.9}>
    <path d="M4 5v14M7 5v14M10 5v14M13 5v14M17 5v14M20 5v14" />
  </Svg>
);

const IkonActivity = ({ size = 13 }: { size?: number }) => (
  <Svg size={size} stroke={2}>
    <path d="M3 12h4l2.5-7 4 14 2.5-7H21" />
  </Svg>
);

const IkonTimbangan = ({ size = 13 }: { size?: number }) => (
  <Svg size={size} stroke={2}>
    <path d="M12 3v4M6 21h12M6 21l-3-9h18l-3 9" />
    <path d="M9 21h6" />
  </Svg>
);

const IkonPrinter = ({ size = 13 }: { size?: number }) => (
  <Svg size={size} stroke={2}>
    <path d="M6 9V3h12v6" />
    <rect x="3" y="9" width="18" height="8" rx="2" />
    <path d="M6 17h12v4H6z" />
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
    ikon: <IkonJam size={17} />,
    ikonBg: "#fff3d6",
    ikonWarna: "#a46a00",
    nada: "kuning",
  },
  belum_dipacking: {
    judul: "Sedang disiapkan",
    catatan: "Pesanan sudah dibayar, siap dikemas",
    ikon: <Package size={17} strokeWidth={2} />,
    ikonBg: "#e8f3fb",
    ikonWarna: "#2774a8",
    nada: "biru",
  },
  sudah_dipacking: {
    judul: "Menunggu penjemputan",
    catatan: "Resi sudah dibuat, paket menunggu kurir",
    ikon: <Truck size={17} strokeWidth={2} />,
    ikonBg: "#e8f3fb",
    ikonWarna: "#2774a8",
    nada: "biru",
  },
  dikirim: {
    judul: "Dalam pengiriman",
    catatan: "Paket sedang menuju alamat pembeli",
    ikon: <Truck size={17} strokeWidth={2} />,
    ikonBg: "#e8f3fb",
    ikonWarna: "#2774a8",
    nada: "biru",
  },
  selesai: {
    judul: "Selesai",
    catatan: "Pesanan sudah diterima pembeli",
    ikon: <IkonCek size={16} />,
    ikonBg: "#e1f5ea",
    ikonWarna: "#1b7347",
    nada: "hijau",
  },
  dibatalkan: {
    judul: "Dibatalkan",
    catatan: "Pesanan ini sudah dibatalkan",
    ikon: (
      <Svg size={17} stroke={2}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="m6.5 6.5 11 11" />
      </Svg>
    ),
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

const LANGKAH = ["Dibayar", "Dikemas", "Dikirim", "Selesai"];

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
  trackAktif = false,
  onSalinResi,
  resiTersalin,
  berat,
  statusKirim,
  statusKirimMeta,
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
  /** `warna` = panel admin (biru). `mono` = /admin & ops (hitam-putih). */
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
  onLacak: () => void;
  /** Pop-up lacak sedang terbuka (dipakai /admin untuk styling tombol Lacak). */
  trackAktif?: boolean;
  onSalinResi: () => void;
  resiTersalin: boolean;
  berat: string;
  /** Status scan J&T terakhir (data yang sudah ada, bukan fetch baru). */
  statusKirim?: string;
  /** Baris kecil lokasi · waktu di bawah status kirim. */
  statusKirimMeta?: string;
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
  onClose: () => void;
  aksi?: AksiFooter[];
  ekstra?: ReactNode;
  /** Blok resi J&T asli (buat resi / ubah resi HBO). Logic lama, hanya dipindah posisinya. */
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
      {/* 1. Header gradasi pendek — kartu pertama menimpa sisi bawahnya. */}
      <div className="dp-header">
        <div className="dp-header-txt">
          <span className="dp-sumber">{sumber}</span>
          <h1 className="dp-judul">Detail Pesanan</h1>
        </div>
        <button type="button" className="dp-tutup" onClick={onClose} aria-label="Tutup">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="dp-isi">
        {/* 2. Kartu status + stepper 4 kolom rata. */}
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
              <span className="dp-langkah-garis" aria-hidden="true">
                <span
                  className="dp-langkah-garis-isi"
                  style={{ width: `${Math.min(100, (level / (LANGKAH.length - 1)) * 100)}%` }}
                />
              </span>
              {LANGKAH.map((label, i) => {
                const aktif = i === level && level < LANGKAH.length;
                const lewat = i < level;
                return (
                  <div key={label} className={`dp-langkah-item${lewat ? " lewat" : ""}${aktif ? " aktif" : ""}`}>
                    <span className="dp-langkah-dot">{lewat ? <IkonCek /> : null}</span>
                    <span className="dp-langkah-label">{label}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>

        {/* 3. Informasi Pengiriman. */}
        <section className="dp-kartu">
          <div className="dp-kepala">
            <div className="dp-kepala-kiri">
              <span className="dp-kepala-ikon">
                <Truck size={14} strokeWidth={2} />
              </span>
              <span className="dp-kepala-judul">Informasi Pengiriman</span>
            </div>
            <div className="dp-lencana-grup">
              <span className="dp-lencana kurir">{kurir}</span>
              {layanan ? <span className="dp-lencana layanan">{layanan}</span> : null}
            </div>
          </div>

          <div className="dp-baris">
            <span className="dp-baris-ikon">
              <IkonBarcode size={13} />
            </span>
            <span className="dp-baris-label">Nomor Resi</span>
            <span className={`dp-baris-nilai${resi ? "" : " kosong"}`}>{resi || resiKosong}</span>
            <span className="dp-baris-aksi">
              <button
                type="button"
                className={`dp-mini${trackAktif ? " aktif" : ""}`}
                onClick={onLacak}
                disabled={!resi}
                aria-expanded={trackAktif}
              >
                <ExternalLink size={10} /> Lacak
              </button>
            </span>
          </div>
          <div className="dp-baris">
            <span className="dp-baris-ikon">
              <Truck size={13} />
            </span>
            <span className="dp-baris-label">Layanan</span>
            <span className="dp-baris-nilai">{layanan || "—"}</span>
          </div>
          <div className="dp-baris">
            <span className="dp-baris-ikon">
              <IkonActivity size={13} />
            </span>
            <span className="dp-baris-label">Status Terbaru</span>
            <span className="dp-baris-nilai">
              {statusKirim || "Menunggu pickup kurir"}
              <i className="dp-baris-sub">{statusKirimMeta || "Belum ada scan J&T"}</i>
            </span>
          </div>
          <div className="dp-baris">
            <span className="dp-baris-ikon">
              <IkonTimbangan size={13} />
            </span>
            <span className="dp-baris-label">Berat Kirim</span>
            <span className="dp-baris-nilai">{berat}</span>
          </div>

          {/* Aksi resi J&T asli (buat resi / ubah resi HBO) — logic lama, tampilan dirapikan. */}
          {children ? <div className="dp-resi-panel">{children}</div> : null}
        </section>

        {/* 4. Alamat Pengiriman. */}
        <section className="dp-kartu">
          <div className="dp-kepala">
            <div className="dp-kepala-kiri">
              <span className="dp-kepala-ikon pink">
                <MapPin size={14} strokeWidth={2} />
              </span>
              <span className="dp-kepala-judul">Alamat Pengiriman</span>
            </div>
            <button type="button" className="dp-wa" onClick={onChat} aria-label="Chat WhatsApp customer">
              <MessageCircle size={14} strokeWidth={2} />
            </button>
          </div>
          <div>
            <p className="dp-alamat-nama">
              {nama}
              {telepon ? <span className="dp-alamat-hp"> · {localPhone(telepon)}</span> : null}
            </p>
            <p className="dp-alamat-jalan">{alamat || "Alamat belum diisi."}</p>
          </div>
        </section>

        {/* 5. Informasi Produk. */}
        <section className="dp-kartu">
          <div className="dp-kepala">
            <div className="dp-kepala-kiri">
              <span className="dp-kepala-ikon">
                <ShoppingBag size={14} strokeWidth={2} />
              </span>
              <span className="dp-kepala-judul">Informasi Produk</span>
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

        {/* 6. Detail Pesanan. */}
        <section className="dp-kartu">
          <div className="dp-kepala">
            <div className="dp-kepala-kiri">
              <span className="dp-kepala-ikon">
                <FileText size={14} strokeWidth={2} />
              </span>
              <span className="dp-kepala-judul">Detail Pesanan</span>
            </div>
          </div>

          <div className="dp-baris dp-baris-detail">
            <span className="dp-baris-ikon">
              <IkonBarcode size={13} />
            </span>
            <span className="dp-baris-label">No. Pesanan</span>
            <span className="dp-baris-nilai">
              {nomorPesanan}
              <button type="button" className="dp-mini" onClick={onSalinNomor}>
                {nomorTersalin ? "Tersalin" : "Salin"}
              </button>
            </span>
          </div>
          <div className="dp-baris dp-baris-detail">
            <span className="dp-baris-ikon">
              <FileText size={13} />
            </span>
            <span className="dp-baris-label">Metode Pembayaran</span>
            <span className="dp-baris-nilai">{metodeBayar}</span>
          </div>
          <div className="dp-baris dp-baris-detail">
            <span className="dp-baris-ikon">
              <IkonJam size={13} />
            </span>
            <span className="dp-baris-label">Waktu Pemesanan</span>
            <span className="dp-baris-nilai">{waktuPesan}</span>
          </div>
          <div className="dp-baris dp-baris-detail">
            <span className="dp-baris-ikon">
              <IkonJam size={13} />
            </span>
            <span className="dp-baris-label">Waktu Pembayaran</span>
            <span className={`dp-baris-nilai${waktuBayar ? "" : " kosong"}`}>{waktuBayar || "Belum"}</span>
          </div>
        </section>

        {ekstra ? <section className="dp-kartu dp-ekstra">{ekstra}</section> : null}

        {/* 7. Footer — sekunder sejajar, utama full lebar di bawah. */}
        <PanelDetailFooter aksi={aksi} />
      </div>
    </div>
  );
}

export function PanelDetailFooter({ aksi }: { aksi: AksiFooter[] }) {
  if (!aksi || aksi.length === 0) return null;
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
          <IkonPrinter size={13} />
          {a.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Pop-up "Lacak Pengiriman" — dipakai drawer /admin dan dashboard ops.
 * Dirender di dalam panel (position:absolute) supaya menutupi area drawer.
 */
export function PanelLacakModal({
  open,
  onClose,
  resi,
  loading = false,
  error = "",
  riwayat,
}: {
  open: boolean;
  onClose: () => void;
  resi: string;
  loading?: boolean;
  error?: string;
  riwayat: {
    key: string;
    status: string;
    meta: string;
    note?: string | null;
    receiver?: string | null;
    receivedByThirdParty?: string | null;
    handoverNote?: string | null;
    terbaru?: boolean;
  }[];
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="dp-md"
      role="dialog"
      aria-modal="true"
      aria-label="Lacak Pengiriman"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dp-mc">
        <div className="dp-mh">
          <div>
            <small>J&amp;T Express</small>
            <h3>Lacak Pengiriman</h3>
            <small>
              No. Resi <b>{resi || "-"}</b>
            </small>
          </div>
          <button type="button" className="dp-tutup" onClick={onClose} aria-label="Tutup">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {loading ? (
          <p className="dp-md-note">Memuat riwayat dari J&amp;T…</p>
        ) : error ? (
          <p className="dp-md-note is-error">{error}</p>
        ) : riwayat.length === 0 ? (
          <p className="dp-md-note">Belum ada riwayat dari J&amp;T.</p>
        ) : (
          <ul className="dp-trk">
            {riwayat.map((r) => (
              <li key={r.key} className={r.terbaru ? "is-latest" : undefined}>
                <b>{r.status}</b>
                {r.meta ? <small>{r.meta}</small> : null}
                {r.note ? <small>Catatan: {r.note}</small> : null}
                {r.receiver ? <small>Diterima oleh: {r.receiver}</small> : null}
                {r.receivedByThirdParty ? <small>Diterima oleh: {r.receivedByThirdParty}</small> : null}
                {r.handoverNote ? <small style={{ color: "#b45309", fontWeight: 700 }}>{r.handoverNote}</small> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Kerangka drawer: overlay + panel geser. Isi dirender oleh anak. */
export function PanelDetailShell({
  open,
  onClose,
  tema = "warna",
  embed = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  tema?: "warna" | "mono";
  /** `embed` = dipakai di dalam drawer lain (/admin & ops) yang sudah punya overlay. */
  embed?: boolean;
  children: ReactNode;
}) {
  const panel = (
    <motion.aside
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "tween", duration: 0.24, ease: "easeOut" }}
      className={`dp-panel${tema === "mono" ? " tema-mono" : ""}${embed ? " is-embed" : ""}`}
      role="dialog"
      aria-label="Detail Pesanan"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
      <style>{DP_CSS}</style>
    </motion.aside>
  );

  if (embed) return open ? panel : null;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="dp-overlay"
          onClick={onClose}
        >
          {panel}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* Layout rapat/compact: jarak kecil, radius 14, huruf 10.5–16px.
   Dipakai sama oleh tema warna (panel admin) dan mono (/admin & ops). */
const DP_CSS = `
.dp-overlay{position:fixed;inset:0;z-index:9998;display:flex;justify-content:flex-end;background:rgba(18,32,48,.45);backdrop-filter:blur(3px)}
.dp-panel{position:relative;z-index:1;display:flex;flex-direction:column;flex:1 1 auto;width:100%;max-width:100%;height:100%;min-width:0;min-height:0;background:#f4f7fb;color:#24324a;overflow:hidden;box-shadow:-24px 0 60px -24px rgba(18,32,48,.4)}
.dp-panel.is-embed{box-shadow:none}
.dp-panel.tema-mono{background:#fff}
/* Panel admin (non-embed) 440px di desktop, full di mobile. Lebar embed diatur induk. */
.dp-overlay > .dp-panel{flex:0 0 auto}
@media (min-width:640px){.dp-overlay > .dp-panel{width:440px;max-width:440px}}
.dp-wrap{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;scrollbar-width:none}
.dp-wrap::-webkit-scrollbar{display:none}

/* 1. Header pendek. */
.dp-header{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px 40px;background:linear-gradient(135deg,#2774a8 0%,#4b9bd1 60%,#8cc5ea 100%)}
.dp-header-txt{display:flex;flex-direction:column;gap:2px;min-width:0}
.dp-sumber{font-size:10.5px;font-weight:700;color:rgba(255,255,255,.82)}
.dp-judul{margin:0;font-size:20px;font-weight:900;line-height:1.2;letter-spacing:-.01em;color:#fff}
.dp-tutup{flex:none;display:grid;place-items:center;width:34px;height:34px;border-radius:999px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.16);color:#fff;cursor:pointer}
.dp-tutup:hover{background:rgba(255,255,255,.28)}

.dp-isi{flex:1;display:flex;flex-direction:column;gap:8px;padding:0 12px 12px;margin-top:-30px;position:relative}

/* Kartu: padding 11x12, radius 14. */
.dp-kartu{background:#fff;border-radius:14px;padding:11px 12px;display:flex;flex-direction:column;gap:9px;box-shadow:0 4px 14px rgba(36,50,74,.06)}
.dp-status-kartu{padding:12px 12px 10px;gap:10px}

/* 2. Kartu status. */
.dp-status{display:flex;align-items:center;justify-content:space-between;gap:10px}
.dp-status-kiri{display:flex;align-items:center;gap:9px;min-width:0}
.dp-status-ikon{flex:none;display:grid;place-items:center;width:30px;height:30px;border-radius:10px}
.dp-status-teks{display:flex;flex-direction:column;gap:1px;min-width:0}
.dp-status-judul{font-size:14px;font-weight:900;line-height:1.25}
.dp-status-catatan{font-size:11.5px;font-weight:700;color:#5a6b80;line-height:1.3}
.dp-hitung{flex:none;font-size:13px;font-weight:900;color:#8a5600;background:#fff3d6;padding:5px 8px;border-radius:9px;font-variant-numeric:tabular-nums}
.dp-status-kartu.nada-merah .dp-hitung{background:#fdebf0;color:#a3355f}

/* Stepper: 4 kolom RATA, titik 20px, garis 2px di belakang titik. */
.dp-langkah{position:relative;display:flex;align-items:flex-start;padding-top:2px}
.dp-langkah-garis{position:absolute;left:12.5%;right:12.5%;top:11px;height:2px;border-radius:2px;background:#e4e9ef;overflow:hidden}
.dp-langkah-garis-isi{display:block;height:100%;background:#2774a8;border-radius:2px;transition:width .2s}
.dp-langkah-item{position:relative;z-index:1;flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px}
.dp-langkah-dot{display:grid;place-items:center;width:20px;height:20px;border-radius:999px;background:#eef1f5;color:#fff;box-sizing:border-box;border:2px solid transparent}
.dp-langkah-label{font-size:11px;font-weight:700;color:#8a97a6;text-align:center;white-space:nowrap;line-height:1.2}
.dp-langkah-item.lewat .dp-langkah-dot{background:#2774a8;border-color:#2774a8}
.dp-langkah-item.lewat .dp-langkah-label{font-weight:800;color:#2774a8}
.dp-langkah-item.aktif .dp-langkah-dot{background:#fff;border-color:#2774a8}
.dp-langkah-item.aktif .dp-langkah-label{font-weight:900;color:#2774a8}
.dp-status-kartu.nada-kuning .dp-langkah-garis-isi{background:#f0b443}
.dp-status-kartu.nada-kuning .dp-langkah-item.lewat .dp-langkah-dot{background:#f0b443;border-color:#f0b443}
.dp-status-kartu.nada-kuning .dp-langkah-item.lewat .dp-langkah-label{color:#8a5600}
.dp-status-kartu.nada-kuning .dp-langkah-item.aktif .dp-langkah-dot{border-color:#f0b443}
.dp-status-kartu.nada-kuning .dp-langkah-item.aktif .dp-langkah-label{color:#8a5600}
.dp-status-kartu.nada-hijau .dp-langkah-garis-isi{background:#1b7347}
.dp-status-kartu.nada-hijau .dp-langkah-item.lewat .dp-langkah-dot{background:#1b7347;border-color:#1b7347}
.dp-status-kartu.nada-hijau .dp-langkah-item.lewat .dp-langkah-label{color:#1b7347}
.dp-status-kartu.nada-hijau .dp-langkah-item.aktif .dp-langkah-dot{border-color:#1b7347}
.dp-status-kartu.nada-hijau .dp-langkah-item.aktif .dp-langkah-label{color:#1b7347}

/* Kepala kartu. */
.dp-kepala{display:flex;align-items:center;justify-content:space-between;gap:8px}
.dp-kepala-kiri{display:flex;align-items:center;gap:7px;min-width:0}
.dp-kepala-ikon{flex:none;display:grid;place-items:center;width:24px;height:24px;border-radius:8px;background:#e8f3fb;color:#2774a8}
.dp-kepala-ikon.pink{background:#fde8ee;color:#a3355f}
.dp-kepala-judul{font-size:13px;font-weight:900}
.dp-lencana-grup{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}

/* Badge kurir: J&T tetap MERAH di semua tema. */
.dp-lencana{font-size:10.5px;font-weight:900;padding:3px 8px;border-radius:999px;white-space:nowrap}
.dp-lencana.kurir{background:#c8102e;color:#fff}
.dp-lencana.layanan{background:#e8f3fb;color:#2774a8;font-weight:800}

/* 3. Baris grid: ikon | label 92 | nilai | aksi. */
.dp-baris{display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-top:1px solid #f1f4f8;font-size:12px;min-width:0}
.dp-kepala + .dp-baris{border-top:0;padding-top:0}
.dp-baris-ikon{flex:none;display:grid;place-items:center;width:16px;height:18px;color:#8a97a6}
.dp-baris-label{flex:0 0 92px;font-weight:700;color:#5a6b80;line-height:1.45}
.dp-baris-nilai{flex:1 1 auto;min-width:0;font-weight:800;color:#24324a;line-height:1.45;overflow-wrap:anywhere;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dp-baris-nilai.kosong{color:#9aa6b4;font-weight:700}
.dp-baris-sub{display:block;width:100%;font-style:normal;font-size:10.5px;font-weight:600;color:#8a97a6;line-height:1.35}
.dp-baris-aksi{flex:none;display:flex;align-items:center;gap:4px;margin-left:auto}

/* Tombol mini (Lacak / Salin). */
.dp-mini{display:inline-flex;align-items:center;gap:3px;height:22px;padding:0 7px;border:0;border-radius:7px;background:#eef6fc;color:#2774a8;font:inherit;font-size:10.5px;font-weight:800;cursor:pointer;white-space:nowrap}
.dp-mini:hover:not(:disabled){background:#e1eefa}
.dp-mini.aktif{background:#2774a8;color:#fff}
.tema-mono .dp-mini.aktif{background:#111827;color:#fff}
.dp-mini:disabled{background:#f2f4f7;color:#a9b4c0;cursor:not-allowed}

.dp-chip{display:inline-block;font-size:10.5px;font-weight:800;color:#3d4a5c;background:#f3f5f8;padding:2px 8px;border-radius:999px;white-space:nowrap}
.dp-chip.kain{background:#e8f3fb;color:#2774a8}

/* Blok resi J&T asli (buat resi / ubah resi HBO) — hanya aksinya yang tampil. */
.dp-resi-panel{padding-top:8px;border-top:1px solid #f1f4f8}
.dp-resi-panel:empty{display:none}
.dp-resi-panel .rp-act{position:static;background:none;padding:0}
.dp-resi-panel .od-link,.dp-resi-panel button{font-size:11.5px}
/* Link "Ganti ke resi HBO (input manual)" — satu baris abu muda, ikon kiri, chevron kanan. */
.dp-resi-panel .od-link-hbo{display:flex;align-items:center;gap:6px;width:100%;margin-top:6px;padding:6px 8px;border:0;border-radius:8px;background:#f5f7fa;color:#5a6b80;font:inherit;font-size:11px;font-weight:800;text-align:left;cursor:pointer}
.dp-resi-panel .od-link-hbo:hover{background:#eef2f7;color:#24324a}
.dp-resi-panel .od-link-hbo span{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dp-resi-panel .od-link-hbo svg:last-child{flex:none;margin-left:auto;opacity:.6}
.tema-mono .dp-resi-panel .od-link-hbo{background:#f3f4f6;color:#6b7280}
.tema-mono .dp-resi-panel .od-link-hbo:hover{background:#e5e7eb;color:#111827}

/* 4. Alamat. */
.dp-alamat-nama{margin:0;font-size:12.5px;font-weight:900;line-height:1.4}
.dp-alamat-hp{font-weight:700;color:#5a6b80}
.dp-alamat-jalan{margin:2px 0 0;font-size:12px;font-weight:600;color:#3d4a5c;line-height:1.5}
.dp-wa{flex:none;display:grid;place-items:center;width:30px;height:30px;border:0;border-radius:9px;background:#e1f5ea;color:#1b7347;cursor:pointer}
.dp-wa:hover{background:#d3efdf}

/* 5. Produk. */
.dp-item{display:flex;align-items:flex-start;gap:9px}
.dp-item-foto{flex:none;display:grid;place-items:center;width:44px;height:50px;border-radius:9px;overflow:hidden;background:linear-gradient(160deg,#eef6fc,#fdf1f5)}
.dp-item-foto img{width:100%;height:100%;object-fit:cover;display:block}
.dp-item-teks{display:flex;flex-direction:column;gap:4px;flex:1;min-width:0}
.dp-item-nama{font-size:13px;font-weight:900;line-height:1.3}
.dp-item-chips{display:flex;gap:4px;flex-wrap:wrap}
.dp-item-harga{flex:none;font-size:12.5px;font-weight:900;white-space:nowrap;color:#24324a}
.dp-kosong-teks{margin:0;font-size:12px;font-weight:600;color:#8a97a6}

.dp-ringkas{display:flex;flex-direction:column;gap:4px;background:#f7f9fb;border-radius:10px;padding:7px 10px}
.dp-ringkas-baris{display:flex;justify-content:space-between;gap:8px;font-size:11.5px;font-weight:600;color:#3d4a5c}
.dp-ringkas-baris .hijau{color:#1b7347;font-weight:700}
.dp-ringkas-garis{height:1px;background:#e4e9ef;margin:2px 0}
.dp-ringkas-total{display:flex;justify-content:space-between;align-items:center;gap:8px}
.dp-ringkas-total span:first-child{font-size:12px;font-weight:900;color:#24324a}
.dp-ringkas-total span:last-child{font-size:16px;font-weight:900;color:#2774a8}

/* 6. Detail pesanan: label 128px. */
.dp-baris-detail .dp-baris-label{flex-basis:128px}

/* 7. Footer: sekunder 34px, utama 38px full lebar. */
.dp-footer{flex:none;display:flex;flex-direction:column;gap:6px;padding:8px;background:#fff;border-radius:14px;box-shadow:0 4px 14px rgba(36,50,74,.06)}
.dp-footer-baris{display:flex;gap:6px}
.dp-tombol{display:inline-flex;align-items:center;justify-content:center;gap:5px;flex:1 1 0;min-width:0;height:34px;padding:0 10px;border:0;border-radius:9px;font:inherit;font-size:12px;font-weight:800;line-height:1;cursor:pointer;transition:filter .15s}
.dp-tombol:hover:not(:disabled){filter:brightness(.97)}
.dp-tombol:disabled{opacity:.45;cursor:not-allowed}
.dp-tombol.bahaya{background:#fff;color:#b42f2f;box-shadow:inset 0 0 0 1px #f2dcdc}
.dp-tombol.bahaya:hover:not(:disabled){background:#fef7f7}
.dp-tombol.sekunder{background:#eef6fc;color:#2774a8}
.dp-tombol.sekunder:hover:not(:disabled){background:#e3f0fa}
.dp-tombol.utama{flex:0 0 auto;width:100%;height:38px;font-size:12.5px;background:linear-gradient(135deg,#2774a8,#3a8fc6);color:#fff}
.dp-tombol.utama:hover:not(:disabled){filter:brightness(1.03)}

/* Catatan & peringatan. */
.dp-warning{padding:8px 10px;border-radius:9px;border:1px solid #f3dfae;background:#fff8e6;color:#7a5200;font-size:11.5px;font-weight:700;line-height:1.5}
.dp-catatan{margin:0;font-size:11.5px;font-weight:700;color:#5a6b80;line-height:1.5}
.dp-error{margin:0;font-size:11.5px;font-weight:800;color:#b42f2f}

/* Blok ekstra dirapikan di dalam kartu. */
.dp-ekstra .od-root,.dp-ekstra .rp-root{padding:0;background:transparent;min-height:0}
.dp-ekstra .rp-act{position:static;background:none;padding:0}
.dp-ekstra .od-acts{gap:6px;margin-top:6px;padding-top:6px}
.dp-ekstra .od-title{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;font-weight:900;color:#9aa6b4;margin-bottom:6px}
.dp-ekstra .od-a{flex:1 1 calc(50% - 3px);min-height:30px;border-radius:8px;border:0;background:#f3f5f8;color:#3d4a5c;font-size:11.5px;font-weight:800}
.dp-ekstra .od-a-primary{background:#2774a8;color:#fff}
.dp-ekstra .od-a-danger{background:#fdf0f0;color:#b42f2f}
.dp-ekstra .od-link{width:100%;border:0;background:none;padding:6px 0 0;font-size:11.5px;font-weight:800;color:#2774a8;cursor:pointer}

/* Modal Lacak. */
.dp-md{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(36,50,74,.45);backdrop-filter:blur(3px)}
.dp-mc{width:100%;max-width:420px;max-height:80vh;overflow-y:auto;background:#fff;border-radius:16px;box-shadow:0 24px 60px -24px rgba(36,50,74,.5)}
.dp-mh{position:sticky;top:0;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:13px 14px;background:#fff;border-bottom:1px solid #e4e9ef}
.dp-mh small{display:block;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#5a6b80}
.dp-mh h3{margin:1px 0 0;font-size:14px;font-weight:900;color:#24324a}
.dp-mh b{color:#24324a;text-transform:none;letter-spacing:0}
.dp-mh .dp-tutup{width:30px;height:30px;border-color:#d7e0ea;background:#f3f5f8;color:#24324a}
.dp-md-note{margin:0;padding:16px;font-size:12px;font-weight:700;color:#5a6b80}
.dp-md-note.is-error{color:#b42f2f}
.dp-trk{margin:0;padding:4px 14px 14px;list-style:none}
.dp-trk li{padding:8px 0;border-bottom:1px solid #eef2f6}
.dp-trk li:last-child{border-bottom:0}
.dp-trk b{display:block;font-size:12px;font-weight:900;color:#3d4a5c}
.dp-trk li.is-latest b{color:#2774a8}
.dp-trk small{display:block;margin-top:1px;font-size:11px;font-weight:600;color:#5a6b80}

/* ── Tema MONO (/admin & ops) ── layout identik, warna hitam/abu. Badge J&T tetap merah. */
.dp-wrap.tema-mono{background:#fff;color:#111827}
.tema-mono .dp-header{background:linear-gradient(135deg,#111827 0%,#1f2937 60%,#374151 100%)}
.tema-mono .dp-status-ikon{background:#f3f4f6 !important;color:#111827 !important}
.tema-mono .dp-status-judul{color:#111827}
.tema-mono .dp-status-catatan{color:#6b7280}
.tema-mono .dp-hitung{background:#f3f4f6;color:#111827}
.tema-mono .dp-langkah-garis{background:#e5e7eb}
.tema-mono .dp-langkah-garis-isi,
.tema-mono .dp-status-kartu.nada-kuning .dp-langkah-garis-isi,
.tema-mono .dp-status-kartu.nada-hijau .dp-langkah-garis-isi{background:#111827}
.tema-mono .dp-langkah-dot{background:#e5e7eb}
.tema-mono .dp-langkah-item.lewat .dp-langkah-dot,
.tema-mono .dp-status-kartu.nada-kuning .dp-langkah-item.lewat .dp-langkah-dot,
.tema-mono .dp-status-kartu.nada-hijau .dp-langkah-item.lewat .dp-langkah-dot{background:#111827;border-color:#111827}
.tema-mono .dp-langkah-item.aktif .dp-langkah-dot,
.tema-mono .dp-status-kartu.nada-kuning .dp-langkah-item.aktif .dp-langkah-dot,
.tema-mono .dp-status-kartu.nada-hijau .dp-langkah-item.aktif .dp-langkah-dot{background:#fff;border-color:#111827}
.tema-mono .dp-langkah-item.lewat .dp-langkah-label,
.tema-mono .dp-langkah-item.aktif .dp-langkah-label,
.tema-mono .dp-status-kartu.nada-kuning .dp-langkah-item.lewat .dp-langkah-label,
.tema-mono .dp-status-kartu.nada-kuning .dp-langkah-item.aktif .dp-langkah-label,
.tema-mono .dp-status-kartu.nada-hijau .dp-langkah-item.lewat .dp-langkah-label,
.tema-mono .dp-status-kartu.nada-hijau .dp-langkah-item.aktif .dp-langkah-label{color:#111827}
.tema-mono .dp-kepala-ikon{background:#f3f4f6;color:#111827}
.tema-mono .dp-kepala-ikon.pink{background:#f3f4f6;color:#111827}
.tema-mono .dp-kepala-judul{color:#111827}
.tema-mono .dp-lencana.layanan{background:#f3f4f6;color:#374151}
.tema-mono .dp-baris-ikon{color:#9ca3af}
.tema-mono .dp-baris-label{color:#6b7280}
.tema-mono .dp-baris-nilai{color:#111827}
.tema-mono .dp-baris-nilai.kosong{color:#9ca3af}
.tema-mono .dp-baris-sub{color:#9ca3af}
.tema-mono .dp-baris{border-top-color:#f3f4f6}
.tema-mono .dp-mini{background:#f3f4f6;color:#111827}
.tema-mono .dp-mini:hover:not(:disabled){background:#e5e7eb}
.tema-mono .dp-mini:disabled{background:#f9fafb;color:#d1d5db}
.tema-mono .dp-chip{background:#f3f4f6;color:#374151}
.tema-mono .dp-chip.kain{background:#e5e7eb;color:#111827}
.tema-mono .dp-resi-panel{border-top-color:#f3f4f6}
.tema-mono .dp-alamat-hp{color:#6b7280}
.tema-mono .dp-alamat-jalan{color:#374151}
.tema-mono .dp-wa{background:#f3f4f6;color:#111827}
.tema-mono .dp-wa:hover{background:#e5e7eb}
.tema-mono .dp-item-foto{background:linear-gradient(160deg,#f9fafb,#f3f4f6)}
.tema-mono .dp-item-harga{color:#111827}
.tema-mono .dp-kosong-teks{color:#6b7280}
.tema-mono .dp-ringkas{background:#f9fafb}
.tema-mono .dp-ringkas-baris{color:#374151}
.tema-mono .dp-ringkas-baris .hijau{color:#374151}
.tema-mono .dp-ringkas-total span:first-child{color:#111827}
.tema-mono .dp-ringkas-total span:last-child{color:#111827}
.tema-mono .dp-tombol.bahaya{background:#fff;color:#374151;box-shadow:inset 0 0 0 1px #e5e7eb}
.tema-mono .dp-tombol.bahaya:hover:not(:disabled){background:#f9fafb}
.tema-mono .dp-tombol.sekunder{background:#f3f4f6;color:#111827}
.tema-mono .dp-tombol.sekunder:hover:not(:disabled){background:#e5e7eb}
.tema-mono .dp-tombol.utama{background:#111827;color:#fff}
.tema-mono .dp-warning{background:#f9fafb;border-color:#e5e7eb;color:#374151}
.tema-mono .dp-catatan{color:#6b7280}
.tema-mono .dp-error{color:#111827}
.tema-mono .dp-trk li.is-latest b{color:#111827}

/* Mobile: tetap rapat, label tidak terpotong. */
@media (max-width:639.98px){
  .dp-header{padding:13px 14px 36px}
  .dp-judul{font-size:19px}
  .dp-isi{padding:0 10px 10px;margin-top:-26px}
  .dp-baris-label{flex-basis:84px}
  .dp-baris-detail .dp-baris-label{flex-basis:104px}
  .dp-tombol{font-size:11.5px;padding:0 8px}
}
`;

/** Stylesheet drawer untuk pemakai yang merender panel langsung (tanpa shell). */
export const DP_STYLE = DP_CSS;

"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/affiliate/icons";
import { Empty, Search, useModal } from "@/components/affiliate/ui";

/**
 * Pusat Bantuan — FAQ program affiliate.
 * Isi mengikuti mockup, dengan angka yang diselaraskan dengan konfigurasi nyata.
 */

const FAQ: [string, string, string][] = [
  [
    "Tautan Affiliate",
    "Bagaimana cara membuat tautan affiliate?",
    "Buka Katalog Produk, pilih produk, lalu klik “Promosikan” atau “Buat Tautan Affiliate”. Isi nama kampanye dan sumber promosi, lalu klik Buat Tautan. Tautan akan tersimpan di halaman Tautan Affiliate dan bisa disalin kapan saja.",
  ],
  [
    "Tautan Affiliate",
    "Apakah satu produk bisa memiliki beberapa tautan?",
    "Bisa. Buat tautan berbeda untuk setiap kanal (misalnya TikTok dan WhatsApp) agar performa tiap kanal dapat dibandingkan di halaman Performa.",
  ],
  [
    "Laporan",
    "Bagaimana cara membaca laporan performa?",
    "Klik adalah jumlah kunjungan dari tautan kamu. Tingkat konversi = pesanan ÷ klik. Penjualan hanya menghitung pesanan yang sudah dibayar dan tidak dibatalkan atau diretur.",
  ],
  [
    "Laporan",
    "Kenapa angka komisi berbeda dengan penjualan × persentase?",
    "Dasar komisi hanya nilai produk yang memenuhi syarat. Ongkos kirim dan biaya lain tidak dihitung, dan setiap produk dapat memiliki persentase komisi berbeda.",
  ],
  [
    "Status Komisi",
    "Apa arti status komisi?",
    "Menunggu Validasi: pesanan belum selesai atau masih dalam masa validasi. Disetujui: komisi final dan masuk saldo tersedia. Dibayarkan: sudah dicairkan. Tidak Disetujui: pesanan dibatalkan atau diretur.",
  ],
  [
    "Status Komisi",
    "Kenapa komisi saya belum bisa ditarik?",
    "Komisi hanya bisa ditarik setelah pesanan selesai dan masa validasi berakhir. Masa validasi diatur admin di dashboard admin → Affiliate → Pengaturan Komisi.",
  ],
  [
    "Penarikan Dana",
    "Bagaimana cara menarik dana?",
    "Buka Penarikan Dana, isi jumlah, pilih metode dan rekening tujuan, lalu konfirmasi. Pengajuan berstatus Menunggu masih dapat dibatalkan sebelum diproses admin.",
  ],
  [
    "Penarikan Dana",
    "Kenapa penarikan saya ditolak?",
    "Penarikan dapat ditolak jika nama pemilik rekening tidak sesuai dengan data affiliate. Perbarui rekening di Pengaturan Akun lalu ajukan kembali.",
  ],
  [
    "Ketentuan Promosi",
    "Apa saja yang dilarang saat promosi?",
    "Dilarang menggunakan klaim palsu, menjanjikan diskon yang tidak berlaku, spam, memakai iklan berbayar dengan kata kunci merek SAMAQU, dan mengubah logo resmi.",
  ],
];

const CAT_ICON: Record<string, string> = {
  "Tautan Affiliate": "link",
  Laporan: "chart",
  "Status Komisi": "coins",
  "Penarikan Dana": "cash",
  "Ketentuan Promosi": "shield",
};

export default function AffiliateHelpPage() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const { open: openModal, close } = useModal();

  const cats = useMemo(() => Array.from(new Set(FAQ.map((f) => f[0]))), []);

  const list = useMemo(
    () =>
      FAQ.map((f, i) => ({ ...f, index: i })).filter((f) => {
        if (cat && f[0] !== cat) return false;
        if (q && !`${f[1]} ${f[2]}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [q, cat],
  );

  return (
    <div>
      <div
        className="card cp"
        style={{ textAlign: "center", padding: "32px 20px", background: "var(--af-soft2)", borderColor: "var(--af-soft)" }}
      >
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827" }}>Ada yang bisa kami bantu?</h2>
        <p className="muted" style={{ marginTop: 4 }}>
          Cari jawaban seputar tautan, laporan, komisi, dan penarikan dana.
        </p>
        <div style={{ maxWidth: 520, margin: "16px auto 0" }}>
          <Search value={q} onChange={setQ} placeholder="Cari pertanyaan…" />
        </div>
      </div>

      <div className="grid g5 mt">
        {cats.map((c) => (
          <button
            key={c}
            className="qa"
            style={
              cat === c
                ? { borderColor: "var(--af-pri)", background: "var(--af-soft2)" }
                : undefined
            }
            onClick={() => setCat(cat === c ? "" : c)}
            type="button"
          >
            <div className="aic">
              <Icon name={CAT_ICON[c] || "help"} />
            </div>
            <div className="b dark">{c}</div>
            <div className="small muted">{FAQ.filter((f) => f[0] === c).length} artikel</div>
          </button>
        ))}
      </div>

      <div className="split mt">
        <div>
          <div className="row between" style={{ marginBottom: 10 }}>
            <h3 className="b dark">Pertanyaan Umum {cat ? `· ${cat}` : ""}</h3>
            {cat ? (
              <button className="btn g sm" onClick={() => setCat("")} type="button">
                Tampilkan semua
              </button>
            ) : null}
          </div>

          {list.length === 0 ? (
            <div className="card">
              <Empty icon="help" title="Pertanyaan tidak ditemukan" text="Coba kata kunci lain atau hubungi tim bantuan." />
            </div>
          ) : (
            list.map((f) => (
              <div className="acc" key={f.index}>
                <button
                  className="q"
                  onClick={() => setOpen((prev) => ({ ...prev, [f.index]: !prev[f.index] }))}
                  aria-expanded={!!open[f.index]}
                  type="button"
                >
                  <span>{f[1]}</span>
                  <span
                    style={{
                      transform: `rotate(${open[f.index] ? 180 : 0}deg)`,
                      transition: "transform .2s",
                    }}
                  >
                    <Icon name="chevd" className="sm" />
                  </span>
                </button>
                {open[f.index] ? <div className="a">{f[2]}</div> : null}
              </div>
            ))
          )}
        </div>

        <div className="card cp" style={{ alignSelf: "start" }}>
          <div className="aic">
            <Icon name="mail" />
          </div>
          <h3 className="b dark mt">Masih butuh bantuan?</h3>
          <p className="small muted" style={{ marginTop: 4, lineHeight: 1.6 }}>
            Tim affiliate SAMAQU siap membantu pertanyaan seputar akun dan komisi.
          </p>
          <button
            className="btn p w mt"
            onClick={() =>
              openModal({
                size: "sm",
                title: "Kontak Bantuan",
                body: (
                  <div>
                    <div className="note i">
                      <Icon name="info" className="sm" />
                      <span>
                        Hubungi admin SAMAQU lewat WhatsApp resmi toko untuk bantuan regarding akun
                        dan komisi.
                      </span>
                    </div>
                    <div className="kv box mt">
                      <dt>Email</dt>
                      <dd>halo@samaqu.id</dd>
                      <dt>Jam layanan</dt>
                      <dd>Senin–Jumat, 09.00–17.00 WIB</dd>
                    </div>
                  </div>
                ),
                foot: (
                  <button className="btn p" onClick={close} type="button">
                    Mengerti
                  </button>
                ),
              })
            }
            type="button"
          >
            Hubungi Bantuan
          </button>
        </div>
      </div>
    </div>
  );
}

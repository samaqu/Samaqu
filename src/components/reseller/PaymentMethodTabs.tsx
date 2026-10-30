"use client";

import { useState } from "react";
import { Copy, Download, Maximize2 } from "lucide-react";
import { Modal } from "@/components/reseller/admin/Modal";
import type { ResellerSettingsView } from "@/lib/reseller/client";

export type PaymentMethodChoice = "bsi" | "qris";

/**
 * Pilihan pembayaran portal reseller: transfer BSI atau scan QRIS.
 * Dipakai di Top Up dan kotak kekurangan saldo (Buat Pesanan, sukses, detail).
 * Tab QRIS otomatis tersembunyi kalau admin belum mengunggah gambar QRIS.
 */
export default function PaymentMethodTabs({
  settings,
  method,
  onChange,
  intro,
}: {
  settings: ResellerSettingsView;
  method: PaymentMethodChoice;
  onChange: (method: PaymentMethodChoice) => void;
  /** Keterangan kecil di atas pilihan (opsional). */
  intro?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(false);
  const hasQris = Boolean(settings.qris_image_url);
  const active: PaymentMethodChoice = hasQris ? method : "bsi";

  const copyAccount = async () => {
    const text = `${settings.bsi_bank_name} ${settings.bsi_account_number} a.n. ${settings.bsi_account_holder}`.trim();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard diblokir — nomor tetap terlihat */
    }
  };

  return (
    <div>
      {intro ? <p className="hint" style={{ marginBottom: 8 }}>{intro}</p> : null}

      {hasQris ? (
        <div className="tabs" style={{ marginBottom: 10 }}>
          <button type="button" className={`tab ${active === "bsi" ? "on" : ""}`} onClick={() => onChange("bsi")}>
            Transfer BSI
          </button>
          <button type="button" className={`tab ${active === "qris" ? "on" : ""}`} onClick={() => onChange("qris")}>
            QRIS
          </button>
        </div>
      ) : null}

      {active === "bsi" ? (
        <div className="note warn">
          <b>Transfer manual ke rekening BSI SAMAQU:</b>
          <div style={{ marginTop: 6, fontWeight: 700 }}>{settings.bsi_bank_name}</div>
          <div style={{ fontWeight: 700 }}>{settings.bsi_account_number || "(belum diatur admin)"}</div>
          {settings.bsi_account_holder ? <div>a.n. {settings.bsi_account_holder}</div> : null}
          {settings.bsi_account_number ? (
            <button className="btn ghost sm" type="button" style={{ marginTop: 8 }} onClick={copyAccount}>
              <Copy size={13} /> {copied ? "Tersalin" : "Salin rekening"}
            </button>
          ) : null}
          <div style={{ marginTop: 8, fontSize: 12 }}>Transfer sesuai jumlah, lalu upload bukti pembayaran.</div>
        </div>
      ) : (
        <div className="note warn">
          <b>{settings.bsi_bank_name} — QRIS</b>
          <div style={{ marginTop: 8, textAlign: "center" }}>
            <button
              type="button"
              onClick={() => setZoom(true)}
              style={{ border: 0, background: "none", padding: 0, cursor: "zoom-in", width: "100%" }}
              aria-label="Perbesar QRIS"
            >
              <img
                src={settings.qris_image_url || ""}
                alt="QRIS pembayaran SAMAQU"
                style={{ width: "100%", maxWidth: 260, borderRadius: 12, margin: "0 auto", display: "block" }}
              />
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 12 }}>
            Scan QRIS ini, bayar sesuai jumlah, lalu upload bukti pembayaran.
          </div>
          <div className="row" style={{ marginTop: 8, gap: 8 }}>
            <button className="btn ghost sm" type="button" onClick={() => setZoom(true)}>
              <Maximize2 size={13} /> Perbesar
            </button>
            <a
              className="btn ghost sm"
              href={settings.qris_image_url || "#"}
              target="_blank"
              rel="noreferrer"
              download
            >
              <Download size={13} /> Unduh
            </a>
          </div>
        </div>
      )}

      {zoom && settings.qris_image_url ? (
        <Modal title="QRIS SAMAQU" onClose={() => setZoom(false)} width={640}>
          <img
            src={settings.qris_image_url}
            alt="QRIS pembayaran SAMAQU"
            style={{ width: "100%", borderRadius: 12 }}
          />
          <p className="hint" style={{ marginTop: 10 }}>
            Scan QRIS ini, bayar sesuai jumlah, lalu upload bukti pembayaran.
          </p>
          <a className="btn blk" style={{ marginTop: 10 }} href={settings.qris_image_url} target="_blank" rel="noreferrer" download>
            <Download size={15} /> Unduh gambar QRIS
          </a>
        </Modal>
      ) : null}
    </div>
  );
}

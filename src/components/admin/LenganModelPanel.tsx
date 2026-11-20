"use client";

import { useEffect, useState } from "react";

/**
 * Panel "Model Lengan" di form produk Koko.
 *
 * Produk yang sedang diedit = Lengan Panjang (pegang stok utama). Lengan Pendek adalah model
 * kedua yang stoknya ikut Lengan Panjang per warna & ukuran (lihat `src/lib/lengan-pendek.ts`).
 * Komponen ini murni tampilan: state & penyimpanan tetap milik `ProductForm`.
 */

const PANJANG = "Lengan Panjang";
const PENDEK = "Lengan Pendek";

function rupiah(digits: string): string {
  const d = digits.replace(/\D/g, "");
  return d ? d.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
}

export interface LenganModelPanelProps {
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
  /** Harga khusus Lengan Pendek (digit polos). Kosong = sama dengan Lengan Panjang. */
  price: string;
  onPriceChange: (digits: string) => void;
  /** Harga dasar produk ini (Lengan Panjang), digit polos. */
  basePrice: string;
  /** Lengan Pendek sudah aktif saat form dimuat (untuk peringatan saat dimatikan). */
  wasEnabled: boolean;
}

export default function LenganModelPanel({
  enabled,
  onEnabledChange,
  price,
  onPriceChange,
  basePrice,
  wasEnabled,
}: LenganModelPanelProps) {
  // "Harga berbeda" dipilih eksplisit; kalau data dimuat dengan harga khusus, otomatis ikut.
  const [customPrice, setCustomPrice] = useState(price !== "");
  useEffect(() => {
    if (price !== "") setCustomPrice(true);
  }, [price]);

  const base = rupiah(basePrice);
  const baseLabel = base ? `Rp ${base}` : "belum diisi";

  return (
    <div className="lm-card">
      <style>{LM_CSS}</style>

      <div className="lm-head">
        <p className="lm-title">Model Lengan</p>
        <p className="lm-sub">Atur pilihan model yang bisa dipilih customer di halaman produk ini.</p>
      </div>

      <ul className="lm-list">
        {/* Lengan Panjang — produk ini */}
        <li className="lm-row">
          <div className="lm-dot lm-dot-on" aria-hidden="true" />
          <div className="lm-main">
            <p className="lm-name">
              {PANJANG} <span className="lm-badge lm-badge-dark">Produk ini</span>
            </p>
            <p className="lm-note">Pegang stok utama. Selalu tampil di website.</p>
          </div>
          <p className="lm-price">{baseLabel}</p>
        </li>

        {/* Lengan Pendek — opsional */}
        <li className={`lm-row lm-row-opt${enabled ? " is-on" : ""}`}>
          <div className={`lm-dot${enabled ? " lm-dot-on" : ""}`} aria-hidden="true" />
          <div className="lm-main">
            <p className="lm-name">
              {PENDEK}{" "}
              <span className={`lm-badge ${enabled ? "lm-badge-green" : "lm-badge-gray"}`}>
                {enabled ? "Aktif" : "Tidak aktif"}
              </span>
            </p>
            <p className="lm-note">
              {enabled ? "Customer bisa memilih model ini." : "Nyalakan kalau produk ini juga tersedia lengan pendek."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={`Sediakan model ${PENDEK}`}
            onClick={() => onEnabledChange(!enabled)}
            className={`lm-switch${enabled ? " on" : ""}`}
          >
            <span className="lm-switch-knob" />
          </button>
        </li>
      </ul>

      {enabled && (
        <div className="lm-detail">
          <div className="lm-block">
            <p className="lm-label">Harga {PENDEK}</p>
            <div className="lm-seg" role="radiogroup" aria-label={`Harga ${PENDEK}`}>
              <button
                type="button"
                role="radio"
                aria-checked={!customPrice}
                className={`lm-seg-btn${!customPrice ? " active" : ""}`}
                onClick={() => {
                  setCustomPrice(false);
                  onPriceChange("");
                }}
              >
                Sama dengan {PANJANG}
                <span className="lm-seg-sub">{baseLabel}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={customPrice}
                className={`lm-seg-btn${customPrice ? " active" : ""}`}
                onClick={() => setCustomPrice(true)}
              >
                Harga berbeda
                <span className="lm-seg-sub">Isi sendiri</span>
              </button>
            </div>

            {customPrice && (
              <div className="lm-input-wrap">
                <span className="lm-input-prefix">Rp</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={rupiah(price)}
                  onChange={(e) => onPriceChange(e.target.value.replace(/\D/g, ""))}
                  className="lm-input"
                  placeholder="mis. 325.000"
                  aria-label={`Harga ${PENDEK} dalam rupiah`}
                />
              </div>
            )}
            {customPrice && price === "" && (
              <p className="lm-warn">Harga belum diisi, jadi harganya akan sama dengan {PANJANG}.</p>
            )}
          </div>

          <ul className="lm-facts">
            <li>
              <span className="lm-check" aria-hidden="true">✓</span>
              <span>
                <b>Stok ikut {PANJANG}</b> per warna &amp; ukuran. Tidak perlu isi stok untuk {PENDEK}.
              </span>
            </li>
            <li>
              <span className="lm-check" aria-hidden="true">✓</span>
              <span>
                <b>Foto sama</b> dengan {PANJANG}. Customer diberi catatan foto menampilkan lengan panjang.
              </span>
            </li>
            <li>
              <span className="lm-check" aria-hidden="true">✓</span>
              <span>
                <b>Nama di pesanan &amp; label</b> otomatis ditambah &ldquo;{PENDEK}&rdquo;.
              </span>
            </li>
          </ul>

          <div className="lm-preview" aria-hidden="true">
            <p className="lm-preview-label">Tampilan di halaman produk</p>
            <p className="lm-preview-title">Pilih Model</p>
            <div className="lm-preview-chips">
              <span className="lm-chip lm-chip-active">{PANJANG}</span>
              <span className="lm-chip">{PENDEK}</span>
            </div>
          </div>
        </div>
      )}

      {!enabled && wasEnabled && (
        <p className="lm-alert">
          {PENDEK} akan disembunyikan dari customer setelah disimpan. Pesanan lama tetap aman.
        </p>
      )}

      <p className="lm-foot">Perubahan baru berlaku setelah klik <b>Simpan Perubahan</b>.</p>
    </div>
  );
}

const LM_CSS = `
.lm-card{border:1px solid #e4e4e7;border-radius:1rem;background:#fff;padding:1.1rem 1.15rem;color:#18181b}
.lm-head{margin-bottom:.85rem}
.lm-title{font-size:.95rem;font-weight:700;color:#18181b}
.lm-sub{font-size:.78rem;line-height:1.45;color:#71717a;margin-top:.15rem}
.lm-list{list-style:none;margin:0;padding:0;border:1px solid #e4e4e7;border-radius:.85rem;overflow:hidden}
.lm-row{display:flex;align-items:center;gap:.8rem;padding:.8rem .95rem;background:#fff}
.lm-row + .lm-row{border-top:1px solid #e4e4e7}
.lm-row-opt{background:#fafafa}
.lm-row-opt.is-on{background:#f4faf6}
.lm-dot{width:.7rem;height:.7rem;border-radius:999px;border:2px solid #d4d4d8;flex:none}
.lm-dot-on{border-color:#16a34a;background:#16a34a}
.lm-main{flex:1;min-width:0}
.lm-name{font-size:.88rem;font-weight:600;display:flex;align-items:center;flex-wrap:wrap;gap:.4rem}
.lm-note{font-size:.76rem;color:#71717a;margin-top:.1rem;line-height:1.4}
.lm-price{font-size:.88rem;font-weight:600;white-space:nowrap;color:#18181b}
.lm-badge{font-size:.66rem;font-weight:700;border-radius:999px;padding:.12rem .5rem;letter-spacing:.01em}
.lm-badge-dark{background:#18181b;color:#fff}
.lm-badge-green{background:#dcfce7;color:#166534}
.lm-badge-gray{background:#e4e4e7;color:#52525b}
.lm-switch{position:relative;width:2.75rem;height:1.55rem;border-radius:999px;background:#d4d4d8;flex:none;transition:background .2s ease;border:0;cursor:pointer}
.lm-switch.on{background:#18181b}
.lm-switch-knob{position:absolute;top:.17rem;left:.17rem;width:1.21rem;height:1.21rem;border-radius:999px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s ease}
.lm-switch.on .lm-switch-knob{transform:translateX(1.2rem)}
.lm-detail{margin-top:1rem;display:grid;gap:1rem}
.lm-label{font-size:.8rem;font-weight:700;margin-bottom:.45rem}
.lm-seg{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}
.lm-seg-btn{display:flex;flex-direction:column;align-items:flex-start;gap:.15rem;text-align:left;border:1px solid #e4e4e7;border-radius:.75rem;background:#fff;padding:.65rem .8rem;font-size:.82rem;font-weight:600;color:#18181b;cursor:pointer;transition:border-color .15s ease,background .15s ease}
.lm-seg-btn:hover{border-color:#a1a1aa}
.lm-seg-btn.active{border-color:#18181b;background:#fafafa;box-shadow:0 0 0 1px #18181b inset}
.lm-seg-sub{font-size:.72rem;font-weight:500;color:#71717a}
.lm-input-wrap{display:flex;align-items:center;margin-top:.6rem;max-width:18rem;border:1px solid #d4d4d8;border-radius:.75rem;background:#fff;overflow:hidden}
.lm-input-wrap:focus-within{border-color:#18181b;box-shadow:0 0 0 1px #18181b inset}
.lm-input-prefix{padding:0 .75rem;font-size:.85rem;font-weight:600;color:#52525b;background:#f4f4f5;align-self:stretch;display:flex;align-items:center;border-right:1px solid #e4e4e7}
.lm-input{flex:1;min-width:0;border:0;outline:0;padding:.65rem .8rem;font-size:.9rem;background:transparent;color:#18181b}
.lm-warn{margin-top:.45rem;font-size:.75rem;color:#b45309}
.lm-facts{list-style:none;margin:0;padding:.85rem .95rem;display:grid;gap:.55rem;background:#fafafa;border:1px solid #e4e4e7;border-radius:.85rem}
.lm-facts li{display:flex;gap:.55rem;font-size:.78rem;line-height:1.45;color:#3f3f46}
.lm-check{flex:none;width:1.1rem;height:1.1rem;border-radius:999px;background:#dcfce7;color:#166534;font-size:.68rem;font-weight:800;display:flex;align-items:center;justify-content:center;margin-top:.05rem}
.lm-preview{border:1px dashed #d4d4d8;border-radius:.85rem;padding:.8rem .95rem}
.lm-preview-label{font-size:.68rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#a1a1aa}
.lm-preview-title{font-size:.8rem;font-weight:600;margin-top:.45rem}
.lm-preview-chips{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.4rem}
.lm-chip{border:1px solid #d4d4d8;border-radius:.6rem;padding:.35rem .75rem;font-size:.78rem;color:#3f3f46;background:#fff}
.lm-chip-active{background:#18181b;border-color:#18181b;color:#fff}
.lm-alert{margin-top:.85rem;font-size:.78rem;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:.75rem;padding:.6rem .8rem}
.lm-foot{margin-top:.85rem;font-size:.74rem;color:#71717a}
@media (max-width:520px){
  .lm-seg{grid-template-columns:1fr}
  .lm-row{flex-wrap:wrap}
  .lm-price{order:3;width:100%;padding-left:1.5rem}
}
`;

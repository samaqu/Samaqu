"use client";

import { useRef, useState } from "react";
import { FileImage, Loader2, X } from "lucide-react";
import { MEDIA_LIMITS, uploadToCloudinary } from "@/lib/cloudinary";
import { getResellerToken } from "@/lib/reseller/client";

/**
 * Upload bukti transfer (gambar) ke Cloudinary via mekanisme yang sudah ada
 * (`uploadToCloudinary` + scope "reseller" yang dijaga sesi reseller).
 */
export default function UploadBukti({
  value,
  onChange,
  label = "Upload bukti transfer",
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pick = async (file: File | null) => {
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Bukti harus berupa gambar (JPG, PNG, atau WebP).");
      return;
    }
    if (file.size > MEDIA_LIMITS.imageMaxBytes) {
      setError("Ukuran gambar maksimal 10MB.");
      return;
    }
    setBusy(true);
    try {
      const url = await uploadToCloudinary(file, { scope: "reseller", token: getResellerToken() });
      onChange(url);
    } catch {
      setError("Upload gagal. Coba lagi.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />
      {value ? (
        <div className="upload" style={{ cursor: "default" }}>
          <img src={value} alt="Bukti transfer" />
          <button
            type="button"
            className="btn ghost sm"
            style={{ marginTop: 10 }}
            onClick={() => onChange(null)}
          >
            <X size={14} /> Ganti bukti
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="upload"
          style={{ width: "100%" }}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 size={18} className="rs-spin-inline" /> : <FileImage size={18} />}
          <div style={{ marginTop: 6 }}>{busy ? "Mengunggah…" : label}</div>
          <div style={{ fontSize: 11, marginTop: 2 }}>JPG/PNG/WebP, maks 10MB</div>
        </button>
      )}
      {error ? (
        <p style={{ color: "var(--rs-err)", fontSize: 11.5, fontWeight: 600, marginTop: 6 }}>{error}</p>
      ) : null}
      <style>{`.rs-spin-inline{animation:rsSpin3 .8s linear infinite}@keyframes rsSpin3{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

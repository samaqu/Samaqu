"use client";

import { useRef, useState } from "react";
import { FileImage, Loader2, X } from "lucide-react";
import { MEDIA_LIMITS } from "@/lib/cloudinary";
import { uploadProofToPrivateR2 } from "@/lib/reseller/proof-upload";

/**
 * Upload bukti transfer (gambar) ke R2 private via presigned PUT.
 * `value` adalah URL tampilan (preview lokal / signed route), sedangkan
 * `onKeyChange` membawa object key yang disimpan server.
 */
export default function UploadBukti({
  value,
  onChange,
  onKeyChange,
  kind = "topup",
  label = "Upload bukti transfer",
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  onKeyChange?: (key: string | null) => void;
  kind?: "topup" | "order-payment";
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
      const key = await uploadProofToPrivateR2(file, kind);
      onChange(URL.createObjectURL(file));
      onKeyChange?.(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload gagal. Coba lagi.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const clear = () => {
    onChange(null);
    onKeyChange?.(null);
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
            onClick={clear}
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

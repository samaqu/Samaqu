"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { CopyButton, Field, Select, useModal, useToast } from "./ui";
import { affiliateFetch } from "@/lib/affiliate/client";
import { referralUrl } from "@/lib/affiliate/site";

/**
 * Formulir "Buat Tautan Affiliate" (dipakai di katalog, detail produk, dan
 * halaman Tautan). Bentuk & alurnya mengikuti mockup.
 */

interface AffiliateProduct {
  id: string;
  name: string;
  rate: number;
  series?: string | null;
}

const SOURCES = ["TikTok", "Instagram", "WhatsApp", "Facebook", "YouTube", "Lainnya"];

export default function LinkFormModal({ products, initialProductId }: {
  products: AffiliateProduct[];
  initialProductId?: string;
}) {
  const { open, close } = useModal();
  const { toast } = useToast();
  const [productId, setProductId] = useState(initialProductId || "");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ code: string; url: string } | null>(null);

  useEffect(() => {
    setProductId(initialProductId || "");
    setSource("");
    setNote("");
    setErr({});
    setCreated(null);
  }, [initialProductId]);

  const submit = async () => {
    const next: Record<string, string> = {};
    if (!productId) next.productId = "Pilih produk yang ingin dipromosikan.";
    setErr(next);
    if (Object.keys(next).length) {
      toast("Periksa kembali formulir tautan", "err");
      return;
    }

    setBusy(true);
    try {
      const res = await affiliateFetch<{ link: { code: string } }>("/api/affiliate/links", {
        method: "POST",
        body: JSON.stringify({
          productId,
          source,
          note: note.trim(),
        }),
      });
      setCreated({ code: res.link.code, url: referralUrl(res.link.code) });
      toast("Tautan affiliate berhasil dibuat");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal membuat tautan", "err");
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div className="row" style={{ marginBottom: 14 }}>
        <div className="row" style={{ marginBottom: 14, width: "100%" }}>
          <div style={{ flex: 1 }}>
            <label className="fl">Tautan Affiliate</label>
            <div className="row">
              <input className="inp" readOnly value={created.url} />
              <CopyButton value={created.url} label="Salin Tautan" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Field label="Pilih Produk" error={err.productId}>
        <Select
          value={productId}
          onChange={setProductId}
          options={[
            ["", "— Pilih produk —"],
            ...products.map(
              (p) =>
                [
                  p.id,
                  `${p.name}${p.series ? ` · ${p.series}` : ""} · ${p.rate}%`,
                ] as [string, string],
            ),
          ]}
        />
      </Field>

      <Field label="Sumber Promosi (opsional)">
        <Select
          value={source}
          onChange={setSource}
          options={[["", "— Tanpa sumber —"], ...SOURCES.map((s) => [s, s] as [string, string])]}
        />
      </Field>

      <Field label="Catatan (opsional)">
        <textarea
          className="inp"
          rows={2}
          placeholder="Catatan internal untuk kampanye ini"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        <button className="btn s" onClick={close} type="button">
          Batal
        </button>
        <button className="btn p" onClick={submit} disabled={busy} type="button">
          <Icon name="link" className="sm" />
          {busy ? "Menyimpan…" : "Buat Tautan"}
        </button>
      </div>
    </div>
  );
}

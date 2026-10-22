"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/affiliate/icons";
import {
  CopyButton,
  Empty,
  Pager,
  Search,
  Select,
  Table,
  paginate,
  useModal,
  useToast,
} from "@/components/affiliate/ui";
import LinkFormModal from "@/components/affiliate/LinkFormModal";
import { affiliateFetch } from "@/lib/affiliate/client";
import { referralUrl } from "@/lib/affiliate/site";
import { num, tgl } from "@/lib/affiliate/format";

/**
 * Tautan Affiliate — daftar tautan referral + formulir pembuatan tautan.
 * Struktur mengikuti mockup (form di kiri, daftar di kanan).
 */

interface AffiliateLink {
  id: string;
  code: string;
  product_id: string | null;
  product_name: string | null;
  product_image: string | null;
  campaign: string;
  source: string | null;
  note: string | null;
  is_active: boolean;
  click_count: number;
  orders: number;
  url: string;
  created_at: string;
}

interface CatalogProduct {
  id: string;
  name: string;
  rate: number;
  series?: string | null;
  kain?: string | null;
}

export default function AffiliateLinksPage() {
  const [links, setLinks] = useState<AffiliateLink[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [src, setSrc] = useState("");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  const { open } = useModal();
  const { toast } = useToast();

  const load = async () => {
    try {
      const [linkJson, productJson] = await Promise.all([
        affiliateFetch<{ links: AffiliateLink[] }>("/api/affiliate/links"),
        affiliateFetch<{ products: CatalogProduct[] }>("/api/affiliate/products"),
      ]);
      setLinks(linkJson.links || []);
      setProducts((productJson.products || []).map((p) => ({ id: p.id, name: p.name, rate: p.rate })));
    } catch (e) {
      console.error("[AFFILIATE] Gagal memuat tautan:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    const cutoff = date ? new Date(Date.now() - Number(date) * 24 * 60 * 60 * 1000) : null;
    return links.filter((l) => {
      if (q && !`${l.campaign} ${l.product_name || ""} ${l.code}`.toLowerCase().includes(q.toLowerCase())) {
        return false;
      }
      if (src && l.source !== src) return false;
      if (cutoff && new Date(l.created_at) < cutoff) return false;
      return true;
    });
  }, [links, q, src, date]);

  const pg = paginate(rows, page, 8);

  const openForm = () => {
    open({
      title: "Buat Tautan Affiliate",
      body: <LinkFormModal products={products} />,
    });
  };

  const remove = async (link: AffiliateLink) => {
    if (!window.confirm(`Tautan "${link.campaign}" akan dinonaktifkan. Pesanan dan komisi tetap tersimpan.`)) {
      return;
    }
    try {
      await affiliateFetch(`/api/affiliate/links?id=${encodeURIComponent(link.id)}`, { method: "DELETE" });
      toast("Tautan berhasil dinonaktifkan");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal menghapus tautan", "err");
    }
  };

  const absolute = (link: AffiliateLink) => referralUrl(link.code);

  return (
    <div className="split" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,2fr)" }}>
      <div className="card">
        <div className="ch">
          <div>
            <h3>Buat Tautan Baru</h3>
            <p>Tautan dipakai untuk melacak klik & pesanan.</p>
          </div>
        </div>
        <div className="cp">
          <LinkFormInline products={products} onCreated={load} />
        </div>
      </div>

      <div className="card">
        <div className="ch">
          <div>
            <h3>Daftar Tautan</h3>
            <p>{loading ? "Memuat tautan…" : `${links.length} tautan`}</p>
          </div>
          <button className="btn p sm" onClick={openForm} type="button">
            <Icon name="link" className="sm" />
            Buat Tautan
          </button>
        </div>

        <div className="filters">
          <Search
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Cari kampanye, produk, kode…"
          />
          <Select
            value={src}
            onChange={(v) => {
              setSrc(v);
              setPage(1);
            }}
            options={[
              ["", "Semua Sumber"],
              ["TikTok", "TikTok"],
              ["Instagram", "Instagram"],
              ["WhatsApp", "WhatsApp"],
              ["Facebook", "Facebook"],
              ["YouTube", "YouTube"],
              ["Lainnya", "Lainnya"],
            ]}
          />
          <Select
            value={date}
            onChange={(v) => {
              setDate(v);
              setPage(1);
            }}
            options={[
              ["", "Semua Tanggal"],
              ["7", "Dibuat 7 hari terakhir"],
              ["30", "Dibuat 30 hari terakhir"],
              ["90", "Dibuat 90 hari terakhir"],
            ]}
          />
        </div>

        {pg.total === 0 ? (
          <Empty icon="link" title="Tautan tidak ditemukan" text="Belum ada tautan untuk filter ini." />
        ) : (
          <>
            <Table
              columns={[
                {
                  label: "Produk",
                  render: (l) => <div className="b dark">{l.product_name || l.campaign}</div>,
                },
                {
                  label: "Tautan Affiliate",
                  render: (l) => (
                    <div className="row" style={{ gap: 6 }}>
                      <code className="small" style={{ color: "var(--af-pri)" }}>
                        {referralUrl(l.code).replace(/^https?:\/\//, "")}
                      </code>
                      <CopyButton value={absolute(l)} label="" />
                    </div>
                  ),
                },
                {
                  label: "Sumber",
                  render: (l) => <span className="badge b-gray">{l.source || "-"}</span>,
                },
                { label: "Dibuat", render: (l) => tgl(l.created_at) },
                { label: "Klik", num: true, render: (l) => num(l.click_count) },
                { label: "Pesanan", num: true, render: (l) => num(l.orders) },
                {
                  label: "Aksi",
                  render: (l) => (
                    <div className="row" style={{ gap: 4 }}>
                      <button
                        className="btn s sm"
                        style={{ color: "var(--af-err)" }}
                        onClick={() => remove(l)}
                        title="Hapus"
                        type="button"
                      >
                        <Icon name="trash" className="sm" />
                      </button>
                    </div>
                  ),
                },
              ]}
              rows={pg.rows}
            />
            <Pager page={pg.page} pages={pg.pages} total={pg.total} size={pg.size} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}

/** Formulir ringkas di kolom kiri (mockup: "Buat Tautan Baru"). */
function LinkFormInline({
  products,
  onCreated,
}: {
  products: CatalogProduct[];
  onCreated: () => Promise<void>;
}) {
  const [productId, setProductId] = useState("");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [lastUrl, setLastUrl] = useState("");
  const { toast } = useToast();

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
        body: JSON.stringify({ productId, source, note: note.trim() }),
      });
      setLastUrl(referralUrl(res.link.code));
      setSource("");
      setNote("");
      toast("Tautan affiliate berhasil dibuat");
      await onCreated();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal membuat tautan", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="fg">
        <label className="fl">Pilih Produk</label>
        <select
          className={`sel ${err.productId ? "e" : ""}`}
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          <option value="">— Pilih produk —</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.series ? ` · ${p.series}` : ""}
              {p.kain ? ` · ${p.kain}` : ""} · {p.rate}%
            </option>
          ))}
        </select>
        {err.productId ? <div className="fe">{err.productId}</div> : null}
      </div>

      <div className="fg">
        <label className="fl">Sumber Promosi (opsional)</label>
        <select className="sel" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">— Tanpa sumber —</option>
          {["TikTok", "Instagram", "WhatsApp", "Facebook", "YouTube", "Lainnya"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="fg">
        <label className="fl">Catatan (opsional)</label>
        <textarea
          className="inp"
          rows={2}
          placeholder="Catatan internal untuk kampanye ini"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <button className="btn p w" onClick={submit} disabled={busy} type="button">
        <Icon name="link" className="sm" />
        {busy ? "Menyimpan…" : "Buat Tautan"}
      </button>

      {lastUrl ? (
        <div className="box mt">
          <div className="small muted b">Tautan terakhir dibuat</div>
          <div className="row mt" style={{ marginTop: 8 }}>
            <input className="inp" readOnly value={lastUrl} />
            <CopyButton value={lastUrl} label="Salin" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/affiliate/icons";
import { Empty, Search, useModal } from "@/components/affiliate/ui";
import { affiliateFetch } from "@/lib/affiliate/client";
import { money, tgl } from "@/lib/affiliate/format";

/**
 * Materi Promosi — foto/video produk resmi SAMAQU (dari katalog asli).
 * Struktur mengikuti mockup.
 */

interface Material {
  id: string;
  name: string;
  category: string;
  price: number;
  rate: number;
  image: string | null;
  video: string | null;
  downloadable: boolean;
}

const CATS = ["Foto Produk", "Video Produk", "Logo dan Identitas Merek", "Panduan Konten"];

export default function AffiliateMaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const { open, close } = useModal();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const json = await affiliateFetch<{ materials: Material[] }>("/api/affiliate/materi");
        if (alive) setMaterials(json.materials || []);
      } catch (e) {
        console.error("[AFFILIATE] Gagal memuat materi:", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const list = useMemo(
    () =>
      materials.filter((m) => {
        if (q && !`${m.name} ${m.category}`.toLowerCase().includes(q.toLowerCase())) return false;
        if (cat && m.category !== cat) return false;
        return true;
      }),
    [materials, q, cat],
  );

  const categoryOf = (m: Material) => (m.video ? "Video Produk" : "Foto Produk");

  const showMaterial = (m: Material) => {
    open({
      size: "lg",
      title: m.name,
      body: (
        <div>
          <div
            style={{
              position: "relative",
              aspectRatio: "16/10",
              borderRadius: 12,
              overflow: "hidden",
              background: "#F3F4F6",
            }}
          >
            {m.image ? (
              <img
                src={m.image}
                alt={m.name}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : null}
            {m.video ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: "rgba(17,24,39,.6)",
                    color: "#fff",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Icon name="video" />
                </div>
              </div>
            ) : null}
          </div>
          <div className="kv mt">
            <dt>Kategori</dt>
            <dd>{categoryOf(m)}</dd>
            <dt>Harga produk</dt>
            <dd>{money(m.price)}</dd>
            <dt>Komisi</dt>
            <dd>{m.rate}%</dd>
          </div>
          {m.video ? (
            <div className="note i mt">
              <Icon name="info" className="sm" />
              <span>Pratinjau video menampilkan cuplikan gambar. Berkas video tersedia di katalog produk.</span>
            </div>
          ) : null}
        </div>
      ),
      foot: (
        <>
          {m.image ? (
            <a className="btn s" href={m.image} download={`${m.name}.png`}>
              <Icon name="download" className="sm" />
              Unduh
            </a>
          ) : null}
          <button className="btn p" onClick={close} type="button">
            Tutup
          </button>
        </>
      ),
    });
  };

  return (
    <div>
      <div className="card">
        <div className="filters">
          <Search value={q} onChange={setQ} placeholder="Cari materi…" />
          <div className="row wrap" style={{ gap: 6 }}>
            <button className={`chip ${!cat ? "on" : ""}`} onClick={() => setCat("")} type="button">
              Semua
            </button>
            {CATS.map((c) => (
              <button
                key={c}
                className={`chip ${cat === c ? "on" : ""}`}
                onClick={() => setCat(c)}
                type="button"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card mt p-10 text-center muted">Memuat materi…</div>
      ) : list.length === 0 ? (
        <div className="card mt">
          <Empty icon="image" title="Materi tidak ditemukan" text="Coba kata kunci atau kategori lain." />
        </div>
      ) : (
        <div className="grid g3 mt">
          {list.map((m) => (
            <div className="card pc" key={m.id}>
              <div className="im" style={{ aspectRatio: "4/3" }} onClick={() => showMaterial(m)}>
                {m.image ? (
                  <img src={m.image} alt={m.name} loading="lazy" />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "grid",
                      placeItems: "center",
                      background: "#F3F4F6",
                      color: "var(--af-pri)",
                    }}
                  >
                    <Icon name="file" className="lg" />
                  </div>
                )}
                {m.video ? (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        background: "rgba(17,24,39,.6)",
                        color: "#fff",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      <Icon name="video" />
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="bd">
                <div className="row between">
                  <span className="badge b-pri">{categoryOf(m)}</span>
                  <span className="small muted">{tgl(new Date())}</span>
                </div>
                <div className="nm" style={{ minHeight: 0 }}>
                  {m.name}
                </div>
                <p className="small muted">Komisi {m.rate}% · {money(m.price)}</p>
                <div className="row" style={{ marginTop: "auto", paddingTop: 8 }}>
                  <button className="btn s sm" style={{ flex: 1 }} onClick={() => showMaterial(m)} type="button">
                    <Icon name="eye" className="sm" />
                    Lihat
                  </button>
                  {m.image ? (
                    <a className="btn p sm" style={{ flex: 1 }} href={m.image} download={`${m.name}.png`}>
                      <Icon name="download" className="sm" />
                      Unduh
                    </a>
                  ) : (
                    <span className="small muted" style={{ flex: 1, textAlign: "center" }}>
                      Berkas belum tersedia
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

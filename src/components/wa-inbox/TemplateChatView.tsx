"use client";

/**
 * Halaman "Template Chat" (menu Tim & Chat), mengikuti pola Script Library di Academy: kategori di panel kiri,
 * kartu 2 kolom dengan isi dipotong 3 baris (tanpa scrollbar), klik kartu membuka detail lengkap di modal,
 * tombol Salin di tiap kartu (Ubah hanya untuk Owner/Leader).
 * SEMUA warna memakai variabel tema panel (--pink, --pink-d, --plum, --line, --card-line, --mut, --green/--orange/--purple
 * beserta -bg), jadi otomatis mengikuti tema Berry, Bunga Matahari, dan Tropical Beach.
 * Placeholder ({nama}, {admin}) tidak diisi di sini karena tidak ada pelanggan terpilih.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import WaTemplatesManager from "./WaTemplatesManager";
import type { WaTemplate } from "@/lib/wa-template";
import { loadTemplates } from "@/lib/wa-templates-client";

/** Pasangan warna per kategori: semuanya variabel tema, bukan warna tetap. */
const TONES = [
  { fg: "var(--green)", bg: "var(--green-bg)" },
  { fg: "var(--purple)", bg: "var(--purple-bg)" },
  { fg: "var(--orange)", bg: "var(--orange-bg)" },
  { fg: "var(--pink-d)", bg: "var(--pink-bg)" },
] as const;

const KNOWN_TONE: Record<string, number> = { "Cara Order": 0, "Create Your Price": 1, Kain: 2, Order: 3, Pembayaran: 0, Produk: 1 };

/** "Cara order (versi 2)" / "… (variasi 3)" → 2 / 3; selain itu null. */
function versionOf(title: string): number | null {
  const m = title.match(/\((?:versi|variasi)\s*(\d+)\)\s*$/i);
  return m ? Number(m[1]) : null;
}

const icon = (path: string, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);
const ICON_COPY = "M9 9h10v10H9zM5 15V5h10";
const ICON_EDIT = "M4 20h4L19 9l-4-4L4 16zM14 6l4 4";
const ICON_SEARCH = "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM21 21l-4.3-4.3";
const ICON_PLUS = "M12 5v14M5 12h14";
const ICON_CHECK = "M5 12l5 5L20 7";

/** Gaya yang butuh media query / hover / line-clamp (tidak bisa lewat style inline). Semua warna tetap variabel tema. */
const CSS = `
.tc-body{display:grid;grid-template-columns:210px minmax(0,1fr);gap:22px;align-items:start}
.tc-cats{display:grid;gap:2px;position:sticky;top:12px}
.tc-cat{display:flex;justify-content:space-between;align-items:center;gap:8px;border:1px solid transparent;background:transparent;color:var(--plum);font:inherit;font-size:14px;font-weight:600;padding:9px 12px;border-radius:12px;cursor:pointer;text-align:left}
.tc-cat span{color:var(--mut);font-weight:600;font-size:13px}
.tc-cat:hover{background:rgba(255,255,255,.55)}
.tc-cat.on{background:#fff;border-color:var(--card-line);font-weight:800;box-shadow:0 2px 8px rgba(0,0,0,.05)}
.tc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.tc-card{background:#fff;border:1px solid var(--card-line);border-radius:18px;padding:16px 18px;display:grid;gap:10px;align-content:start;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.04);transition:box-shadow .15s,transform .15s}
.tc-card:hover{box-shadow:0 10px 24px rgba(0,0,0,.08);transform:translateY(-1px)}
.tc-card:focus-visible{outline:2px solid var(--pink-d);outline-offset:2px}
.tc-clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.tc-btn{border:1px solid var(--card-line);background:#fff;color:var(--plum);border-radius:10px;height:34px;padding:0 12px;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.tc-btn:hover{background:var(--pink-bg)}
.tc-btn.ok{color:var(--green);border-color:var(--green)}
.tc-btn.solid{background:var(--plum);color:#fff;border-color:var(--plum)}
.tc-btn.solid:hover{opacity:.92;background:var(--plum)}
@media (max-width:900px){
  .tc-body{grid-template-columns:minmax(0,1fr);gap:12px}
  .tc-cats{display:flex;overflow-x:auto;position:static;gap:6px;padding-bottom:4px}
  .tc-cat{white-space:nowrap;flex:0 0 auto;gap:6px}
  .tc-cats-label{display:none}
}
@media (max-width:760px){.tc-grid{grid-template-columns:minmax(0,1fr)}}
`;

export default function TemplateChatView() {
  const [items, setItems] = useState<WaTemplate[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Semua");
  const [manage, setManage] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<WaTemplate | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await loadTemplates();
      setItems(res.items);
      setCanManage(res.canManage);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat template.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Esc menutup detail.
  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetail(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of items || []) counts.set(t.category, (counts.get(t.category) || 0) + 1);
    return [...counts.entries()];
  }, [items]);

  const toneOf = useCallback(
    (name: string) => {
      const known = KNOWN_TONE[name];
      if (known !== undefined) return TONES[known];
      const index = categories.findIndex(([c]) => c === name);
      return TONES[(index < 0 ? 0 : index) % TONES.length];
    },
    [categories],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items || []).filter(
      (t) => (category === "Semua" || t.category === category) && (!q || t.title.toLowerCase().includes(q) || t.content.toLowerCase().includes(q)),
    );
  }, [items, search, category]);

  async function copy(t: WaTemplate) {
    try {
      await navigator.clipboard.writeText(t.content);
      setCopiedId(t.id);
      setTimeout(() => setCopiedId((id) => (id === t.id ? null : id)), 1800);
    } catch {
      setError("Gagal menyalin. Buka detailnya lalu blok teksnya untuk disalin manual.");
    }
  }

  const openManager = (id: number | null) => {
    setDetail(null);
    setEditId(id);
    setManage(true);
  };

  const catList: [string, number][] = [["Semua", items?.length ?? 0], ...categories];

  return (
    <div style={{ display: "grid", gap: 16, fontFamily: "var(--font)", color: "var(--plum)" }}>
      <style>{CSS}</style>

      {/* judul + aksi */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 4, maxWidth: 560 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, lineHeight: 1.15, color: "var(--plum)" }}>Template Chat</h1>
          <p style={{ margin: 0, fontSize: 14, color: "var(--mut)" }}>
            Balasan siap pakai. Sesuaikan dengan percakapan; {"{nama}"} terisi otomatis saat dipakai di Inbox WA.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid var(--card-line)", borderRadius: 12, padding: "0 12px", height: 40, color: "var(--mut)", width: 280, maxWidth: "100%" }}>
            {icon(ICON_SEARCH, 16)}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari judul atau isi template…"
              aria-label="Cari template"
              style={{ border: 0, outline: "none", background: "transparent", flex: 1, fontSize: 14, color: "var(--plum)", fontFamily: "inherit", minWidth: 0 }}
            />
          </label>
          {canManage ? (
            <button type="button" className="tc-btn solid" style={{ height: 40, padding: "0 16px", borderRadius: 12 }} onClick={() => openManager(null)}>
              {icon(ICON_PLUS, 16)}
              Kelola
            </button>
          ) : null}
        </div>
      </header>

      {error ? <div style={{ background: "var(--pink-bg)", color: "var(--pink-d)", borderRadius: 12, padding: "9px 14px", fontSize: 13.5, fontWeight: 700 }}>{error}</div> : null}

      <div className="tc-body">
        {/* kategori */}
        <nav className="tc-cats" aria-label="Kategori template">
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.2, color: "var(--mut)", padding: "0 12px 6px" }} className="tc-cats-label">
            KATEGORI
          </div>
          {catList.map(([name, count]) => (
            <button key={name} type="button" className={`tc-cat${category === name ? " on" : ""}`} onClick={() => setCategory(name)}>
              {name === "Semua" ? "Semua kategori" : name}
              <span>{count}</span>
            </button>
          ))}
        </nav>

        {/* kartu */}
        <div>
          {items === null && !error ? (
            <p style={{ color: "var(--mut)", fontSize: 14 }}>Memuat…</p>
          ) : visible.length === 0 ? (
            <div style={{ border: "1px dashed var(--line)", borderRadius: 16, padding: 18, color: "var(--mut)", fontSize: 14, background: "#fff" }}>
              {items && items.length === 0 ? "Belum ada template." : "Tidak ada template yang cocok."}
            </div>
          ) : (
            <div className="tc-grid">
              {visible.map((t) => {
                const tone = toneOf(t.category);
                const version = versionOf(t.title);
                const copied = copiedId === t.id;
                return (
                  <article
                    key={t.id}
                    className="tc-card"
                    role="button"
                    tabIndex={0}
                    aria-label={`Buka template ${t.title}`}
                    onClick={() => setDetail(t)}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        setDetail(t);
                      }
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ background: tone.bg, color: tone.fg, borderRadius: 999, padding: "3px 11px", fontSize: 12.5, fontWeight: 800 }}>{t.category}</span>
                      {version ? <span style={{ fontSize: 12.5, color: "var(--mut)", fontWeight: 600 }}>Versi {version}</span> : null}
                    </div>
                    <h3 style={{ margin: 0, fontSize: 16, lineHeight: 1.3, fontWeight: 800, color: "var(--plum)" }}>{t.title}</h3>
                    {/* Pemotongan 3 baris di elemen dalam (tanpa padding), supaya baris ke-4 tidak mengintip di area padding. */}
                    <div style={{ background: tone.bg, borderRadius: 12, padding: "11px 14px", fontSize: 14, lineHeight: 1.55, color: "var(--plum)" }}>
                      <div className="tc-clamp">{t.content}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                      <button type="button" className={`tc-btn${copied ? " ok" : ""}`} onClick={() => void copy(t)}>
                        {icon(copied ? ICON_CHECK : ICON_COPY, 15)}
                        {copied ? "Tersalin" : "Salin"}
                      </button>
                      {canManage ? (
                        <button type="button" className="tc-btn" onClick={() => openManager(t.id)} aria-label={`Ubah template ${t.title}`}>
                          {icon(ICON_EDIT, 15)}
                          Ubah
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* detail lengkap */}
      {detail ? (
        <div role="presentation" onClick={() => setDetail(null)} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(15,23,42,0.45)", display: "grid", placeItems: "center", padding: 16 }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={detail.title}
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 640, maxHeight: "86vh", overflow: "auto", background: "#fff", borderRadius: 22, padding: 22, display: "grid", gap: 14, boxShadow: "0 24px 60px rgba(15,23,42,0.28)", color: "var(--plum)", fontFamily: "var(--font)" }}
          >
            {(() => {
              const tone = toneOf(detail.category);
              const version = versionOf(detail.title);
              const copied = copiedId === detail.id;
              return (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ background: tone.bg, color: tone.fg, borderRadius: 999, padding: "3px 12px", fontSize: 13, fontWeight: 800 }}>{detail.category}</span>
                    {version ? <span style={{ fontSize: 13, color: "var(--mut)", fontWeight: 600 }}>Versi {version}</span> : null}
                  </div>
                  <h2 style={{ margin: 0, fontSize: 20, lineHeight: 1.3, fontWeight: 800 }}>{detail.title}</h2>
                  <div style={{ background: tone.bg, borderRadius: 14, padding: "14px 16px", fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{detail.content}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button type="button" className="tc-btn" onClick={() => setDetail(null)}>
                      Tutup
                    </button>
                    {canManage ? (
                      <button type="button" className="tc-btn" onClick={() => openManager(detail.id)}>
                        {icon(ICON_EDIT, 15)}
                        Ubah
                      </button>
                    ) : null}
                    <button type="button" className={`tc-btn solid${copied ? " ok" : ""}`} onClick={() => void copy(detail)} style={copied ? { background: "var(--green)", borderColor: "var(--green)", color: "#fff" } : undefined}>
                      {icon(copied ? ICON_CHECK : ICON_COPY, 15)}
                      {copied ? "Tersalin" : "Salin teks"}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      <WaTemplatesManager
        open={manage}
        initialEditId={editId}
        onClose={() => {
          setManage(false);
          setEditId(null);
        }}
        onChanged={() => void refresh()}
      />
    </div>
  );
}

"use client";

/**
 * Halaman "Template Chat" (menu Tim & Chat): banner dengan ringkasan, pencarian, chip kategori, dan kartu template
 * (Salin teks; pensil untuk Owner/Leader). SEMUA warna memakai variabel tema panel (--pink, --pink-d, --plum, --line,
 * --green/--orange/--purple beserta -bg), jadi otomatis mengikuti tema Berry, Bunga Matahari, dan Tropical Beach.
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

export default function TemplateChatView() {
  const [items, setItems] = useState<WaTemplate[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Semua");
  const [manage, setManage] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

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
      setError("Gagal menyalin. Blok teksnya lalu salin manual.");
    }
  }

  const openManager = (id: number | null) => {
    setEditId(id);
    setManage(true);
  };

  return (
    <div style={{ display: "grid", gap: 16, fontFamily: "var(--font)", color: "var(--plum)" }}>
      {/* banner */}
      <section
        style={{
          borderRadius: 24,
          padding: "26px 30px",
          color: "#fff",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
          backgroundImage: "radial-gradient(circle at 88% 12%, rgba(255,255,255,0.24), transparent 42%), linear-gradient(120deg, var(--pink-d) 0%, var(--pink) 100%)",
          boxShadow: "0 14px 34px rgba(0,0,0,0.10)",
        }}
      >
        <div style={{ display: "grid", gap: 6, maxWidth: 560 }}>
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.6, opacity: 0.85 }}>TIM &amp; CHAT</span>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, lineHeight: 1.1, color: "#fff" }}>Template Chat</h1>
          <p style={{ margin: 0, fontSize: 14.5, opacity: 0.92 }}>Balasan siap pakai. {"{nama}"} terisi otomatis saat dipakai di Inbox WA.</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "stretch", flexWrap: "wrap" }}>
          {[
            { n: items?.length ?? 0, l: "Template" },
            { n: categories.length, l: "Kategori" },
          ].map((s) => (
            <div key={s.l} style={{ minWidth: 112, padding: "14px 18px", borderRadius: 18, background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.30)", display: "grid", gap: 2 }}>
              <b style={{ fontSize: 30, lineHeight: 1 }}>{s.n}</b>
              <span style={{ fontSize: 13, opacity: 0.9 }}>{s.l}</span>
            </div>
          ))}
          {canManage ? (
            <button
              type="button"
              onClick={() => openManager(null)}
              style={{ border: 0, background: "#fff", color: "var(--pink-d)", borderRadius: 18, padding: "0 26px", minHeight: 62, fontSize: 15, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              {icon(ICON_PLUS, 18)}
              Kelola
            </button>
          ) : null}
        </div>
      </section>

      {/* pencarian + kategori */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ flex: "1 1 280px", maxWidth: 440, display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid var(--card-line)", borderRadius: 16, padding: "0 16px", height: 52, color: "var(--mut)" }}>
          {icon(ICON_SEARCH, 18)}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari judul atau isi template…"
            aria-label="Cari template"
            style={{ border: 0, outline: "none", background: "transparent", flex: 1, fontSize: 14.5, color: "var(--plum)", fontFamily: "inherit" }}
          />
        </label>
        <div style={{ flex: "1 1 360px", display: "flex", gap: 6, flexWrap: "wrap", background: "#fff", border: "1px solid var(--card-line)", borderRadius: 16, padding: 6 }}>
          {[["Semua", items?.length ?? 0] as [string, number], ...categories].map(([name, count]) => {
            const active = category === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setCategory(name)}
                style={{ border: 0, cursor: "pointer", borderRadius: 12, padding: "9px 16px", fontSize: 14, fontWeight: 700, fontFamily: "inherit", background: active ? "var(--plum)" : "transparent", color: active ? "#fff" : "var(--plum)" }}
              >
                {name} <span style={{ opacity: active ? 0.85 : 0.6, fontWeight: 600 }}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error ? <div style={{ background: "var(--pink-bg)", color: "var(--pink-d)", borderRadius: 14, padding: "10px 14px", fontSize: 13.5, fontWeight: 700 }}>{error}</div> : null}

      {items === null && !error ? (
        <p style={{ color: "var(--mut)", fontSize: 14 }}>Memuat…</p>
      ) : visible.length === 0 ? (
        <div style={{ border: "1px dashed var(--line)", borderRadius: 18, padding: 22, color: "var(--mut)", fontSize: 14, background: "#fff" }}>
          {items && items.length === 0 ? "Belum ada template." : "Tidak ada template yang cocok."}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {visible.map((t) => {
            const tone = toneOf(t.category);
            const version = versionOf(t.title);
            const copied = copiedId === t.id;
            return (
              <article key={t.id} style={{ background: "#fff", border: "1px solid var(--card-line)", borderRadius: 22, padding: 18, display: "grid", gap: 12, alignContent: "start", boxShadow: "0 6px 18px rgba(0,0,0,0.04)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ background: tone.bg, color: tone.fg, borderRadius: 999, padding: "6px 14px", fontSize: 13, fontWeight: 800 }}>{t.category}</span>
                  {version ? <span style={{ fontSize: 13, color: "var(--mut)", fontWeight: 600 }}>Versi {version}</span> : null}
                </div>
                <h3 style={{ margin: 0, fontSize: 18, lineHeight: 1.3, fontWeight: 700, color: "var(--plum)" }}>{t.title}</h3>
                <div style={{ background: tone.bg, borderRadius: 16, padding: "14px 16px", fontSize: 14.5, lineHeight: 1.6, color: "var(--plum)", whiteSpace: "pre-wrap", maxHeight: 300, overflowY: "auto" }}>{t.content}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => void copy(t)}
                    style={{ flex: 1, border: 0, cursor: "pointer", borderRadius: 14, height: 46, background: copied ? "var(--green)" : "var(--plum)", color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                  >
                    {icon(copied ? ICON_CHECK : ICON_COPY, 17)}
                    {copied ? "Tersalin" : "Salin teks"}
                  </button>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => openManager(t.id)}
                      title="Ubah template"
                      aria-label={`Ubah template ${t.title}`}
                      style={{ width: 46, height: 46, border: "1px solid var(--card-line)", cursor: "pointer", borderRadius: 14, background: "var(--pink-bg)", color: "var(--pink-d)", display: "grid", placeItems: "center" }}
                    >
                      {icon(ICON_EDIT, 18)}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

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

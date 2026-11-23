"use client";

/**
 * Halaman "Template Chat" (menu Tim & Chat): semua template balasan, dengan pencarian, chip kategori, dan tombol Salin.
 * Semua admin boleh melihat dan menyalin; Owner dan Leader mengelola lewat tombol "Kelola" (pengelola yang sama dengan
 * tombol Template di kolom balasan Inbox). Placeholder ({nama}, {admin}) tidak diisi di sini karena tidak ada pelanggan terpilih.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import WaTemplatesManager from "./WaTemplatesManager";
import type { WaTemplate } from "@/lib/wa-template";
import { loadTemplates } from "@/lib/wa-templates-client";

const INK = "#1f2937";
const SUB = "#6b7280";
const LINE = "#e5e7eb";

export default function TemplateChatView() {
  const [items, setItems] = useState<WaTemplate[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Semua");
  const [manage, setManage] = useState(false);
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

  const chip = (active: boolean): React.CSSProperties => ({
    border: `1px solid ${active ? INK : LINE}`,
    background: active ? INK : "#fff",
    color: active ? "#fff" : INK,
    borderRadius: 999,
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  });

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: INK }}>Template Chat</h1>
          <p style={{ margin: "2px 0 0", fontSize: 12.5, color: SUB }}>
            Balasan siap pakai untuk chat pelanggan. Di Inbox WA, tombol Template di kolom balasan memasukkan isinya langsung dan mengisi {"{nama}"} otomatis.
          </p>
        </div>
        {canManage ? (
          <button type="button" onClick={() => setManage(true)} style={{ border: 0, background: "#16a34a", color: "#fff", borderRadius: 999, padding: "9px 18px", fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}>
            Kelola template
          </button>
        ) : null}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Cari judul atau isi template…"
        aria-label="Cari template"
        style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: "10px 14px", fontSize: 14, outline: "none", background: "#fff", maxWidth: 520, width: "100%", boxSizing: "border-box" }}
      />

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" style={chip(category === "Semua")} onClick={() => setCategory("Semua")}>
          Semua {items?.length ?? 0}
        </button>
        {categories.map(([name, count]) => (
          <button key={name} type="button" style={chip(category === name)} onClick={() => setCategory(name)}>
            {name} {count}
          </button>
        ))}
      </div>

      {error ? <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 600 }}>{error}</div> : null}

      {items === null && !error ? (
        <p style={{ color: SUB, fontSize: 13 }}>Memuat…</p>
      ) : visible.length === 0 ? (
        <div style={{ border: `1px dashed ${LINE}`, borderRadius: 14, padding: 18, color: SUB, fontSize: 13.5, background: "#fff" }}>
          {items && items.length === 0 ? "Belum ada template." : "Tidak ada template yang cocok."}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {visible.map((t) => (
            <div key={t.id} style={{ border: `1px solid ${LINE}`, borderRadius: 16, background: "#fff", padding: 16, display: "grid", gap: 10, alignContent: "start" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ display: "grid", gap: 4 }}>
                  <span style={{ background: "#e0e7ff", color: "#3730a3", borderRadius: 999, padding: "2px 10px", fontSize: 11.5, fontWeight: 700, justifySelf: "start" }}>{t.category}</span>
                  <b style={{ fontSize: 15, color: INK }}>{t.title}</b>
                </div>
                <button
                  type="button"
                  onClick={() => void copy(t)}
                  style={{ border: `1px solid ${copiedId === t.id ? "#16a34a" : LINE}`, background: copiedId === t.id ? "#f0fdf4" : "#fff", color: copiedId === t.id ? "#166534" : INK, borderRadius: 999, padding: "6px 14px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  {copiedId === t.id ? "Tersalin" : "Salin"}
                </button>
              </div>
              <div style={{ background: "#f8fafc", borderRadius: 12, padding: "10px 12px", fontSize: 13.5, color: INK, whiteSpace: "pre-wrap", lineHeight: 1.5, maxHeight: 260, overflowY: "auto" }}>{t.content}</div>
            </div>
          ))}
        </div>
      )}

      <WaTemplatesManager open={manage} onClose={() => setManage(false)} onChanged={() => void refresh()} />
    </div>
  );
}

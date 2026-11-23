"use client";

/**
 * Pengelola template chat (Owner/Leader): tambah, ubah, nonaktifkan, hapus. Admin biasa tidak melihat tombolnya,
 * dan server menolak (403) kalau tetap mencoba. Hasil perubahan langsung muncul di daftar Template kolom balasan.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmDialog from "@/components/ops/ConfirmDialog";
import { TEMPLATE_LIMITS, type WaTemplate } from "@/lib/wa-template";
import { createTemplate, deleteTemplate, loadTemplates, updateTemplate } from "@/lib/wa-templates-client";

const INK = "#1f2937";
const SUB = "#6b7280";
const LINE = "#e5e7eb";

interface Draft {
  id: number | null;
  title: string;
  category: string;
  content: string;
}

const EMPTY: Draft = { id: null, title: "", category: "Umum", content: "" };

export default function WaTemplatesManager({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<WaTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<WaTemplate | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await loadTemplates(true);
      setItems(res.items);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat template.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setLoading(true);
      setDraft(null);
      void refresh();
    }
  }, [open, refresh]);

  const categories = useMemo(() => [...new Set(items.map((t) => t.category))].sort((a, b) => a.localeCompare(b)), [items]);

  if (!open) return null;

  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    setError("");
    try {
      const input = { title: draft.title, category: draft.category, content: draft.content };
      if (draft.id === null) await createTemplate(input);
      else await updateTemplate(draft.id, input);
      setDraft(null);
      await refresh();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(t: WaTemplate) {
    try {
      await updateTemplate(t.id, { active: !t.active });
      await refresh();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengubah status.");
    }
  }

  async function confirmRemove() {
    const target = removing;
    setRemoving(null);
    if (!target) return;
    try {
      await deleteTemplate(target.id);
      await refresh();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus.");
    }
  }

  const field: React.CSSProperties = { border: `1px solid ${LINE}`, borderRadius: 10, padding: "8px 12px", fontSize: 13.5, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
  const smallBtn: React.CSSProperties = { border: `1px solid ${LINE}`, background: "#fff", color: INK, borderRadius: 999, padding: "5px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" };

  return (
    <>
    <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(15,23,42,0.45)", display: "grid", placeItems: "center", padding: 16 }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Kelola template chat"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 760, maxHeight: "88vh", overflow: "auto", background: "#fff", borderRadius: 20, padding: 22, display: "grid", gap: 14, boxShadow: "0 24px 60px rgba(15,23,42,0.25)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <b style={{ fontSize: 18, color: INK }}>Kelola template chat</b>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: SUB }}>
              Placeholder: <code>{"{nama}"}</code> diisi nama pelanggan, <code>{"{admin}"}</code> diisi nama admin yang membalas.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={{ ...smallBtn, background: INK, color: "#fff", borderColor: INK }} onClick={() => setDraft({ ...EMPTY })}>
              + Tambah template
            </button>
            <button type="button" style={smallBtn} onClick={onClose}>
              Tutup
            </button>
          </div>
        </div>

        {error ? <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 10, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>{error}</div> : null}

        {draft ? (
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: 14, display: "grid", gap: 10, background: "#f8fafc" }}>
            <b style={{ fontSize: 14, color: INK }}>{draft.id === null ? "Template baru" : "Ubah template"}</b>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: SUB, fontWeight: 700 }}>
                Judul
                <input style={field} value={draft.title} maxLength={TEMPLATE_LIMITS.title[1]} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="mis. Cara order (versi 1)" />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: SUB, fontWeight: 700 }}>
                Kategori
                <input style={field} list="wa-tpl-categories" value={draft.category} maxLength={TEMPLATE_LIMITS.category[1]} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
                <datalist id="wa-tpl-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
            </div>
            <label style={{ display: "grid", gap: 4, fontSize: 12.5, color: SUB, fontWeight: 700 }}>
              Isi template
              <textarea style={{ ...field, minHeight: 140, resize: "vertical" }} value={draft.content} maxLength={TEMPLATE_LIMITS.content[1]} onChange={(e) => setDraft({ ...draft, content: e.target.value })} placeholder="Halo {nama}, …" />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" style={smallBtn} onClick={() => setDraft(null)} disabled={saving}>
                Batal
              </button>
              <button type="button" style={{ ...smallBtn, background: "#16a34a", color: "#fff", borderColor: "#16a34a" }} onClick={() => void save()} disabled={saving}>
                {saving ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <p style={{ color: SUB, fontSize: 13 }}>Memuat…</p>
        ) : items.length === 0 ? (
          <p style={{ color: SUB, fontSize: 13 }}>Belum ada template. Klik "Tambah template".</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {items.map((t) => (
              <div key={t.id} style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: "10px 12px", display: "grid", gap: 6, opacity: t.active ? 1 : 0.6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ background: "#e0e7ff", color: "#3730a3", borderRadius: 999, padding: "2px 9px", fontSize: 11.5, fontWeight: 700 }}>{t.category}</span>
                    <b style={{ fontSize: 14, color: INK }}>{t.title}</b>
                    {!t.active ? <span style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 999, padding: "2px 9px", fontSize: 11.5, fontWeight: 700 }}>Nonaktif</span> : null}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" style={smallBtn} onClick={() => setDraft({ id: t.id, title: t.title, category: t.category, content: t.content })}>
                      Ubah
                    </button>
                    <button type="button" style={smallBtn} onClick={() => void toggleActive(t)}>
                      {t.active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                    <button type="button" style={{ ...smallBtn, color: "#b91c1c" }} onClick={() => setRemoving(t)}>
                      Hapus
                    </button>
                  </div>
                </div>
                <span style={{ fontSize: 12.5, color: SUB, whiteSpace: "pre-wrap" }}>{t.content.length > 160 ? `${t.content.slice(0, 160)}…` : t.content}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    {/* Di luar lapisan pengelola, supaya klik di dalamnya tidak ikut menutup pengelola. */}
    <ConfirmDialog
      open={removing !== null}
      tone="danger"
      title={`Hapus template "${removing?.title ?? ""}"?`}
      message="Template ini dihapus permanen dan tidak muncul lagi di daftar admin. Pesan yang sudah pernah terkirim tidak terpengaruh."
      confirmLabel="Ya, hapus"
      onCancel={() => setRemoving(null)}
      onConfirm={() => void confirmRemove()}
    />
    </>
  );
}

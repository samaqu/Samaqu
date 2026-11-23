"use client";

/**
 * Tim Admin — struktur tim panel admin.
 *
 * Semua admin boleh MELIHAT daftar (nama, label jabatan, peran, status). Hanya owner dan penanggung jawab (leader)
 * yang melihat tombol kelola (undang, ubah label, nonaktifkan, tautan atur-password). Izin dijaga di server
 * (`/api/ops/team`); tombol di sini hanya mengikuti `canManage` / `me.grantable` dari server.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Role = "owner" | "leader" | "admin" | "admin_operasional" | "other";

interface Member {
  id: string;
  email: string;
  name: string;
  title: string;
  role: Role;
  active: boolean;
  invited: boolean;
  lastSignIn: string | null;
  isMe: boolean;
  canManage: boolean;
}

interface TeamResponse {
  items: Member[];
  me: { role: Role; canInvite: boolean; grantable: string[] };
}

const INK = "#1f2937";
const SUB = "#6b7280";
const LINE = "#e5e7eb";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  leader: "Leader",
  admin: "Admin",
  admin_operasional: "Admin Operasional",
  other: "Admin",
};
const ROLE_RANK: Record<string, number> = { owner: 0, leader: 1, admin: 2, admin_operasional: 3, other: 4 };
const AVATAR_COLORS = ["#fde68a", "#bfdbfe", "#fbcfe8", "#bbf7d0", "#ddd6fe", "#fed7aa"];
const TITLE_SUGGESTIONS = ["Penanggung Jawab", "Admin", "Admin Leads", "Admin Chat"];

async function api<T>(method: "GET" | "POST" | "PATCH", body?: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch("/api/ops/team", {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `Gagal (HTTP ${res.status})`);
  return json as T;
}

function sinceLabel(iso: string | null): string {
  if (!iso) return "Belum pernah login";
  const min = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(min)) return "";
  if (min < 2) return "Baru saja login";
  if (min < 60) return `Login ${min} menit lalu`;
  if (min < 1440) return `Login ${Math.floor(min / 60)} jam lalu`;
  return `Login ${Math.floor(min / 1440)} hari lalu`;
}

export default function TeamAdminView() {
  const [data, setData] = useState<TeamResponse | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [linkShown, setLinkShown] = useState<{ name: string; link: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<TeamResponse>("GET"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat tim.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const members = [...(data?.items || [])].sort(
    (a, b) => Number(b.active) - Number(a.active) || (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9) || a.name.localeCompare(b.name),
  );

  async function act(id: string, run: () => Promise<unknown>, okMsg: string) {
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      await run();
      setNotice(okMsg);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal.");
    } finally {
      setBusyId("");
    }
  }

  async function copyLink(m: Member) {
    setBusyId(m.id);
    setError("");
    try {
      const res = await api<{ link: string }>("POST", { action: "link", id: m.id });
      setLinkShown({ name: m.name, link: res.link });
      try {
        await navigator.clipboard.writeText(res.link);
        setNotice(`Tautan untuk ${m.name} disalin. Kirim lewat WhatsApp; tautan hanya berlaku sebentar.`);
      } catch {
        setNotice("Salin tautan di bawah ini secara manual.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat tautan.");
    } finally {
      setBusyId("");
    }
  }

  const btn = (primary = false): React.CSSProperties => ({
    border: `1px solid ${primary ? "#16a34a" : LINE}`,
    background: primary ? "#16a34a" : "#fff",
    color: primary ? "#fff" : INK,
    borderRadius: 999,
    padding: "6px 13px",
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "pointer",
  });

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: INK }}>Tim Admin</h1>
          <p style={{ margin: "2px 0 0", fontSize: 12.5, color: SUB }}>
            Struktur tim panel admin. Semua admin bisa melihat daftar ini; undangan dan pengaturan hanya untuk penanggung jawab.
          </p>
        </div>
        {data?.me.canInvite ? (
          <button type="button" style={btn(true)} onClick={() => setInviteOpen(true)}>
            + Tambah admin
          </button>
        ) : null}
      </div>

      {error ? <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 600 }}>{error}</div> : null}
      {notice ? <div style={{ background: "#dcfce7", color: "#166534", borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 600 }}>{notice}</div> : null}
      {linkShown ? (
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, background: "#fff", fontSize: 12.5 }}>
          <b style={{ color: INK }}>Tautan atur-password untuk {linkShown.name}</b>
          <input readOnly value={linkShown.link} onFocus={(e) => e.currentTarget.select()} style={{ width: "100%", marginTop: 6, border: `1px solid ${LINE}`, borderRadius: 8, padding: "7px 10px", fontSize: 12 }} />
          <button type="button" style={{ ...btn(), marginTop: 8 }} onClick={() => setLinkShown(null)}>
            Tutup
          </button>
        </div>
      ) : null}

      {loading ? (
        <p style={{ color: SUB, fontSize: 13 }}>Memuat…</p>
      ) : (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {members.map((m, i) => (
            <div key={m.id} style={{ border: `1px solid ${LINE}`, borderRadius: 16, background: "#fff", padding: 16, display: "grid", gap: 10, alignContent: "start", opacity: m.active ? 1 : 0.6 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ width: 46, height: 46, borderRadius: "50%", background: AVATAR_COLORS[i % AVATAR_COLORS.length], display: "grid", placeItems: "center", fontWeight: 800, fontSize: 18, color: INK }}>
                  {m.name.charAt(0).toUpperCase()}
                </span>
                <div style={{ minWidth: 0 }}>
                  <b style={{ display: "block", fontSize: 15, color: INK }}>
                    {m.name}
                    {m.isMe ? <span style={{ marginLeft: 6, fontSize: 10.5, background: "#e0e7ff", color: "#3730a3", borderRadius: 999, padding: "2px 8px" }}>Anda</span> : null}
                  </b>
                  <span style={{ fontSize: 12, color: SUB, wordBreak: "break-all" }}>{m.email}</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ background: m.title ? "#fef3c7" : "#f1f5f9", color: m.title ? "#92400e" : SUB, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                  {m.title || ROLE_LABEL[m.role] || "Admin"}
                </span>
                <span style={{ background: "#f1f5f9", color: SUB, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>Akses: {ROLE_LABEL[m.role] || "Admin"}</span>
                {m.invited ? <span style={{ background: "#e0f2fe", color: "#075985", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>Menunggu undangan</span> : null}
                {!m.active ? <span style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>Nonaktif</span> : null}
              </div>
              <span style={{ fontSize: 12, color: SUB }}>{m.invited ? "Belum membuat password" : sinceLabel(m.lastSignIn)}</span>

              {m.canManage ? (
                editing?.id === m.id ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <input
                      list="team-title-suggestions"
                      value={editing.title}
                      maxLength={40}
                      onChange={(e) => setEditing({ id: m.id, title: e.target.value })}
                      placeholder="Label jabatan"
                      style={{ flex: 1, minWidth: 140, border: `1px solid ${LINE}`, borderRadius: 8, padding: "6px 10px", fontSize: 13 }}
                    />
                    <button type="button" style={btn(true)} disabled={busyId === m.id} onClick={() => act(m.id, () => api("PATCH", { id: m.id, title: editing.title }).then(() => setEditing(null)), "Label disimpan.")}>
                      Simpan
                    </button>
                    <button type="button" style={btn()} onClick={() => setEditing(null)}>
                      Batal
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button type="button" style={btn()} disabled={busyId === m.id} onClick={() => setEditing({ id: m.id, title: m.title })}>
                      Ubah label
                    </button>
                    <button type="button" style={btn()} disabled={busyId === m.id} onClick={() => void copyLink(m)}>
                      Salin tautan
                    </button>
                    <button
                      type="button"
                      style={{ ...btn(), color: m.active ? "#b91c1c" : "#166534" }}
                      disabled={busyId === m.id}
                      onClick={() => {
                        if (m.active && !window.confirm(`Nonaktifkan ${m.name}? Akun ini tidak bisa login sampai diaktifkan lagi. Datanya tidak dihapus.`)) return;
                        void act(m.id, () => api("PATCH", { id: m.id, active: !m.active }), m.active ? `${m.name} dinonaktifkan.` : `${m.name} diaktifkan lagi.`);
                      }}
                    >
                      {m.active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  </div>
                )
              ) : null}
            </div>
          ))}
        </div>
      )}
      <datalist id="team-title-suggestions">
        {TITLE_SUGGESTIONS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      {inviteOpen && data ? (
        <InviteDialog
          grantable={data.me.grantable}
          onClose={() => setInviteOpen(false)}
          onDone={async (email) => {
            setInviteOpen(false);
            setNotice(`Undangan terkirim ke ${email}. Minta orangnya membuka email dan membuat password.`);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function InviteDialog({ grantable, onClose, onDone }: { grantable: string[]; onClose: () => void; onDone: (email: string) => void | Promise<void> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("Admin");
  const [role, setRole] = useState(grantable.includes("admin") ? "admin" : grantable[0] || "admin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await api("POST", { name, email, title, role });
      await onDone(email.trim().toLowerCase());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim undangan.");
      setBusy(false);
    }
  }

  const field: React.CSSProperties = { border: `1px solid ${LINE}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, outline: "none", width: "100%" };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: SUB, display: "grid", gap: 4 };

  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "grid", placeItems: "center", padding: 16, zIndex: 80 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, padding: 22, width: "100%", maxWidth: 420, display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 17, color: INK }}>Tambah admin</h2>
        <label style={label}>
          Nama
          <input style={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Lea" maxLength={60} />
        </label>
        <label style={label}>
          Email
          <input style={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" />
        </label>
        <label style={label}>
          Label jabatan
          <input style={field} list="team-title-suggestions" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} />
        </label>
        <label style={label}>
          Hak akses
          <select style={field} value={role} onChange={(e) => setRole(e.target.value)}>
            {grantable.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r] || r}
              </option>
            ))}
          </select>
        </label>
        <p style={{ margin: 0, fontSize: 12, color: SUB }}>Undangan dikirim ke email itu. Orangnya membuat password sendiri.</p>
        {error ? <p style={{ margin: 0, color: "#b91c1c", fontSize: 13, fontWeight: 600 }}>{error}</p> : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ border: `1px solid ${LINE}`, background: "#fff", borderRadius: 10, padding: "9px 16px", fontWeight: 700, cursor: "pointer" }}>
            Batal
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !name.trim() || !email.trim()}
            style={{ border: 0, background: busy || !name.trim() || !email.trim() ? "#cbd5e1" : "#16a34a", color: "#fff", borderRadius: 10, padding: "9px 18px", fontWeight: 800, cursor: busy ? "wait" : "pointer" }}
          >
            {busy ? "Mengirim…" : "Kirim undangan"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

/**
 * Inbox WhatsApp di panel admin.
 *
 * Semua aksi lewat `/api/ops/wa-panel` (penerus ke fungsi `wa-admin` yang juga dipakai inbox Academy dan bot), jadi daftar
 * chat, status "diambil alih", riwayat, balasan, dan kirim foto persis sama dengan Academy. Membalas otomatis mengambil
 * alih chat dari bot (aturan di server, bukan di sini).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

interface Conversation {
  sender: string;
  name: string;
  lastMessage: string;
  lastAt: string;
  lastFrom?: "customer" | "kita";
  pending: number;
  oldestPendingAt?: string | null;
  total: number;
  handover: boolean;
}

interface Message {
  id: string;
  message: string | null;
  status: string;
  created_at: string;
  replied_at?: string | null;
  reply_text?: string | null;
  reply_media_url?: string | null;
  media_url?: string | null;
  filename?: string | null;
  error?: string | null;
  admin_email?: string | null;
}

interface Stats {
  pending: number;
  processing: number;
  sent: number;
  skipped: number;
  total: number;
}

const INK = "#1f2937";
const SUB = "#6b7280";
const LINE = "#e5e7eb";
const SOFT = "#f8fafc";

async function call<T>(payload: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch("/api/ops/wa-panel", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error || `Gagal memuat (HTTP ${res.status})`);
  return json as T;
}

const wibParts = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));

function timeLabel(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const p = Object.fromEntries(wibParts(iso).map((x) => [x.type, x.value]));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(t));
  return day === today ? `${p.hour}.${p.minute}` : `${p.day} ${p.month}`;
}

function clock(iso: string): string {
  const p = Object.fromEntries(wibParts(iso).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} · ${p.hour}.${p.minute}`;
}

/** Lama menunggu → teks + warna (HANYA informasi, tidak memicu apa pun). */
function waitInfo(iso?: string | null): { text: string; color: string; bg: string } | null {
  const t = Date.parse(String(iso || ""));
  if (!Number.isFinite(t)) return null;
  const min = Math.max(0, Math.floor((Date.now() - t) / 60000));
  const text = min < 60 ? `${min} mnt` : `${Math.floor(min / 60)} j ${min % 60} mnt`;
  if (min < 5) return { text, color: "#166534", bg: "#dcfce7" };
  if (min < 10) return { text, color: "#92400e", bg: "#fef3c7" };
  return { text, color: "#991b1b", bg: "#fee2e2" };
}

/** Foto yang dipilih admin: sudah dikecilkan (maks 1600px, JPEG) supaya cepat terkirim dan jauh di bawah batas server. */
interface Photo {
  data: string;
  mime: string;
  preview: string;
}
const PHOTO_MAX_SIDE = 1600;

function shrinkPhoto(file: File): Promise<Photo> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      reject(new Error("Format foto harus JPG, PNG, atau WebP."));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Browser tidak bisa memproses foto."));
        return;
      }
      ctx.fillStyle = "#fff"; // PNG transparan tidak boleh jadi hitam saat menjadi JPEG
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      resolve({ data: dataUrl.split(",")[1] || "", mime: "image/jpeg", preview: dataUrl });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Foto tidak bisa dibuka."));
    };
    img.src = url;
  });
}

const initials = (c: Conversation) => (c.name || c.sender).trim().charAt(0).toUpperCase() || "#";

export default function WaInboxPanelView() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"semua" | "belum" | "admin">("semua");
  const [selected, setSelected] = useState<string>("");
  const [thread, setThread] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState("");
  const [, tick] = useState(0);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [sending, setSending] = useState(false);
  const [handoverBusy, setHandoverBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const loadList = useCallback(async () => {
    try {
      const res = await call<{ items: Conversation[]; stats: Stats }>({ action: "conversations" });
      setItems(res.items || []);
      setStats(res.stats || null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat inbox.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
    const id = setInterval(() => void loadList(), 20_000);
    const clockId = setInterval(() => tick((n) => n + 1), 30_000); // segarkan lama menunggu
    return () => {
      clearInterval(id);
      clearInterval(clockId);
    };
  }, [loadList]);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    const run = async (first: boolean) => {
      if (first) setThreadLoading(true);
      try {
        const res = await call<{ items: Message[] }>({ action: "messages", sender: selected, limit: 100 });
        if (!alive) return;
        setThread(res.items || []);
        setThreadError("");
      } catch (e) {
        if (alive) setThreadError(e instanceof Error ? e.message : "Gagal memuat riwayat.");
      } finally {
        if (alive && first) setThreadLoading(false);
      }
    };
    void run(true);
    const id = setInterval(() => void run(false), 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [selected]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [thread, selected]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((c) => {
      if (filter === "belum" && c.pending === 0) return false;
      if (filter === "admin" && !c.handover) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.sender.includes(q.replace(/\D/g, "") || "\u0000") || c.lastMessage.toLowerCase().includes(q);
    });
  }, [items, search, filter]);

  const current = items.find((c) => c.sender === selected) || null;

  // Pindah chat: kotak balasan dan pesan galat milik chat sebelumnya tidak ikut terbawa.
  useEffect(() => {
    setDraft("");
    setPhoto(null);
    setActionError("");
  }, [selected]);

  async function refreshThread(sender: string) {
    const res = await call<{ items: Message[] }>({ action: "messages", sender, limit: 100 });
    setThread(res.items || []);
  }

  async function onSend() {
    const text = draft.trim();
    if ((!text && !photo) || !selected || sending) return;
    setSending(true);
    setActionError("");
    try {
      await call({ action: "reply", sender: selected, message: text, ...(photo ? { media: { data: photo.data, mime: photo.mime } } : {}) });
      setDraft("");
      setPhoto(null);
      await Promise.all([refreshThread(selected), loadList()]);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Gagal mengirim.");
    } finally {
      setSending(false);
    }
  }

  async function onPickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setPhoto(await shrinkPhoto(file));
      setActionError("");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Foto tidak bisa dipakai.");
    }
  }

  async function onToggleHandover() {
    if (!current || handoverBusy) return;
    setHandoverBusy(true);
    setActionError("");
    try {
      await call({ action: current.handover ? "release" : "takeover", sender: current.sender });
      await loadList();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Gagal mengubah status percakapan.");
    } finally {
      setHandoverBusy(false);
    }
  }

  const chip = (key: typeof filter, label: string, count?: number) => (
    <button
      key={key}
      type="button"
      onClick={() => setFilter(key)}
      style={{
        border: `1px solid ${filter === key ? INK : LINE}`,
        background: filter === key ? INK : "#fff",
        color: filter === key ? "#fff" : INK,
        borderRadius: 999,
        padding: "5px 12px",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
      {typeof count === "number" ? ` ${count}` : ""}
    </button>
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: INK }}>Inbox WA</h1>
          <p style={{ margin: "2px 0 0", fontSize: 12.5, color: SUB }}>
            Sama dengan inbox Academy. Membalas otomatis mengambil alih chat dari bot.
          </p>
        </div>
        {stats ? (
          <div style={{ display: "flex", gap: 8, fontSize: 12, fontWeight: 700 }}>
            <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 999, padding: "4px 10px" }}>
              Belum dibalas {stats.pending + stats.processing}
            </span>
            <span style={{ background: "#e0f2fe", color: "#075985", borderRadius: 999, padding: "4px 10px" }}>
              Percakapan {items.length}
            </span>
          </div>
        ) : null}
      </div>

      {error ? (
        <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 600 }}>
          {error}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)",
          gap: 0,
          border: `1px solid ${LINE}`,
          borderRadius: 16,
          overflow: "hidden",
          background: "#fff",
          height: "min(74vh, 720px)",
        }}
      >
        {/* daftar chat */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, borderRight: `1px solid ${LINE}` }}>
          <div style={{ padding: 12, display: "grid", gap: 8, borderBottom: `1px solid ${LINE}` }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama / nomor / isi pesan…"
              aria-label="Cari percakapan"
              style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: "8px 12px", fontSize: 13, outline: "none", background: SOFT }}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {chip("semua", "Semua")}
              {chip("belum", "Belum dibalas", items.filter((c) => c.pending > 0).length)}
              {chip("admin", "Diambil alih", items.filter((c) => c.handover).length)}
            </div>
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading ? (
              <p style={{ padding: 20, color: SUB, fontSize: 13 }}>Memuat…</p>
            ) : visible.length === 0 ? (
              <p style={{ padding: 20, color: SUB, fontSize: 13 }}>Tidak ada percakapan.</p>
            ) : (
              visible.map((c) => {
                const wait = c.pending > 0 ? waitInfo(c.oldestPendingAt) : null;
                const active = c.sender === selected;
                return (
                  <button
                    key={c.sender}
                    type="button"
                    onClick={() => setSelected(c.sender)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "40px minmax(0, 1fr) auto",
                      gap: 10,
                      alignItems: "center",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      border: 0,
                      borderBottom: `1px solid ${LINE}`,
                      background: active ? "#eef2ff" : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        background: c.handover ? "#fde68a" : "#e0e7ff",
                        color: INK,
                        fontWeight: 800,
                      }}
                    >
                      {initials(c)}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <b style={{ display: "block", fontSize: 13.5, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {c.name || `+${c.sender}`}
                      </b>
                      <span style={{ display: "block", fontSize: 12, color: SUB, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {c.lastFrom === "kita" ? "Kita: " : ""}
                        {c.lastMessage || "—"}
                      </span>
                    </span>
                    <span style={{ display: "grid", justifyItems: "end", gap: 4 }}>
                      <span style={{ fontSize: 11, color: SUB }}>{timeLabel(c.lastAt)}</span>
                      {c.pending > 0 ? (
                        <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          {wait ? (
                            <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "1px 7px", color: wait.color, background: wait.bg }}>
                              {wait.text}
                            </span>
                          ) : null}
                          <span style={{ background: "#16a34a", color: "#fff", borderRadius: 999, minWidth: 18, textAlign: "center", fontSize: 11, fontWeight: 800, padding: "1px 6px" }}>
                            {c.pending}
                          </span>
                        </span>
                      ) : (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: c.handover ? "#92400e" : SUB }}>
                          {c.handover ? "Admin" : "Bot"}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* riwayat */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, background: "#efeae2" }}>
          {!current ? (
            <div style={{ margin: "auto", textAlign: "center", color: SUB, fontSize: 13 }}>Pilih percakapan di sebelah kiri.</div>
          ) : (
            <>
              <div style={{ background: "#fff", borderBottom: `1px solid ${LINE}`, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <b style={{ display: "block", fontSize: 14, color: INK }}>{current.name || `+${current.sender}`}</b>
                  <span style={{ fontSize: 12, color: SUB }}>
                    +{current.sender} · {current.handover ? "ditangani admin" : "ditangani bot"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onToggleHandover}
                  disabled={handoverBusy}
                  title={current.handover ? "Kembalikan chat ini ke bot" : "Ambil alih chat ini dari bot"}
                  style={{
                    marginLeft: "auto",
                    border: `1px solid ${LINE}`,
                    background: current.handover ? "#fef3c7" : "#fff",
                    color: INK,
                    borderRadius: 999,
                    padding: "6px 14px",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: handoverBusy ? "wait" : "pointer",
                  }}
                >
                  {handoverBusy ? "Memproses…" : current.handover ? "Kembalikan ke bot" : "Ambil alih"}
                </button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "grid", gap: 6, alignContent: "start" }}>
                {threadLoading ? <p style={{ color: SUB, fontSize: 13 }}>Memuat riwayat…</p> : null}
                {threadError ? <p style={{ color: "#991b1b", fontSize: 13 }}>{threadError}</p> : null}
                {thread.map((m) => (
                  <div key={m.id} style={{ display: "grid", gap: 6 }}>
                    {m.message || m.media_url ? (
                      <Bubble side="left" time={m.created_at}>
                        {m.media_url ? <Media url={m.media_url} name={m.filename} /> : null}
                        {/* "[lampiran]" hanya penanda dari sistem; kalau fotonya tampil, teks itu tidak perlu. */}
                        {m.message && !(m.media_url && /^\[lampiran\]$/i.test(m.message.trim())) ? <span>{m.message}</span> : null}
                      </Bubble>
                    ) : null}
                    {m.reply_text || m.reply_media_url ? (
                      <Bubble
                        side="right"
                        time={m.replied_at || m.created_at}
                        who={m.admin_email ? m.admin_email.split("@")[0] : m.status === "admin" ? "admin" : "Bot"}
                      >
                        {m.reply_media_url ? <Media url={m.reply_media_url} name="Lampiran balasan" /> : null}
                        {m.reply_text ? <span>{m.reply_text}</span> : null}
                      </Bubble>
                    ) : null}
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <div style={{ background: "#fff", borderTop: `1px solid ${LINE}`, padding: "10px 12px", display: "grid", gap: 8 }}>
                {actionError ? (
                  <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "6px 10px", fontSize: 12.5, fontWeight: 600 }}>
                    {actionError}
                  </div>
                ) : null}
                {photo ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.preview} alt="Pratinjau foto" style={{ height: 64, borderRadius: 8, border: `1px solid ${LINE}` }} />
                    <button
                      type="button"
                      onClick={() => setPhoto(null)}
                      style={{ border: 0, background: "transparent", color: "#991b1b", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
                    >
                      Hapus foto
                    </button>
                  </div>
                ) : null}
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPickPhoto} style={{ display: "none" }} />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={sending}
                    title="Lampirkan foto"
                    aria-label="Lampirkan foto"
                    style={{ border: `1px solid ${LINE}`, background: "#fff", borderRadius: 10, width: 40, height: 40, fontSize: 18, cursor: "pointer" }}
                  >
                    📎
                  </button>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter = kirim, Shift+Enter = baris baru. Saat memilih huruf lewat IME, Enter tidak mengirim.
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        void onSend();
                      }
                    }}
                    rows={2}
                    placeholder="Ketik balasan… (Enter kirim, Shift+Enter baris baru)"
                    disabled={sending}
                    style={{ flex: 1, border: `1px solid ${LINE}`, borderRadius: 10, padding: "8px 12px", fontSize: 13.5, resize: "none", outline: "none", fontFamily: "inherit" }}
                  />
                  <button
                    type="button"
                    onClick={() => void onSend()}
                    disabled={sending || (!draft.trim() && !photo)}
                    style={{
                      border: 0,
                      background: sending || (!draft.trim() && !photo) ? "#cbd5e1" : "#16a34a",
                      color: "#fff",
                      borderRadius: 10,
                      height: 40,
                      padding: "0 18px",
                      fontSize: 13.5,
                      fontWeight: 800,
                      cursor: sending ? "wait" : "pointer",
                    }}
                  >
                    {sending ? "Mengirim…" : "Kirim"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const isVideoUrl = (url: string) => /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(String(url || ""));

/**
 * Lampiran di dalam gelembung: foto tampil langsung (klik = buka ukuran penuh), video bisa diputar. Kalau filenya
 * bukan gambar atau gagal dimuat (PDF, tautan kedaluwarsa), jatuh ke tautan bernama file.
 */
function Media({ url, name }: { url: string; name?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (isVideoUrl(url)) {
    return <video src={url} controls preload="metadata" style={{ maxWidth: 260, borderRadius: 8, display: "block" }} />;
  }
  if (failed) {
    return (
      <a href={url} target="_blank" rel="noreferrer" style={{ color: "#0369a1", fontSize: 12.5, fontWeight: 600 }}>
        📎 {name || "Lampiran"}
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" style={{ display: "block" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={name || "Lampiran"}
        loading="lazy"
        onError={() => setFailed(true)}
        style={{ maxWidth: 260, maxHeight: 320, borderRadius: 8, display: "block", objectFit: "cover" }}
      />
    </a>
  );
}

function Bubble({
  side,
  time,
  who,
  children,
}: {
  side: "left" | "right";
  time: string;
  who?: string;
  children: React.ReactNode;
}) {
  const right = side === "right";
  return (
    <div style={{ display: "flex", justifyContent: right ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "76%",
          background: right ? "#d9fdd3" : "#fff",
          borderRadius: 10,
          padding: "7px 10px 5px",
          boxShadow: "0 1px 1px rgba(0,0,0,0.08)",
          fontSize: 13.5,
          color: INK,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          display: "grid",
          gap: 2,
        }}
      >
        {who ? <b style={{ fontSize: 11, color: "#0f766e" }}>{who}</b> : null}
        {children}
        <span style={{ fontSize: 10.5, color: SUB, justifySelf: "end" }}>{clock(time)}</span>
      </div>
    </div>
  );
}

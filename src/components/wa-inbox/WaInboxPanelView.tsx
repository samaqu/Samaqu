"use client";

/**
 * Inbox WhatsApp di panel admin — TAHAP 1: BACA SAJA.
 *
 * Datanya diambil lewat `/api/ops/wa-panel` (penerus ke fungsi `wa-admin` yang juga dipakai inbox Academy dan bot),
 * jadi daftar chat, status "diambil alih", dan riwayat persis sama dengan Academy. Belum ada tombol kirim/ambil alih:
 * itu tahap berikutnya setelah tampilan ini terbukti benar.
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
            Tampilan baca-saja (tahap 1). Balas dan ambil alih masih lewat inbox Academy sampai tahap berikutnya.
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
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "grid", gap: 6, alignContent: "start" }}>
                {threadLoading ? <p style={{ color: SUB, fontSize: 13 }}>Memuat riwayat…</p> : null}
                {threadError ? <p style={{ color: "#991b1b", fontSize: 13 }}>{threadError}</p> : null}
                {thread.map((m) => (
                  <div key={m.id} style={{ display: "grid", gap: 6 }}>
                    {m.message || m.media_url ? (
                      <Bubble side="left" time={m.created_at}>
                        {m.media_url ? (
                          <a href={m.media_url} target="_blank" rel="noreferrer" style={{ color: "#0369a1", fontSize: 12.5, fontWeight: 600 }}>
                            📎 {m.filename || "Lampiran"}
                          </a>
                        ) : null}
                        {m.message ? <span>{m.message}</span> : null}
                      </Bubble>
                    ) : null}
                    {m.reply_text || m.reply_media_url ? (
                      <Bubble
                        side="right"
                        time={m.replied_at || m.created_at}
                        who={m.admin_email ? m.admin_email.split("@")[0] : m.status === "admin" ? "admin" : "Bot"}
                      >
                        {m.reply_media_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.reply_media_url} alt="Foto balasan" style={{ maxWidth: 240, borderRadius: 8, display: "block", marginBottom: 4 }} />
                        ) : null}
                        {m.reply_text ? <span>{m.reply_text}</span> : null}
                      </Bubble>
                    ) : null}
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <div style={{ background: "#fff", borderTop: `1px solid ${LINE}`, padding: "10px 16px", fontSize: 12, color: SUB }}>
                Mode baca-saja. Untuk membalas, buka inbox Academy.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
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

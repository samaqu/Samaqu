"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/AdminToast";

/**
 * Panel admin "Live Chat" — riwayat percakapan AI per sesi.
 *
 * Satu sesi = satu pengunjung (session_id). Di dalamnya ditampilkan pertanyaan
 * customer + jawaban AI secara berurutan, plus nama/WA dan gambar bila ada.
 * Data dibaca lewat `/api/admin/chat-logs` (service role; chat_logs tanpa policy RLS).
 */

interface ChatLog {
  id: string;
  session_id: string | null;
  locale: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  question: string | null;
  question_images: string[] | null;
  answer: string | null;
  tools_used: string[] | null;
  escalated: boolean | null;
  error: string | null;
  created_at: string;
}

interface SessionGroup {
  key: string;
  items: ChatLog[];
  name: string | null;
  phone: string | null;
  lastAt: string;
  escalated: boolean;
  errors: number;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function groupSessions(logs: ChatLog[]): SessionGroup[] {
  const map = new Map<string, ChatLog[]>();
  for (const log of logs) {
    const key = log.session_id || `single-${log.id}`;
    const list = map.get(key) || [];
    list.push(log);
    map.set(key, list);
  }

  return [...map.entries()]
    .map(([key, items]) => {
      const sorted = [...items].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const latest = sorted[sorted.length - 1];
      const name = [...sorted].reverse().find((item) => item.customer_name)?.customer_name || null;
      const phone = [...sorted].reverse().find((item) => item.customer_phone)?.customer_phone || null;
      return {
        key,
        items: sorted,
        name,
        phone,
        lastAt: latest.created_at,
        escalated: sorted.some((item) => item.escalated === true),
        errors: sorted.filter((item) => !!item.error).length,
      };
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export default function ChatLogsView() {
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyEscalated, setOnlyEscalated] = useState(false);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const toast = useToast();

  async function addToFaq(id: string) {
    setAddingId(id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/chat-logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({ action: "toFaq", id }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        toast.showToast("error", json.error || "Gagal menambah pengetahuan");
        return;
      }
      toast.showToast(
        "success",
        json.duplicate
          ? "Percakapan ini sudah ada di pengetahuan AI"
          : "Ditambahkan ke pengetahuan AI (tidak tampil di /faq)",
      );
    } catch (e) {
      console.error("[ADMIN] Gagal menambah FAQ:", e);
      toast.showToast("error", "Gagal menambah FAQ");
    } finally {
      setAddingId(null);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/chat-logs?limit=500", {
        headers: { Authorization: `Bearer ${session?.access_token || ""}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memuat log");
      setLogs(json.logs || []);
    } catch (e) {
      console.error("[ADMIN] Gagal memuat log chat:", e);
      toast.showToast("error", "Gagal memuat log chat");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sessions = groupSessions(logs);
  const q = query.trim().toLowerCase();
  const filteredSessions = sessions.filter((session) => {
    if (onlyEscalated && !session.escalated) return false;
    if (onlyErrors && session.errors === 0) return false;
    if (!q) return true;
    return session.items.some((log) =>
      [log.question, log.answer, log.customer_name, log.customer_phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari pertanyaan, jawaban, nama, atau no WA..."
            className="w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{ background: "var(--card)", border: "1px solid var(--bd)", color: "var(--fg)" }}
          />
        </div>

        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--fg2)" }}>
          <input
            type="checkbox"
            checked={onlyEscalated}
            onChange={(e) => setOnlyEscalated(e.target.checked)}
          />
          Hanya yang diarahkan ke admin
        </label>

        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--fg2)" }}>
          <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />
          Hanya yang gagal
        </label>

        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50"
          style={{ border: "1px solid var(--bd)", color: "var(--fg)" }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Muat ulang
        </button>
      </div>

      <p className="text-xs" style={{ color: "var(--fg3)" }}>
        {filteredSessions.length} sesi dari {sessions.length} sesi · {logs.length} pertanyaan.
        Klik satu sesi untuk melihat riwayat lengkap.
      </p>

      {loading ? (
        <div className="card p-6 flex items-center gap-2" style={{ color: "var(--fg3)" }}>
          <Loader2 size={18} className="animate-spin" /> Memuat...
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="card p-6 text-sm" style={{ color: "var(--fg3)" }}>
          Belum ada percakapan yang cocok.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSessions.map((session) => {
            const isOpen = openKey === session.key;
            const waDigits = (session.phone || "").replace(/\D/g, "").replace(/^0/, "62");
            return (
              <article key={session.key} className="card p-4 space-y-2">
                <button
                  type="button"
                  onClick={() => setOpenKey(isOpen ? null : session.key)}
                  className="w-full text-left"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
                        {session.name || "Anonim"}
                        {session.phone ? (
                          <span className="font-normal" style={{ color: "var(--fg2)" }}>
                            {" · "}
                            {session.phone}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-[11px]" style={{ color: "var(--fg3)" }}>
                        {formatTime(session.lastAt)} · {session.items.length} pertanyaan · sesi{" "}
                        {session.key.slice(0, 8)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      {session.escalated && (
                        <span
                          className="px-2 py-0.5 rounded-full"
                          style={{ background: "#fef3c7", color: "#92400e" }}
                        >
                          Diarahkan ke admin
                        </span>
                      )}
                      {session.errors > 0 && (
                        <span
                          className="px-2 py-0.5 rounded-full"
                          style={{ background: "#fee2e2", color: "#b91c1c" }}
                        >
                          {session.errors} gagal
                        </span>
                      )}
                      <span style={{ color: "var(--fg2)" }}>{isOpen ? "Tutup" : "Lihat"}</span>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="space-y-3 pt-3 border-t" style={{ borderColor: "var(--bd)" }}>
                    {waDigits && (
                      <a
                        href={`https://wa.me/${waDigits}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex text-xs font-semibold px-3 py-1.5 rounded-lg"
                        style={{ border: "1px solid var(--bd)", color: "var(--fg)" }}
                      >
                        Chat WhatsApp
                      </a>
                    )}

                    {session.items.map((log) => (
                      <div
                        key={log.id}
                        className="space-y-1.5 pb-3"
                        style={{ borderBottom: "1px solid var(--bd)" }}
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: "var(--fg3)" }}>
                          <span className="font-semibold">Customer</span>
                          <span>{formatTime(log.created_at)}</span>
                        </div>
                        {log.question_images && log.question_images.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {log.question_images.map((url) => (
                              <a key={url} href={url} target="_blank" rel="noreferrer">
                                <img
                                  src={url}
                                  alt="Lampiran customer"
                                  className="w-16 h-16 rounded-lg object-cover"
                                  style={{ border: "1px solid var(--bd)" }}
                                />
                              </a>
                            ))}
                          </div>
                        )}
                        <p className="text-sm font-semibold whitespace-pre-wrap break-words" style={{ color: "var(--fg)" }}>
                          {log.question || (log.question_images?.length ? "(gambar)" : "(tanpa pertanyaan)")}
                        </p>

                        <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: "var(--fg3)" }}>
                          <span className="font-semibold">AI</span>
                          {log.tools_used && log.tools_used.length > 0 && (
                            <span>{[...new Set(log.tools_used)].join(", ")}</span>
                          )}
                        </div>
                        <p className="text-sm whitespace-pre-wrap break-words" style={{ color: "var(--fg2)" }}>
                          {log.answer || "(tidak ada jawaban)"}
                        </p>
                        {log.error && (
                          <p className="text-[11px] whitespace-pre-wrap break-words" style={{ color: "#b91c1c" }}>
                            Error: {log.error}
                          </p>
                        )}

                        {log.question && log.answer && (
                          <button
                            onClick={() => addToFaq(log.id)}
                            disabled={addingId === log.id}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                            style={{ border: "1px solid var(--bd)", color: "var(--fg)" }}
                          >
                            {addingId === log.id && <Loader2 size={12} className="animate-spin" />}
                            Tambah ke Knowledge AI
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

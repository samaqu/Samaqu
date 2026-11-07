"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/AdminToast";
import type { ChatLog } from "./chat-logs/types";
import { extractProducts, groupSessions } from "./chat-logs/utils";
import SessionList from "./chat-logs/SessionList";
import ChatThread from "./chat-logs/ChatThread";
import CustomerPanel from "./chat-logs/CustomerPanel";

/**
 * Panel admin "Live Chat" — riwayat percakapan AI.
 *
 * Semua logic lama dipertahankan: fetch `/api/admin/chat-logs`, search, filter,
 * reload, WhatsApp, dan Tambah ke Knowledge AI. Tampilan dipecah jadi komponen
 * kecil di folder `chat-logs/`.
 */

type FilterMode = "all" | "escalated" | "failed";

export default function ChatLogsView() {
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyEscalated, setOnlyEscalated] = useState(false);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
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

  const filterMode: FilterMode = onlyEscalated ? "escalated" : onlyErrors ? "failed" : "all";
  const selectedSession =
    filteredSessions.find((session) => session.key === selectedKey) ||
    filteredSessions[0] ||
    null;
  const products = selectedSession ? extractProducts(selectedSession.items) : [];

  function setFilter(mode: FilterMode) {
    setOnlyEscalated(mode === "escalated");
    setOnlyErrors(mode === "failed");
  }

  function selectSession(key: string) {
    setSelectedKey(key);
    setMobileView("chat");
  }

  function filterPill(mode: FilterMode, label: string, dot?: string) {
    const active = filterMode === mode;
    return (
      <button
        key={mode}
        type="button"
        onClick={() => setFilter(mode)}
        className="inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors"
        style={
          active
            ? { background: "#141414", color: "#fff", border: "1px solid #141414" }
            : { background: "#fff", color: "#141414", border: "1px solid #E7E6E1" }
        }
      >
        {dot ? <span className="h-2 w-2 rounded-full" style={{ background: dot }} /> : null}
        {label}
      </button>
    );
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl p-3 sm:p-5"
      style={{ background: "#F4F4F1", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
    >
      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "#6B6A64" }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama, no WA, pertanyaan, atau jawaban…"
            className="h-11 w-full rounded-xl pl-9 pr-3 text-sm outline-none"
            style={{ background: "#fff", border: "1px solid #E7E6E1", color: "#141414" }}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {filterPill("all", `Semua · ${sessions.length}`)}
          {filterPill("escalated", "Diarahkan ke admin", "#C8A45D")}
          {filterPill("failed", "Gagal dijawab", "#9B2C2C")}
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          title="Muat ulang"
          aria-label="Muat ulang"
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border bg-white disabled:opacity-50"
          style={{ borderColor: "#E7E6E1", color: "#141414" }}
        >
          {loading ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
        </button>
      </div>

      {loading && logs.length === 0 ? (
        <div
          className="flex min-h-0 flex-1 items-center justify-center gap-2 rounded-2xl border bg-white text-sm"
          style={{ borderColor: "#E7E6E1", color: "#6B6A64" }}
        >
          <Loader2 size={18} className="animate-spin" /> Memuat...
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[300px_minmax(0,1fr)_320px] lg:gap-4">
          <div className={`${mobileView === "chat" ? "hidden lg:block" : "block"} min-h-0 h-full`}>
            <SessionList
              sessions={filteredSessions}
              selectedKey={selectedSession?.key || null}
              onSelect={selectSession}
              loading={loading}
            />
          </div>

          <div className={`${mobileView === "list" ? "hidden lg:block" : "block"} min-h-0 h-full`}>
            <ChatThread
              key={`${selectedSession?.key || "none"}-${mobileView}`}
              session={selectedSession}
              onBack={() => setMobileView("list")}
              onAddToFaq={addToFaq}
              addingId={addingId}
              mobileDetails={
                selectedSession ? (
                  <details className="lg:hidden" style={{ borderBottom: "1px solid #E7E6E1" }}>
                    <summary
                      className="cursor-pointer px-4 py-3 text-sm font-semibold"
                      style={{ color: "#141414" }}
                    >
                      Detail pelanggan
                    </summary>
                    <div className="p-3" style={{ background: "#F4F4F1" }}>
                      <CustomerPanel session={selectedSession} products={products} />
                    </div>
                  </details>
                ) : null
              }
            />
          </div>

          <div className="hidden min-h-0 h-full lg:block">
            {selectedSession ? (
              <CustomerPanel session={selectedSession} products={products} />
            ) : (
              <div
                className="flex h-full items-center justify-center rounded-2xl border bg-white p-6 text-sm"
                style={{ borderColor: "#E7E6E1", color: "#6B6A64" }}
              >
                Pilih sesi untuk melihat detail pelanggan.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

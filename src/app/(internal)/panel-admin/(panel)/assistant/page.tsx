"use client";

import { useEffect, useRef, useState } from "react";
import { authToken, sessionEmail } from "../../panel-api";
import {
  LEGACY_HISTORY_KEY,
  LEGACY_SESSION_KEY,
  accountNs,
  appendArchive,
  completeMessages,
  hasUserTurn,
  parseHistory,
  seedIfEmpty,
  storageKeys,
  type HistoryMsg,
  type StorageKeys,
} from "../../assistant-history";
import { GREETING, busyLabel } from "../../assistant-copy";
import styles from "../../panel.module.css";

/**
 * Asisten Operasional (internal) — halaman `/panel-admin/assistant`.
 *
 * Beda dengan widget live chat di website:
 *  - memanggil `/api/panel-ai/chat` yang WAJIB sesi admin (server yang memverifikasi);
 *  - sesi & riwayat disimpan dengan kunci localStorage TERPISAH dari chat customer;
 *  - read-only: hanya menampilkan data, tidak ada aksi yang mengubah database.
 *
 * Pembatalan (R8): tombol Stop meng-abort request; jawaban yang terpotong ditandai
 * "belum lengkap" dan TIDAK ikut disimpan sebagai jawaban penuh.
 */

/** Satu pesan percakapan — bentuknya sama dengan yang disimpan di riwayat. */
type Msg = HistoryMsg;

const SUGGESTIONS = [
  "Bagaimana kondisi operasional hari ini?",
  "Omset bulan ini berapa?",
  "Pesanan mana yang perlu dikirim?",
  "Produk apa saja yang stoknya menipis?",
];

function newSessionId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // diabaikan — jatuh ke id berbasis waktu
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Render sederhana: baris berpoin + **tebal**, tanpa dependency markdown. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        const bullet = /^\s*[-•]\s+(.*)$/.exec(line);
        const content = bullet ? bullet[1] : line;
        const parts = content.split(/\*\*(.+?)\*\*/g);
        return (
          <span key={i} className={bullet ? `${styles.aiLine} ${styles.aiBullet}` : styles.aiLine}>
            {parts.map((part, j) => (j % 2 === 1 ? <strong key={j}>{part}</strong> : <span key={j}>{part}</span>))}
          </span>
        );
      })}
    </>
  );
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const sessionIdRef = useRef("");
  const keysRef = useRef<StorageKeys | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Riwayat dipisah per akun admin (browser bersama tidak saling menimpa).
      let email: string | null = null;
      try {
        email = await sessionEmail();
      } catch {
        // sesi tidak terbaca → namespace "anon"; halaman ini tetap di balik gerbang login panel
      }
      if (cancelled) return;
      const keys = storageKeys(accountNs(email));
      keysRef.current = keys;

      try {
        let sid = localStorage.getItem(keys.session);
        let raw = localStorage.getItem(keys.history);

        // Migrasi sekali dari kunci lama (versi sebelum riwayat dipisah per akun).
        if (!sid && !raw) {
          const oldSid = localStorage.getItem(LEGACY_SESSION_KEY);
          const oldHistory = localStorage.getItem(LEGACY_HISTORY_KEY);
          if (oldSid) {
            sid = oldSid;
            localStorage.setItem(keys.session, oldSid);
          }
          if (oldHistory) {
            raw = oldHistory;
            localStorage.setItem(keys.history, oldHistory);
          }
        }

        if (!sid) sid = newSessionId();
        localStorage.setItem(keys.session, sid);
        sessionIdRef.current = sid;

        // Percakapan lama dipakai apa adanya. Kalau kosong (percakapan baru), Ara menyapa
        // sekali — sapaan ikut tersimpan sehingga tidak berulang saat refresh/pindah menu.
        setMessages(seedIfEmpty(parseHistory(raw), GREETING));
      } catch {
        // mode privat: sesi hanya hidup di memori
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Riwayat HANYA menyimpan jawaban yang lengkap (R8) dan tidak pernah disimpan saat
  // jawaban masih berjalan — supaya jawaban terpotong tidak terbaca sebagai jawaban penuh.
  useEffect(() => {
    if (!ready || busy) return;
    const keys = keysRef.current;
    if (!keys) return;
    try {
      localStorage.setItem(keys.history, JSON.stringify(completeMessages(messages)));
    } catch {
      // diabaikan
    }
  }, [messages, busy, ready]);

  // Tinggalkan halaman saat masih streaming → batalkan supaya tidak ada panggilan model
  // yang jalan sia-sia.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
    },
    []
  );

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  /** Tandai jawaban terakhir sebagai belum lengkap + tampilkan alasannya. */
  function markIncomplete(why: string) {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== "assistant") return prev;
      const copy = [...prev];
      copy[copy.length - 1] = { ...last, incomplete: true };
      return copy;
    });
    setNotice(why);
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setNotice("Dihentikan oleh Anda. Jawaban di atas belum lengkap.");
  }

  /**
   * Mulai percakapan kosong. Percakapan yang sedang berjalan TIDAK dihapus — diarsipkan dulu
   * di penyimpanan akun (belum ada UI daftar riwayat), lalu sesi baru dibuat supaya konteks
   * lanjutan tidak tercampur dengan percakapan lama.
   */
  function startNewConversation() {
    if (busy) return;
    const keys = keysRef.current;
    try {
      if (keys && hasUserTurn(messages)) {
        const entry = {
          at: new Date().toISOString(),
          sessionId: sessionIdRef.current,
          messages: completeMessages(messages),
        };
        localStorage.setItem(keys.archive, appendArchive(localStorage.getItem(keys.archive), entry));
        localStorage.setItem(keys.history, JSON.stringify([]));
      }
      const sid = newSessionId();
      sessionIdRef.current = sid;
      if (keys) localStorage.setItem(keys.session, sid);
    } catch {
      // mode privat: percakapan baru tetap jalan, hanya tidak tersimpan
    }
    // Percakapan baru dimulai lagi dengan sapaan Ara (sekali saja).
    setMessages(seedIfEmpty([], GREETING));
    setInput("");
    setError(null);
    setNotice(null);
    inputRef.current?.focus();
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;

    const history = [...messages, { role: "user" as const, content: question }];
    setMessages(history);
    setInput("");
    setBusy(true);
    setError(null);
    setNotice(null);

    const token = await authToken();
    if (!token) {
      setBusy(false);
      setError("Sesi admin tidak ditemukan. Muat ulang halaman lalu masuk kembali.");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/panel-ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: history.slice(-16), sessionId: sessionIdRef.current || null }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        let message = `Gagal menghubungi asisten (${res.status}).`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          // pakai pesan default
        }
        setError(message);
        return;
      }

      const render = (content: string) => {
        setMessages((prev) => {
          const base = prev[prev.length - 1]?.role === "assistant" ? prev.slice(0, -1) : prev;
          return [...base, { role: "assistant", content }];
        });
      };

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let serverNotice: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload) continue;

          let evt: { delta?: string; reset?: boolean; error?: string; notice?: string };
          try {
            evt = JSON.parse(payload) as typeof evt;
          } catch {
            continue;
          }

          if (evt.reset) acc = "";
          if (typeof evt.notice === "string") serverNotice = evt.notice;
          if (typeof evt.delta === "string") {
            acc += evt.delta;
            render(acc);
          }
          if (typeof evt.error === "string") {
            acc = acc || evt.error;
            render(acc);
          }
        }
      }

      if (!acc) {
        render("Maaf, tidak ada jawaban yang bisa ditampilkan. Coba tanya lagi.");
      } else if (serverNotice) {
        // Server menghentikan proses (batas waktu) → jawaban tidak diklaim lengkap.
        markIncomplete(serverNotice);
      }
    } catch (e) {
      // Pembatalan oleh admin dibedakan dari error jaringan/provider.
      if (e instanceof DOMException && e.name === "AbortError") {
        markIncomplete("Dihentikan oleh Anda. Jawaban di atas belum lengkap.");
      } else {
        setError("Koneksi ke asisten terputus. Coba lagi.");
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const activeQuestion = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  return (
    <div className={styles.aiWrap}>
      <div className={styles.aiHead}>
        <div className={styles.aiHeadText}>
          <h1 className={styles.aiTitle}>Asisten Operasional</h1>
          <p className={styles.aiSub}>
            Tanya kondisi toko dengan bahasa biasa. Asisten membaca data langsung dari database dan hanya bisa melihat — tidak mengubah apa pun.
          </p>
        </div>
        <button
          type="button"
          className={styles.aiNew}
          onClick={startNewConversation}
          disabled={busy || !hasUserTurn(messages)}
          title="Mulai percakapan kosong (percakapan sekarang tetap tersimpan)"
        >
          + Percakapan baru
        </button>
      </div>

      <div className={styles.aiLog} ref={listRef}>
        {messages.map((m, i) => (
          <div key={i} className={`${styles.aiRow} ${m.role === "user" ? styles.aiRowUser : ""}`}>
            <div className={`${styles.aiBubble} ${m.role === "user" ? styles.aiUser : styles.aiBot}`}>
              <RichText text={m.content} />
              {m.incomplete ? <span className={styles.aiTag}>belum lengkap</span> : null}
            </div>
          </div>
        ))}
        {busy ? (
          <div className={styles.aiRow}>
            <div className={`${styles.aiBubble} ${styles.aiBot}`}>{busyLabel(activeQuestion)}</div>
          </div>
        ) : null}
      </div>

      <div className={styles.aiChips}>
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className={styles.aiChip} disabled={busy} onClick={() => void send(s)}>
            {s}
          </button>
        ))}
      </div>

      {notice ? <p className={styles.aiNotice}>{notice}</p> : null}
      {error ? <p className={styles.aiError}>{error}</p> : null}

      <form
        className={styles.aiForm}
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <textarea
          ref={inputRef}
          className={styles.aiInput}
          rows={1}
          placeholder="Tulis pertanyaan operasional… (Enter kirim, Shift+Enter baris baru)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        {busy ? (
          <button className={styles.aiStop} type="button" onClick={stop}>
            Stop
          </button>
        ) : (
          <button className={styles.aiSend} type="submit" disabled={!input.trim()}>
            Kirim
          </button>
        )}
      </form>

      <p className={styles.aiNote}>
        Read-only · jawaban bisa salah, periksa menu terkait sebelum mengambil keputusan.
      </p>
    </div>
  );
}

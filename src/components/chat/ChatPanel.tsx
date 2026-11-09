"use client";

import { useEffect, useRef, useState } from "react";
import { X, Send, Loader2, Image as ImageIcon } from "lucide-react";
import { useSafeTranslations, useSafeLocale } from "@/lib/safe-i18n";
import { waNumber } from "@/lib/whatsapp";
import { validateMediaFile } from "@/lib/cloudinary";
import { uploadChatImage } from "@/lib/chat-upload";
import {
  HISTORY_KEY,
  SHOW_WHATSAPP_HANDOFF,
  SUGGESTION_KEYS,
  RobotIcon,
  renderRichText,
  type Msg,
} from "./shared";

/**
 * Panel chat yang berat (streaming, upload). Dimuat terpisah oleh
 * ChatWidget hanya saat pengunjung membuka chat atau saat idle.
 */
export default function ChatPanel({
  greeting,
  whatsapp,
  onClose,
}: {
  greeting: string;
  whatsapp: string;
  onClose: () => void;
}) {
  const t = useSafeTranslations("chat");
  const locale = useSafeLocale();

  // Riwayat chat TIDAK disimpan. Begitu panel ditutup/pindah halaman, percakapan hilang.
  const [messages, setMessages] = useState<Msg[]>(() => [
    { role: "assistant", content: greeting || t("greeting") },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [identityReady, setIdentityReady] = useState(false);
  const [identity, setIdentity] = useState({ name: "", phone: "" });
  const [identityForm, setIdentityForm] = useState({ name: "", phone: "" });
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef("");

  // ID sesi anonim supaya log percakapan bisa dikelompokkan per pengunjung.
  useEffect(() => {
    try {
      let sid = localStorage.getItem("samaqu_chat_sid");
      if (!sid) {
        sid =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem("samaqu_chat_sid", sid);
      }
      sessionIdRef.current = sid;
    } catch {
      sessionIdRef.current = "";
    }
  }, []);

  // Identitas ringan (tanpa daftar/login). Disimpan supaya tidak ditanya lagi.
  useEffect(() => {
    try {
      const name = localStorage.getItem("samaqu_chat_name") || "";
      const phone = localStorage.getItem("samaqu_chat_phone") || "";
      const skipped = localStorage.getItem("samaqu_chat_identity_skipped") === "1";
      if (name || phone || skipped) {
        setIdentity({ name, phone });
        setIdentityForm({ name, phone });
        setIdentityReady(true);
      }
    } catch {
      setIdentityReady(true);
    }
  }, []);

  function startIdentity(skip = false) {
    const name = identityForm.name.trim().slice(0, 80);
    const phone = identityForm.phone.replace(/[^\d+]/g, "").slice(0, 20);
    setIdentity({ name, phone });
    try {
      if (!skip) {
        localStorage.setItem("samaqu_chat_name", name);
        localStorage.setItem("samaqu_chat_phone", phone);
      }
      localStorage.setItem("samaqu_chat_identity_skipped", skip ? "1" : "0");
    } catch {
      // storage diblokir — identitas tetap dipakai untuk sesi ini
    }
    setIdentityReady(true);
  }

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Bersihkan riwayat lama yang sempat tersimpan di browser pengunjung.
  useEffect(() => {
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      // storage diblokir / mode privat → tidak ada yang perlu dibersihkan
    }
  }, []);

  async function handleImageFile(file: File | null | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      await validateMediaFile(file);
      const url = await uploadChatImage(file);
      setImageUrl(url);
    } catch (e) {
      console.error("[CHAT] Gagal mengunggah gambar:", e);
      setMessages((m) => [...m, { role: "assistant", content: t("imageError") }]);
    } finally {
      setUploading(false);
    }
  }

  async function send(textOverride?: string, productId?: string) {
    if (!identityReady) return;
    const text = (textOverride ?? input).trim();
    if ((!text && !imageUrl) || loading || uploading) return;

    const sentImage = imageUrl || undefined;
    const history: Msg[] = [
      ...messages,
      { role: "user", content: text, images: sentImage ? [sentImage] : undefined },
    ];
    let cards: NonNullable<Msg["products"]> = [];
    let imgs: NonNullable<Msg["images"]> = [];
    const render = (content: string) =>
      setMessages([
        ...history,
        { role: "assistant", content, products: cards, images: imgs.length ? imgs : undefined },
      ]);
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setImageUrl(null);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          sessionId: sessionIdRef.current,
          locale,
          customerName: identity.name,
          customerPhone: identity.phone,
          ...(productId ? { productId } : {}),
        }),
      });

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        render(json.error || t("error"));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";

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

          let evt: { delta?: string; reset?: boolean; error?: string; done?: boolean; products?: Msg["products"]; images?: Msg["images"] };
          try {
            evt = JSON.parse(payload);
          } catch {
            continue;
          }

          if (evt.reset) acc = "";
          else if (Array.isArray(evt.products)) cards = evt.products;
          else if (Array.isArray(evt.images)) imgs = evt.images;
          else if (typeof evt.delta === "string") acc += evt.delta;
          else if (evt.error) acc = acc || evt.error;

          render(acc);
        }
      }

      if (!acc) render(t("error"));
    } catch {
      render(t("error"));
    } finally {
      setLoading(false);
    }
  }

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content;
  const handoffText = lastUserMessage
    ? `${t("handoffMessage")}\n\nPertanyaan saya: "${lastUserMessage}"`
    : t("handoffMessage");
  const waHref = whatsapp
    ? `https://wa.me/${waNumber(whatsapp)}?text=${encodeURIComponent(handoffText)}`
    : "";

  return (
    <div
      className="fixed z-[96] inset-0 sm:inset-auto sm:right-6 sm:left-auto sm:bottom-[calc(var(--mobile-nav-h)+1.5rem)] sm:w-[380px] sm:h-[min(560px,calc(100vh-6rem))] flex flex-col sm:rounded-2xl overflow-hidden shadow-2xl"
      style={{ background: "var(--bg, #fff)", border: "1px solid #e4e4e7" }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white shrink-0" style={{ background: "#000" }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,.15)" }}>
            <RobotIcon size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{t("title")}</p>
            <p className="text-[11px] opacity-80 truncate flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#4ade80" }} />
              {t("online")}
            </p>
          </div>
        </div>
        <button onClick={onClose} aria-label={t("close")} className="p-1 opacity-80 hover:opacity-100">
          <X size={18} />
        </button>
      </div>

      {!identityReady && (
        <div className="shrink-0 p-3 space-y-2 border-b" style={{ borderColor: "#ececec", background: "#fff" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--fg, #18181b)" }}>
            Biar admin bisa bantu
          </p>
          <p className="text-xs" style={{ color: "var(--fg3, #71717a)" }}>
            Isi nama & WhatsApp. Boleh dilewati.
          </p>
          <input
            value={identityForm.name}
            onChange={(e) => setIdentityForm((v) => ({ ...v, name: e.target.value }))}
            placeholder="Nama"
            className="w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid #e4e4e7", background: "#fff", color: "var(--fg, #18181b)" }}
          />
          <input
            value={identityForm.phone}
            onChange={(e) => setIdentityForm((v) => ({ ...v, phone: e.target.value }))}
            placeholder="No WhatsApp"
            inputMode="tel"
            className="w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid #e4e4e7", background: "#fff", color: "var(--fg, #18181b)" }}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => startIdentity(false)}
              className="flex-1 rounded-xl px-3 py-2 text-sm font-semibold text-white"
              style={{ background: "#000" }}
            >
              Mulai chat
            </button>
            <button
              type="button"
              onClick={() => startIdentity(true)}
              className="rounded-xl px-3 py-2 text-sm font-semibold"
              style={{ border: "1px solid #e4e4e7", color: "var(--fg2, #52525b)" }}
            >
              Lewati
            </button>
          </div>
        </div>
      )}

      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2" style={{ background: "var(--sub, #fafafa)" }}>
        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col gap-1.5 ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words ${
                m.role === "user" ? "text-white whitespace-pre-wrap" : "space-y-px"
              }`}
              style={
                m.role === "user"
                  ? { background: "#000" }
                  : { background: "#fff", color: "var(--fg, #18181b)", border: "1px solid #ececec" }
              }
            >
              {m.role === "user" ? (
                <>
                  {m.images?.map((u) => (
                    <img key={u} src={u} alt="" className="block rounded-lg max-h-48 w-auto mb-1.5" />
                  ))}
                  {m.content}
                </>
              ) : (
                <>
                  {m.images && m.images.length > 0 ? (
                    <div className="mb-1.5 flex flex-wrap gap-1.5">
                      {m.images.map((u) => (
                        <img
                          key={u}
                          src={u}
                          alt=""
                          loading="lazy"
                          className="block rounded-lg max-h-44 w-auto"
                        />
                      ))}
                    </div>
                  ) : null}
                  {renderRichText(m.content)}
                </>
              )}
            </div>
            {m.products && m.products.length > 0 && (
              <div className="w-full space-y-1.5">
                {m.products.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2.5 rounded-xl p-2"
                    style={{ background: "#fff", border: "1px solid #ececec" }}
                  >
                    {p.image ? (
                      <img src={p.image} alt={p.name} className="w-11 h-11 rounded-lg object-cover shrink-0" />
                    ) : (
                      <span className="w-11 h-11 rounded-lg shrink-0" style={{ background: "var(--sub, #fafafa)" }} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate" style={{ color: "var(--fg, #18181b)" }}>{p.name}</p>
                      <p className="text-[11px] font-medium" style={{ color: "var(--gold, #b08d57)" }}>
                        {p.cyp ? `Mulai Rp ${p.price.toLocaleString("id-ID")}` : `Rp ${p.price.toLocaleString("id-ID")}`}
                        <span style={{ color: "var(--fg3, #a1a1aa)" }}>
                          {" · "}
                          {p.series ? `${p.series} · ` : ""}
                          {p.category}
                        </span>
                      </p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <a
                        href={`/${locale}/katalog/${p.id}`}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                        style={{ background: "#000", color: "#fff" }}
                      >
                        {t("view")}
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          send(
                            `${t("askProductMsg")} ${p.name}${p.series ? ` series ${p.series}` : ""}`,
                            p.id,
                          )
                        }
                        className="text-[11px] font-medium px-2 py-0.5"
                        style={{ color: "var(--fg3, #a1a1aa)" }}
                      >
                        {t("askProduct")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && !messages[messages.length - 1]?.content && (
          <div className="flex justify-start">
            <div
              className="rounded-2xl px-3 py-2 text-xs flex items-center gap-1.5"
              style={{ background: "#fff", border: "1px solid #ececec", color: "var(--fg3, #a1a1aa)" }}
            >
              {t("typing")}
              <span className="inline-flex items-center gap-0.5">
                <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: "currentColor", animationDelay: "0ms" }} />
                <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: "currentColor", animationDelay: "150ms" }} />
                <span className="w-1 h-1 rounded-full animate-bounce" style={{ background: "currentColor", animationDelay: "300ms" }} />
              </span>
            </div>
          </div>
        )}
      </div>

      {!messages.some((m) => m.role === "user") && (
        <div className="shrink-0 flex gap-2 overflow-x-auto px-3 py-2 border-t" style={{ borderColor: "#ececec", background: "#fff" }}>
          {SUGGESTION_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => send(t(k))}
              className="whitespace-nowrap text-xs font-medium px-3 py-1.5 rounded-full"
              style={{ border: "1px solid #e4e4e7", color: "var(--fg2, #52525b)", background: "#fff" }}
            >
              {t(k)}
            </button>
          ))}
        </div>
      )}

      {SHOW_WHATSAPP_HANDOFF && waHref && (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-center text-xs font-semibold py-2 border-t"
          style={{ borderColor: "#ececec", color: "var(--espresso, #2b2118)", background: "#fff" }}
        >
          {t("handoff")}
        </a>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="shrink-0 border-t"
        style={{ borderColor: "#ececec", background: "#fff" }}
      >
        {imageUrl && (
          <div className="px-2 pt-2">
            <div className="relative inline-block">
              <img src={imageUrl} alt="" className="w-14 h-14 rounded-lg object-cover" style={{ border: "1px solid #e4e4e7" }} />
              <button
                type="button"
                onClick={() => setImageUrl(null)}
                aria-label={t("removeImage")}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white"
                style={{ background: "rgba(0,0,0,.7)" }}
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 p-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              handleImageFile(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={!identityReady || uploading || loading}
            aria-label={t("attach")}
            className="w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-40"
            style={{ border: "1px solid #e4e4e7", color: "var(--fg2, #52525b)" }}
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
          </button>

          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={!identityReady ? "Isi nama & WA dulu" : t("placeholder")}
            disabled={!identityReady}
            className="flex-1 rounded-xl px-3 py-2 text-sm outline-none disabled:opacity-60"
            style={{ border: "1px solid #e4e4e7", background: "#fff", color: "var(--fg, #18181b)" }}
          />
          <button
            type="submit"
            disabled={!identityReady || loading || uploading || (!input.trim() && !imageUrl)}
            aria-label={t("send")}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white disabled:opacity-40"
            style={{ background: "#000" }}
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}

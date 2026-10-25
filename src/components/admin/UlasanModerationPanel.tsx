"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CheckCircle, Loader2, Star, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

/**
 * Antrean moderasi ulasan customer.
 *
 * Dipakai halaman Ulasan Pelanggan di dashboard admin (dan nanti panel admin).
 * Testimoni kurasi lama tetap dikelola form terpisah; panel ini hanya menyentuh
 * baris `source = customer` lewat API admin.
 */

type ModerationItem = {
  id: string;
  customer_name: string;
  category: string | null;
  series_name: string | null;
  rating: number;
  verified: boolean;
  content: string;
  image_url: string | null;
  status: "pending" | "published" | "rejected";
  admin_note: string | null;
  created_at: string;
  order_id: string | null;
};

type Tab = "pending" | "published";

const TABS: { key: Tab; label: string }[] = [
  { key: "pending", label: "Menunggu" },
  { key: "published", label: "Tayang" },
];

async function authToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export default function UlasanModerationPanel() {
  const [tab, setTab] = useState<Tab>("pending");
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [counts, setCounts] = useState({ pending: 0, published: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [rejectTarget, setRejectTarget] = useState<ModerationItem | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async (status: Tab) => {
    setLoading(true);
    setError("");
    try {
      const token = await authToken();
      if (!token) {
        setError("Sesi admin tidak ditemukan. Muat ulang halaman lalu masuk lagi.");
        return;
      }
      const res = await fetch(`/api/admin/testimonials?status=${status}&limit=100`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error || "Gagal memuat ulasan.");
        return;
      }
      setItems((json?.items || []) as ModerationItem[]);
      setCounts({
        pending: json?.counts?.pending || 0,
        published: json?.counts?.published || 0,
        rejected: json?.counts?.rejected || 0,
      });
    } catch {
      setError("Gagal memuat ulasan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  async function act(item: ModerationItem, action: "approve" | "reject", reason = "") {
    if (busyId) return;
    setBusyId(item.id);
    setError("");
    setNotice("");
    try {
      const token = await authToken();
      if (!token) {
        setError("Sesi admin tidak ditemukan.");
        return;
      }
      const res = await fetch(`/api/admin/testimonials/${item.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, note: reason }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error || "Gagal menyimpan keputusan.");
        return;
      }
      setNotice(
        action === "approve"
          ? "Ulasan disetujui dan sekarang tampil di halaman Testimoni."
          : "Ulasan ditolak dan disembunyikan dari publik.",
      );
      setRejectTarget(null);
      setNote("");
      await load(tab);
    } catch {
      setError("Gagal menyimpan keputusan.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="mb-5 rounded-xl border p-4" style={{ background: "var(--card, #ffffff)", borderColor: "var(--bd, #e5e1d8)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold" style={{ color: "var(--espresso, #1f1b16)" }}>
            Ulasan Masuk
          </p>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted, #6b7280)" }}>
            Setujui ulasan pembeli sebelum tampil di halaman Testimoni.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "rgba(180,140,60,.14)", color: "var(--espresso, #1f1b16)" }}>
            {counts.pending} menunggu
          </span>
          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "rgba(42,33,27,.06)", color: "var(--stone, #57534e)" }}>
            {counts.published} tayang
          </span>
          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "rgba(42,33,27,.06)", color: "var(--stone, #57534e)" }}>
            {counts.rejected} ditolak
          </span>
        </div>
      </div>

      <div className="mt-3 flex gap-1.5">
        {TABS.map((option) => {
          const active = tab === option.key;
          const count = option.key === "pending" ? counts.pending : counts.published;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setTab(option.key)}
              className="rounded-lg px-3 py-1.5 text-[11.5px] font-bold transition"
              style={{
                background: active ? "var(--espresso, #1f1b16)" : "rgba(42,33,27,.06)",
                color: active ? "#fff" : "var(--stone, #57534e)",
              }}
            >
              {option.label} ({count})
            </button>
          );
        })}
      </div>

      {notice ? (
        <p className="mt-3 rounded-lg px-3 py-2 text-[11.5px] font-semibold" style={{ background: "rgba(34,120,80,.10)", color: "#1d6b47" }}>
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-lg px-3 py-2 text-[11.5px] font-semibold" style={{ background: "rgba(180,40,40,.08)", color: "#a12a2a" }}>
          {error}
        </p>
      ) : null}

      <div className="mt-3 space-y-2.5">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin" style={{ color: "var(--gold, #b08d57)" }} />
          </div>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-[12px]" style={{ color: "var(--text-muted, #6b7280)" }}>
            {tab === "pending" ? "Tidak ada ulasan yang menunggu." : "Belum ada ulasan tayang dari customer."}
          </p>
        ) : (
          items.map((item) => {
            const busy = busyId === item.id;
            return (
              <div key={item.id} className="rounded-xl border p-3" style={{ borderColor: "var(--bd, #e5e1d8)" }}>
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold" style={{ background: "var(--espresso, #1f1b16)", color: "var(--gold, #b08d57)" }}>
                    {item.customer_name.split(" ").map((word) => word[0]).join("").slice(0, 2).toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-[12.5px] font-bold" style={{ color: "var(--espresso, #1f1b16)" }}>
                        {item.customer_name}
                      </p>
                      {item.verified ? <CheckCircle size={12} style={{ color: "var(--gold, #b08d57)" }} /> : null}
                      {item.category ? (
                        <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: "#f4f4f5", color: "var(--gold, #b08d57)" }}>
                          {item.category}
                        </span>
                      ) : null}
                      {item.series_name ? (
                        <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: "rgba(42,33,27,.06)", color: "var(--stone, #57534e)" }}>
                          {item.series_name}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="flex gap-0.5">
                        {Array.from({ length: 5 }, (_, index) => (
                          <Star
                            key={index}
                            size={11}
                            fill={index < item.rating ? "var(--gold, #b08d57)" : "none"}
                            stroke="var(--gold, #b08d57)"
                          />
                        ))}
                      </span>
                      <span className="text-[10px]" style={{ color: "var(--text-muted, #6b7280)" }}>
                        {dateLabel(item.created_at)}
                      </span>
                    </div>

                    <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed" style={{ color: "var(--text-secondary, #4b5563)" }}>
                      {item.content}
                    </p>

                    {item.image_url ? (
                      <a href={item.image_url} target="_blank" rel="noreferrer" className="mt-2 inline-block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.image_url} alt="Foto ulasan" className="h-20 w-20 rounded-lg object-cover" />
                      </a>
                    ) : null}

                    {item.status === "published" && item.admin_note ? (
                      <p className="mt-1.5 text-[10.5px]" style={{ color: "var(--text-muted, #6b7280)" }}>
                        Catatan: {item.admin_note}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col gap-1.5">
                    {item.status === "pending" ? (
                      <>
                        <button
                          type="button"
                          disabled={Boolean(busyId)}
                          onClick={() => act(item, "approve")}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold text-white transition disabled:opacity-50"
                          style={{ background: "#1d6b47" }}
                        >
                          {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          Setujui
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busyId)}
                          onClick={() => { setRejectTarget(item); setNote(""); }}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition disabled:opacity-50"
                          style={{ borderColor: "rgba(180,40,40,.35)", color: "#a12a2a" }}
                        >
                          <X size={12} /> Tolak
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={Boolean(busyId)}
                        onClick={() => { setRejectTarget(item); setNote(""); }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition disabled:opacity-50"
                        style={{ borderColor: "var(--bd, #e5e1d8)", color: "var(--stone, #57534e)" }}
                      >
                        Tarik
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {rejectTarget ? (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-[420px] rounded-2xl p-4" style={{ background: "var(--card, #ffffff)" }}>
            <p className="text-sm font-bold" style={{ color: "var(--espresso, #1f1b16)" }}>
              {rejectTarget.status === "pending" ? "Tolak ulasan?" : "Tarik ulasan dari publik?"}
            </p>
            <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted, #6b7280)" }}>
              Ulasan tidak akan tampil di halaman Testimoni. Alasan boleh dikosongkan.
            </p>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 500))}
              rows={3}
              placeholder="Alasan untuk pelanggan (opsional)"
              className="mt-3 w-full resize-none rounded-xl border px-3 py-2 text-[12.5px] outline-none"
              style={{ borderColor: "var(--bd, #e5e1d8)", background: "var(--cream, #fdfbf7)" }}
            />
            {error ? (
              <p className="mt-2 rounded-lg px-3 py-2 text-[11.5px] font-semibold" style={{ background: "rgba(180,40,40,.08)", color: "#a12a2a" }}>
                {error}
              </p>
            ) : null}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                disabled={Boolean(busyId)}
                className="rounded-lg border px-3.5 py-2 text-[12px] font-bold disabled:opacity-50"
                style={{ borderColor: "var(--bd, #e5e1d8)", color: "var(--stone, #57534e)" }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => act(rejectTarget, "reject", note)}
                disabled={Boolean(busyId)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12px] font-bold text-white disabled:opacity-50"
                style={{ background: "#a12a2a" }}
              >
                {busyId ? <Loader2 size={12} className="animate-spin" /> : null}
                {rejectTarget.status === "pending" ? "Tolak" : "Tarik"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

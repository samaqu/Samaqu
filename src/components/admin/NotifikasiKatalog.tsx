"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Loader2, RotateCcw, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";

/**
 * Pratinjau + editor SEMUA notifikasi WhatsApp sistem — panel "Template Notif".
 *
 * Logic data TIDAK berubah: GET/PUT `/api/admin/notifikasi`, tabel `notifikasi_template`,
 * dan `buildNotifikasi()` di server tetap sama. Yang berubah hanya tampilan/interaksi:
 * tab per template, chip variabel yang bisa diklik, warning, dan live preview.
 *
 * Template mentah memakai penanda `{nama}`, `{nomor}`, `{resi}`, dst. `{nama}` SUDAH berisi
 * sapaan lengkap ("Ka Agus", atau "Ust. Irsan" kalau namanya diawali gelar), jadi template
 * menulis "Halo {nama}" — bukan "Halo Ka {nama}".
 */

type Item = {
  key: string;
  label: string;
  ke: "Pembeli" | "Admin";
  kapan: string;
  isi: string;
  /** Teks mentah dengan penanda — isi awal editor. */
  template: string;
  /** Teks pengganti yang tersimpan (kosong = belum pernah diubah). */
  override: string;
  aktif: boolean;
};

/** Arti setiap penanda template. Dipakai chip + tooltip di panel. */
const PENANDA_INFO: Record<string, { label: string; contoh: string }> = {
  nama: { label: "Sapaan + nama depan", contoh: "Ka Agus" },
  nomor: { label: "Nomor pesanan", contoh: "SMQ-20261019-928" },
  resi: { label: "Nomor resi J&T", contoh: "JO0330121411" },
  wa: { label: "Nomor WhatsApp pelanggan", contoh: "08123456789" },
  pembayaran: { label: "Metode pembayaran", contoh: "Transfer Bank (BSI)" },
  total: { label: "Total pembayaran", contoh: "Rp379.000" },
  subtotal: { label: "Subtotal produk", contoh: "Rp354.000" },
  ongkir: { label: "Ongkos kirim", contoh: "Rp25.000" },
  diskon: { label: "Diskon", contoh: "Rp0" },
  status: { label: "Status pembayaran", contoh: "Belum Lunas" },
  daftar_produk: { label: "Daftar produk (satu baris per item)", contoh: "- Thobe Jiharkah Series Soft Grey Kain A-02 size L x1 — Rp354.000" },
  blok_rekening: { label: "Daftar rekening aktif", contoh: "*Pembayaran BANK BSI*\n7153280058\na.n. Ardo Babus Abdullah" },
  instruksi_pembayaran: { label: "Instruksi pembayaran", contoh: "Transfer ke rekening ..." },
  info_tambahan: { label: "Info tambahan pesanan", contoh: "Tujuan: ...\nSumber: Website" },
  tautan_admin: { label: "Link panel admin", contoh: "https://www.samaqu.id/admin?panel=orders" },
  alasan: { label: "Alasan pembatalan", contoh: "Stok habis" },
  info_refund: { label: "Info refund", contoh: "Refund diproses 1–3 hari kerja" },
  nama_rekening: { label: "Nama pemilik rekening", contoh: "Ardo Babus Abdullah" },
};

/** Data contoh HANYA untuk preview — tidak pernah ikut disimpan/dikirim. */
const SAMPLE: Record<string, string> = {
  nama: "Ka Agus",
  nomor: "SMQ-20261019-928",
  resi: "JO0330121411",
  wa: "08123456789",
  pembayaran: "Transfer Bank (BSI)",
  total: "Rp379.000",
  subtotal: "Rp354.000",
  ongkir: "Rp25.000",
  diskon: "Rp0",
  status: "Belum Lunas",
  daftar_produk: "- Thobe Jiharkah Series Soft Grey Kain A-02 size L x1 — Rp354.000",
  blok_rekening: "*Pembayaran BANK BSI*\n7153280058\na.n. Ardo Babus Abdullah",
  instruksi_pembayaran: "Transfer ke rekening ...",
  info_tambahan: "Tujuan: ...\nSumber: Website",
  tautan_admin: "https://www.samaqu.id/admin?panel=orders",
  alasan: "Stok habis",
  info_refund: "Refund diproses 1–3 hari kerja",
  nama_rekening: "Ardo Babus Abdullah",
};

/** Isi penanda dengan data contoh; penanda tak dikenal dibiarkan apa adanya. */
function renderPreview(text: string): string {
  return String(text ?? "").replace(/\{([a-zA-Z0-9_]+)\}/g, (whole, key: string) => SAMPLE[key] ?? whole);
}

/** Daftar penanda unik di sebuah teks, urut kemunculan. */
function daftarPenanda(text: string): string[] {
  return [...new Set([...String(text ?? "").matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]))];
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` };
}

export default function NotifikasiKatalog() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pesan, setPesan] = useState("");
  const [tersalin, setTersalin] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);
  const [activeKey, setActiveKey] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [hoverPenanda, setHoverPenanda] = useState("");
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notifikasi", { headers: await authHeaders() });
      const json = (await res.json()) as { items?: Item[]; error?: string };
      if (!res.ok) throw new Error(json.error || "Gagal memuat daftar notifikasi");
      const nextItems = json.items || [];
      setItems(nextItems);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const item of nextItems) {
          // Jangan menimpa draft yang belum disimpan saat panel dimuat ulang.
          if (!(item.key in next)) next[item.key] = item.override || item.template;
        }
        return next;
      });
      setActiveKey((current) =>
        current && nextItems.some((item) => item.key === current) ? current : nextItems[0]?.key || "",
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat daftar notifikasi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeItem = items.find((item) => item.key === activeKey) || null;
  const draft = activeItem ? drafts[activeItem.key] ?? "" : "";
  const savedValue = activeItem ? activeItem.override || activeItem.template : "";
  const dirty = Boolean(activeItem) && draft !== savedValue;
  const penandaTersedia = useMemo(
    () => (activeItem ? daftarPenanda(activeItem.template) : []),
    [activeItem],
  );
  const penandaDiDraf = useMemo(() => daftarPenanda(draft), [draft]);
  const penandaTidakDikenal = useMemo(
    () => penandaDiDraf.filter((nama) => !PENANDA_INFO[nama]),
    [penandaDiDraf],
  );
  const dobelKa = /Ka\s*\{nama\}/i.test(draft);
  const preview = useMemo(() => renderPreview(draft), [draft]);
  const infoHover = hoverPenanda ? PENANDA_INFO[hoverPenanda] : null;

  // Daftar pilihan template: dikelompokkan per penerima, tanpa scroll samping.
  const templateGroups = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of items) {
      const key = item.ke === "Admin" ? "Admin" : item.ke === "Pembeli" ? "Pembeli" : "Lainnya";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    const labels: Record<string, string> = {
      Pembeli: "Untuk Pelanggan",
      Admin: "Untuk Admin",
      Lainnya: "Template",
    };
    return ["Pembeli", "Admin", "Lainnya"]
      .filter((key) => map.has(key))
      .map((key) => ({ key, label: labels[key], items: map.get(key)! }));
  }, [items]);

  function updateDraft(value: string) {
    if (!activeItem) return;
    setDrafts((prev) => ({ ...prev, [activeItem.key]: value }));
  }

  /** Sisipkan penanda di posisi kursor; teks yang diblok ikut diganti. */
  function insertPenanda(nama: string) {
    if (!activeItem) return;
    const token = `{${nama}}`;
    const el = editorRef.current;
    if (!el) {
      updateDraft(draft + token);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    setDrafts((prev) => ({ ...prev, [activeItem.key]: next }));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function salin() {
    try {
      await navigator.clipboard.writeText(draft);
      setTersalin(true);
      setTimeout(() => setTersalin(false), 1800);
    } catch {
      setError("Gagal menyalin — browser menolak akses clipboard.");
    }
  }

  async function simpan(item: Item, body: string) {
    setMenyimpan(true);
    setPesan("");
    try {
      const res = await fetch("/api/admin/notifikasi", {
        method: "PUT",
        headers: await authHeaders(),
        body: JSON.stringify({ key: item.key, body }),
      });
      const json = (await res.json()) as { error?: string; kembaliKeBawaan?: boolean };
      if (!res.ok) throw new Error(json.error || "Gagal menyimpan template");
      setPesan(
        json.kembaliKeBawaan
          ? `Template "${item.label}" kembali ke teks bawaan sistem.`
          : `Template "${item.label}" tersimpan dan langsung dipakai untuk pesan berikutnya.`,
      );
      // Samakan draft dengan nilai yang disimpan server (server men-trim body).
      setDrafts((prev) => ({
        ...prev,
        [item.key]: body.trim() ? body.trim() : item.template,
      }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan template");
    } finally {
      setMenyimpan(false);
    }
  }

  /** Kembalikan ke default: kalau ada versi tersimpan, hapus; kalau belum, isi editor dengan teks bawaan. */
  async function kembalikanDefault(item: Item) {
    const yakin = window.confirm(
      `Kembalikan "${item.label}" ke teks bawaan sistem? Perubahan yang pernah disimpan akan hilang.`,
    );
    if (!yakin) return;
    if (item.override) {
      await simpan(item, "");
      return;
    }
    setDrafts((prev) => ({ ...prev, [item.key]: item.template }));
    setPesan(`Isi editor "${item.label}" sudah kembali ke teks bawaan sistem.`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--espresso)" }}>
            Atur isi pesan otomatis
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Pilih template, edit pesannya, lalu simpan. Penanda diisi otomatis saat notifikasi dikirim.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading || menyimpan}
          className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          style={{ borderColor: "rgba(0,0,0,.12)", color: "var(--text-secondary)" }}
        >
          Muat ulang
        </button>
      </div>

      {pesan ? <p className="text-sm text-emerald-700">{pesan}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 size={14} className="animate-spin" /> Memuat daftar notifikasi…
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Belum ada template notifikasi.
        </p>
      ) : (
        <>
          {/* Tab per template — wrap per kelompok, tanpa scroll samping */}
          <div className="space-y-3">
            {templateGroups.map((group) => (
              <div key={group.key}>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.items.map((item) => {
                    const active = item.key === activeKey;
                    const recipient = item.ke === "Admin" ? "Admin" : "Pelanggan";
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          setActiveKey(item.key);
                          setHoverPenanda("");
                          setPesan("");
                        }}
                        title={item.label}
                        style={{ flex: "1 1 180px" }}
                        className={`flex min-h-[52px] min-w-0 max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1 ${
                          active
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">
                          {item.label}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                              active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {recipient}
                          </span>
                          {item.override ? (
                            <span
                              className={`h-2 w-2 shrink-0 rounded-full ${
                                active ? "bg-amber-300" : "bg-amber-500"
                              }`}
                              title="Template sudah diubah"
                            />
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {activeItem ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                  style={{ borderColor: "rgba(0,0,0,.12)", color: "var(--text-secondary)" }}
                >
                  {activeItem.ke}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    activeItem.aktif ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {activeItem.aktif ? "aktif" : "belum aktif"}
                </span>
                {activeItem.override ? (
                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                    teks diubah
                  </span>
                ) : null}
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {activeItem.kapan}
                </span>
              </div>

              <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
                <div className="card p-5 space-y-4">
                  <div>
                    <label
                      htmlFor="template-notif-editor"
                      className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Template pesan
                    </label>
                    <textarea
                      id="template-notif-editor"
                      ref={editorRef}
                      value={draft}
                      onChange={(event) => updateDraft(event.target.value)}
                      rows={14}
                      spellCheck={false}
                      placeholder="Tulis template di sini…"
                      className="w-full rounded-xl border px-3 py-2.5 font-mono text-xs leading-relaxed outline-none focus:ring-2"
                      style={{
                        borderColor: "rgba(0,0,0,.15)",
                        background: "#fff",
                        color: "var(--espresso)",
                      }}
                    />
                  </div>

                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                      Variabel — klik untuk sisipkan di posisi kursor
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {penandaTersedia.map((nama) => {
                        const info = PENANDA_INFO[nama];
                        return (
                          <button
                            key={nama}
                            type="button"
                            onClick={() => insertPenanda(nama)}
                            onMouseEnter={() => setHoverPenanda(nama)}
                            onMouseLeave={() => setHoverPenanda("")}
                            onFocus={() => setHoverPenanda(nama)}
                            onBlur={() => setHoverPenanda("")}
                            title={`${info?.label || "Penanda sistem"} — contoh: ${info?.contoh || "—"}`}
                            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                          >
                            {`{${nama}}`}
                          </button>
                        );
                      })}
                    </div>

                    <div
                      className="mt-2 rounded-lg border px-3 py-2 text-[11px]"
                      style={{ borderColor: "rgba(0,0,0,.08)", background: "rgba(0,0,0,.015)", color: "var(--text-muted)" }}
                    >
                      {infoHover ? (
                        <>
                          <p>
                            <b style={{ color: "var(--espresso)" }}>{`{${hoverPenanda}}`}</b>{" "}
                            — {infoHover.label}
                          </p>
                          <p className="mt-0.5" style={{ whiteSpace: "pre-line" }}>
                            Contoh: {infoHover.contoh}
                          </p>
                          {hoverPenanda === "nama" ? (
                            <p className="mt-1 font-semibold text-amber-700">
                              Sudah termasuk "Ka". Jangan tulis "Ka {"{nama}"}" lagi.
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <p>Klik variabel untuk menyisipkan. Arahkan kursor untuk melihat arti & contoh.</p>
                      )}
                    </div>

                    {dobelKa ? (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                        <b>Perhatian:</b> template berisi <code>Ka {"{nama}"}</code>.{" "}
                        <code>{"{nama}"}</code> sudah termasuk "Ka", jadi hasilnya dobel. Tulis{" "}
                        <code>Halo {"{nama}"}</code> saja.
                      </div>
                    ) : null}

                    {penandaTidakDikenal.length > 0 ? (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                        <b>Penanda tidak dikenal:</b>{" "}
                        {penandaTidakDikenal.map((nama) => `{${nama}}`).join(", ")}. Cek ejaan sebelum menyimpan.
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => simpan(activeItem, draft)}
                      disabled={!dirty || menyimpan}
                      className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {menyimpan ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                      {menyimpan ? "Menyimpan…" : dirty ? "Simpan" : "Tersimpan"}
                    </button>
                    <button
                      type="button"
                      onClick={() => kembalikanDefault(activeItem)}
                      disabled={menyimpan || (!activeItem.override && draft === activeItem.template)}
                      className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"
                      style={{ borderColor: "rgba(0,0,0,.12)", color: "var(--text-secondary)" }}
                    >
                      <RotateCcw size={13} /> Kembalikan ke default
                    </button>
                    <button
                      type="button"
                      onClick={salin}
                      disabled={!draft}
                      className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"
                      style={{ borderColor: "rgba(0,0,0,.12)", color: "var(--text-secondary)" }}
                    >
                      <Copy size={13} /> {tersalin ? "Tersalin" : "Salin"}
                    </button>
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Langsung dipakai untuk pesan berikutnya.
                    </span>
                  </div>
                </div>

                <aside className="card p-4 lg:sticky lg:top-24">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                      Pratinjau WhatsApp
                    </p>
                    <span
                      className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                      style={{ borderColor: "rgba(0,0,0,.1)", color: "var(--text-muted)" }}
                    >
                      data contoh
                    </span>
                  </div>
                  <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Tampilan saja — contoh ini tidak ikut disimpan atau dikirim.
                  </p>
                  <div
                    className="mt-3 rounded-2xl rounded-tl-md bg-[#DCF8C6] px-4 py-3 text-[13px] leading-relaxed text-[#111B21] shadow-sm"
                    style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  >
                    {preview || "Pratinjau akan muncul di sini."}
                  </div>
                </aside>
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

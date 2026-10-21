"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePanelSidebarCollapsed } from "@/lib/use-panel-sidebar";
import {
  OPNAME_REASONS,
  OPNAME_SIZES,
  OPNAME_STATUS,
  displayColor,
  formatRupiah,
  reasonLabel,
  type OpnameStatus,
} from "@/lib/stock-opname";

/**
 * Halaman hitung Stok Opname.
 *
 * Satu baris = satu produk × warna; tiap sel ukuran menampilkan angka stok sistem kecil
 * di atas dan kotak hitungan fisik di bawahnya (pola tabel Laporan Stok). Baris stok
 * sharing hanya info dan dikunci — hitung di baris induknya.
 */

type Line = {
  id: string;
  product_id: string;
  product_name: string;
  sku: string | null;
  category: string | null;
  jenis_kain: string | null;
  series: string | null;
  color: string;
  size: string;
  system_stock: number;
  counted_stock: number | null;
  reason: string | null;
  reason_note: string | null;
  price: number;
  is_derived: boolean;
  base_product_id: string | null;
  base_product_name: string | null;
  applied?: boolean;
};

type Session = {
  id: string;
  code: string;
  status: OpnameStatus;
  created_at: string;
  notes: string | null;
  reject_reason: string | null;
  created_by_name: string | null;
  reviewed_by_name: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
};

type LiveRow = { product_id: string; color: string; size: string; stock: number };

/** Satu baris riwayat penyesuaian yang sudah diterapkan (dari `stock_movements`). */
type AppliedMovement = {
  id: string;
  product_id: string;
  color: string | null;
  size: string | null;
  qty: number;
  direction: "in" | "out";
  before_stock: number | null;
  after_stock: number | null;
  actor_name: string | null;
  notes: string | null;
  created_at: string;
};

/** Baris yang ditahan saat approve karena stok akhirnya bakal negatif. */
type BlockedRow = {
  product_name?: string;
  color?: string;
  size?: string;
  system_stock?: number;
  counted_stock?: number;
  current_stock?: number;
  final_stock?: number;
};

/** Latar sel ala spreadsheet: lembut, garis grid tetap terlihat. */
const CELL_BG: Record<string, string> = {
  belum: "bg-white",
  cocok: "bg-emerald-50",
  kurang: "bg-red-50",
  lebih: "bg-orange-50",
  info: "bg-gray-100",
};

function statusPill(status: OpnameStatus) {
  const tone = OPNAME_STATUS[status]?.tone || "draft";
  const style: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    ok: "bg-emerald-100 text-emerald-800",
  };
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${style[tone]}`}>
      {OPNAME_STATUS[status]?.label || status}
    </span>
  );
}

type ProductRow = {
  key: string;
  product_id: string;
  product_name: string;
  sku: string;
  category: string;
  jenis_kain: string;
  series: string;
  color: string;
  is_derived: boolean;
  base_product_name: string;
  cells: Record<string, Line>;
};

export default function StokOpnameDetail({
  sessionId,
  basePath,
}: {
  sessionId: string;
  basePath: string;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [live, setLive] = useState<LiveRow[]>([]);
  const [movements, setMovements] = useState<AppliedMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  /** Sidebar panel admin terlipat → ruang tabel lebih lega (kolom Produk & Fisik ikut lebar). */
  const sidebarCollapsed = usePanelSidebarCollapsed();
  const [busy, setBusy] = useState(false);

  const [counts, setCounts] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const [search, setSearch] = useState("");
  const [kategori, setKategori] = useState("all");
  const [kain, setKain] = useState("all");
  const [series, setSeries] = useState("all");
  const [onlyUncounted, setOnlyUncounted] = useState(false);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  /** Baris yang membuat approve ditahan (stok akhirnya bakal negatif). */
  const [blockedRows, setBlockedRows] = useState<BlockedRow[]>([]);
  /** Fokus antar sel ala spreadsheet (Enter / panah bawah / panah atas). */
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session: auth } } = await supabase.auth.getSession();
      const res = await fetch(`/api/ops/stock-opname?id=${encodeURIComponent(sessionId)}`, {
        headers: auth?.access_token ? { Authorization: `Bearer ${auth.access_token}` } : undefined,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Gagal memuat sesi.");
      setSession(json.session);
      setLines(json.lines || []);
      setLive(json.live || []);
      setMovements(json.movements || []);
      const nextCounts: Record<string, string> = {};
      const nextReasons: Record<string, string> = {};
      const nextNotes: Record<string, string> = {};
      for (const line of json.lines || []) {
        if (line.counted_stock !== null && line.counted_stock !== undefined) {
          nextCounts[line.id] = String(line.counted_stock);
        }
        if (line.reason) nextReasons[line.id] = line.reason;
        if (line.reason_note) nextNotes[line.id] = line.reason_note;
      }
      setCounts(nextCounts);
      setReasons(nextReasons);
      setNotes(nextNotes);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat sesi.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  const readOnly = session ? session.status !== "draft" : true;

  // ── Baris tabel: satu produk × warna ──────────────────────────────────────
  const rows = useMemo<ProductRow[]>(() => {
    const map = new Map<string, ProductRow>();
    for (const line of lines) {
      const key = `${line.product_id}|${line.color}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          product_id: line.product_id,
          product_name: line.product_name,
          sku: line.sku || "",
          category: line.category || "",
          jenis_kain: line.jenis_kain || "",
          series: line.series || "",
          color: line.color,
          is_derived: line.is_derived,
          base_product_name: line.base_product_name || "",
          cells: {},
        });
      }
      const row = map.get(key) as ProductRow;
      if (!row.sku && line.sku) row.sku = line.sku;
      row.cells[line.size.toUpperCase()] = line;
    }
    return Array.from(map.values());
  }, [lines]);

  const sizeColumns = useMemo(() => {
    const found = new Set<string>();
    for (const line of lines) if (line.size) found.add(line.size.toUpperCase());
    const standard = OPNAME_SIZES.filter((s) => found.has(s));
    const extra = Array.from(found).filter((s) => !OPNAME_SIZES.includes(s as any)).sort();
    return [...standard, ...extra];
  }, [lines]);

  const options = useMemo(() => {
    const pick = (getter: (r: ProductRow) => string) =>
      Array.from(new Set(rows.map(getter).filter(Boolean))).sort((a, b) => a.localeCompare(b, "id"));
    return { kategori: pick((r) => r.category), kain: pick((r) => r.jenis_kain), series: pick((r) => r.series) };
  }, [rows]);

  const countedValue = (line: Line): number | null => {
    const raw = counts[line.id];
    if (raw === undefined || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };

  const lineStateOf = (line: Line) => {
    if (line.is_derived) return "info";
    const value = countedValue(line);
    if (value === null) return "belum";
    const diff = value - Number(line.system_stock);
    if (diff === 0) return "cocok";
    return diff < 0 ? "kurang" : "lebih";
  };

  const diffOf = (line: Line): number | null => {
    const value = countedValue(line);
    if (value === null) return null;
    return value - Number(line.system_stock);
  };

  // ── Ringkasan progress & nilai ───────────────────────────────────────────
  const summary = useMemo(() => {
    const countable = lines.filter((l) => !l.is_derived);
    let dihitung = 0;
    let selisih = 0;
    let nilai = 0;
    let kurang = 0;
    let lebih = 0;
    for (const line of countable) {
      const value = countedValue(line);
      if (value === null) continue;
      dihitung += 1;
      const diff = value - Number(line.system_stock);
      if (diff !== 0) {
        selisih += 1;
        nilai += diff * (Number(line.price) || 0);
        if (diff < 0) kurang += Math.abs(diff);
        else lebih += diff;
      }
    }
    return { total: countable.length, dihitung, selisih, nilai, kurang, lebih };
  }, [lines, counts]);

  const progress = summary.total > 0 ? Math.round((summary.dihitung / summary.total) * 100) : 0;

  const movementCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of live) map.set(`${row.product_id}|${String(row.color || "default").toLowerCase()}|${row.size}`, Number(row.stock) || 0);
    let count = 0;
    for (const line of lines) {
      if (line.is_derived) continue;
      const current = map.get(`${line.product_id}|${String(line.color).toLowerCase()}|${line.size}`);
      if (current !== undefined && current !== Number(line.system_stock)) count += 1;
    }
    return count;
  }, [lines, live]);

  /**
   * Baris yang stok terkini-nya sudah berbeda dari snapshot (ada transaksi selama proses
   * hitung). Ditampilkan di layar approval beserta stok akhir setelah penyesuaian:
   * akhir = terkini + (fisik − snapshot).
   */
  const movementRows = useMemo(() => {
    if (session?.status !== "draft") return [];
    const map = new Map<string, number>();
    for (const row of live) {
      map.set(`${row.product_id}|${String(row.color || "default").toLowerCase()}|${row.size}`, Number(row.stock) || 0);
    }
    const out: {
      key: string;
      name: string;
      color: string;
      size: string;
      snapshot: number;
      current: number;
      final: number;
    }[] = [];
    for (const line of lines) {
      if (line.is_derived) continue;
      if (line.counted_stock === null || line.counted_stock === undefined) continue;
      const current = map.get(`${line.product_id}|${String(line.color).toLowerCase()}|${line.size}`);
      if (current === undefined || current === Number(line.system_stock)) continue;
      out.push({
        key: line.id,
        name: line.product_name,
        color: line.color,
        size: line.size,
        snapshot: Number(line.system_stock),
        current,
        final: current + (Number(line.counted_stock) - Number(line.system_stock)),
      });
    }
    return out;
  }, [lines, live, session]);

  // ── Filter ───────────────────────────────────────────────────────────────
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (kategori !== "all" && row.category !== kategori) return false;
      if (kain !== "all" && row.jenis_kain !== kain) return false;
      if (series !== "all" && row.series !== series) return false;
      if (q) {
        const hay = `${row.product_name} ${row.jenis_kain} ${row.series} ${row.sku} ${row.color}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const cells = Object.values(row.cells).filter((c) => !c.is_derived);
      if (onlyUncounted && cells.length > 0 && !cells.some((c) => countedValue(c) === null)) return false;
      if (onlyDiff && !cells.some((c) => diffOf(c) !== null && diffOf(c) !== 0)) return false;
      return true;
    });
  }, [rows, search, kategori, kain, series, onlyUncounted, onlyDiff, counts]);

  /**
   * Kolom ukuran yang benar-benar dipakai baris yang sedang tampil. Kategori tanpa ukuran
   * (mis. Cover & Hanger) otomatis hanya menampilkan ALL SIZE — tidak ada kolom kosong.
   */
  const visibleSizes = useMemo(() => {
    const found = new Set<string>();
    for (const row of visibleRows) for (const size of Object.keys(row.cells)) found.add(size);
    if (found.size === 0) return sizeColumns;
    const standard = OPNAME_SIZES.filter((s) => found.has(s));
    const extra = Array.from(found)
      .filter((s) => !OPNAME_SIZES.includes(s as any))
      .sort();
    return [...standard, ...extra];
  }, [visibleRows, sizeColumns]);

  /** Pindah fokus ke sel yang sama di baris berikutnya/sebelumnya (Enter / panah). */
  const focusRelative = (line: Line, step: number) => {
    const rowIndex = visibleRows.findIndex((r) => r.cells[line.size]?.id === line.id);
    if (rowIndex < 0) return;
    for (let i = rowIndex + step; i >= 0 && i < visibleRows.length; i += step) {
      const next = visibleRows[i].cells[line.size];
      if (next && !next.is_derived && !readOnly) {
        inputRefs.current[next.id]?.focus();
        return;
      }
    }
  };

  /** Ringkasan per baris: total stok sistem, total fisik, dan selisihnya. */
  const rowTotals = (row: ProductRow) => {
    let sys = 0;
    let fisik = 0;
    let counted = 0;
    let diff = 0;
    for (const cell of Object.values(row.cells)) {
      if (cell.is_derived) continue;
      sys += Number(cell.system_stock) || 0;
      const value = countedValue(cell);
      if (value === null) continue;
      counted += 1;
      fisik += value;
      diff += value - Number(cell.system_stock);
    }
    return { sys, fisik: counted > 0 ? fisik : null, diff: counted > 0 ? diff : null };
  };

  const groups = useMemo(() => {
    const kategoriCount = new Map<string, number>();
    const kainCount = new Map<string, number>();
    for (const row of rows) {
      if (row.is_derived) continue;
      const cells = Object.values(row.cells).filter((c) => !c.is_derived && countedValue(c) === null);
      if (!cells.length) continue;
      if (row.category) kategoriCount.set(row.category, (kategoriCount.get(row.category) || 0) + 1);
      if (row.jenis_kain) kainCount.set(row.jenis_kain, (kainCount.get(row.jenis_kain) || 0) + 1);
    }
    return {
      kategori: Array.from(kategoriCount.entries()).sort((a, b) => b[1] - a[1]),
      kain: Array.from(kainCount.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [rows, counts]);

  /**
   * Baris "Hasil penerapan": hanya yang benar-benar berubah (dari `stock_movements`).
   * Nama produk & penyebab diambil dari baris sesi karena movements tidak menyimpannya.
   */
  const appliedRows = useMemo(() => {
    const byKey = new Map<string, Line>();
    for (const line of lines) byKey.set(`${line.product_id}|${line.color}|${line.size}`, line);
    return movements.map((m) => {
      const line = byKey.get(`${m.product_id}|${m.color}|${m.size}`);
      const delta = m.direction === "out" ? -Math.abs(m.qty) : Math.abs(m.qty);
      return {
        id: m.id,
        product_name: line?.product_name || m.product_id,
        color: m.color || "default",
        size: m.size || "-",
        before: m.before_stock ?? 0,
        delta,
        after: m.after_stock ?? 0,
        price: line?.price || 0,
        reason: line?.reason || "",
        note: line?.reason_note || "",
      };
    });
  }, [movements, lines]);

  const appliedTotals = useMemo(() => {
    return appliedRows.reduce(
      (acc, row) => ({
        baris: acc.baris + 1,
        nilai: acc.nilai + row.delta * row.price,
      }),
      { baris: 0, nilai: 0 },
    );
  }, [appliedRows]);

  /** Unduh CSV arsip hasil penerapan (dibuat di browser, tidak menyentuh server). */
  const downloadCsv = () => {
    const header = ["Produk", "Kain/Warna", "Ukuran", "Stok sebelum", "Selisih", "Stok sesudah", "Penyebab", "Catatan"];
    const rows = appliedRows.map((row) => [
      row.product_name,
      displayColor(row.color, row.product_name),
      row.size,
      row.before,
      row.delta > 0 ? `+${row.delta}` : row.delta,
      row.after,
      reasonLabel(row.reason),
      row.note,
    ]);
    const csv = [header, ...rows]
      .map((cols) => cols.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `opname-${session?.code || sessionId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Aksi server ──────────────────────────────────────────────────────────
  const call = async (body: Record<string, unknown>) => {
    const { data: { session: auth } } = await supabase.auth.getSession();
    const res = await fetch("/api/ops/stock-opname", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(auth?.access_token ? { Authorization: `Bearer ${auth.access_token}` } : {}),
      },
      body: JSON.stringify({ id: sessionId, ...body }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      // `rows` diisi server saat approve ditahan karena stok akhir bakal negatif.
      const error = new Error(json?.error || "Gagal menyimpan.") as Error & { rows?: unknown[] };
      error.rows = json?.rows;
      throw error;
    }
    return json;
  };

  const collectPayload = () =>
    lines
      .filter((l) => !l.is_derived)
      .map((line) => ({
        product_id: line.product_id,
        color: line.color,
        size: line.size,
        counted_stock: countedValue(line),
        reason: reasons[line.id] || null,
        reason_note: notes[line.id] || null,
      }));

  const saveDraft = async (silent = false) => {
    if (busy || readOnly) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await call({ action: "save", lines: collectPayload() });
      if (!silent) setNotice("Hitungan tersimpan sebagai draft. Stok belum berubah.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan draft.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openApply = () => {
    const beda = lines.filter((l) => !l.is_derived && diffOf(l) !== null && diffOf(l) !== 0);
    const tanpa = beda.filter((l) => !reasons[l.id]);
    if (tanpa.length > 0) {
      setError(`Masih ada ${tanpa.length} baris selisih yang belum dipilih penyebabnya.`);
      return;
    }
    const lainnyaTanpa = beda.filter((l) => reasons[l.id] === "lainnya" && !(notes[l.id] || "").trim());
    if (lainnyaTanpa.length > 0) {
      setError('Penyebab "Lainnya" wajib diberi catatan singkat.');
      return;
    }
    setError("");
    setConfirmOpen(true);
  };

  /** Simpan draft lalu terapkan ke stok (satu transaksi di server). */
  const applySession = async () => {
    setConfirmOpen(false);
    const ok = await saveDraft(true);
    if (!ok) return;
    setBusy(true);
    setBlockedRows([]);
    try {
      const result = await call({ action: "apply" });
      setNotice(
        `Diterapkan. ${result?.adjusted ?? 0} baris stok disesuaikan${result?.skipped ? `, ${result.skipped} dilewati` : ""}.`,
      );
      await load();
    } catch (e) {
      const rows = (e as Error & { rows?: BlockedRow[] }).rows;
      setBlockedRows(Array.isArray(rows) ? rows : []);
      setError(e instanceof Error ? e.message : "Gagal menerapkan ke stok.");
    } finally {
      setBusy(false);
    }
  };

  const setRowReason = (row: ProductRow, value: string) => {
    setReasons((prev) => {
      const next = { ...prev };
      for (const cell of Object.values(row.cells)) {
        if (cell.is_derived) continue;
        const diff = diffOf(cell);
        if (diff !== null && diff !== 0) next[cell.id] = value;
      }
      return next;
    });
  };

  if (loading) {
    return <p className="py-16 text-center text-sm text-slate-400">Memuat sesi…</p>;
  }
  if (!session) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-red-600">{error || "Sesi tidak ditemukan."}</p>
        <Link href={basePath} className="text-sm font-bold text-[#1e3a5f] underline">Kembali ke daftar</Link>
      </div>
    );
  }

  const showActions = session.status === "draft";

  return (
    <div className="space-y-3 pb-2">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={basePath} className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400">
            ← Stok Opname
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="font-inter text-xl md:text-2xl font-black text-slate-900 dark:text-white">{session.code}</h1>
            {statusPill(session.status)}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Mulai {new Date(session.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
            {session.created_by_name ? ` · oleh ${session.created_by_name}` : ""}
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>
      ) : null}
      {blockedRows.length > 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
          <p className="text-sm font-bold">Stok belum diterapkan — ada baris yang stok akhirnya negatif</p>
          <p className="mt-0.5 text-[12px]">
            Penyesuaian dihitung dari stok terkini (bukan angka fisik langsung). Perbaiki hitungan atau stok baris di
            bawah, lalu terapkan lagi. Tidak ada stok yang berubah.
          </p>
          <ul className="mt-2 space-y-0.5">
            {blockedRows.map((row, index) => (
              <li key={index} className="text-[12px]">
                <b>{row.product_name || "-"}</b> · {row.color || "default"} · {row.size || "-"}: sistem{" "}
                {row.system_stock ?? "-"} · fisik {row.counted_stock ?? "-"} · kini {row.current_stock ?? "-"} ·
                akhir <b className="text-red-700">{row.final_stock ?? "-"}</b>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</div>
      ) : null}

      {/* Progress */}
      <div className="rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-[#1a1d28] px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
            {summary.dihitung} dari {summary.total} baris sudah dihitung
            <span className="text-slate-400"> · </span>
            <span className={summary.selisih > 0 ? "text-orange-600" : "text-slate-500"}>{summary.selisih} ada selisih</span>
          </p>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{progress}%</span>
        </div>
        <div className="mt-1.5 h-2 w-full rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
          <div className="h-full rounded-full bg-[#1e3a5f] transition-all" style={{ width: `${progress}%` }} />
        </div>
        {movementCount > 0 ? (
          <p className="mt-2 text-[11px] font-semibold text-amber-600">
            Ada {movementCount} ukuran yang stok sistemnya bergerak setelah sesi dimulai (transaksi baru). Rinciannya
            tampil di dialog konfirmasi sebelum diterapkan; penyesuaian memakai stok terbaru.
          </p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap gap-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Cocok</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-red-500" /> Kurang dari sistem</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Lebih dari sistem</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-gray-300" /> Belum dihitung</span>
        </div>
      </div>

      {/* Toolbar filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari produk, kain, atau series..."
            className="w-full pl-3.5 pr-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-[13px] font-medium text-gray-900 dark:text-slate-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={kategori} onChange={(e) => setKategori(e.target.value)} className="px-2.5 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-[13px] font-semibold text-gray-700 dark:text-slate-200" title="Saring per kategori produk">
          <option value="all">Semua Kategori</option>
          {options.kategori.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={kain} onChange={(e) => setKain(e.target.value)} className="px-2.5 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-[13px] font-semibold text-gray-700 dark:text-slate-200" title="Saring per jenis kain">
          <option value="all">Semua Jenis Kain</option>
          {options.kain.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={series} onChange={(e) => setSeries(e.target.value)} className="px-2.5 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-[13px] font-semibold text-gray-700 dark:text-slate-200" title="Saring per series">
          <option value="all">Semua Series</option>
          {options.series.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setOnlyUncounted((v) => !v)}
          className={`px-2.5 py-2 rounded-lg text-[13px] font-bold border transition-colors ${onlyUncounted ? "bg-[#1e3a5f] text-white border-[#1e3a5f]" : "bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-200 dark:border-slate-700"}`}
          title="Tampilkan hanya baris yang belum diisi hitungannya"
        >
          Belum dihitung
        </button>
        <button
          type="button"
          onClick={() => setOnlyDiff((v) => !v)}
          className={`px-2.5 py-2 rounded-lg text-[13px] font-bold border transition-colors ${onlyDiff ? "bg-orange-600 text-white border-orange-600" : "bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-200 dark:border-slate-700"}`}
          title="Tampilkan hanya baris yang ada selisihnya"
        >
          Ada selisih
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setGroupOpen((v) => !v)}
            className="px-2.5 py-2 rounded-lg text-[13px] font-bold bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border border-gray-200 dark:border-slate-700"
            title="Fokus satu kategori atau satu jenis kain dulu"
          >
            Hitung per kelompok ▾
          </button>
          {groupOpen ? (
            <div className="absolute right-0 z-30 mt-1 w-64 max-h-80 overflow-y-auto rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-[#1a1d28] shadow-xl p-2">
              <button
                type="button"
                onClick={() => { setKategori("all"); setKain("all"); setGroupOpen(false); }}
                className="w-full text-left px-2.5 py-2 rounded-lg text-sm font-bold hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                Semua kelompok
              </button>
              <p className="px-2.5 pt-2 pb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Kategori</p>
              {groups.kategori.length === 0 ? <p className="px-2.5 pb-1 text-xs text-slate-400">Semua sudah dihitung</p> : null}
              {groups.kategori.map(([name, count]) => (
                <button
                  key={`kat-${name}`}
                  type="button"
                  onClick={() => { setKategori(name); setKain("all"); setOnlyUncounted(true); setGroupOpen(false); }}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-slate-800"
                >
                  <span className="truncate">{name}</span>
                  <span className="text-[11px] font-bold text-slate-400">{count} baris</span>
                </button>
              ))}
              <p className="px-2.5 pt-2 pb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Jenis kain</p>
              {groups.kain.map(([name, count]) => (
                <button
                  key={`kain-${name}`}
                  type="button"
                  onClick={() => { setKain(name); setKategori("all"); setOnlyUncounted(true); setGroupOpen(false); }}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-slate-800"
                >
                  <span className="truncate">Kain {name}</span>
                  <span className="text-[11px] font-bold text-slate-400">{count} baris</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Legenda tabel — selalu terlihat */}
      <p className="px-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
        Angka abu-abu = stok di sistem · Kotak = hitungan fisik · Badge = selisih
      </p>

      {/* Tabel hitung — compact ala spreadsheet */}
      <style>{`/* spinner angka disembunyikan: sel terasa seperti sel spreadsheet */
.opname-table input[type=number]::-webkit-outer-spin-button,
.opname-table input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.opname-table input[type=number]{-moz-appearance:textfield}`}</style>
      <div className="opname-table rounded-lg border border-gray-300 dark:border-slate-800 bg-white dark:bg-[#1a1d28]">
        <div className="overflow-x-auto lg:overflow-visible">
          <table className="w-full min-w-[660px] table-fixed border-collapse text-[13px] lg:min-w-0">
            <thead>
              <tr>
                <th
                  className={`sticky top-0 left-0 z-30 h-9 ${sidebarCollapsed ? "w-[34%] min-w-[230px]" : "w-[28%] min-w-[190px]"} rounded-tl-lg border-b border-r border-white/25 bg-[#1e3a5f] px-2 text-left text-[10px] font-bold uppercase tracking-wide text-white`}
                  title="Nama produk, varian, SKU, dan kategori/kain"
                >
                  Produk
                </th>
                {visibleSizes.map((size) => (
                  <th
                    key={size}
                    className="sticky top-0 z-20 h-9 w-[64px] border-b border-r border-white/25 bg-[#1e3a5f] px-0.5 text-center text-[10px] font-bold uppercase tracking-wide text-white lg:w-[70px]"
                    title="Sistem = stok di sistem · Kotak = hitungan fisik · Badge = selisih"
                  >
                    {size}
                  </th>
                ))}
                <th
                  className="sticky top-0 z-20 h-9 w-[68px] border-b border-r border-white/25 bg-[#1e3a5f] px-1 text-center text-[10px] font-bold uppercase tracking-wide text-white"
                  title="Jumlah stok di sistem satu baris"
                >
                  Sistem
                </th>
                <th
                  className={`sticky top-0 z-20 hidden h-9 w-[64px] border-b border-r border-white/25 bg-[#1e3a5f] px-1 text-center text-[10px] font-bold uppercase tracking-wide text-white ${sidebarCollapsed ? "lg:table-cell" : "xl:table-cell"}`}
                  title="Jumlah hitungan fisik satu baris"
                >
                  Fisik
                </th>
                <th
                  className="sticky top-0 z-20 h-9 w-[84px] border-b border-r border-white/25 bg-[#1e3a5f] px-1 text-center text-[10px] font-bold uppercase tracking-wide text-white"
                  title="Total selisih satu baris"
                >
                  Selisih
                </th>
                <th
                  className="sticky top-0 z-20 h-9 w-[150px] rounded-tr-lg border-b border-white/25 bg-[#1e3a5f] px-1 text-left text-[10px] font-bold uppercase tracking-wide text-white lg:w-[165px]"
                  title="Pilih penyebab kalau ada selisih"
                >
                  Penyebab
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={5 + visibleSizes.length} className="px-4 py-12 text-center text-sm text-slate-400">
                    Tidak ada baris yang cocok dengan pencarian/filter.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row, index) => {
                  const rowDiffLines = Object.values(row.cells).filter((c) => !c.is_derived && (diffOf(c) ?? 0) !== 0);
                  const rowReason = rowDiffLines.length > 0 ? reasons[rowDiffLines[0].id] || "" : "";
                  const rowNote = rowDiffLines.length > 0 ? notes[rowDiffLines[0].id] || "" : "";
                  const totals = rowTotals(row);
                  const zebra = index % 2 === 0 ? "bg-white" : "bg-slate-50/80";
                  const info = [row.category, row.jenis_kain].filter(Boolean).join(" · ");
                  return (
                    <tr key={row.key} className={row.is_derived ? "opacity-70" : undefined}>
                      <td
                        className={`sticky left-0 z-10 h-[72px] border-b border-r border-gray-200/70 px-2 py-1 align-middle ${zebra}`}
                        title={[info, row.series].filter(Boolean).join(" · ")}
                      >
                        <div className="flex h-full min-w-0 flex-col justify-center gap-1 leading-tight">
                          <span className="truncate text-[14px] font-semibold text-gray-900 dark:text-white">
                            {row.product_name}
                            <span className="ml-1 text-[12px] font-normal text-slate-500 dark:text-slate-400">
                              · {displayColor(row.color, row.product_name)}
                            </span>
                          </span>
                          <span className={`truncate text-[12px] ${row.is_derived ? "font-medium text-amber-700" : "text-slate-600 dark:text-slate-300"}`}>
                            {row.is_derived ? `ikut stok ${row.base_product_name}` : [row.sku || "-", info].filter(Boolean).join(" · ")}
                          </span>
                        </div>
                      </td>
                      {visibleSizes.map((size) => {
                        const line = row.cells[size];
                        if (!line) {
                          return (
                            <td
                              key={size}
                              className="h-[72px] border-b border-r border-gray-200/70 bg-slate-100/70 dark:bg-slate-800/40"
                              title="Produk ini tidak punya ukuran ini"
                            />
                          );
                        }
                        const state = lineStateOf(line);
                        const diff = diffOf(line);
                        const disabled = readOnly || row.is_derived;
                        return (
                          <td
                            key={size}
                            className={`h-[72px] border-b border-r border-gray-200/70 p-0 align-middle ${CELL_BG[state] || "bg-white"}`}
                          >
                            <div className="flex h-[72px] flex-col items-center justify-center gap-1">
                              <span
                                className="text-[11px] font-medium leading-none text-slate-600 dark:text-slate-300"
                                title="Stok di sistem"
                              >
                                Sistem {line.system_stock}
                              </span>
                              <input
                                ref={(el) => {
                                  inputRefs.current[line.id] = el;
                                }}
                                type="number"
                                inputMode="numeric"
                                min={0}
                                value={counts[line.id] ?? ""}
                                onChange={(e) => setCounts((prev) => ({ ...prev, [line.id]: e.target.value }))}
                                onFocus={(e) => e.currentTarget.select()}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === "ArrowDown") {
                                    e.preventDefault();
                                    focusRelative(line, 1);
                                  } else if (e.key === "ArrowUp") {
                                    e.preventDefault();
                                    focusRelative(line, -1);
                                  }
                                }}
                                disabled={disabled}
                                placeholder=""
                                aria-label={`Hitungan di rak ${row.product_name} ${row.color} ${size}`}
                                title={row.is_derived ? `Ikut stok ${row.base_product_name}` : "Hitungan di rak"}
                                className="h-7 w-[54px] rounded-[3px] border border-gray-300 bg-white px-0 text-center text-[14px] font-semibold tabular-nums text-slate-900 outline-none focus:ring-2 focus:ring-blue-400 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:text-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                              />
                              {state === "cocok" ? (
                                <span className="inline-flex h-[18px] items-center rounded-full bg-emerald-100 px-2 text-[12px] font-bold leading-none text-emerald-700">
                                  Cocok
                                </span>
                              ) : diff !== null && diff !== 0 ? (
                                <span
                                  className={`inline-flex h-[18px] items-center rounded-full px-2 text-[12px] font-bold leading-none ${diff < 0 ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}
                                  title="Selisih (fisik − sistem)"
                                >
                                  {diff > 0 ? `+${diff}` : diff}
                                </span>
                              ) : (
                                <span className="h-[18px]" />
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td
                        className={`h-[72px] border-b border-r border-gray-200/70 px-1 text-center align-middle text-[14px] font-semibold tabular-nums text-slate-700 dark:text-slate-200 ${zebra}`}
                        title="Jumlah stok di sistem"
                      >
                        {totals.sys}
                      </td>
                      <td
                        className={`hidden h-[72px] border-b border-r border-gray-200/70 px-1 text-center align-middle text-[14px] font-semibold tabular-nums text-slate-700 dark:text-slate-200 ${sidebarCollapsed ? "lg:table-cell" : "xl:table-cell"} ${zebra}`}
                        title="Jumlah hitungan fisik"
                      >
                        {totals.fisik ?? "-"}
                      </td>
                      <td className={`h-[72px] border-b border-r border-gray-200/70 px-1 text-center align-middle ${zebra}`} title="Total selisih">
                        {totals.diff === null ? (
                          <span className="text-[12px] text-slate-400">-</span>
                        ) : totals.diff === 0 ? (
                          <span className="inline-flex h-[20px] items-center rounded-full bg-emerald-100 px-2 text-[12px] font-bold text-emerald-700">
                            Cocok
                          </span>
                        ) : (
                          <span
                            className={`inline-flex h-[20px] items-center rounded-full px-2 text-[12px] font-bold ${totals.diff < 0 ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}
                          >
                            {totals.diff > 0 ? `+${totals.diff}` : totals.diff}
                          </span>
                        )}
                      </td>
                      <td className={`h-[72px] border-b border-gray-200/70 px-1.5 py-1 align-middle ${zebra}`}>
                        {rowDiffLines.length > 0 ? (
                          <div className="flex flex-col gap-1 py-0.5">
                            <select
                              value={rowReason}
                              onChange={(e) => setRowReason(row, e.target.value)}
                              disabled={readOnly}
                              className={`h-7 w-full rounded border bg-white px-1 text-[11px] font-semibold outline-none focus:ring-1 focus:ring-blue-400 dark:bg-slate-900 ${
                                rowReason
                                  ? "border-gray-300 text-slate-700 dark:border-slate-600 dark:text-slate-200"
                                  : "border-red-300 text-red-600"
                              } dark:border-slate-600`}
                              title="Pilih penyebab selisih"
                            >
                              <option value="">Pilih penyebab</option>
                              {OPNAME_REASONS.map((r) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                              ))}
                            </select>
                            {!rowReason ? (
                              <span className="text-[10px] font-medium text-red-600">Pilih penyebab</span>
                            ) : null}
                            {rowReason === "lainnya" ? (
                              <input
                                type="text"
                                value={rowNote}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setNotes((prev) => {
                                    const next = { ...prev };
                                    for (const cell of rowDiffLines) next[cell.id] = value;
                                    return next;
                                  });
                                }}
                                disabled={readOnly}
                                placeholder="Catatan"
                                className="h-6 w-full rounded border border-gray-300 bg-white px-1 text-[11px] dark:border-slate-600 dark:bg-slate-900"
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hasil penerapan — hanya untuk sesi yang sudah Selesai */}
      {session.status === "selesai" ? (
        <div className="rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-[#1a1d28] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 dark:border-slate-800 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 dark:text-white">Hasil penerapan</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Diterapkan{session.reviewed_by_name ? ` oleh ${session.reviewed_by_name}` : ""}
                {session.reviewed_at ? ` · ${new Date(session.reviewed_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}` : ""}
                {" · "}
                {appliedTotals.baris} baris berubah · nilai selisih{" "}
                {appliedTotals.nilai === 0 ? "-" : `${appliedTotals.nilai < 0 ? "−" : "+"}Rp ${formatRupiah(appliedTotals.nilai)}`}
              </p>
            </div>
            <button
              type="button"
              onClick={downloadCsv}
              disabled={appliedRows.length === 0}
              className="px-3 py-2 rounded-lg bg-[#1e3a5f] text-white text-xs font-bold disabled:opacity-50"
            >
              Unduh CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[13px]">
              <thead>
                <tr className="bg-[#1e3a5f]">
                  {["Produk", "Kain/Warna", "Ukuran", "Stok sebelum", "Selisih", "Stok sesudah", "Penyebab"].map((head) => (
                    <th
                      key={head}
                      className="px-2.5 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-white border-r border-white/25 last:border-r-0 whitespace-nowrap"
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {appliedRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">
                      Tidak ada baris yang berubah pada sesi ini.
                    </td>
                  </tr>
                ) : (
                  appliedRows.map((row, index) => (
                    <tr
                      key={row.id}
                      className={`${index % 2 === 0 ? "bg-white" : "bg-slate-50/80"} border-b border-gray-200/70`}
                    >
                      <td className="px-2.5 py-2 font-semibold text-slate-900 dark:text-white">{row.product_name}</td>
                      <td className="px-2.5 py-2 text-slate-600 dark:text-slate-300">{displayColor(row.color, row.product_name)}</td>
                      <td className="px-2.5 py-2 text-center font-semibold text-slate-700 dark:text-slate-200">{row.size}</td>
                      <td className="px-2.5 py-2 text-center tabular-nums text-slate-600 dark:text-slate-300">{row.before}</td>
                      <td className="px-2.5 py-2 text-center">
                        <span
                          className={`inline-flex h-[20px] items-center rounded-full px-2 text-[12px] font-bold ${row.delta < 0 ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}
                        >
                          {row.delta > 0 ? `+${row.delta}` : row.delta}
                        </span>
                      </td>
                      <td className="px-2.5 py-2 text-center tabular-nums font-semibold text-slate-700 dark:text-slate-200">{row.after}</td>
                      <td className="px-2.5 py-2 text-slate-600 dark:text-slate-300">
                        {reasonLabel(row.reason)}{row.note ? ` (${row.note})` : ""}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Ruang kosong seukuran bar bawah supaya baris terakhir tidak tertutup. */}
      {showActions ? <div className="h-14" aria-hidden="true" /> : null}

      {/* Bar aksi bawah — selalu terlihat */}
      {showActions ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 dark:border-slate-800 bg-white/95 dark:bg-[#12141a]/95 backdrop-blur px-3 py-1.5">
          <div className="mx-auto flex max-w-6xl items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-bold text-slate-600 dark:text-slate-300">
                {summary.dihitung}/{summary.total} dihitung · {summary.selisih} baris selisih
              </p>
              <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                total kurang {summary.kurang} pcs · total lebih {summary.lebih} pcs · nilai selisih{" "}
                {summary.nilai === 0 ? "-" : `${summary.nilai < 0 ? "−" : "+"}Rp ${formatRupiah(summary.nilai)}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => saveDraft()}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200 disabled:opacity-60"
            >
              {busy ? "Menyimpan…" : "Simpan draft"}
            </button>
            <button
              type="button"
              onClick={openApply}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl bg-[#1e3a5f] text-white text-sm font-bold disabled:opacity-60"
            >
              Terapkan ke stok
            </button>
          </div>
        </div>
      ) : null}

      {/* Konfirmasi ajukan */}
      {confirmOpen ? (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setConfirmOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1a1d28] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Terapkan ke stok?</h3>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Baris dihitung</span><b>{summary.dihitung} dari {summary.total}</b></div>
              <div className="flex justify-between"><span className="text-slate-500">Baris selisih</span><b className={summary.selisih ? "text-orange-600" : ""}>{summary.selisih}</b></div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total nilai selisih</span>
                <b className={summary.nilai < 0 ? "text-red-600" : summary.nilai > 0 ? "text-emerald-600" : ""}>
                  {summary.nilai === 0 ? "-" : `${summary.nilai < 0 ? "−" : "+"}Rp ${formatRupiah(summary.nilai)}`}
                </b>
              </div>
            </div>
            {summary.dihitung < summary.total ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
                Masih ada {summary.total - summary.dihitung} baris belum dihitung. Baris itu dianggap sesuai (stok tidak berubah).
              </p>
            ) : null}
            {movementRows.length > 0 ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-[12px] font-bold text-amber-800">Ada pergerakan stok sejak sesi dimulai</p>
                <ul className="mt-1 space-y-0.5">
                  {movementRows.slice(0, 6).map((row) => (
                    <li key={row.key} className="text-[11px] text-amber-800">
                      {row.name} · {displayColor(row.color, row.name)} · {row.size}: sistem {row.snapshot} → kini{" "}
                      {row.current} → akhir <b>{row.final}</b>
                    </li>
                  ))}
                  {movementRows.length > 6 ? (
                    <li className="text-[11px] font-semibold text-amber-700">+{movementRows.length - 6} ukuran lain</li>
                  ) : null}
                </ul>
              </div>
            ) : null}
            <p className="mt-3 rounded-lg bg-[#1e3a5f]/5 px-3 py-2 text-[12px] font-semibold text-[#1e3a5f]">
              Stok akan LANGSUNG berubah setelah kamu menekan “Ya, terapkan”. Sesi ini jadi Selesai dan tidak bisa diubah lagi.
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setConfirmOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-200">
                Batal
              </button>
              <button type="button" onClick={applySession} disabled={busy} className="flex-1 px-4 py-2.5 rounded-xl bg-[#1e3a5f] text-white text-sm font-bold disabled:opacity-60">
                Ya, terapkan
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Catatan sesi selesai */}
      {session.status === "selesai" ? (
        <p className="text-[11px] text-slate-400">
          Sesi ini sudah diterapkan{session.reviewed_by_name ? ` oleh ${session.reviewed_by_name}` : ""} dan bersifat read-only.
          Semua penyesuaian tercatat di riwayat stok beserta penyebabnya.
        </p>
      ) : null}
    </div>
  );
}

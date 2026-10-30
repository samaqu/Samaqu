"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import {
  AdminApiError,
  opsResellerApi,
  type CatalogRow,
  type CatalogUpdate,
} from "./api";
import type { CatalogGroup } from "./ProductGroupRow";
import type { RowSaveState } from "./SeriesRow";
import DefaultDiscountCard from "./DefaultDiscountCard";
import BulkBar from "./BulkBar";
import PriceTable from "./PriceTable";
import { AdminToast } from "./Modal";

const NEW_SERIES_DAYS = 7;
type VisibilityFilter = "all" | "katalog" | "open_order" | "tersembunyi";

/** Tab "Produk & Harga": diskon default + tabel per series + aksi massal. */
export default function PriceTab() {
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [defaultDiscount, setDefaultDiscount] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<"all" | "on" | "off">("all");
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowStatus, setRowStatus] = useState<Record<string, RowSaveState>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "ok" | "err" } | null>(null);
  const statusTimers = useRef<Record<string, number>>({});

  const load = useCallback(async (preserveSelection = false) => {
    try {
      const res = await opsResellerApi.catalog();
      setRows(res.data);
      setDefaultDiscount(res.default_discount);
      setError("");
      if (!preserveSelection) setSelected(new Set());
      else
        setSelected((prev) => {
          const ids = new Set(res.data.map((row) => row.id));
          return new Set([...prev].filter((id) => ids.has(id)));
        });
    } catch {
      setError("Gagal memuat produk. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timers = statusTimers.current;
    return () => {
      Object.values(timers).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const categories = useMemo(
    () => [...new Set(rows.map((row) => row.category).filter(Boolean))].sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (category !== "all" && row.category !== category) return false;
      if (status === "on" && !row.reseller_enabled) return false;
      if (status === "off" && row.reseller_enabled) return false;
      if (visibility === "katalog" && !row.is_published) return false;
      if (visibility === "open_order" && !row.open_order_enabled) return false;
      if (visibility === "tersembunyi" && (row.is_published || row.open_order_enabled)) return false;
      if (!needle) return true;
      return `${row.name} ${row.series || ""} ${row.kain || ""}`.toLowerCase().includes(needle);
    });
  }, [rows, query, category, status, visibility]);

  const groups = useMemo<CatalogGroup[]>(() => {
    const map = new Map<string, CatalogGroup>();
    for (const row of filtered) {
      const key = `${row.category}|${row.name}`;
      const group = map.get(key) || {
        key,
        name: row.name,
        category: row.category,
        thumbnail: null,
        kain: row.kain,
        rows: [],
      };
      if (!group.thumbnail && row.thumbnail) group.thumbnail = row.thumbnail;
      group.rows.push(row);
      map.set(key, group);
    }
    return [...map.values()];
  }, [filtered]);

  const isNewRow = (row: CatalogRow) => {
    if (row.reseller_enabled || !row.created_at) return false;
    const age = Date.now() - new Date(row.created_at).getTime();
    return age >= 0 && age <= NEW_SERIES_DAYS * 86_400_000;
  };

  const setRowState = (id: string, state: RowSaveState, fade = false) => {
    setRowStatus((prev) => ({ ...prev, [id]: state }));
    if (statusTimers.current[id]) window.clearTimeout(statusTimers.current[id]);
    if (fade) {
      statusTimers.current[id] = window.setTimeout(() => {
        setRowStatus((prev) => ({ ...prev, [id]: "idle" }));
      }, 2000);
    }
  };

  const toggleSelectRow = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectGroup = (ids: string[], checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  /** Simpan satu baris (toggle / harga minimum). Reload menjaga harga beli tetap akurat. */
  const saveRow = async (updates: CatalogUpdate[], successMessage: string, rowId: string) => {
    setRowState(rowId, "saving");
    try {
      await opsResellerApi.saveCatalog(updates);
      await load(true);
      setRowState(rowId, "saved", true);
      setToast({ message: successMessage, tone: "ok" });
    } catch (e) {
      setRowState(rowId, "error");
      setToast({ message: e instanceof AdminApiError ? e.message : "Gagal menyimpan.", tone: "err" });
    }
  };

  const applyBulk = async (updates: CatalogUpdate[], message: string): Promise<boolean> => {
    setBulkBusy(true);
    try {
      await opsResellerApi.saveCatalog(updates);
      setSelected(new Set());
      await load();
      setToast({ message, tone: "ok" });
      return true;
    } catch (e) {
      setToast({ message: e instanceof AdminApiError ? e.message : "Gagal menyimpan perubahan.", tone: "err" });
      return false;
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <DefaultDiscountCard
        key={defaultDiscount}
        value={defaultDiscount}
        onSaved={(message) => {
          setToast({ message, tone: "ok" });
          load();
        }}
        onError={(message) => setToast({ message, tone: "err" })}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full pl-9 pr-3 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            placeholder="Cari produk, series, atau kain…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="px-3 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter kategori"
        >
          <option value="all">Semua kategori</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          className="px-3 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as VisibilityFilter)}
          aria-label="Filter tampil di"
        >
          <option value="all">Tampil di: Semua</option>
          <option value="katalog">Katalog website</option>
          <option value="open_order">Open Order</option>
          <option value="tersembunyi">Tersembunyi</option>
        </select>
        <select
          className="px-3 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-700"
          value={status}
          onChange={(e) => setStatus(e.target.value as "all" | "on" | "off")}
          aria-label="Filter status reseller"
        >
          <option value="all">Semua status</option>
          <option value="on">Dijual ke reseller</option>
          <option value="off">Belum dijual</option>
        </select>
      </div>

      {error ? (
        <div className="px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm font-semibold">
          {error}{" "}
          <button type="button" className="underline font-bold" onClick={() => load()}>
            Coba lagi
          </button>
        </div>
      ) : null}

      <BulkBar selectedIds={[...selected]} busy={bulkBusy} onApply={applyBulk} />

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
          Memuat produk…
        </div>
      ) : (
        <PriceTable
          groups={groups}
          defaultDiscount={defaultDiscount}
          selected={selected}
          rowStatus={rowStatus}
          onSelectGroup={selectGroup}
          onSelectRow={toggleSelectRow}
          onToggle={(row) =>
            saveRow(
              [{ id: row.id, reseller_enabled: !row.reseller_enabled }],
              `${row.series || row.name} ${!row.reseller_enabled ? "dinyalakan" : "dimatikan"} untuk reseller.`,
              row.id
            )
          }
          onMinSellCommit={(row, value) =>
            saveRow(
              [{ id: row.id, reseller_min_sell_price: value }],
              `Harga minimum jual ${row.series || row.name} disimpan.`,
              row.id
            )
          }
          isNewRow={isNewRow}
        />
      )}

      {toast ? <AdminToast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} /> : null}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  AdminApiError,
  opsResellerApi,
  type CatalogRow,
  type CatalogUpdate,
} from "./api";
import type { CatalogGroup } from "./ProductGroupRow";
import type { SeriesDraft } from "./SeriesRow";
import DefaultDiscountCard from "./DefaultDiscountCard";
import BulkBar from "./BulkBar";
import PriceTable from "./PriceTable";
import { AdminToast } from "./Modal";

const NEW_SERIES_DAYS = 7;

/** Tab "Produk & Harga": diskon default + tabel per series + aksi massal. */
export default function PriceTab() {
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [defaultDiscount, setDefaultDiscount] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<"all" | "on" | "off">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, SeriesDraft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "ok" | "err" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await opsResellerApi.catalog();
      setRows(res.data);
      setDefaultDiscount(res.default_discount);
      setDrafts({});
      setSelected(new Set());
    } catch {
      setError("Gagal memuat produk. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
      if (!needle) return true;
      return `${row.name} ${row.series || ""} ${row.kain || ""}`.toLowerCase().includes(needle);
    });
  }, [rows, query, category, status]);

  const groups = useMemo<CatalogGroup[]>(() => {
    const map = new Map<string, CatalogGroup>();
    for (const row of filtered) {
      const key = `${row.category}|${row.name}`;
      const group = map.get(key) || {
        key,
        name: row.name,
        category: row.category,
        image: row.image,
        kain: row.kain,
        rows: [],
      };
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

  const changeDraft = (id: string, patch: Partial<SeriesDraft>) => {
    setDrafts((prev) => {
      const row = rows.find((item) => item.id === id);
      if (!row) return prev;
      const current = prev[id] || { enabled: row.reseller_enabled, minSell: row.reseller_min_sell_price };
      return { ...prev, [id]: { ...current, ...patch } };
    });
  };

  const saveRow = async (id: string) => {
    const row = rows.find((item) => item.id === id);
    const draft = drafts[id];
    if (!row || !draft) return;
    setBusyId(id);
    try {
      await opsResellerApi.saveCatalog([
        {
          id,
          reseller_enabled: draft.enabled,
          reseller_min_sell_price: draft.minSell,
        },
      ]);
      await load();
      setToast({ message: `Series ${row.series || row.name} disimpan.`, tone: "ok" });
    } catch (e) {
      setToast({ message: e instanceof AdminApiError ? e.message : "Gagal menyimpan series.", tone: "err" });
    } finally {
      setBusyId(null);
    }
  };

  const applyBulk = async (updates: CatalogUpdate[], message: string): Promise<boolean> => {
    setBulkBusy(true);
    try {
      await opsResellerApi.saveCatalog(updates);
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
        <div className="relative flex-1 min-w-[220px]">
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
          <button type="button" className="underline font-bold" onClick={load}>
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
          drafts={drafts}
          selected={selected}
          busyId={busyId}
          onSelectGroup={selectGroup}
          onSelectRow={toggleSelectRow}
          onDraftChange={changeDraft}
          onSaveRow={saveRow}
          isNewRow={isNewRow}
        />
      )}

      {toast ? <AdminToast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} /> : null}
    </div>
  );
}

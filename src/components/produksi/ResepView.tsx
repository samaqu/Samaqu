"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { CATEGORY_ORDER } from "@/lib/ops-order";
import { formatDate, todayInput } from "@/lib/produksi";
import { produksiFetch } from "@/lib/produksi-api";
import { useProduksiAccess } from "./useAccess";
import {
  AccessGate,
  Badge,
  Drawer,
  EmptyState,
  ErrorBox,
  FilterBar,
  FilterSelect,
  PageHead,
  Spinner,
  StatCard,
  btnPrimary,
  btnSecondary,
  cardClass,
  inputClass,
  labelClass,
} from "./ui";

type Recipe = {
  id: string;
  product_category: string;
  version: number;
  effective_date: string;
  is_active: boolean;
  notes: string;
  line_count: number;
  updated_at: string;
};

export default function ResepView() {
  const access = useProduksiAccess();
  const router = useRouter();
  const [items, setItems] = useState<Recipe[]>([]);
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_category: "", effective_date: todayInput(), notes: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      const json = await produksiFetch<{ items: Recipe[] }>(
        `/api/ops/production/recipes?${params.toString()}`,
      );
      setItems(json.items || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat resep.");
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    if (access.role === "owner") load();
  }, [load, access.role]);

  const activeCategories = useMemo(
    () => new Set(items.filter((r) => r.is_active).map((r) => r.product_category)),
    [items],
  );

  const summary = useMemo(() => {
    const active = items.filter((r) => r.is_active);
    return {
      active: active.length,
      versions: items.length,
      covered: activeCategories.size,
    };
  }, [items, activeCategories]);

  async function createRecipe() {
    if (saving) return;
    setFormError("");
    if (!form.product_category) return setFormError("Pilih kategori produk.");
    if (!form.effective_date) return setFormError("Tanggal berlaku wajib diisi.");

    setSaving(true);
    try {
      const json = await produksiFetch<{ item: { id: string } }>("/api/ops/production/recipes", {
        method: "POST",
        body: JSON.stringify({ ...form, lines: [] }),
      });
      setOpen(false);
      router.push(`/ops/produksi/resep/${json.item.id}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Gagal membuat resep.");
    } finally {
      setSaving(false);
    }
  }

  const availableCategories = CATEGORY_ORDER.filter((value) => !activeCategories.has(value));

  return (
    <AccessGate access={access} ownerOnly>
      <div className="space-y-4">
        <PageHead
          title="Resep Produk"
          subtitle="Definisi bahan & biaya per kategori produk. Mengubah resep aktif selalu membuat versi baru."
          actions={
            <button className={btnPrimary} onClick={() => { setForm({ product_category: "", effective_date: todayInput(), notes: "" }); setFormError(""); setOpen(true); }}>
              <Plus size={16} /> Resep
            </button>
          }
        />

        <ErrorBox message={error} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Resep aktif" value={String(summary.active)} hint="Satu per kategori" />
          <StatCard label="Kategori tercakup" value={`${summary.covered} / ${CATEGORY_ORDER.length}`} hint="Kategori produk" />
          <StatCard label="Total versi" value={String(summary.versions)} hint="Termasuk versi lama" />
          <StatCard label="HPP" value="Perhitungan" hint="Tanpa mengurangi stok" tone="muted" />
        </div>

        <FilterBar active={Boolean(category)} onReset={() => setCategory("")}>
          <FilterSelect value={category} onChange={setCategory} ariaLabel="Filter kategori resep" minWidthClass="sm:min-w-[190px]">
            <option value="">Semua kategori</option>
            {CATEGORY_ORDER.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </FilterSelect>
        </FilterBar>

        <div className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[860px]">
              <thead>
                <tr className="bg-[#1e3a5f]">
                  {["Kategori", "Versi", "Tanggal berlaku", "Status", "Baris", "Diperbarui", ""].map((h) => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-bold text-white uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7}><Spinner /></td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState title="Belum ada resep" description="Buat resep pertama lewat tombol di atas." /></td></tr>
                ) : (
                  items.map((recipe, index) => (
                    <tr key={recipe.id} className={`${index % 2 === 0 ? "bg-white dark:bg-[#16171d]" : "bg-blue-50/30 dark:bg-[#1a1d28]"} border-b border-gray-100 dark:border-slate-800/50`}>
                      <td className="px-3 py-2.5 text-sm font-bold text-slate-900 dark:text-white whitespace-nowrap">{recipe.product_category}</td>
                      <td className="px-3 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">v{recipe.version}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatDate(recipe.effective_date)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <Badge tone={recipe.is_active ? "green" : "slate"}>{recipe.is_active ? "Aktif" : "Versi lama"}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{recipe.line_count}</td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">{recipe.updated_at ? formatDate(recipe.updated_at) : "—"}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <Link
                          href={`/ops/produksi/resep/${recipe.id}`}
                          className="inline-flex px-3 py-1.5 rounded-lg bg-[#1e3a5f] text-white text-xs font-bold hover:bg-[#16304f] transition-colors"
                        >
                          Buka
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          title="Buat Resep"
          subtitle="Resep baru dimulai dari versi 1. Versi berikutnya dibuat saat menyimpan perubahan."
          footer={
            <div className="flex items-center justify-end gap-2">
              <button className={btnSecondary} onClick={() => setOpen(false)} disabled={saving}>Batal</button>
              <button className={btnPrimary} onClick={createRecipe} disabled={saving}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : null}
                {saving ? "Membuat…" : "Buat & Isi Resep"}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <ErrorBox message={formError} />
            <div>
              <label className={labelClass}>Kategori produk</label>
              <select className={inputClass} value={form.product_category} onChange={(e) => setForm({ ...form, product_category: e.target.value })}>
                <option value="">— Pilih kategori —</option>
                {availableCategories.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
              {activeCategories.size > 0 ? (
                <p className="mt-1 text-[11px] text-slate-400">
                  Kategori yang sudah punya resep aktif tidak muncul di sini. Buka resep itu untuk membuat versi baru.
                </p>
              ) : null}
            </div>
            <div>
              <label className={labelClass}>Tanggal berlaku</label>
              <input type="date" className={inputClass} value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Catatan</label>
              <textarea className={`${inputClass} min-h-[80px]`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
        </Drawer>
      </div>
    </AccessGate>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardList, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { formatDate, formatQty, formatRupiah } from "@/lib/produksi";
import { produksiFetch } from "@/lib/produksi-api";
import {
  BAHAN_GROUPS,
  bahanGroupLabel,
  filterSummary,
  parseBahanPaste,
  parseBiayaPaste,
  type ImportBahanRow,
  type ImportBiayaRow,
  type RecipeLine,
} from "@/lib/produksi-resep";
import { useProduksiAccess } from "./useAccess";
import {
  AccessGate,
  Badge,
  Drawer,
  EmptyState,
  ErrorBox,
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
  created_by: string;
  updated_at: string;
};

type RecipeLineDetail = RecipeLine & {
  component_code?: string | null;
  component_unit?: string | null;
  filter_fabric_name?: string | null;
};

type Options = {
  categories: string[];
  series: string[];
  sizes: string[];
  colors: string[];
  fabrics: { id: string; name: string }[];
  cost_groups: string[];
};

type ComponentOption = {
  id: string;
  code: string;
  name: string;
  category: string;
  unit_use: string;
  stock: number;
  real_price?: number;
  safe_price?: number;
};

type Tab = "isi" | "kalkulator" | "matriks";

export default function ResepDetailView({ id }: { id: string }) {
  const access = useProduksiAccess();
  const router = useRouter();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [lines, setLines] = useState<RecipeLineDetail[]>([]);
  const [options, setOptions] = useState<Options | null>(null);
  const [components, setComponents] = useState<ComponentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("isi");

  const [effectiveDate, setEffectiveDate] = useState("");
  const [notes, setNotes] = useState("");
  const [initialLineCount, setInitialLineCount] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [lineDrawer, setLineDrawer] = useState<{ open: boolean; index: number | null; type: "bahan" | "biaya" }>({
    open: false,
    index: null,
    type: "bahan",
  });
  const [importMode, setImportMode] = useState<"bahan" | "biaya" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, optionJson, componentJson] = await Promise.all([
        produksiFetch<{ item: Recipe; lines: RecipeLineDetail[] }>(
          `/api/ops/production/recipes/${id}`,
        ),
        produksiFetch<Options>("/api/ops/production/recipes/options"),
        produksiFetch<{ items: ComponentOption[] }>("/api/ops/production/components"),
      ]);
      setRecipe(detail.item);
      setLines(detail.lines || []);
      setInitialLineCount((detail.lines || []).length);
      setEffectiveDate(String(detail.item.effective_date || "").slice(0, 10));
      setNotes(detail.item.notes || "");
      setOptions(optionJson);
      setComponents(componentJson.items || []);
      setDirty(false);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat resep.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (access.role === "owner") load();
  }, [load, access.role]);

  const fabricName = useCallback(
    (fabricId?: string | null) =>
      (options?.fabrics || []).find((f) => f.id === fabricId)?.name || "—",
    [options],
  );

  const bahanLines = useMemo(() => lines.filter((line) => line.line_type === "bahan"), [lines]);
  const biayaLines = useMemo(() => lines.filter((line) => line.line_type === "biaya"), [lines]);

  function addLine(line: RecipeLine) {
    setLines((current) => {
      if (lineDrawer.index === null) return [...current, line];
      return current.map((row, index) => (index === lineDrawer.index ? { ...line, id: row.id } : row));
    });
    setDirty(true);
    setLineDrawer({ open: false, index: null, type: "bahan" });
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, i) => i !== index));
    setDirty(true);
  }

  function addImported(rows: RecipeLine[]) {
    setLines((current) => [...current, ...rows]);
    setDirty(true);
    setImportMode(null);
  }

  async function save() {
    if (saving || !recipe) return;
    setSaveError("");
    if (!effectiveDate) return setSaveError("Tanggal berlaku wajib diisi.");

    setSaving(true);
    try {
      const json = await produksiFetch<{ item: { id: string; version: number } }>(
        "/api/ops/production/recipes",
        {
          method: "POST",
          body: JSON.stringify({
            id: recipe.id,
            effective_date: effectiveDate,
            notes,
            lines: lines.map((line) => ({
              line_type: line.line_type,
              group_code: line.group_code,
              group_label: line.group_label,
              component_id: line.component_id,
              name: line.name,
              qty_per_pcs: line.qty_per_pcs,
              waste_percent: line.waste_percent,
              size_qty: line.size_qty,
              real_price: line.real_price,
              safe_price: line.safe_price,
              filter_fabric_type_id: line.filter_fabric_type_id,
              filter_series: line.filter_series,
              filter_size: line.filter_size,
              filter_color: line.filter_color,
              notes: line.notes,
            })),
          }),
        },
      );
      setDirty(false);
      if (json.item.id === recipe.id) {
        await load();
      } else {
        router.replace(`/ops/produksi/resep/${json.item.id}`);
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Gagal menyimpan resep.");
    } finally {
      setSaving(false);
    }
  }

  const selectedLine = lineDrawer.index !== null ? lines[lineDrawer.index] : null;

  return (
    <AccessGate access={access} ownerOnly>
      <div className="space-y-4">
        <Link
          href="/ops/produksi/resep"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft size={14} /> Kembali ke Resep Produk
        </Link>

        <ErrorBox message={error} />
        {loading ? (
          <div className={cardClass}><Spinner /></div>
        ) : !recipe ? (
          <div className={cardClass}><EmptyState title="Resep tidak ditemukan" /></div>
        ) : (
          <>
            <PageHead
              title={`Resep ${recipe.product_category}`}
              subtitle={`Versi ${recipe.version} · berlaku ${formatDate(recipe.effective_date)}${recipe.created_by ? ` · oleh ${recipe.created_by}` : ""}`}
              actions={
                <div className="flex items-center gap-2">
                  <Badge tone={recipe.is_active ? "green" : "slate"}>
                    {recipe.is_active ? "Aktif" : "Versi lama"}
                  </Badge>
                  {dirty ? <Badge tone="amber">Belum disimpan</Badge> : null}
                </div>
              }
            />

            <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-[#1a1d28] p-1">
              {[
                { key: "isi", label: "Isi Resep" },
                { key: "kalkulator", label: "Kalkulator HPP" },
                { key: "matriks", label: "Matriks HPP" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key as Tab)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                    tab === item.key
                      ? "bg-[#1e3a5f] text-white"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {tab === "isi" ? (
              <IsiResep
                recipe={recipe}
                lines={lines}
                bahanLines={bahanLines}
                biayaLines={biayaLines}
                effectiveDate={effectiveDate}
                notes={notes}
                saving={saving}
                saveError={saveError}
                onEffectiveDate={setEffectiveDate}
                onNotes={setNotes}
                onSave={save}
                onAdd={(type) => setLineDrawer({ open: true, index: null, type })}
                onEdit={(index) => setLineDrawer({ open: true, index, type: lines[index].line_type })}
                onRemove={removeLine}
                onImport={setImportMode}
                fabricName={fabricName}
                isNewRecipe={initialLineCount === 0}
              />
            ) : null}

            {tab === "kalkulator" ? (
              <KalkulatorTab recipeId={recipe.id} options={options} />
            ) : null}

            {tab === "matriks" ? (
              <MatriksTab recipeId={recipe.id} options={options} />
            ) : null}

            <LineDrawer
              open={lineDrawer.open}
              type={lineDrawer.type}
              initial={selectedLine}
              options={options}
              components={components}
              onClose={() => setLineDrawer({ open: false, index: null, type: "bahan" })}
              onSave={addLine}
            />

            <ImportDrawer
              mode={importMode}
              options={options}
              components={components}
              onClose={() => setImportMode(null)}
              onAdd={addImported}
            />
          </>
        )}
      </div>
    </AccessGate>
  );
}

// ── Tab Isi Resep ────────────────────────────────────────────────────────────

function IsiResep({
  recipe,
  lines,
  bahanLines,
  biayaLines,
  effectiveDate,
  notes,
  saving,
  saveError,
  onEffectiveDate,
  onNotes,
  onSave,
  onAdd,
  onEdit,
  onRemove,
  onImport,
  fabricName,
  isNewRecipe,
}: {
  recipe: Recipe;
  lines: RecipeLineDetail[];
  bahanLines: RecipeLineDetail[];
  biayaLines: RecipeLineDetail[];
  effectiveDate: string;
  notes: string;
  saving: boolean;
  saveError: string;
  onEffectiveDate: (value: string) => void;
  onNotes: (value: string) => void;
  onSave: () => void;
  onAdd: (type: "bahan" | "biaya") => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
  onImport: (mode: "bahan" | "biaya") => void;
  fabricName: (id?: string | null) => string;
  isNewRecipe: boolean;
}) {
  const readOnly = !recipe.is_active;

  return (
    <div className="space-y-4">
      {readOnly ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
          Ini versi lama dan hanya bisa dibaca. Buka versi aktif untuk membuat versi baru.
        </div>
      ) : null}

      <div className={`${cardClass} p-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelClass}>Tanggal berlaku versi berikutnya</label>
            <input type="date" className={`${inputClass} w-auto`} value={effectiveDate} onChange={(e) => onEffectiveDate(e.target.value)} disabled={readOnly} />
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className={labelClass}>Catatan</label>
            <input className={inputClass} value={notes} onChange={(e) => onNotes(e.target.value)} disabled={readOnly} placeholder="Contoh: update harga kain Oktober" />
          </div>
          {!readOnly ? (
            <button className={btnPrimary} onClick={onSave} disabled={saving}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : null}
              {saving ? "Menyimpan…" : isNewRecipe ? "Simpan Resep" : `Simpan jadi Versi ${recipe.version + 1}`}
            </button>
          ) : null}
        </div>
        <ErrorBox message={saveError} />
        {!readOnly ? (
          <p className="mt-2 text-[11px] text-slate-400">
            {isNewRecipe
              ? `Resep baru masih kosong, jadi isian ini disimpan di versi ${recipe.version}. Setelah ada baris tersimpan, perubahan berikutnya membuat versi baru.`
              : `Menyimpan tidak menimpa versi ini. Sistem membuat versi ${recipe.version + 1} dan menonaktifkan versi ${recipe.version}.`}
          </p>
        ) : null}
      </div>

      {/* Baris bahan */}
      <div className={`${cardClass} overflow-hidden`}>
        <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">Baris bahan</p>
            <p className="text-[11px] text-slate-400">{bahanLines.length} baris · komponen dari master Fase 1</p>
          </div>
          {!readOnly ? (
            <div className="flex items-center gap-2">
              <button className={btnSecondary} onClick={() => onImport("bahan")}>
                <ClipboardList size={15} /> Import Paste
              </button>
              <button className={btnPrimary} onClick={() => onAdd("bahan")}>
                <Plus size={15} /> Bahan
              </button>
            </div>
          ) : null}
        </div>
        <div>
          <table className="w-full border-collapse table-fixed">
            <colgroup>
              <col className="w-[27%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[8%]" />
              <col className="w-[20%]" />
              <col className="w-[11%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead>
              <tr className="bg-[#1e3a5f]">
                {["Komponen", "Kelompok", "Qty / pcs", "Susut", "Filter", "Status", ""].map((h) => (
                  <th key={h} className="px-2 py-2.5 text-left text-[11px] font-bold text-white uppercase tracking-wide leading-tight">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bahanLines.length === 0 ? (
                <tr><td colSpan={7}><EmptyState title="Belum ada bahan" description="Tambahkan komponen atau tempel dari Excel." /></td></tr>
              ) : (
                bahanLines.map((line) => {
                  const index = lines.indexOf(line);
                  const hasSizeOverride = Object.values(line.size_qty || {}).some((value) => Number(value) > 0);
                  const unused = Number(line.qty_per_pcs) <= 0 && !hasSizeOverride;
                  return (
                    <tr key={line.id || index} className="border-b border-gray-100 dark:border-slate-800/50">
                      <td className="px-2 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug break-words">
                        {line.component_code ? `${line.component_code} · ` : ""}{line.name}
                      </td>
                      <td className="px-2 py-2.5 text-[11px] text-slate-600 dark:text-slate-300 leading-snug break-words">{bahanGroupLabel(line.group_code)}</td>
                      <td className="px-2 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                        {formatQty(line.qty_per_pcs)} {line.unit_use || ""}
                        {Object.keys(line.size_qty || {}).length > 0 ? (
                          <span className="block text-[10px] text-slate-400">
                            {Object.entries(line.size_qty).map(([size, qty]) => `${size}: ${formatQty(Number(qty))}`).join(" · ")}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatQty(line.waste_percent)}%</td>
                      <td className="px-2 py-2.5 text-[10px] text-slate-500 dark:text-slate-400 leading-snug break-words">{filterSummary(line, fabricName)}</td>
                      <td className="px-2 py-2.5">
                        {unused ? <Badge tone="slate">Tidak dipakai</Badge> : <Badge tone="green">Dipakai</Badge>}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {!readOnly ? (
                          <div className="inline-flex items-center gap-1">
                            <button className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => onEdit(index)} aria-label="Edit baris">
                              <Pencil size={13} />
                            </button>
                            <button className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => onRemove(index)} aria-label="Hapus baris">
                              <Trash2 size={13} />
                            </button>
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

      {/* Baris biaya */}
      <div className={`${cardClass} overflow-hidden`}>
        <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">Baris biaya non-bahan</p>
            <p className="text-[11px] text-slate-400">{biayaLines.length} baris · nominal Real &amp; Aman per pcs</p>
          </div>
          {!readOnly ? (
            <div className="flex items-center gap-2">
              <button className={btnSecondary} onClick={() => onImport("biaya")}>
                <ClipboardList size={15} /> Import Paste
              </button>
              <button className={btnPrimary} onClick={() => onAdd("biaya")}>
                <Plus size={15} /> Biaya
              </button>
            </div>
          ) : null}
        </div>
        <div>
          <table className="w-full border-collapse table-fixed">
            <colgroup>
              <col className="w-[28%]" />
              <col className="w-[16%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[22%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead>
              <tr className="bg-[#1e3a5f]">
                {["Nama biaya", "Kelompok", "Real / pcs", "Aman / pcs", "Filter", ""].map((h) => (
                  <th key={h} className="px-2 py-2.5 text-left text-[11px] font-bold text-white uppercase tracking-wide leading-tight">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {biayaLines.length === 0 ? (
                <tr><td colSpan={6}><EmptyState title="Belum ada biaya" description="Tambahkan biaya jahit, potong, finishing, dan lainnya." /></td></tr>
              ) : (
                biayaLines.map((line) => {
                  const index = lines.indexOf(line);
                  return (
                    <tr key={line.id || index} className="border-b border-gray-100 dark:border-slate-800/50">
                      <td className="px-2 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug break-words">{line.name}</td>
                      <td className="px-2 py-2.5 text-[11px] text-slate-600 dark:text-slate-300 leading-snug break-words">{line.group_label || "—"}</td>
                      <td className="px-2 py-2.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">Rp {formatRupiah(line.real_price)}</td>
                      <td className="px-2 py-2.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">Rp {formatRupiah(line.safe_price)}</td>
                      <td className="px-2 py-2.5 text-[10px] text-slate-500 dark:text-slate-400 leading-snug break-words">{filterSummary(line, fabricName)}</td>
                      <td className="px-2 py-2.5 text-right">
                        {!readOnly ? (
                          <div className="inline-flex items-center gap-1">
                            <button className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => onEdit(index)} aria-label="Edit baris">
                              <Pencil size={13} />
                            </button>
                            <button className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => onRemove(index)} aria-label="Hapus baris">
                              <Trash2 size={13} />
                            </button>
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
    </div>
  );
}

// ── Drawer baris ─────────────────────────────────────────────────────────────

type LineForm = {
  line_type: "bahan" | "biaya";
  group_code: string;
  component_id: string;
  name: string;
  qty_per_pcs: string;
  waste_percent: string;
  group_label: string;
  real_price: string;
  safe_price: string;
  filter_fabric_type_id: string;
  filter_series: string;
  filter_size: string;
  filter_color: string;
  notes: string;
  size_qty: Record<string, string>;
};

function toForm(line: RecipeLineDetail | null, type: "bahan" | "biaya"): LineForm {
  return {
    line_type: line?.line_type || type,
    group_code: line?.group_code || (type === "biaya" ? "biaya" : "bahan_produksi"),
    component_id: line?.component_id || "",
    name: line?.name || "",
    qty_per_pcs: String(line?.qty_per_pcs ?? 0),
    waste_percent: String(line?.waste_percent ?? 0),
    group_label: line?.group_label || "",
    real_price: String(line?.real_price ?? 0),
    safe_price: String(line?.safe_price ?? 0),
    filter_fabric_type_id: line?.filter_fabric_type_id || "",
    filter_series: line?.filter_series || "",
    filter_size: line?.filter_size || "",
    filter_color: line?.filter_color || "",
    notes: line?.notes || "",
    size_qty: Object.fromEntries(
      Object.entries(line?.size_qty || {}).map(([size, qty]) => [size, String(qty)]),
    ),
  };
}

function LineDrawer({
  open,
  type,
  initial,
  options,
  components,
  onClose,
  onSave,
}: {
  open: boolean;
  type: "bahan" | "biaya";
  initial: RecipeLineDetail | null;
  options: Options | null;
  components: ComponentOption[];
  onClose: () => void;
  onSave: (line: RecipeLine) => void;
}) {
  const [form, setForm] = useState<LineForm>(() => toForm(initial, type));
  const [error, setError] = useState("");
  const [extraGroups, setExtraGroups] = useState<string[]>([]);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  const [groupError, setGroupError] = useState("");

  useEffect(() => {
    if (open) {
      setForm(toForm(initial, type));
      setError("");
      setNewGroupOpen(false);
      setNewGroupName("");
      setGroupError("");
    }
  }, [open, initial, type]);

  const isBahan = form.line_type === "bahan";
  const isKain = isBahan && form.group_code === "kain";
  const selectedComponent = components.find((c) => c.id === form.component_id);

  // Daftar kelompok biaya: default + tambahan Owner + label lama (teks bebas).
  const costGroups = useMemo(() => {
    const list = [...(options?.cost_groups || []), ...extraGroups];
    if (form.group_label) list.push(form.group_label);
    const seen = new Set<string>();
    return list.filter((name) => {
      const key = name.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [options, extraGroups, form.group_label]);

  async function addGroup() {
    const name = newGroupName.trim();
    if (!name) return setGroupError("Nama kelompok wajib diisi.");
    setAddingGroup(true);
    setGroupError("");
    try {
      const json = await produksiFetch<{ name: string }>("/api/ops/production/cost-groups", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setExtraGroups((current) => Array.from(new Set([...current, json.name])));
      setForm((current) => ({ ...current, group_label: json.name }));
      setNewGroupOpen(false);
      setNewGroupName("");
    } catch (e) {
      setGroupError(e instanceof Error ? e.message : "Gagal menambah kelompok.");
    } finally {
      setAddingGroup(false);
    }
  }

  function save() {
    setError("");
    if (isBahan && !form.component_id) return setError("Pilih komponen.");
    if (isBahan && !form.name.trim()) return setError("Komponen belum dipilih.");
    if (!isBahan && !form.name.trim()) return setError("Nama biaya wajib diisi.");
    if (!isBahan && !form.group_label.trim()) return setError("Kelompok biaya wajib diisi.");
    if (isKain && !form.filter_fabric_type_id) return setError("Baris kain wajib memilih jenis kain.");
    const qty = Number(form.qty_per_pcs);
    const waste = Number(form.waste_percent);
    if (!Number.isFinite(qty) || qty < 0) return setError("Qty per pcs tidak valid.");
    if (!Number.isFinite(waste) || waste < 0) return setError("Susut tidak valid.");

    const sizeQty: Record<string, number> = {};
    for (const [size, value] of Object.entries(form.size_qty)) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) sizeQty[size] = n;
    }

    onSave({
      line_type: form.line_type,
      group_code: isBahan ? form.group_code : "biaya",
      group_label: isBahan ? null : form.group_label.trim(),
      component_id: isBahan ? form.component_id : null,
      name: form.name.trim(),
      qty_per_pcs: isBahan ? qty : 1,
      waste_percent: isBahan ? waste : 0,
      size_qty: isKain ? sizeQty : {},
      real_price: isBahan ? 0 : Number(form.real_price) || 0,
      safe_price: isBahan ? 0 : Number(form.safe_price) || 0,
      filter_fabric_type_id: form.filter_fabric_type_id || null,
      filter_series: form.filter_series || null,
      filter_size: form.filter_size || null,
      filter_color: form.filter_color || null,
      notes: form.notes || null,
    });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      wide
      title={initial ? "Ubah Baris Resep" : isBahan ? "Tambah Bahan" : "Tambah Biaya"}
      subtitle="Filter kosong berarti baris berlaku untuk semua kombinasi."
      footer={
        <div className="flex items-center justify-end gap-2">
          <button className={btnSecondary} onClick={onClose}>Batal</button>
          <button className={btnPrimary} onClick={save}>
            <Plus size={15} /> {initial ? "Simpan Baris" : "Tambahkan"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <ErrorBox message={error} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Jenis baris</label>
            <select
              className={inputClass}
              value={form.line_type}
              onChange={(e) => {
                const next = e.target.value as "bahan" | "biaya";
                setForm({ ...form, line_type: next, group_code: next === "biaya" ? "biaya" : "bahan_produksi" });
              }}
            >
              <option value="bahan">Bahan</option>
              <option value="biaya">Biaya Non-Bahan</option>
            </select>
          </div>
          {isBahan ? (
            <div>
              <label className={labelClass}>Kelompok</label>
              <select className={inputClass} value={form.group_code} onChange={(e) => setForm({ ...form, group_code: e.target.value })}>
                {BAHAN_GROUPS.map((group) => (
                  <option key={group.value} value={group.value}>{group.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className={labelClass}>Kelompok biaya</label>
              <select
                className={inputClass}
                value={form.group_label}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "__new__") {
                    setNewGroupOpen(true);
                    return;
                  }
                  setForm({ ...form, group_label: value });
                  setNewGroupOpen(false);
                  setGroupError("");
                }}
              >
                <option value="">— Pilih kelompok —</option>
                {costGroups.map((group) => <option key={group} value={group}>{group}</option>)}
                <option value="__new__">+ Tambah kelompok baru…</option>
              </select>
              {newGroupOpen ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    className={inputClass}
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Nama kelompok baru"
                    autoFocus
                  />
                  <button type="button" className={btnSecondary} onClick={addGroup} disabled={addingGroup}>
                    {addingGroup ? <Loader2 size={14} className="animate-spin" /> : null}
                    Tambah
                  </button>
                  <button
                    type="button"
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                    onClick={() => { setNewGroupOpen(false); setNewGroupName(""); setGroupError(""); }}
                  >
                    Batal
                  </button>
                </div>
              ) : null}
              {groupError ? <p className="mt-1 text-[11px] font-semibold text-red-600">{groupError}</p> : null}
            </div>
          )}
        </div>

        {isBahan ? (
          <>
            <div>
              <label className={labelClass}>Komponen</label>
              <select
                className={inputClass}
                value={form.component_id}
                onChange={(e) => {
                  const component = components.find((c) => c.id === e.target.value);
                  setForm({ ...form, component_id: e.target.value, name: component?.name || "" });
                }}
              >
                <option value="">— Pilih komponen —</option>
                {components.map((component) => (
                  <option key={component.id} value={component.id}>
                    {component.code} · {component.name} ({component.unit_use})
                  </option>
                ))}
              </select>
              {isKain ? (
                <p className="mt-1 text-[11px] text-slate-400">Baris kain wajib punya filter jenis kain.</p>
              ) : null}
              {selectedComponent ? (
                <p className="mt-1 text-[11px] text-slate-400">
                  Harga Real Rp {formatRupiah(selectedComponent.real_price)} · Harga Aman Rp {formatRupiah(selectedComponent.safe_price)} per {selectedComponent.unit_use}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Qty per pcs ({selectedComponent?.unit_use || "satuan pakai"})</label>
                <input className={inputClass} inputMode="decimal" value={form.qty_per_pcs} onChange={(e) => setForm({ ...form, qty_per_pcs: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Susut % (opsional)</label>
                <input className={inputClass} inputMode="decimal" value={form.waste_percent} onChange={(e) => setForm({ ...form, waste_percent: e.target.value })} />
              </div>
            </div>

            {isKain ? (
              <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3">
                <p className={labelClass}>Qty khusus per ukuran (opsional)</p>
                <p className="text-[11px] text-slate-400 mb-2">Kosongkan kalau ukuran itu memakai qty default di atas.</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {(options?.sizes || []).map((size) => (
                    <div key={size}>
                      <label className="text-[10px] font-bold text-slate-400">{size}</label>
                      <input
                        className={inputClass}
                        inputMode="decimal"
                        value={form.size_qty[size] || ""}
                        onChange={(e) =>
                          setForm((current) => ({
                            ...current,
                            size_qty: { ...current.size_qty, [size]: e.target.value },
                          }))
                        }
                        placeholder="—"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Nama biaya</label>
              <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Biaya Jahit" />
            </div>
            <div>
              <label className={labelClass}>Real / pcs</label>
              <input className={inputClass} inputMode="decimal" value={form.real_price} onChange={(e) => setForm({ ...form, real_price: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Aman / pcs</label>
              <input className={inputClass} inputMode="decimal" value={form.safe_price} onChange={(e) => setForm({ ...form, safe_price: e.target.value })} />
            </div>
          </div>
        )}

        <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3 space-y-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Filter baris</p>
            <p className="text-[11px] text-slate-400">Kosong = berlaku untuk semua.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Jenis kain</label>
              <select className={inputClass} value={form.filter_fabric_type_id} onChange={(e) => setForm({ ...form, filter_fabric_type_id: e.target.value })}>
                <option value="">Semua jenis kain</option>
                {(options?.fabrics || []).map((fabric) => (
                  <option key={fabric.id} value={fabric.id}>{fabric.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Series</label>
              <select className={inputClass} value={form.filter_series} onChange={(e) => setForm({ ...form, filter_series: e.target.value })}>
                <option value="">Semua series</option>
                {(options?.series || []).map((series) => (
                  <option key={series} value={series}>{series}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Ukuran</label>
              <select className={inputClass} value={form.filter_size} onChange={(e) => setForm({ ...form, filter_size: e.target.value })}>
                <option value="">Semua ukuran</option>
                {(options?.sizes || []).map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Warna</label>
              <select className={inputClass} value={form.filter_color} onChange={(e) => setForm({ ...form, filter_color: e.target.value })}>
                <option value="">Semua warna</option>
                {(options?.colors || []).map((color) => <option key={color} value={color}>{color}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div>
          <label className={labelClass}>Catatan</label>
          <input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
    </Drawer>
  );
}

// ── Import Paste ─────────────────────────────────────────────────────────────

function ImportDrawer({
  mode,
  options,
  components,
  onClose,
  onAdd,
}: {
  mode: "bahan" | "biaya" | null;
  options: Options | null;
  components: ComponentOption[];
  onClose: () => void;
  onAdd: (lines: RecipeLine[]) => void;
}) {
  const [text, setText] = useState("");
  const [bahanRows, setBahanRows] = useState<ImportBahanRow[]>([]);
  const [biayaRows, setBiayaRows] = useState<ImportBiayaRow[]>([]);

  useEffect(() => {
    if (!mode) {
      setText("");
      setBahanRows([]);
      setBiayaRows([]);
    }
  }, [mode]);

  useEffect(() => {
    if (!mode) return;
    if (mode === "bahan") {
      const parsed = parseBahanPaste(text, components, options?.fabrics || []);
      setBahanRows(parsed.rows);
    } else {
      const parsed = parseBiayaPaste(text, options?.fabrics || []);
      setBiayaRows(parsed.rows);
    }
  }, [text, mode, components, options]);

  const validBahan = bahanRows.filter((row) => row.errors.length === 0);
  const validBiaya = biayaRows.filter((row) => row.errors.length === 0);

  function add() {
    if (mode === "bahan") {
      const lines: RecipeLine[] = validBahan.map((row) => {
        const component = components.find((c) => c.id === row.component_id);
        return {
          line_type: "bahan",
          group_code: row.group_code,
          group_label: null,
          component_id: row.component_id,
          name: component?.name || row.component_label,
          qty_per_pcs: row.qty_per_pcs,
          waste_percent: row.waste_percent,
          size_qty: {},
          real_price: 0,
          safe_price: 0,
          filter_fabric_type_id: row.filter_fabric_type_id,
          filter_series: row.filter_series || null,
          filter_size: row.filter_size || null,
          filter_color: null,
          notes: null,
        };
      });
      onAdd(lines);
      return;
    }

    const lines: RecipeLine[] = validBiaya.map((row) => ({
      line_type: "biaya",
      group_code: "biaya",
      group_label: row.group_label,
      component_id: null,
      name: row.name,
      qty_per_pcs: 1,
      waste_percent: 0,
      size_qty: {},
      real_price: row.real_price,
      safe_price: row.safe_price,
      filter_fabric_type_id: row.filter_fabric_type_id,
      filter_series: row.filter_series || null,
      filter_size: row.filter_size || null,
      filter_color: null,
      notes: null,
    }));
    onAdd(lines);
  }

  const rows = mode === "bahan" ? bahanRows : biayaRows;
  const valid = mode === "bahan" ? validBahan.length : validBiaya.length;

  return (
    <Drawer
      open={Boolean(mode)}
      onClose={onClose}
      wide
      title={mode === "biaya" ? "Import Paste Biaya" : "Import Paste Bahan"}
      subtitle="Tempel dari Excel/Sheet. Baris valid ditambahkan ke editor, belum disimpan ke database."
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">{rows.length} baris · {valid} siap</p>
          <div className="flex items-center gap-2">
            <button className={btnSecondary} onClick={onClose}>Tutup</button>
            <button className={btnPrimary} onClick={add} disabled={valid === 0}>Tambahkan {valid} baris</button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/20 px-3 py-2.5">
          <p className="text-[11px] font-bold text-blue-800 dark:text-blue-200">
            {mode === "biaya"
              ? "Urutan: nama biaya · nominal Real · nominal Aman · kelompok · filter jenis kain · filter series · filter ukuran"
              : "Urutan: nama komponen · qty per pcs · kelompok · filter jenis kain · filter series · filter ukuran · susut % (opsional)"}
          </p>
        </div>

        <textarea
          className={`${inputClass} min-h-[150px] font-mono text-xs`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            mode === "biaya"
              ? "Biaya Jahit\t25000\t30000\tBiaya Jahit\t\tJiharkah\t"
              : "Kain A-02\t1.8\tKain\tA-02\tJiharkah\tL\t5"
          }
        />

        {rows.length > 0 ? (
          <div className={`${cardClass} overflow-hidden`}>
            <div className="max-h-[320px] overflow-auto no-scrollbar">
              <table className="w-full border-collapse table-fixed">
                <thead className="sticky top-0">
                  <tr className="bg-[#1e3a5f]">
                    {mode === "biaya"
                      ? ["#", "Nama", "Real", "Aman", "Kelompok", "Filter", "Status"].map((h) => (
                          <th key={h} className="px-2 py-2 text-left text-[10px] font-bold text-white uppercase leading-tight">{h}</th>
                        ))
                      : ["#", "Komponen", "Qty", "Kelompok", "Filter", "Susut", "Status"].map((h) => (
                          <th key={h} className="px-2 py-2 text-left text-[10px] font-bold text-white uppercase leading-tight">{h}</th>
                        ))}
                  </tr>
                </thead>
                <tbody>
                  {mode === "biaya"
                    ? biayaRows.map((row) => (
                        <tr key={row.line} className={`border-b border-slate-100 dark:border-slate-800 ${row.errors.length ? "bg-red-50/70 dark:bg-red-900/10" : ""}`}>
                          <td className="px-2.5 py-2 text-xs text-slate-400">{row.line}</td>
                          <td className="px-2.5 py-2 text-xs font-bold text-slate-800 dark:text-slate-100">{row.name || "—"}</td>
                          <td className="px-2.5 py-2 text-xs text-slate-600 dark:text-slate-300">{formatRupiah(row.real_price)}</td>
                          <td className="px-2.5 py-2 text-xs text-slate-600 dark:text-slate-300">{formatRupiah(row.safe_price)}</td>
                          <td className="px-2.5 py-2 text-xs text-slate-600 dark:text-slate-300">{row.group_label || "—"}</td>
                          <td className="px-2.5 py-2 text-[11px] text-slate-500">{[row.filter_series, row.filter_size].filter(Boolean).join(" · ") || "Semua"}</td>
                          <td className="px-2 py-2 text-[10px] font-bold leading-snug break-words">
                            {row.errors.length ? <span className="text-red-600 dark:text-red-300">{row.errors.join("; ")}</span> : <span className="text-emerald-600">OK</span>}
                          </td>
                        </tr>
                      ))
                    : bahanRows.map((row) => (
                        <tr key={row.line} className={`border-b border-slate-100 dark:border-slate-800 ${row.errors.length ? "bg-red-50/70 dark:bg-red-900/10" : ""}`}>
                          <td className="px-2.5 py-2 text-xs text-slate-400">{row.line}</td>
                          <td className="px-2.5 py-2 text-xs font-bold text-slate-800 dark:text-slate-100">{row.component_label || "—"}</td>
                          <td className="px-2.5 py-2 text-xs text-slate-600 dark:text-slate-300">{formatQty(row.qty_per_pcs)}</td>
                          <td className="px-2.5 py-2 text-xs text-slate-600 dark:text-slate-300">{bahanGroupLabel(row.group_code)}</td>
                          <td className="px-2.5 py-2 text-[11px] text-slate-500">
                            {[row.filter_fabric_type_id ? "kain" : "", row.filter_series, row.filter_size].filter(Boolean).join(" · ") || "Semua"}
                          </td>
                          <td className="px-2.5 py-2 text-xs text-slate-600 dark:text-slate-300">{formatQty(row.waste_percent)}%</td>
                          <td className="px-2 py-2 text-[10px] font-bold leading-snug break-words">
                            {row.errors.length ? <span className="text-red-600 dark:text-red-300">{row.errors.join("; ")}</span> : <span className="text-emerald-600">OK</span>}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}

// ── Kalkulator ───────────────────────────────────────────────────────────────

type CalcResult = {
  groups: {
    key: string;
    label: string;
    real: number;
    safe: number;
    lines: { id?: string; name: string; detail: string; cost_real: number; cost_safe: number; warning: string }[];
  }[];
  totals: { real: number; safe: number; real_without_optional: number; safe_without_optional: number; diff: number };
  warnings: { name: string; reason: string; code?: string; message?: string }[];
  has_warning: boolean;
  skipped_lines: number;
};

function KalkulatorTab({ recipeId, options }: { recipeId: string; options: Options | null }) {
  const [selection, setSelection] = useState({ fabric_type_id: "", series: "", size: "", color: "" });
  const [includeOptional, setIncludeOptional] = useState(true);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!options) return;
    setSelection((current) => ({
      ...current,
      size: current.size || (options.sizes.includes("L") ? "L" : options.sizes[0] || ""),
      fabric_type_id: current.fabric_type_id || options.fabrics[0]?.id || "",
    }));
  }, [options]);

  useEffect(() => {
    if (!options) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (selection.fabric_type_id) params.set("fabric_type_id", selection.fabric_type_id);
    if (selection.series) params.set("series", selection.series);
    if (selection.size) params.set("size", selection.size);
    if (selection.color) params.set("color", selection.color);

    produksiFetch<{ result: CalcResult }>(`/api/ops/production/recipes/${recipeId}/calc?${params.toString()}`)
      .then((json) => {
        if (!cancelled) { setResult(json.result); setError(""); }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Gagal menghitung HPP.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [recipeId, selection, options]);

  const activeTotal = includeOptional
    ? { real: result?.totals.real || 0, safe: result?.totals.safe || 0 }
    : { real: result?.totals.real_without_optional || 0, safe: result?.totals.safe_without_optional || 0 };

  return (
    <div className="space-y-4">
      <div className={`${cardClass} p-4`}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className={labelClass}>Jenis kain</label>
            <select className={inputClass} value={selection.fabric_type_id} onChange={(e) => setSelection({ ...selection, fabric_type_id: e.target.value })}>
              <option value="">Semua jenis kain</option>
              {(options?.fabrics || []).map((fabric) => <option key={fabric.id} value={fabric.id}>{fabric.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Series</label>
            <select className={inputClass} value={selection.series} onChange={(e) => setSelection({ ...selection, series: e.target.value })}>
              <option value="">Tanpa series</option>
              {(options?.series || []).map((series) => <option key={series} value={series}>{series}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Ukuran</label>
            <select className={inputClass} value={selection.size} onChange={(e) => setSelection({ ...selection, size: e.target.value })}>
              {(options?.sizes || []).map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Warna (opsional)</label>
            <select className={inputClass} value={selection.color} onChange={(e) => setSelection({ ...selection, color: e.target.value })}>
              <option value="">Semua warna</option>
              {(options?.colors || []).map((color) => <option key={color} value={color}>{color}</option>)}
            </select>
          </div>
        </div>

        <label className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={includeOptional} onChange={(e) => setIncludeOptional(e.target.checked)} className="h-4 w-4 rounded" />
          Hitung Cover &amp; Hanger (Tambahan Opsional)
        </label>
        <p className="mt-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          HPP dihitung dengan harga komponen saat ini.
        </p>
      </div>

      <ErrorBox message={error} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="HPP Real" value={`Rp ${formatRupiah(activeTotal.real)}`} hint={includeOptional ? "Include Cover & Hanger" : "Tanpa Cover & Hanger"} />
        <StatCard label="HPP Aman" value={`Rp ${formatRupiah(activeTotal.safe)}`} hint={includeOptional ? "Include Cover & Hanger" : "Tanpa Cover & Hanger"} />
        <StatCard
          label="Selisih Aman − Real"
          value={`${activeTotal.safe - activeTotal.real < 0 ? "−" : ""}Rp ${formatRupiah(Math.abs(activeTotal.safe - activeTotal.real))}`}
          tone={activeTotal.safe - activeTotal.real < 0 ? "danger" : "positive"}
          hint="Positif = Harga Aman lebih tinggi"
        />
        <StatCard label="Baris tidak dipakai" value={String(result?.skipped_lines || 0)} hint="Qty 0 / tidak dihitung" tone="muted" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className={`${cardClass} p-4`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Include Cover &amp; Hanger</p>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>Real <b>Rp {formatRupiah(result?.totals.real)}</b></span>
            <span>Aman <b>Rp {formatRupiah(result?.totals.safe)}</b></span>
          </div>
        </div>
        <div className={`${cardClass} p-4`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tanpa Cover &amp; Hanger</p>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>Real <b>Rp {formatRupiah(result?.totals.real_without_optional)}</b></span>
            <span>Aman <b>Rp {formatRupiah(result?.totals.safe_without_optional)}</b></span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Dihitung dari penjumlahan baris yang dipakai, bukan pengurangan.</p>
        </div>
      </div>

      {result?.has_warning ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-900/20">
          <p className="text-sm font-bold text-amber-800 dark:text-amber-200">HPP belum lengkap</p>
          <ul className="mt-1 space-y-0.5 text-xs text-amber-700 dark:text-amber-200/80">
            {result.warnings.map((warning, index) => (
              <li key={index}>• {warning.message || `${warning.code ? `${warning.code} · ` : ""}${warning.name} — ${warning.reason}`}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {loading ? (
        <div className={cardClass}><Spinner label="Menghitung HPP…" /></div>
      ) : !result || result.groups.length === 0 ? (
        <div className={cardClass}><EmptyState title="Belum ada baris yang cocok" description="Lengkapi isi resep atau ubah pilihan filter." /></div>
      ) : (
        result.groups.map((group) => (
          <div key={group.key} className={`${cardClass} overflow-hidden ${!includeOptional && group.key === "tambahan_opsional" ? "opacity-50" : ""}`}>
            <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-slate-900 dark:text-white">{group.label}</p>
              <div className="flex gap-4 text-xs font-bold text-slate-600 dark:text-slate-300">
                <span>Real Rp {formatRupiah(group.real)}</span>
                <span>Aman Rp {formatRupiah(group.safe)}</span>
              </div>
            </div>
            <div>
              <table className="w-full border-collapse table-fixed">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60">
                    {["Baris", "Perhitungan", "Real", "Aman", "Catatan"].map((h) => (
                      <th key={h} className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.lines.map((line, index) => (
                    <tr key={`${line.id || line.name}-${index}`} className="border-b border-gray-100 dark:border-slate-800/50 last:border-0">
                      <td className="px-2 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug break-words">{line.name}</td>
                      <td className="px-2 py-2 text-[11px] text-slate-500 dark:text-slate-400 leading-snug break-words">{line.detail}</td>
                      <td className="px-2 py-2 text-xs text-slate-700 dark:text-slate-200 whitespace-nowrap">Rp {formatRupiah(line.cost_real)}</td>
                      <td className="px-2 py-2 text-xs text-slate-700 dark:text-slate-200 whitespace-nowrap">Rp {formatRupiah(line.cost_safe)}</td>
                      <td className="px-2 py-2 text-[10px] text-amber-600 dark:text-amber-300 leading-snug break-words">{line.warning || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Matriks ──────────────────────────────────────────────────────────────────

type MatrixResponse = {
  uses_series: boolean;
  size: string | null;
  fabrics: { id: string; name: string }[];
  series: string[];
  rows: {
    fabric_id: string;
    fabric_name: string;
    series: string;
    real_include: number;
    safe_include: number;
    real_without: number;
    safe_without: number;
    diff_include: number;
    diff_without: number;
    warnings: number;
    warnings_detail?: string[];
  }[];
};

function MatriksTab({ recipeId, options }: { recipeId: string; options: Options | null }) {
  const [size, setSize] = useState("");
  const [data, setData] = useState<MatrixResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (size) params.set("size", size);
    produksiFetch<MatrixResponse>(
      `/api/ops/production/recipes/${recipeId}/matrix?${params.toString()}`,
    )
      .then((json) => {
        if (!cancelled) { setData(json); setError(""); }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Gagal memuat matriks.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [recipeId, size]);

  return (
    <div className="space-y-4">
      <div className={`${cardClass} p-4 flex flex-wrap items-end gap-3`}>
        <div>
          <label className={labelClass}>Ukuran</label>
          <select className={`${inputClass} w-auto min-w-[220px]`} value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="">Acuan (jumlah kain default)</option>
            {(options?.sizes || []).map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <div className="max-w-md">
          <p className="text-[11px] text-slate-400">
            Matriks mengikuti resep: {data?.uses_series ? "Jenis Kain × Series" : "Jenis Kain saja"}. Ukuran opsional,
            hanya memengaruhi baris kain yang punya jumlah berbeda per ukuran.
          </p>
          <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            HPP dihitung dengan harga komponen saat ini.
          </p>
        </div>
      </div>

      <ErrorBox message={error} />
      {loading ? (
        <div className={cardClass}><Spinner label="Menyusun matriks…" /></div>
      ) : !data ? (
        <div className={cardClass}><EmptyState title="Matriks belum tersedia" /></div>
      ) : (
        <div className={`${cardClass} overflow-hidden`}>
          <div>
            <table className="w-full border-collapse table-fixed">
              <thead>
                <tr className="bg-[#1e3a5f]">
                  {[
                    "Jenis Kain",
                    ...(data.uses_series ? ["Series"] : []),
                    "HPP Real (Include)",
                    "HPP Aman (Include)",
                    "HPP Real (Tanpa)",
                    "HPP Aman (Tanpa)",
                    "Selisih Aman − Real",
                  ].map((h) => (
                    <th key={h} className="px-2 py-2.5 text-left text-[10px] font-bold text-white uppercase tracking-wide leading-tight">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState title="Tidak ada kombinasi" /></td></tr>
                ) : (
                  data.rows.map((row, index) => (
                    <tr key={`${row.fabric_id}-${row.series}`} className={`${index % 2 === 0 ? "bg-white dark:bg-[#16171d]" : "bg-blue-50/30 dark:bg-[#1a1d28]"} border-b border-gray-100 dark:border-slate-800/50`}>
                      <td className="px-2 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug break-words">
                        {row.fabric_name}
                        {row.warnings > 0 ? (
                          <span className="ml-1 text-amber-500" title={row.warnings_detail?.join("; ") || "Ada komponen belum punya harga"}>⚠</span>
                        ) : null}
                        {row.warnings_detail?.length ? (
                          <p className="mt-1 text-[9px] font-semibold leading-snug text-amber-600 dark:text-amber-400">
                            {row.warnings_detail.join("; ")}
                          </p>
                        ) : null}
                      </td>
                      {data.uses_series ? <td className="px-2 py-2.5 text-xs text-slate-600 dark:text-slate-300 leading-snug break-words">{row.series || "—"}</td> : null}
                      <td className="px-2 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">Rp {formatRupiah(row.real_include)}</td>
                      <td className="px-2 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">Rp {formatRupiah(row.safe_include)}</td>
                      <td className="px-2 py-2.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">Rp {formatRupiah(row.real_without)}</td>
                      <td className="px-2 py-2.5 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">Rp {formatRupiah(row.safe_without)}</td>
                      <td className={`px-2 py-2.5 text-xs font-bold whitespace-nowrap ${row.diff_include < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {row.diff_include < 0 ? "−" : "+"}Rp {formatRupiah(Math.abs(row.diff_include))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Kolom “Include” memakai baris Tambahan Opsional (Cover &amp; Hanger). Kolom “Tanpa” menjumlahkan baris lain saja.
      </p>
    </div>
  );
}

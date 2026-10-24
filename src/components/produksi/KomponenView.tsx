"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, ClipboardList, Loader2, Pencil, Plus } from "lucide-react";
import {
  COMPONENT_CATEGORIES,
  COMPONENT_UNITS,
  MOVEMENT_TYPES,
  STOCK_STATUS_LABEL,
  categoryLabel,
  formatDate,
  formatQty,
  formatRupiah,
  movementLabel,
  parseComponentPaste,
  stockStatus,
  type FabricType,
  type ImportComponentRow,
} from "@/lib/produksi";
import { produksiFetch } from "@/lib/produksi-api";
import { useProduksiAccess } from "./useAccess";
import {
  AccessGate,
  Badge,
  Drawer,
  EmptyState,
  ErrorBox,
  FilterBar,
  FilterCheck,
  FilterDateRange,
  FilterSearch,
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

type ComponentRow = {
  id: string;
  code: string;
  name: string;
  category: string;
  unit_use: string;
  unit_buy: string;
  conversion: number;
  min_stock: number;
  supplier: string;
  notes: string;
  fabric_type_id: string | null;
  fabric_type_name: string;
  is_active: boolean;
  stock: number;
  reserved_stock?: number;
  available_stock?: number;
  status: "aman" | "menipis" | "habis";
  safe_price?: number;
  real_price?: number;
  last_buy_price?: number;
  stock_value?: number;
  price_gap?: number;
};

type Summary = {
  total: number;
  aman: number;
  menipis: number;
  habis: number;
  stock_value?: number;
};

type DetailMovement = {
  id: string;
  movement_date: string;
  type: string;
  qty: number;
  unit_use?: string;
  unit_price?: number;
  value?: number;
  running_balance: number;
  ref_type: string;
  ref_label?: string;
  notes: string;
  actor: string;
  created_at: string;
};

type DetailPurchase = {
  id: string;
  purchase_number: string;
  purchase_date: string;
  supplier: string;
  qty_buy: number;
  unit_buy: string;
  unit_use?: string;
  price_buy: number;
  qty_use: number;
  line_value: number;
  allocated_cost: number;
  final_unit_price: number;
};

const statusTone = { aman: "green", menipis: "amber", habis: "red" } as const;

const emptyForm = () => ({
  id: "",
  code: "",
  name: "",
  category: "kain",
  unit_use: "yard",
  unit_buy: "yard",
  conversion: "1",
  min_stock: "0",
  safe_price: "0",
  supplier: "",
  notes: "",
  fabric_type_id: "",
  is_active: true,
});

type FormState = ReturnType<typeof emptyForm>;

export default function KomponenView() {
  const access = useProduksiAccess();
  const [items, setItems] = useState<ComponentRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);

  const [fabricTypes, setFabricTypes] = useState<FabricType[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [detail, setDetail] = useState<ComponentRow | null>(null);
  const [detailMovements, setDetailMovements] = useState<DetailMovement[]>([]);
  const [detailPurchases, setDetailPurchases] = useState<DetailPurchase[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<"ringkasan" | "riwayat" | "pembelian">("ringkasan");
  const [movementType, setMovementType] = useState("");
  const [movementStart, setMovementStart] = useState("");
  const [movementEnd, setMovementEnd] = useState("");

  async function openDetail(row: ComponentRow) {
    setDetail(row);
    setDetailMovements([]);
    setDetailPurchases([]);
    setDetailTab("ringkasan");
    setMovementType("");
    setMovementStart("");
    setMovementEnd("");
    setDetailLoading(true);
    try {
      const json = await produksiFetch<{
        item: ComponentRow;
        movements: DetailMovement[];
        purchases: DetailPurchase[];
      }>(`/api/ops/production/components/${row.id}`);
      setDetail(json.item || row);
      setDetailMovements(json.movements || []);
      setDetailPurchases(json.purchases || []);
    } catch {
      /* tetap tampilkan data baris yang sudah ada */
    } finally {
      setDetailLoading(false);
    }
  }

  const filteredMovements = useMemo(
    () =>
      detailMovements.filter((movement) => {
        if (movementType && movement.type !== movementType) return false;
        if (movementStart && String(movement.movement_date).slice(0, 10) < movementStart) return false;
        if (movementEnd && String(movement.movement_date).slice(0, 10) > movementEnd) return false;
        return true;
      }),
    [detailMovements, movementType, movementStart, movementEnd],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (category) params.set("category", category);
      if (status) params.set("status", status);
      if (includeInactive) params.set("include_inactive", "1");
      const json = await produksiFetch<{ items: ComponentRow[]; summary: Summary }>(
        `/api/ops/production/components?${params.toString()}`,
      );
      setItems(json.items || []);
      setSummary(json.summary || null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat komponen.");
    } finally {
      setLoading(false);
    }
  }, [search, category, status, includeInactive]);

  useEffect(() => {
    if (!access.allowed) return;
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load, access.allowed]);

  useEffect(() => {
    if (!access.allowed) return;
    produksiFetch<{ items: FabricType[] }>("/api/ops/jenis-kain")
      .then((json) => setFabricTypes(json.items || []))
      .catch(() => setFabricTypes([]));
  }, [access.allowed]);

  const openCreate = () => {
    setForm(emptyForm());
    setFormError("");
    setCodeTouched(false);
    setEditorOpen(true);
    fetchNextCode("kain");
  };

  const openEdit = (row: ComponentRow) => {
    setForm({
      id: row.id,
      code: row.code,
      name: row.name,
      category: row.category,
      unit_use: row.unit_use,
      unit_buy: row.unit_buy,
      conversion: String(row.conversion),
      min_stock: String(row.min_stock),
      safe_price: String(row.safe_price ?? 0),
      supplier: row.supplier || "",
      notes: row.notes || "",
      fabric_type_id: row.fabric_type_id || "",
      is_active: row.is_active,
    });
    setFormError("");
    setCodeTouched(true);
    setEditorOpen(true);
  };

  async function fetchNextCode(nextCategory: string) {
    try {
      const json = await produksiFetch<{ code: string }>(
        `/api/ops/production/components/next-code?category=${encodeURIComponent(nextCategory)}`,
      );
      setForm((current) => ({ ...current, code: json.code }));
    } catch {
      /* kode masih bisa diisi manual */
    }
  }

  function changeCategory(nextCategory: string) {
    const defaults = nextCategory === "kain"
      ? { unit_use: "yard", unit_buy: "yard", conversion: "1" }
      : { unit_use: "pcs", unit_buy: "pack", conversion: "1" };
    setForm((current) => ({
      ...current,
      category: nextCategory,
      ...(nextCategory !== current.category ? defaults : {}),
      fabric_type_id: nextCategory === "kain" ? current.fabric_type_id : "",
    }));
    if (!form.id && !codeTouched) fetchNextCode(nextCategory);
  }

  async function save() {
    if (saving) return;
    setFormError("");
    if (!form.name.trim()) return setFormError("Nama komponen wajib diisi.");
    if (!form.code.trim()) return setFormError("Kode komponen wajib diisi.");
    const conversion = Number(form.conversion);
    if (!Number.isFinite(conversion) || conversion <= 0) {
      return setFormError("Konversi satuan harus lebih dari 0.");
    }

    setSaving(true);
    try {
      const payload = {
        ...(form.id ? { id: form.id } : {}),
        code: form.code,
        name: form.name,
        category: form.category,
        unit_use: form.unit_use,
        unit_buy: form.unit_buy,
        conversion,
        min_stock: Number(form.min_stock) || 0,
        safe_price: Number(form.safe_price) || 0,
        supplier: form.supplier,
        notes: form.notes,
        fabric_type_id: form.fabric_type_id || null,
        is_active: form.is_active,
      };
      await produksiFetch("/api/ops/production/components", {
        method: form.id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setEditorOpen(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Gagal menyimpan komponen.");
    } finally {
      setSaving(false);
    }
  }

  const statusCards = useMemo(() => {
    if (!summary) return [];
    const cards: {
      label: string;
      value: string;
      hint: string;
      tone: "default" | "positive" | "warning" | "danger" | "muted";
    }[] = [
      { label: "Total komponen", value: String(summary.total), hint: "Komponen aktif", tone: "default" },
    ];
    if (access.role === "owner") {
      cards.push({
        label: "Nilai stok",
        value: `Rp ${formatRupiah(summary.stock_value || 0)}`,
        hint: "Stok × Harga Real",
        tone: "default" as const,
      });
    }
    cards.push(
      { label: "Stok menipis", value: String(summary.menipis), hint: "≤ stok minimum", tone: "warning" as const },
      { label: "Stok habis", value: String(summary.habis), hint: "Perlu dibeli", tone: "danger" as const },
    );
    return cards;
  }, [summary, access.role]);

  return (
    <AccessGate access={access}>
      <div className="space-y-4">
        <PageHead
          title="Komponen & Bahan"
          subtitle="Master komponen produksi, terpisah dari katalog produk. Stok dihitung dari buku stok."
          actions={
            access.canWrite ? (
              <>
                <button className={btnSecondary} onClick={() => setImportOpen(true)}>
                  <ClipboardList size={15} /> Import Paste
                </button>
                <button className={btnPrimary} onClick={openCreate}>
                  <Plus size={16} /> Komponen
                </button>
              </>
            ) : null
          }
        />

        <ErrorBox message={error} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {statusCards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </div>

        <FilterBar
          active={Boolean(search || category || status || includeInactive)}
          onReset={() => { setSearch(""); setCategory(""); setStatus(""); setIncludeInactive(false); }}
        >
          <FilterSearch
            value={search}
            onChange={setSearch}
            placeholder="Cari kode atau nama komponen…"
            ariaLabel="Cari komponen"
          />
          <FilterSelect value={category} onChange={setCategory} ariaLabel="Filter kategori" minWidthClass="sm:min-w-[150px]">
            <option value="">Semua kategori</option>
            {COMPONENT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </FilterSelect>
          <FilterSelect value={status} onChange={setStatus} ariaLabel="Filter status stok" minWidthClass="sm:min-w-[130px]">
            <option value="">Semua status</option>
            <option value="aman">Aman</option>
            <option value="menipis">Menipis</option>
            <option value="habis">Habis</option>
          </FilterSelect>
          <FilterCheck checked={includeInactive} onChange={setIncludeInactive} label="Nonaktif" />
        </FilterBar>

        <div className={`${cardClass} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-900 dark:text-white">Daftar komponen</p>
            <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums">
              {items.length} komponen
            </p>
          </div>
          <table className="w-full border-collapse table-fixed">
            <colgroup>
              {access.role === "owner" ? (
                <>
                  <col className="w-[10%]" />
                  <col className="w-[24%]" />
                  <col className="w-[10%]" />
                  <col className="w-[11%]" />
                  <col className="w-[11%]" />
                  <col className="w-[11%]" />
                  <col className="w-[11%]" />
                  <col className="w-[9%]" />
                  <col className="w-[3%]" />
                </>
              ) : (
                <>
                  <col className="w-[12%]" />
                  <col className="w-[38%]" />
                  <col className="w-[12%]" />
                  <col className="w-[13%]" />
                  <col className="w-[13%]" />
                  <col className="w-[9%]" />
                  <col className="w-[3%]" />
                </>
              )}
            </colgroup>
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                {[
                  { label: "Kode", align: "text-left" },
                  { label: "Komponen", align: "text-left" },
                  { label: "Stok", align: "text-right" },
                  { label: "Dicadangkan", align: "text-right" },
                  { label: "Tersedia", align: "text-right" },
                  ...(access.role === "owner"
                    ? [
                        { label: "Harga Real", align: "text-right" },
                        { label: "Harga Aman", align: "text-right" },
                      ]
                    : []),
                  { label: "Status", align: "text-left" },
                ].map((head) => (
                  <th key={head.label} className={`px-3.5 py-3 ${head.align} text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-tight`}>
                    {head.label}
                  </th>
                ))}
                <th className="px-1 py-3" aria-label="Detail" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {loading ? (
                <tr><td colSpan={access.role === "owner" ? 9 : 7}><Spinner /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={access.role === "owner" ? 9 : 7}><EmptyState title="Belum ada komponen" description="Tambahkan komponen pertama atau tempel data dari Excel." /></td></tr>
              ) : (
                items.map((row) => {
                  const statusKey = stockStatus(row.stock, row.min_stock);
                  return (
                    <tr
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Detail komponen ${row.name}`}
                      onClick={() => openDetail(row)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openDetail(row);
                        }
                      }}
                      className="bg-white dark:bg-[#16171d] hover:bg-blue-50/60 dark:hover:bg-slate-800/60 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                    >
                      <td className="px-3.5 py-3.5 align-middle text-[12px] font-mono font-semibold text-slate-500 dark:text-slate-400 truncate" title={row.code}>
                        {row.code}
                      </td>
                      <td className="px-3.5 py-3.5 align-middle min-w-0">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-[13px] font-bold text-slate-900 dark:text-white truncate" title={row.name}>{row.name}</span>
                          {!row.is_active ? <Badge tone="slate">Nonaktif</Badge> : null}
                        </span>
                      </td>
                      <td className="px-2.5 py-3.5 align-middle text-right whitespace-nowrap tabular-nums">
                        <span className="text-[13px] font-bold text-slate-900 dark:text-white">{formatQty(row.stock)}</span>
                        <span className="ml-0.5 text-[10px] font-semibold text-slate-400">{row.unit_use}</span>
                      </td>
                      <td className="px-2.5 py-3.5 align-middle text-right text-[12px] font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap tabular-nums">
                        {formatQty(row.reserved_stock || 0)}
                      </td>
                      <td className="px-2.5 py-3.5 align-middle text-right text-[12px] font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap tabular-nums">
                        {formatQty(row.available_stock ?? row.stock)}
                      </td>
                      {access.role === "owner" ? (
                        <>
                          <td className="px-3.5 py-3.5 align-middle text-right text-[13px] font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap tabular-nums">
                            Rp {formatRupiah(row.real_price)}
                          </td>
                          <td className="px-3.5 py-3.5 align-middle text-right text-[13px] font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap tabular-nums">
                            Rp {formatRupiah(row.safe_price)}
                          </td>
                        </>
                      ) : null}
                      <td className="px-3.5 py-3.5 align-middle">
                        <Badge tone={statusTone[statusKey]}>{STOCK_STATUS_LABEL[statusKey]}</Badge>
                      </td>
                      <td className="px-1 py-3.5 align-middle text-center text-slate-300 dark:text-slate-600">
                        <ChevronRight size={15} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {access.role === "leader" ? (
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Harga dan nilai stok disembunyikan untuk role Leader.
          </p>
        ) : null}

        <Drawer
          open={Boolean(detail)}
          onClose={() => setDetail(null)}
          title="Detail Komponen"
          subtitle={detail ? `${detail.code} · ${detail.name}` : ""}
          footer={
            detail ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {access.canWrite ? (
                  <button
                    className={btnSecondary}
                    onClick={() => {
                      const row = detail;
                      setDetail(null);
                      openEdit(row);
                    }}
                  >
                    <Pencil size={15} /> Edit
                  </button>
                ) : null}
                <button className={btnPrimary} onClick={() => setDetail(null)}>Tutup</button>
              </div>
            ) : null
          }
        >
          {detail ? (
            <div className="space-y-4">
              <div className={`${cardClass} p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={stockStatus(detail.stock, detail.min_stock) === "aman" ? "green" : stockStatus(detail.stock, detail.min_stock) === "menipis" ? "amber" : "red"}>
                      {STOCK_STATUS_LABEL[stockStatus(detail.stock, detail.min_stock)]}
                    </Badge>
                    <Badge tone={detail.is_active ? "blue" : "slate"}>{detail.is_active ? "Aktif" : "Nonaktif"}</Badge>
                  </div>
                  <p className="mt-3 text-sm font-black text-slate-900 dark:text-white break-words">{detail.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {categoryLabel(detail.category)}{detail.fabric_type_name ? ` · ${detail.fabric_type_name}` : ""}
                  </p>
                </div>
                <div className="sm:text-right shrink-0 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2 sm:bg-transparent sm:dark:bg-transparent sm:px-0 sm:py-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Stok saat ini</p>
                  <p className="mt-1 text-2xl font-black whitespace-nowrap tabular-nums text-slate-900 dark:text-white">
                    {formatQty(detail.stock)}
                    <span className="ml-1 text-xs font-semibold text-slate-400">{detail.unit_use}</span>
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">min {formatQty(detail.min_stock)} {detail.unit_use}</p>
                </div>
              </div>

              {/* Tab */}
              <div role="tablist" aria-label="Detail komponen" className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/70 overflow-x-auto no-scrollbar">
                {[
                  { key: "ringkasan" as const, label: "Ringkasan", count: null },
                  { key: "riwayat" as const, label: "Riwayat Stok", count: detailMovements.length },
                  ...(access.role === "owner"
                    ? [{ key: "pembelian" as const, label: "Pembelian", count: detailPurchases.length }]
                    : []),
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={detailTab === tab.key}
                    onClick={() => setDetailTab(tab.key)}
                    className={`flex-1 sm:flex-none shrink-0 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                      detailTab === tab.key
                        ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                    }`}
                  >
                    {tab.label}
                    {tab.count !== null ? (
                      <span className={`ml-1.5 tabular-nums ${detailTab === tab.key ? "text-slate-400" : "text-slate-400/70"}`}>{tab.count}</span>
                    ) : null}
                  </button>
                ))}
              </div>

              {detailTab === "ringkasan" ? (
                <div className="space-y-4">
                  {access.role === "owner" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <DetailField label="Harga Real" value={`Rp ${formatRupiah(detail.real_price)} / ${detail.unit_use}`} />
                      <DetailField label="Harga Aman" value={`Rp ${formatRupiah(detail.safe_price)} / ${detail.unit_use}`} />
                      <DetailField
                        label="Selisih Aman − Real"
                        value={`${Number(detail.price_gap) < 0 ? "−" : "+"}Rp ${formatRupiah(Math.abs(Number(detail.price_gap) || 0))}`}
                        tone={Number(detail.price_gap) < 0 ? "danger" : "positive"}
                      />
                      <DetailField label="Nilai stok" value={`Rp ${formatRupiah(detail.stock_value)}`} />
                    </div>
                  ) : null}

                  <div className={`${cardClass} p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3`}>
                    <DetailField label="Satuan pakai" value={detail.unit_use} />
                    <DetailField label="Satuan beli" value={`${detail.unit_buy} · 1 = ${formatQty(detail.conversion)} ${detail.unit_use}`} />
                    <DetailField label="Supplier utama" value={detail.supplier || "—"} />
                    <DetailField label="Jenis kain" value={detail.fabric_type_name || "—"} />
                    <DetailField label="Dicadangkan" value={`${formatQty(detail.reserved_stock || 0)} ${detail.unit_use}`} />
                    <DetailField label="Tersedia" value={`${formatQty(detail.available_stock ?? detail.stock)} ${detail.unit_use}`} />
                  </div>

                  {detail.notes ? (
                    <div className={`${cardClass} p-4`}>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Catatan</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-200 break-words">{detail.notes}</p>
                    </div>
                  ) : null}

                  <div className={`${cardClass} overflow-hidden`}>
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">Aktivitas terakhir</p>
                      {detailMovements.length > 3 ? (
                        <button type="button" onClick={() => setDetailTab("riwayat")} className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline">
                          Lihat semua
                        </button>
                      ) : null}
                    </div>
                    {detailLoading ? (
                      <Spinner label="Memuat pergerakan…" />
                    ) : detailMovements.length === 0 ? (
                      <p className="px-4 py-6 text-center text-xs text-slate-400">Belum ada pergerakan stok.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                        {detailMovements.slice(0, 3).map((movement) => (
                          <div key={movement.id} className="px-4 py-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{movementLabel(movement.type)}</p>
                              <p className="text-[11px] text-slate-400 truncate">
                                {formatDate(movement.movement_date)}{movement.ref_label ? ` · ${movement.ref_label}` : ""}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`text-xs font-bold whitespace-nowrap tabular-nums ${movement.qty > 0 ? "text-emerald-600" : "text-red-600"}`}>
                                {movement.qty > 0 ? "+" : "−"}{formatQty(Math.abs(movement.qty))} {movement.unit_use || detail.unit_use}
                              </p>
                              <p className="text-[10px] text-slate-400">saldo {formatQty(movement.running_balance)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {detailTab === "riwayat" ? (
                <div className="space-y-3">
                  <FilterBar
                    active={Boolean(movementType || movementStart || movementEnd)}
                    onReset={() => { setMovementType(""); setMovementStart(""); setMovementEnd(""); }}
                    meta={`${filteredMovements.length} pergerakan`}
                  >
                    <FilterSelect value={movementType} onChange={setMovementType} ariaLabel="Filter jenis pergerakan" minWidthClass="sm:min-w-[150px]">
                      <option value="">Semua jenis</option>
                      {Object.entries(MOVEMENT_TYPES)
                        .filter(([key]) => ["stok_awal", "pembelian", "opname", "rusak_hilang", "penyesuaian"].includes(key))
                        .map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
                    </FilterSelect>
                    <FilterDateRange start={movementStart} end={movementEnd} onStart={setMovementStart} onEnd={setMovementEnd} />
                  </FilterBar>

                  {detailLoading ? (
                    <div className={cardClass}><Spinner label="Memuat riwayat…" /></div>
                  ) : filteredMovements.length === 0 ? (
                    <div className={cardClass}><EmptyState title="Tidak ada pergerakan" description="Ubah filter atau catat transaksi baru." /></div>
                  ) : (
                    <>
                      <div className={`${cardClass} overflow-hidden hidden md:block`}>
                        <table className="w-full border-collapse table-fixed">
                          <colgroup>
                            {access.role === "owner" ? (
                              <>
                                <col className="w-[15%]" />
                                <col className="w-[35%]" />
                                <col className="w-[16%]" />
                                <col className="w-[16%]" />
                                <col className="w-[18%]" />
                              </>
                            ) : (
                              <>
                                <col className="w-[18%]" />
                                <col className="w-[48%]" />
                                <col className="w-[18%]" />
                                <col className="w-[16%]" />
                              </>
                            )}
                          </colgroup>
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                              {["Tanggal", "Jenis", "Jumlah", ...(access.role === "owner" ? ["Harga"] : []), "Saldo"].map((h, i) => (
                                <th key={h} className={`px-3 py-2.5 ${i >= 2 ? "text-right" : "text-left"} text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400`}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                            {filteredMovements.map((movement) => (
                              <tr key={movement.id} className="hover:bg-blue-50/50 dark:hover:bg-slate-800/60">
                                <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">{formatDate(movement.movement_date)}</td>
                                <td className="px-3 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 truncate" title={movement.notes}>{movementLabel(movement.type)}</td>
                                <td className={`px-3 py-2.5 text-right text-xs font-bold whitespace-nowrap tabular-nums ${movement.qty > 0 ? "text-emerald-600" : "text-red-600"}`}>
                                  {movement.qty > 0 ? "+" : "−"}{formatQty(Math.abs(movement.qty))} {movement.unit_use || detail.unit_use}
                                </td>
                                {access.role === "owner" ? (
                                  <td className="px-3 py-2.5 text-right text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap tabular-nums">Rp {formatRupiah(movement.unit_price)}</td>
                                ) : null}
                                <td className="px-3 py-2.5 text-right text-xs font-black text-slate-900 dark:text-white whitespace-nowrap tabular-nums">{formatQty(movement.running_balance)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="md:hidden space-y-2">
                        {filteredMovements.map((movement) => (
                          <div key={movement.id} className={`${cardClass} p-3`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{movementLabel(movement.type)}</p>
                                <p className="text-[11px] text-slate-400">{formatDate(movement.movement_date)}</p>
                                <p className="text-[11px] text-slate-400 truncate">{movement.ref_label || movement.notes || "—"}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className={`text-sm font-black whitespace-nowrap tabular-nums ${movement.qty > 0 ? "text-emerald-600" : "text-red-600"}`}>
                                  {movement.qty > 0 ? "+" : "−"}{formatQty(Math.abs(movement.qty))} {movement.unit_use || detail.unit_use}
                                </p>
                                <p className="text-[11px] text-slate-400">saldo {formatQty(movement.running_balance)}</p>
                                {access.role === "owner" ? (
                                  <p className="text-[11px] text-slate-400">Rp {formatRupiah(movement.unit_price)}</p>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {detailTab === "pembelian" && access.role === "owner" ? (
                <div className="space-y-3">
                  {detailLoading ? (
                    <div className={cardClass}><Spinner label="Memuat pembelian…" /></div>
                  ) : detailPurchases.length === 0 ? (
                    <div className={cardClass}><EmptyState title="Belum ada pembelian" description="Komponen ini belum pernah masuk lewat Pembelian Bahan." /></div>
                  ) : (
                    <>
                      <p className="text-[11px] text-slate-400">{detailPurchases.length} baris pembelian terakhir</p>
                      {detailPurchases.map((purchase) => (
                        <div key={purchase.id} className={`${cardClass} p-4`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[13px] font-black text-slate-900 dark:text-white">{purchase.purchase_number}</p>
                              <p className="text-[11px] text-slate-400">
                                {formatDate(purchase.purchase_date)} · {purchase.supplier || "Tanpa supplier"}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Harga akhir</p>
                              <p className="text-[13px] font-black text-slate-900 dark:text-white whitespace-nowrap tabular-nums">
                                Rp {formatRupiah(purchase.final_unit_price)}
                              </p>
                              <p className="text-[10px] text-slate-400">/ {purchase.unit_use || detail.unit_use}</p>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <MiniStat label="Qty beli" value={`${formatQty(purchase.qty_buy)} ${purchase.unit_buy}`} />
                            <MiniStat label="Harga beli" value={`Rp ${formatRupiah(purchase.price_buy)}`} />
                            <MiniStat label="Ongkir" value={`Rp ${formatRupiah(purchase.allocated_cost)}`} />
                            <MiniStat label="Qty pakai" value={`${formatQty(purchase.qty_use)} ${purchase.unit_use || detail.unit_use}`} />
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </Drawer>

        <Drawer
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          title={form.id ? "Ubah Komponen" : "Tambah Komponen"}
          subtitle={form.id ? `Kode ${form.code}` : "Kode dibuat otomatis sesuai kategori, masih bisa diedit."}
          footer={
            <div className="flex items-center justify-end gap-2">
              <button className={btnSecondary} onClick={() => setEditorOpen(false)} disabled={saving}>Batal</button>
              <button className={btnPrimary} onClick={save} disabled={saving}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : null}
                {saving ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <ErrorBox message={formError} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Kode</label>
                <input
                  className={`${inputClass} uppercase`}
                  value={form.code}
                  onChange={(e) => { setCodeTouched(true); setForm({ ...form, code: e.target.value.toUpperCase() }); }}
                  placeholder="KAIN-001"
                />
              </div>
              <div>
                <label className={labelClass}>Kategori</label>
                <select className={inputClass} value={form.category} onChange={(e) => changeCategory(e.target.value)}>
                  {COMPONENT_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Nama komponen</label>
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Contoh: Kancing Hitam / Kain A-02"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Warna/ukuran dibuat sebagai komponen terpisah (mis. “Kancing Hitam” dan “Kancing Putih”).
              </p>
            </div>

            {form.category === "kain" ? (
              <div>
                <label className={labelClass}>Jenis kain</label>
                <select
                  className={inputClass}
                  value={form.fabric_type_id}
                  onChange={(e) => setForm({ ...form, fabric_type_id: e.target.value })}
                >
                  <option value="">— Pilih jenis kain —</option>
                  {fabricTypes.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Satuan pakai</label>
                <select className={inputClass} value={form.unit_use} onChange={(e) => setForm({ ...form, unit_use: e.target.value })}>
                  {COMPONENT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Satuan beli</label>
                <select className={inputClass} value={form.unit_buy} onChange={(e) => setForm({ ...form, unit_buy: e.target.value })}>
                  {COMPONENT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Konversi</label>
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={form.conversion}
                  onChange={(e) => setForm({ ...form, conversion: e.target.value })}
                />
              </div>
            </div>
            <p className="-mt-2 text-[11px] text-slate-400">
              1 {form.unit_buy} = {formatQty(Number(form.conversion) || 0)} {form.unit_use}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Stok minimum</label>
                <input className={inputClass} inputMode="decimal" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} />
              </div>
              <div>
                <label className={labelClass}>Harga Aman (Rp / {form.unit_use})</label>
                <input className={inputClass} inputMode="decimal" value={form.safe_price} onChange={(e) => setForm({ ...form, safe_price: e.target.value })} />
                <p className="mt-1 text-[11px] text-slate-400">Patokan HPP standar. Tidak berubah otomatis.</p>
              </div>
            </div>

            <div>
              <label className={labelClass}>Supplier utama</label>
              <input className={inputClass} value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Nama toko / supplier" />
            </div>

            <div>
              <label className={labelClass}>Catatan</label>
              <textarea className={`${inputClass} min-h-[80px]`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4 rounded" />
              Komponen aktif
            </label>

            {form.id ? (
              <p className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                Harga Real dihitung otomatis dari stok awal &amp; pembelian. Mengubah satuan setelah ada transaksi
                tidak mengubah angka riwayat yang sudah tercatat.
              </p>
            ) : null}
          </div>
        </Drawer>

        <ImportPasteDrawer
          open={importOpen}
          onClose={() => setImportOpen(false)}
          fabricTypes={fabricTypes}
          onImported={load}
        />
      </div>
    </AccessGate>
  );
}

function DetailField({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "danger";
}) {
  const color =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "danger"
        ? "text-red-600 dark:text-red-400"
        : "text-slate-800 dark:text-slate-100";
  return (
    <div className="min-w-0 rounded-xl border border-gray-100 dark:border-slate-800 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 text-xs font-bold break-words tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2.5 py-2 min-w-0">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 leading-tight">{label}</p>
      <p className="mt-0.5 text-[11px] font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap tabular-nums">{value}</p>
    </div>
  );
}

function ImportPasteDrawer({
  open,
  onClose,
  fabricTypes,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  fabricTypes: FabricType[];
  onImported: () => void;
}) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ImportComponentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  useEffect(() => {
    if (!open) {
      setText("");
      setRows([]);
      setError("");
      setResult("");
    }
  }, [open]);

  useEffect(() => {
    if (!text.trim()) {
      setRows([]);
      return;
    }
    const parsed = parseComponentPaste(text, fabricTypes);
    setRows(parsed.rows);
    setError(parsed.error);
    setResult("");
  }, [text, fabricTypes]);

  const validRows = rows.filter((row) => row.errors.length === 0);
  const invalidRows = rows.length - validRows.length;

  async function save() {
    if (busy || validRows.length === 0) return;
    setBusy(true);
    setError("");
    setResult("");
    try {
      const json = await produksiFetch<{ inserted: number; failed: { line: number; name: string; error: string }[] }>(
        "/api/ops/production/components/import",
        {
          method: "POST",
          body: JSON.stringify({
            rows: validRows.map((row) => ({
              name: row.name,
              category: row.category,
              unit_use: row.unit_use,
              price: row.price,
              safe_price: row.safe_price,
              initial_stock: row.initial_stock,
              min_stock: row.min_stock,
              fabric_type_id: row.fabric_type_id,
            })),
          }),
        },
      );
      setResult(
        `${json.inserted} komponen tersimpan${json.failed.length ? `, ${json.failed.length} gagal` : ""}.`,
      );
      if (json.failed.length) {
        setError(json.failed.map((f) => `Baris ${f.line} (${f.name}): ${f.error}`).join("\n"));
      } else {
        onImported();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengimpor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      wide
      title="Import Paste Komponen"
      subtitle="Tempel langsung dari Excel/Google Sheet (baris = komponen)."
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {rows.length} baris · {validRows.length} siap disimpan{invalidRows ? ` · ${invalidRows} bermasalah` : ""}
          </p>
          <div className="flex items-center gap-2">
            <button className={btnSecondary} onClick={onClose} disabled={busy}>Tutup</button>
            <button className={btnPrimary} onClick={save} disabled={busy || validRows.length === 0}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : null}
              {busy ? "Menyimpan…" : `Simpan ${validRows.length} baris`}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/20 px-3 py-2.5">
          <p className="text-[11px] font-bold text-blue-800 dark:text-blue-200">
            Urutan kolom: nama · kategori · satuan · harga beli · Harga Aman · stok awal · stok minimum · jenis kain
          </p>
          <p className="mt-0.5 text-[11px] text-blue-700/80 dark:text-blue-200/70">
            Kategori: Kain, Komponen Produk, Kemasan Produk, Packaging Pesanan, Penunjang. Harga beli dipakai
            sebagai harga stok awal. Kolom opsional boleh kosong.
          </p>
        </div>

        <div>
          <label className={labelClass}>Tempel data</label>
          <textarea
            className={`${inputClass} min-h-[150px] font-mono text-xs`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Kancing Hitam\tKomponen Produk\tpcs\t150\t200\t100\t20\t\nKain A-02\tKain\tyard\t25000\t30000\t40\t10\tA-02"}
          />
        </div>

        <ErrorBox message={error} />
        {result ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200">
            {result}
          </div>
        ) : null}

        {rows.length > 0 ? (
          <div className={`${cardClass} overflow-hidden`}>
            <div className="max-h-[320px] overflow-auto no-scrollbar">
              <table className="w-full border-collapse min-w-[760px]">
                <thead className="sticky top-0">
                  <tr className="bg-[#1e3a5f]">
                    {["#", "Nama", "Kategori", "Satuan", "Harga", "H. Aman", "Stok awal", "Min", "Kain", "Status"].map((h) => (
                      <th key={h} className="px-2.5 py-2 text-left text-[11px] font-bold text-white uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.line} className={`border-b border-slate-100 dark:border-slate-800 ${row.errors.length ? "bg-red-50/70 dark:bg-red-900/10" : ""}`}>
                      <td className="px-2.5 py-2 text-xs text-slate-400">{row.line}</td>
                      <td className="px-2.5 py-2 text-xs font-bold text-slate-800 dark:text-slate-100">{row.name || "—"}</td>
                      <td className="px-2.5 py-2 text-xs text-slate-600 dark:text-slate-300">{categoryLabel(row.category)}</td>
                      <td className="px-2.5 py-2 text-xs text-slate-600 dark:text-slate-300">{row.unit_use || "—"}</td>
                      <td className="px-2.5 py-2 text-xs text-slate-600 dark:text-slate-300">{formatRupiah(row.price)}</td>
                      <td className="px-2.5 py-2 text-xs text-slate-600 dark:text-slate-300">{formatRupiah(row.safe_price)}</td>
                      <td className="px-2.5 py-2 text-xs text-slate-600 dark:text-slate-300">{formatQty(row.initial_stock)}</td>
                      <td className="px-2.5 py-2 text-xs text-slate-600 dark:text-slate-300">{formatQty(row.min_stock)}</td>
                      <td className="px-2.5 py-2 text-xs text-slate-600 dark:text-slate-300">{row.fabric_type || "—"}</td>
                      <td className="px-2.5 py-2 text-[11px] font-bold">
                        {row.errors.length ? (
                          <span className="text-red-600 dark:text-red-300">{row.errors.join("; ")}</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">OK</span>
                        )}
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

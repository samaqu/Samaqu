"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/AdminToast";
import { SettingsCard } from "@/components/admin/SettingsCard";
import { AdminPageHeader, ErrorBlock, LoadingBlock, adminFetch, money } from "./affiliate-admin-ui";

/**
 * Admin → Affiliate → Pengaturan Komisi.
 *
 * Pola kartu admin yang sudah dipakai di menu Pengaturan: default read-only
 * (nilai tampil sebagai teks) → klik **Edit** → isi form → **Simpan / Batal**.
 *
 * Semua nilai di sini dipakai BENAR-BENAR oleh mesin komisi di server.
 */

interface Settings {
  enabled: boolean;
  commission_mode: "percent" | "fixed";
  commission_percent: number;
  fixed_commission: number | null;
  product_commission: Record<string, number>;
  attribution_model: "first_click" | "last_click";
  referral_validity_days: number;
  require_paid: boolean;
  require_completed: boolean;
  validation_days: number;
  min_withdrawal: number;
  withdrawal_fee_bank: number;
  withdrawal_fee_ewallet: number;
  reversal_on_cancel: boolean;
  reversal_on_return: boolean;
}

interface ProductLite {
  id: string;
  name: string;
  series: string | null;
  price: number | null;
  is_published: boolean;
}

interface ProductRuleDraft {
  id: string;
  percent: string;
}

type FormState = Omit<Settings, "product_commission"> & { product_commission: ProductRuleDraft[] };

function toForm(s: Settings): FormState {
  return {
    ...s,
    product_commission: Object.entries(s.product_commission || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, percent]) => ({ id, percent: String(percent) })),
  };
}

/** Baris kosong diabaikan; baris tidak valid ditahan oleh validasi sebelum simpan. */
function serializeProductRules(rules: ProductRuleDraft[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const rule of rules) {
    const id = rule.id.trim();
    const percentText = rule.percent.trim();
    const percent = Number(percentText);
    if (!id || !percentText || !Number.isFinite(percent) || percent < 0 || percent > 100) continue;
    out[id] = percent;
  }
  return out;
}

function ruleIssues(rules: ProductRuleDraft[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const invalid = new Set<number>();

  rules.forEach((rule, index) => {
    const id = rule.id.trim();
    const percentText = rule.percent.trim();
    if (!id && !percentText) return;

    if (!id) {
      invalid.add(index);
      return;
    }
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);

    const percent = Number(percentText);
    if (!percentText || !Number.isFinite(percent) || percent < 0 || percent > 100) invalid.add(index);
  });

  return { duplicates, invalid };
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold" style={{ color: "var(--espresso)" }}>{label}</label>
      {children}
      {hint && <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{hint}</p>}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="mt-1.5 w-11 h-6 rounded-full relative transition-colors"
      style={{ background: value ? "#18181b" : "#d4d4d8" }}
      aria-pressed={value}
    >
      <span
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
        style={{ left: value ? "22px" : "2px" }}
      />
    </button>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="mt-1.5 w-full rounded-xl px-4 py-2.5 bg-white text-sm outline-none"
      style={{ border: "1px solid #e4e4e7" }}
    />
  );
}

function ProductPicker({
  value,
  products,
  onChange,
  invalid,
}: {
  value: string;
  products: ProductLite[];
  onChange: (id: string) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = products.find((product) => product.id === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const term = query.trim().toLowerCase();
  const filtered = products
    .filter((product) => {
      if (!term) return true;
      return (
        product.name.toLowerCase().includes(term) ||
        product.id.toLowerCase().includes(term) ||
        String(product.series || "").toLowerCase().includes(term)
      );
    })
    .slice(0, 60);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          setQuery("");
        }}
        className="flex w-full items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-left text-sm outline-none transition-colors hover:border-zinc-300"
        style={{ border: `1px solid ${invalid ? "#fca5a5" : "#e4e4e7"}` }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className="min-w-0 flex-1 truncate"
          style={{ color: selected || value ? "var(--fg)" : "var(--text-muted)" }}
        >
          {selected ? selected.name : value || "Pilih produk"}
        </span>
        {selected?.series ? (
          <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
            {selected.series}
          </span>
        ) : null}
        <ChevronDown
          size={15}
          className={`shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {value && !selected && (
        <p className="mt-1 text-[11px] text-amber-600">
          Tidak ada di katalog — aturan tetap disimpan dengan id <span className="font-mono">{value}</span>.
        </p>
      )}

      {open && (
        <div
          className="absolute left-0 right-0 z-40 mt-1.5 overflow-hidden rounded-xl bg-white shadow-xl"
          style={{ border: "1px solid #e4e4e7" }}
        >
          <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid #f4f4f5" }}>
            <Search size={14} className="text-zinc-400" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari nama atau id produk…"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <div role="listbox" className="max-h-64 overflow-y-auto py-1">
            {filtered.map((product) => {
              const active = product.id === value;
              return (
                <button
                  key={product.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => pick(product.id)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    active ? "bg-zinc-100" : "hover:bg-zinc-50"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" style={{ color: "var(--fg)" }}>
                      {product.name}
                    </span>
                    <span className="block truncate text-[11px] text-zinc-400">
                      {product.id}
                      {product.series ? ` · ${product.series}` : ""}
                      {product.is_published ? "" : " · draft"}
                    </span>
                  </span>
                  {active && <Check size={14} className="shrink-0 text-zinc-500" />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-3 text-xs text-zinc-400">Tidak ada produk yang cocok.</p>
            )}
          </div>
          {query.trim() && !products.some((product) => product.id === query.trim()) && (
            <button
              type="button"
              onClick={() => pick(query.trim())}
              className="w-full px-3 py-2 text-left text-xs text-zinc-500 hover:bg-zinc-50"
              style={{ borderTop: "1px solid #f4f4f5" }}
            >
              Gunakan id manual: <span className="font-mono">{query.trim()}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AffiliateSettingsView() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [original, setOriginal] = useState<FormState | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [products, setProducts] = useState<ProductLite[]>([]);
  const { showToast } = useToast();

  const load = async () => {
    try {
      const json = await adminFetch<{ settings: Settings }>("/api/admin/affiliate/settings");
      setSettings(json.settings);
      const f = toForm(json.settings);
      setForm(f);
      setOriginal(f);
      setError("");
    } catch (e) {
      console.error("[ADMIN-AFFILIATE] Gagal memuat pengaturan:", e);
      setError(e instanceof Error ? e.message : "Gagal memuat pengaturan.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error: productsError } = await supabase
        .from("products")
        .select("id, name, series, price, is_published")
        .order("name", { ascending: true });
      if (!alive) return;
      if (productsError) {
        console.error("[ADMIN-AFFILIATE] Gagal memuat produk:", productsError.message);
      }
      setProducts((data || []) as ProductLite[]);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const dirty = form && original ? JSON.stringify(form) !== JSON.stringify(original) : false;
  const rules = form?.product_commission || [];
  const issues = ruleIssues(rules);
  const rulesValid = issues.duplicates.size === 0 && issues.invalid.size === 0;
  const canSaveAll = dirty && rulesValid;

  const setRules = (next: ProductRuleDraft[]) => set("product_commission", next);

  const updateRule = (index: number, patch: Partial<ProductRuleDraft>) => {
    setRules(rules.map((rule, current) => (current === index ? { ...rule, ...patch } : rule)));
  };

  const addRule = () => setRules([...rules, { id: "", percent: "" }]);

  const removeRule = (index: number) => setRules(rules.filter((_, current) => current !== index));

  const save = async () => {
    if (!form) return;
    if (!rulesValid) {
      showToast("error", "Periksa aturan komisi per produk: ada produk ganda atau persentase tidak valid.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        fixed_commission: form.fixed_commission === null ? null : Number(form.fixed_commission),
        product_commission: serializeProductRules(form.product_commission),
        commission_percent: Number(form.commission_percent),
        referral_validity_days: Number(form.referral_validity_days),
        validation_days: Number(form.validation_days),
        min_withdrawal: Number(form.min_withdrawal),
        withdrawal_fee_bank: Number(form.withdrawal_fee_bank),
        withdrawal_fee_ewallet: Number(form.withdrawal_fee_ewallet),
      };
      const json = await adminFetch<{ settings: Settings }>("/api/admin/affiliate/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const f = toForm(json.settings);
      setSettings(json.settings);
      setForm(f);
      setOriginal(f);
      setEditing(false);
      showToast("success", "Pengaturan komisi disimpan.");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Gagal menyimpan pengaturan.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock />;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Pengaturan Komisi"
        sub="Aturan perhitungan komisi, atribusi referral, syarat pesanan, dan pencairan. Nilai di sini dipakai langsung oleh mesin komisi di server."
      />

      {error && <ErrorBlock message={error} />}

      {settings && !settings.enabled && (
        <div
          className="card p-4 flex items-start gap-2 text-sm"
          style={{ background: "#fffbeb", borderColor: "#fde68a", color: "#92400e" }}
        >
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>Program affiliate sedang dinonaktifkan. Pendaftaran baru & pengambilan tautan referral ditolak.</span>
        </div>
      )}

      {form && (
        <>
          <SettingsCard
            title="Status Program"
            description="Nyalakan atau matikan program affiliate."
            editing={editing}
            onEdit={() => setEditing(true)}
            onCancel={() => { setForm(original); setEditing(false); }}
            onSave={save}
            saving={saving}
            canSave={canSaveAll}
          >
            <Row label="Program affiliate aktif" hint="Ketika nonaktif, pendaftaran baru dan pembuatan tautan referral ditolak.">
              {editing ? (
                <Toggle value={form.enabled} onChange={(v) => set("enabled", v)} />
              ) : (
                <p className="mt-1 text-sm font-medium" style={{ color: "var(--fg)" }}>
                  {form.enabled ? "Aktif" : "Nonaktif"}
                </p>
              )}
            </Row>
          </SettingsCard>

          <SettingsCard
            title="Perhitungan Komisi"
            description="Persentase global, nominal tetap, dan aturan khusus per produk."
            editing={editing}
            onEdit={() => setEditing(true)}
            onCancel={() => { setForm(original); setEditing(false); }}
            onSave={save}
            saving={saving}
            canSave={canSaveAll}
          >
            <Row label="Mode perhitungan">
              {editing ? (
                <select
                  value={form.commission_mode}
                  onChange={(e) => set("commission_mode", e.target.value as FormState["commission_mode"])}
                  className="mt-1.5 w-full rounded-xl px-4 py-2.5 bg-white text-sm outline-none"
                  style={{ border: "1px solid #e4e4e7" }}
                >
                  <option value="percent">Persentase dari nilai produk</option>
                  <option value="fixed">Nominal tetap per pesanan</option>
                </select>
              ) : (
                <p className="mt-1 text-sm font-medium" style={{ color: "var(--fg)" }}>
                  {form.commission_mode === "percent" ? "Persentase dari nilai produk" : "Nominal tetap per pesanan"}
                </p>
              )}
            </Row>

            {form.commission_mode === "percent" ? (
              <Row label="Persentase komisi global (%)" hint="Nilai 0 = komisi belum ditetapkan. Berlaku untuk semua produk tanpa aturan khusus.">
                {editing ? (
                  <TextInput value={String(form.commission_percent)} onChange={(v) => set("commission_percent", Number(v.replace(/\D/g, "")) || 0)} placeholder="0" />
                ) : (
                  <p className="mt-1 text-sm font-medium" style={{ color: "var(--fg)" }}>{form.commission_percent}%</p>
                )}
              </Row>
            ) : (
              <Row label="Komisi nominal tetap per pesanan (Rp)" hint="Nominal ini dibayar sekali per pesanan, bukan per item.">
                {editing ? (
                  <TextInput
                    value={String(form.fixed_commission ?? "")}
                    onChange={(v) => set("fixed_commission", v === "" ? null : Number(v.replace(/\D/g, "")) || 0)}
                    placeholder="0"
                  />
                ) : (
                  <p className="mt-1 text-sm font-medium" style={{ color: "var(--fg)" }}>
                    {form.fixed_commission ? money(form.fixed_commission) : "Belum diisi"}
                  </p>
                )}
              </Row>
            )}

            <Row
              label="Aturan komisi per produk"
              hint={`Aturan di sini MENANG atas persentase global (${form.commission_percent}%). Produk tanpa aturan memakai nilai global.`}
            >
              {editing ? (
                <div className="mt-2">
                  <div className="rounded-2xl" style={{ border: "1px solid #e4e4e7" }}>
                    <div
                      className="grid grid-cols-[minmax(0,1fr)_84px_32px] sm:grid-cols-[minmax(0,1fr)_120px_36px] gap-2 sm:gap-3 rounded-t-2xl px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400"
                      style={{ background: "#fafafa" }}
                    >
                      <span>Produk</span>
                      <span>Komisi</span>
                      <span />
                    </div>

                    {rules.length === 0 ? (
                      <div className="px-4 py-7 text-center" style={{ borderTop: "1px solid #f4f4f5" }}>
                        <p className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                          Belum ada aturan khusus
                        </p>
                        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                          Semua produk memakai komisi global {form.commission_percent}%.
                        </p>
                      </div>
                    ) : (
                      rules.map((rule, index) => {
                        const duplicate = Boolean(rule.id.trim()) && issues.duplicates.has(rule.id.trim());
                        const invalidPercent = issues.invalid.has(index);
                        return (
                          <div
                            key={index}
                            className="grid grid-cols-[minmax(0,1fr)_84px_32px] sm:grid-cols-[minmax(0,1fr)_120px_36px] items-start gap-2 sm:gap-3 px-3 py-3"
                            style={{ borderTop: "1px solid #f4f4f5" }}
                          >
                            <div>
                              <ProductPicker
                                value={rule.id}
                                products={products}
                                onChange={(id) => updateRule(index, { id })}
                                invalid={duplicate}
                              />
                              {duplicate && (
                                <p className="mt-1 text-[11px] text-red-500">
                                  Produk ini sudah punya aturan lain.
                                </p>
                              )}
                            </div>

                            <div className="relative">
                              <input
                                value={rule.percent}
                                onChange={(event) =>
                                  updateRule(index, {
                                    percent: event.target.value.replace(/[^\d.,]/g, "").replace(/,/g, "."),
                                  })
                                }
                                inputMode="decimal"
                                placeholder={String(form.commission_percent || 0)}
                                className="w-full rounded-xl bg-white px-3 py-2.5 pr-7 text-sm tabular-nums outline-none"
                                style={{ border: `1px solid ${invalidPercent ? "#fca5a5" : "#e4e4e7"}` }}
                                aria-label="Persentase komisi"
                              />
                              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                                %
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => removeRule(index)}
                              className="mt-0.5 flex h-10 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500"
                              aria-label="Hapus aturan produk"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={addRule}
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:bg-zinc-50"
                      style={{ border: "1px dashed #d4d4d8", color: "var(--fg)" }}
                    >
                      <Plus size={15} /> Tambah produk
                    </button>
                    {!rulesValid && (
                      <span className="text-[11px] text-red-500">
                        Lengkapi produk & persentase 0–100 sebelum menyimpan.
                      </span>
                    )}
                  </div>
                </div>
              ) : rules.length === 0 ? (
                <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                  Belum ada aturan khusus — semua produk memakai komisi global {form.commission_percent}%.
                </p>
              ) : (
                <div className="mt-2 overflow-hidden rounded-2xl" style={{ border: "1px solid #e4e4e7" }}>
                  {rules.map((rule, index) => {
                    const product = products.find((item) => item.id === rule.id);
                    return (
                      <div
                        key={`${rule.id}-${index}`}
                        className="flex items-center gap-3 px-3 py-2.5"
                        style={{ borderTop: index ? "1px solid #f4f4f5" : undefined }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium" style={{ color: "var(--fg)" }}>
                            {product?.name || rule.id}
                          </p>
                          <p className="truncate text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>
                            {rule.id}
                            {product?.series ? ` · ${product.series}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: "var(--fg)" }}>
                          {Number(rule.percent)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Row>
          </SettingsCard>

          <SettingsCard
            title="Atribusi Referral"
            description="Bagaimana kunjungan referral dikaitkan ke pesanan."
            editing={editing}
            onEdit={() => setEditing(true)}
            onCancel={() => { setForm(original); setEditing(false); }}
            onSave={save}
            saving={saving}
            canSave={canSaveAll}
          >
            <Row label="Model atribusi" hint="Last click: klik terakhir yang menang. First click: klik pertama yang masih berlaku.">
              {editing ? (
                <select
                  value={form.attribution_model}
                  onChange={(e) => set("attribution_model", e.target.value as FormState["attribution_model"])}
                  className="mt-1.5 w-full rounded-xl px-4 py-2.5 bg-white text-sm outline-none"
                  style={{ border: "1px solid #e4e4e7" }}
                >
                  <option value="last_click">Last click</option>
                  <option value="first_click">First click</option>
                </select>
              ) : (
                <p className="mt-1 text-sm font-medium" style={{ color: "var(--fg)" }}>
                  {form.attribution_model === "last_click" ? "Last click" : "First click"}
                </p>
              )}
            </Row>

            <Row label="Masa berlaku referral (hari)" hint="Klik yang lebih lama dari ini tidak lagi diatribusikan ke pesanan.">
              {editing ? (
                <TextInput value={String(form.referral_validity_days)} onChange={(v) => set("referral_validity_days", Number(v.replace(/\D/g, "")) || 0)} />
              ) : (
                <p className="mt-1 text-sm font-medium" style={{ color: "var(--fg)" }}>{form.referral_validity_days} hari</p>
              )}
            </Row>

            <Row label="Pesanan harus lunas" hint="Kalau aktif, komisi hanya dihitung setelah pembayaran terverifikasi.">
              {editing ? (
                <Toggle value={form.require_paid} onChange={(v) => set("require_paid", v)} />
              ) : (
                <p className="mt-1 text-sm font-medium" style={{ color: "var(--fg)" }}>{form.require_paid ? "Ya" : "Tidak"}</p>
              )}
            </Row>

            <Row label="Pesanan harus selesai" hint="Kalau aktif, komisi baru disetujui setelah pesanan berstatus selesai.">
              {editing ? (
                <Toggle value={form.require_completed} onChange={(v) => set("require_completed", v)} />
              ) : (
                <p className="mt-1 text-sm font-medium" style={{ color: "var(--fg)" }}>{form.require_completed ? "Ya" : "Tidak"}</p>
              )}
            </Row>

            <Row label="Masa validasi komisi (hari)" hint="Komisi menunggu selama masa ini sebelum masuk saldo tersedia.">
              {editing ? (
                <TextInput value={String(form.validation_days)} onChange={(v) => set("validation_days", Number(v.replace(/\D/g, "")) || 0)} />
              ) : (
                <p className="mt-1 text-sm font-medium" style={{ color: "var(--fg)" }}>{form.validation_days} hari</p>
              )}
            </Row>
          </SettingsCard>

          <SettingsCard
            title="Pencairan"
            description="Minimum pencairan, biaya admin, dan aturan pembatalan/retur."
            editing={editing}
            onEdit={() => setEditing(true)}
            onCancel={() => { setForm(original); setEditing(false); }}
            onSave={save}
            saving={saving}
            canSave={canSaveAll}
          >
            <Row label="Minimum pencairan (Rp)" hint="Nilai 0 = belum ditetapkan, pencairan nominal berapa pun diproses.">
              {editing ? (
                <TextInput value={String(form.min_withdrawal)} onChange={(v) => set("min_withdrawal", Number(v.replace(/\D/g, "")) || 0)} />
              ) : (
                <p className="mt-1 text-sm font-medium" style={{ color: "var(--fg)" }}>
                  {form.min_withdrawal ? money(form.min_withdrawal) : "Belum ditetapkan"}
                </p>
              )}
            </Row>

            <Row label="Biaya admin transfer bank (Rp)">
              {editing ? (
                <TextInput value={String(form.withdrawal_fee_bank)} onChange={(v) => set("withdrawal_fee_bank", Number(v.replace(/\D/g, "")) || 0)} />
              ) : (
                <p className="mt-1 text-sm font-medium" style={{ color: "var(--fg)" }}>{money(form.withdrawal_fee_bank)}</p>
              )}
            </Row>

            <Row label="Biaya admin e-wallet (Rp)">
              {editing ? (
                <TextInput value={String(form.withdrawal_fee_ewallet)} onChange={(v) => set("withdrawal_fee_ewallet", Number(v.replace(/\D/g, "")) || 0)} />
              ) : (
                <p className="mt-1 text-sm font-medium" style={{ color: "var(--fg)" }}>{money(form.withdrawal_fee_ewallet)}</p>
              )}
            </Row>

            <Row label="Pembatalan pesanan membatalkan komisi" hint="Kalau aktif, pesanan yang dibatalkan menyebabkan komisi ditolak (riwayat tetap tersimpan).">
              {editing ? (
                <Toggle value={form.reversal_on_cancel} onChange={(v) => set("reversal_on_cancel", v)} />
              ) : (
                <p className="mt-1 text-sm font-medium" style={{ color: "var(--fg)" }}>{form.reversal_on_cancel ? "Ya" : "Tidak"}</p>
              )}
            </Row>

            <Row label="Retur produk membatalkan komisi">
              {editing ? (
                <Toggle value={form.reversal_on_return} onChange={(v) => set("reversal_on_return", v)} />
              ) : (
                <p className="mt-1 text-sm font-medium" style={{ color: "var(--fg)" }}>{form.reversal_on_return ? "Ya" : "Tidak"}</p>
              )}
            </Row>
          </SettingsCard>
        </>
      )}
    </div>
  );
}

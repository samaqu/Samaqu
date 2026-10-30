"use client";

import { useState, useEffect } from "react";
import { Plus, Edit, Trash2, X, Loader2, Ticket, DollarSign, Percent, ChevronDown, ChevronUp, Calendar } from "lucide-react";
import { supabase } from "@/lib/supabase";
import AdminShell from "@/components/AdminShell";
import { useToast } from "@/components/AdminToast";
import ConfirmModal from "@/components/ConfirmModal";

interface Voucher {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  min_purchase: number;
  max_discount: number;
  usage_limit: number;
  used_count: number;
  limit_per_wa: boolean;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface VoucherUsage {
  id: string;
  voucher_id: string;
  whatsapp_number: string;
  order_id: string;
  used_at: string;
}

const emptyVoucher = {
  code: "",
  discount_type: "percentage",
  discount_value: 0,
  min_purchase: 0,
  max_discount: 0,
  usage_limit: 0,
  used_count: 0,
  limit_per_wa: false,
  start_date: "",
  end_date: "",
  is_active: true,
};

function formatRupiahInput(val: string): { display: string; numeric: number } {
  const digits = val.replace(/\D/g, "");
  if (!digits) return { display: "", numeric: 0 };
  const num = parseInt(digits, 10);
  return { display: num.toLocaleString("id-ID"), numeric: num };
}

export default function VoucherPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Voucher | null>(null);
  const [form, setForm] = useState(emptyVoucher);
  const [formDisplay, setFormDisplay] = useState({ discount_value: "", min_purchase: "", max_discount: "" });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; onConfirm: () => void }>({ open: false, onConfirm: () => {} });
  const [usages, setUsages] = useState<Record<string, VoucherUsage[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    supabase.from("vouchers").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setVouchers(data);
      setLoading(false);
    });
  }, []);

  async function loadUsages(voucherId: string) {
    if (usages[voucherId]) { setUsages((prev) => { const n = { ...prev }; delete n[voucherId]; return n; }); return; }
    const { data } = await supabase.from("voucher_usages").select("*").eq("voucher_id", voucherId).order("used_at", { ascending: false });
    if (data) setUsages((prev) => ({ ...prev, [voucherId]: data }));
  }

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyVoucher, start_date: new Date().toISOString().split("T")[0] });
    setFormDisplay({ discount_value: "", min_purchase: "", max_discount: "" });
    setErrors({});
    setModalOpen(true);
  }

  function openEdit(v: Voucher) {
    setEditing(v);
    setForm({
      code: v.code, discount_type: v.discount_type, discount_value: v.discount_value,
      min_purchase: v.min_purchase, max_discount: v.max_discount, usage_limit: v.usage_limit,
      used_count: v.used_count, limit_per_wa: v.limit_per_wa || false,
      start_date: v.start_date?.split("T")[0] || "", end_date: v.end_date?.split("T")[0] || "", is_active: v.is_active,
    });
    const isFixed = v.discount_type === "fixed";
    setFormDisplay({
      discount_value: isFixed && v.discount_value ? v.discount_value.toLocaleString("id-ID") : String(v.discount_value || ""),
      min_purchase: v.min_purchase ? v.min_purchase.toLocaleString("id-ID") : "",
      max_discount: v.max_discount ? v.max_discount.toLocaleString("id-ID") : "",
    });
    setErrors({});
    setModalOpen(true);
  }

  function handleFieldChange(field: "discount_value" | "min_purchase" | "max_discount", raw: string) {
    const isRupiah = field === "discount_value" ? form.discount_type === "fixed" : true;
    if (isRupiah) {
      const { display, numeric } = formatRupiahInput(raw);
      setFormDisplay((prev) => ({ ...prev, [field]: display }));
      setForm((prev) => ({ ...prev, [field]: numeric }));
    } else {
      const num = parseInt(raw) || 0;
      setFormDisplay((prev) => ({ ...prev, [field]: raw }));
      setForm((prev) => ({ ...prev, [field]: num }));
    }
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.code.trim()) e.code = "Kode wajib diisi";
    else if (!/^[A-Za-z0-9_-]+$/.test(form.code)) e.code = "Kode hanya boleh huruf, angka, - dan _";
    if (form.discount_value <= 0) e.discount_value = "Nilai diskon harus lebih dari 0";
    if (form.discount_type === "percentage" && form.discount_value > 100) e.discount_value = "Persentase maksimal 100%";
    if (form.min_purchase < 0) e.min_purchase = "Minimal belanja tidak boleh negatif";
    if (form.max_discount < 0) e.max_discount = "Max diskon tidak boleh negatif";
    if (form.usage_limit < 0) e.usage_limit = "Limit tidak boleh negatif";
    if (!form.end_date) e.end_date = "Tanggal akhir wajib diisi";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    const code = form.code.trim().toUpperCase();
    const payload = {
      code, discount_type: form.discount_type, discount_value: form.discount_value,
      min_purchase: form.min_purchase, max_discount: form.max_discount,
      usage_limit: form.usage_limit, limit_per_wa: form.limit_per_wa,
      start_date: form.start_date, end_date: form.end_date, is_active: form.is_active,
    };

    if (editing) {
      const { error } = await supabase.from("vouchers").update(payload).eq("id", editing.id);
      if (error) {
        if (error.code === "23505") { setErrors({ code: "Kode voucher sudah digunakan" }); setSaving(false); return; }
        toast.showToast("error", "Gagal menyimpan"); setSaving(false); return;
      }
      setVouchers(vouchers.map((v) => v.id === editing.id ? { ...v, ...payload, id: editing.id } : v));
      toast.showToast("success", "Voucher berhasil diperbarui");
    } else {
      const { data, error } = await supabase.from("vouchers").insert(payload).select().single();
      if (error) {
        if (error.code === "23505") { setErrors({ code: "Kode voucher sudah digunakan" }); setSaving(false); return; }
        toast.showToast("error", "Gagal menyimpan"); setSaving(false); return;
      }
      setVouchers([data, ...vouchers]);
      toast.showToast("success", "Voucher berhasil ditambahkan");
    }
    setModalOpen(false);
    setSaving(false);
  }

  function handleDelete(v: Voucher) {
    setConfirmModal({
      open: true,
      onConfirm: async () => {
        await supabase.from("voucher_usages").delete().eq("voucher_id", v.id);
        await supabase.from("vouchers").delete().eq("id", v.id);
        setVouchers(vouchers.filter((x) => x.id !== v.id));
        toast.showToast("success", "Voucher berhasil dihapus");
        setConfirmModal({ open: false, onConfirm: () => {} });
      },
    });
  }

  async function toggleActive(v: Voucher) {
    const newVal = !v.is_active;
    await supabase.from("vouchers").update({ is_active: newVal }).eq("id", v.id);
    setVouchers(vouchers.map((x) => x.id === v.id ? { ...x, is_active: newVal } : x));
  }

  function formatDiscount(v: Voucher) {
    if (v.discount_type === "percentage") return `${v.discount_value}%`;
    return `Rp ${v.discount_value.toLocaleString("id-ID")}`;
  }

  function formatDate(d: string) {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <AdminShell>
      <section className="p-5 lg:p-8 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: "var(--espresso)" }}>Voucher / Kode Promo</h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Kelola kode promo untuk pelanggan</p>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl text-white" style={{ background: "linear-gradient(135deg, var(--gold), #96742f)" }}>
            <Plus size={18} /> Tambah Voucher
          </button>
        </div>

        {loading ? (
          <div className="card p-12 flex justify-center"><Loader2 size={24} className="animate-spin" style={{ color: "var(--gold)" }} /></div>
        ) : (
          <div className="space-y-4">
            {vouchers.map((v) => {
              const isExpanded = expandedId === v.id;
              const usageList = usages[v.id];
              const isExpired = v.end_date && new Date(v.end_date) < new Date();
              const isFull = v.usage_limit > 0 && v.used_count >= v.usage_limit;
              const statusLabel = isExpired ? "Kadaluarsa" : isFull ? "Habis" : v.is_active ? "Aktif" : "Nonaktif";
              const statusColor = isExpired ? { bg: "#f4f4f5", text: "#71717a" } : isFull ? { bg: "#fef2f2", text: "#dc2626" } : v.is_active ? { bg: "#f4f4f5", text: "#3f3f46" } : { bg: "#f4f4f5", text: "#52525b" };
              const usagePct = v.usage_limit > 0 ? Math.min(100, (v.used_count / v.usage_limit) * 100) : 0;

              return (
                <div key={v.id} className="rounded-2xl overflow-hidden" style={{ background: "#ffffff", border: "1px solid #f1f1f3", boxShadow: "0 1px 3px #fafafa" }}>
                  <div className="flex">
                    {/* Left: discount badge (ticket stub) */}
                    <div className="flex flex-col items-center justify-center px-5 py-5 min-w-[100px] relative" style={{ background: "linear-gradient(135deg, #f4f4f5 0%, #f4f4f5 100%)" }}>
                      <span className="text-2xl font-bold leading-none" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--gold)" }}>
                        {v.discount_type === "percentage" ? `${v.discount_value}%` : `Rp${Math.round(v.discount_value / 1000)}K`}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider mt-1 font-medium" style={{ color: "#52525b" }}>
                        {v.discount_type === "percentage" ? "Diskon" : "Potongan"}
                      </span>
                      {/* Ticket notch */}
                      <div className="absolute top-0 right-0 w-3 h-3 rounded-bl-full" style={{ background: "#ffffff" }} />
                      <div className="absolute bottom-0 right-0 w-3 h-3 rounded-tl-full" style={{ background: "#ffffff" }} />
                      <div className="absolute top-0 right-0 w-[1px] h-full" style={{ borderRight: "2px dashed #e4e4e7" }} />
                    </div>

                    {/* Right: voucher details */}
                    <div className="flex-1 px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {/* Voucher code */}
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="text-lg font-bold tracking-wide" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}>{v.code}</span>
                            <span className="text-[10px] px-2.5 py-1 rounded-full font-medium" style={{ background: statusColor.bg, color: statusColor.text }}>{statusLabel}</span>
                            {v.limit_per_wa && <span className="text-[10px] px-2.5 py-1 rounded-full font-medium" style={{ background: "#e4e4e7", color: "#52525b" }}>1x/WA</span>}
                          </div>

                          {/* Info row */}
                          <div className="flex items-center gap-3 mt-2 text-[11px] flex-wrap" style={{ color: "var(--text-muted)" }}>
                            {v.min_purchase > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <DollarSign size={11} />
                                Min Rp {v.min_purchase.toLocaleString("id-ID")}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1">
                              <Calendar size={11} />
                              {isExpired ? <span style={{ color: "#dc2626" }}>Kadaluarsa</span> : `Hingga ${formatDate(v.end_date)}`}
                            </span>
                          </div>

                          {/* Progress bar or usage count */}
                          {v.usage_limit > 0 ? (
                            <div className="mt-3">
                              <div className="flex items-center justify-between text-[10px] mb-1" style={{ color: "var(--text-muted)" }}>
                                <span>Terpakai {v.used_count} / {v.usage_limit}</span>
                                <span>{Math.round(usagePct)}%</span>
                              </div>
                              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#e4e4e7" }}>
                                <div className="h-full rounded-full transition-all" style={{ width: `${usagePct}%`, background: usagePct >= 100 ? "#dc2626" : "var(--gold)" }} />
                              </div>
                            </div>
                          ) : (
                            <p className="mt-2 text-[10px]" style={{ color: "var(--text-muted)" }}>Terpakai: {v.used_count} kali (tanpa batas)</p>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => openEdit(v)} className="p-2 rounded-lg transition-colors hover:bg-[#f4f4f5]" style={{ color: "var(--gold)", border: "1px solid #e4e4e7" }} title="Edit"><Edit size={14} /></button>
                          <button onClick={() => handleDelete(v)} className="p-2 rounded-lg transition-colors hover:bg-red-50" style={{ color: "#dc2626", border: "1px solid rgba(231,76,60,.15)" }} title="Hapus"><Trash2 size={14} /></button>
                          <button onClick={() => { setExpandedId(isExpanded ? null : v.id); loadUsages(v.id); }} className="p-2 rounded-lg transition-colors hover:bg-[#f4f4f5]" style={{ color: "var(--text-muted)", border: "1px solid #e4e4e7" }} title="Lihat pemakaian">
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded usage list */}
                  {isExpanded && (
                    <div className="px-5 py-4" style={{ borderTop: "1px dashed #e4e4e7", background: "rgba(255,255,255,.3)" }}>
                      <p className="text-[11px] font-medium mb-2.5" style={{ color: "var(--text-muted)" }}>Nomor WA yang sudah menggunakan voucher:</p>
                      {usageList && usageList.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {usageList.map((u) => (
                            <span key={u.id} className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg font-medium" style={{ background: "#fafafa", color: "var(--espresso)" }}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--gold)" }} />
                              {u.whatsapp_number}
                              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{new Date(u.used_at).toLocaleDateString("id-ID")}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>Belum ada pemakaian</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {vouchers.length === 0 && (
              <div className="card p-12 text-center" style={{ color: "var(--text-muted)" }}>Belum ada voucher</div>
            )}
          </div>
        )}

        {/* Add/Edit Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(42,33,27,.4)", backdropFilter: "blur(4px)" }} onClick={() => setModalOpen(false)}>
            <div className="w-full max-w-lg rounded-2xl p-6 max-h-[85vh] overflow-y-auto" style={{ background: "var(--cream)", boxShadow: "0 25px 60px -12px rgba(42,33,27,.5)" }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold" style={{ color: "var(--espresso)" }}>{editing ? "Edit Voucher" : "Tambah Voucher"}</h2>
                <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg" style={{ color: "var(--text-muted)" }}><X size={18} /></button>
              </div>

              <div className="space-y-4">
                {/* Code */}
                <div>
                  <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Kode Voucher *</label>
                  <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ border: errors.code ? "1px solid #dc2626" : "1px solid #d4d4d8", background: "white", color: "var(--espresso)" }} placeholder="CONTOHPromo" />
                  {errors.code && <p className="text-[11px] mt-1" style={{ color: "#dc2626" }}>{errors.code}</p>}
                </div>

                {/* Type + Value */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Tipe Diskon</label>
                    <select value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ border: "1px solid #d4d4d8", background: "white", color: "var(--espresso)" }}>
                      <option value="percentage">Persen (%)</option>
                      <option value="fixed">Nominal (Rp)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Nilai Diskon *</label>
                    <div className="relative">
                      {form.discount_type === "fixed" && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>Rp</span>}
                      <input type="text" value={formDisplay.discount_value} onChange={(e) => handleFieldChange("discount_value", e.target.value)} className="w-full rounded-lg py-2.5 text-sm outline-none" style={{ border: errors.discount_value ? "1px solid #dc2626" : "1px solid #d4d4d8", background: "white", color: "var(--espresso)", paddingLeft: form.discount_type === "fixed" ? "2.2rem" : "0.75rem", paddingRight: "0.75rem" }} placeholder={form.discount_type === "percentage" ? "10" : "50.000"} />
                    </div>
                    {errors.discount_value && <p className="text-[11px] mt-1" style={{ color: "#dc2626" }}>{errors.discount_value}</p>}
                  </div>
                </div>

                {/* Min purchase + Max discount */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Minimal Belanja</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>Rp</span>
                      <input type="text" value={formDisplay.min_purchase} onChange={(e) => handleFieldChange("min_purchase", e.target.value)} className="w-full rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none" style={{ border: "1px solid #d4d4d8", background: "white", color: "var(--espresso)" }} placeholder="0" />
                    </div>
                  </div>
                  {form.discount_type === "percentage" && (
                    <div>
                      <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Max Diskon</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>Rp</span>
                        <input type="text" value={formDisplay.max_discount} onChange={(e) => handleFieldChange("max_discount", e.target.value)} className="w-full rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none" style={{ border: "1px solid #d4d4d8", background: "white", color: "var(--espresso)" }} placeholder="Tanpa batas" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Usage limit */}
                <div>
                  <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Batas Penggunaan Total (0 = tanpa batas)</label>
                  <input type="number" value={form.usage_limit || ""} onChange={(e) => setForm({ ...form, usage_limit: Number(e.target.value) })} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ border: "1px solid #d4d4d8", background: "white", color: "var(--espresso)" }} placeholder="0" />
                </div>

                {/* Limit per WA */}
                <label className="flex items-start gap-2.5 cursor-pointer p-3 rounded-lg" style={{ background: "rgba(255,255,255,.5)", border: "1px solid #e4e4e7" }}>
                  <input type="checkbox" checked={form.limit_per_wa} onChange={(e) => setForm({ ...form, limit_per_wa: e.target.checked })} className="rounded mt-0.5" />
                  <div>
                    <span className="text-sm font-medium" style={{ color: "var(--espresso)" }}>Batasi 1x pakai per nomor WhatsApp</span>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Setiap nomor WhatsApp hanya bisa menggunakan voucher ini sekali</p>
                  </div>
                </label>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Tanggal Mulai</label>
                    <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ border: "1px solid #d4d4d8", background: "white", color: "var(--espresso)" }} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Tanggal Berakhir *</label>
                    <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ border: errors.end_date ? "1px solid #dc2626" : "1px solid #d4d4d8", background: "white", color: "var(--espresso)" }} />
                    {errors.end_date && <p className="text-[11px] mt-1" style={{ color: "#dc2626" }}>{errors.end_date}</p>}
                  </div>
                </div>

                {/* Active */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
                  <span className="text-sm" style={{ color: "var(--espresso)" }}>Aktif</span>
                </label>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setModalOpen(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ border: "1px solid #d4d4d8", color: "var(--espresso)" }}>Batal</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "var(--gold)" }}>
                  {saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
                  {editing ? "Simpan" : "Tambah"}
                </button>
              </div>
            </div>
          </div>
        )}

        <ConfirmModal open={confirmModal.open} title="Hapus Voucher?" message="Voucher yang dihapus tidak bisa dikembalikan." onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal({ open: false, onConfirm: () => {} })} />
      </section>
    </AdminShell>
  );
}

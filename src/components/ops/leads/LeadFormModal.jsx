import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/lib/ops-api";
import { motion } from "framer-motion";
import { X, Save, CalendarClock, User, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ops/ui/use-toast";
import { defaultFirstFollowup, isoToWibInput, wibInputToIso } from "@/lib/ops-followup";

const SUMBER_OPTIONS = ["Website", "IG", "WA", "Meta ads"];

const formatRupiah = (value) => {
  if (!value) return '';
  const number = parseInt(value.toString().replace(/\D/g, ''));
  if (isNaN(number)) return '';
  return number.toLocaleString('id-ID');
};

const parseRupiah = (value) => parseInt(value.replace(/\D/g, '')) || 0;

/** Input datetime-local (WIB) dari tanggal + jam, mis. "2026-10-14" + 10 -> "2026-10-14T10:00" */
const wibInputFrom = (daysAhead, hour) => isoToWibInput(defaultFirstFollowup(new Date(), daysAhead, hour));

export default function LeadFormModal({ isOpen, onClose, initialData = null, defaultDate }) {
  const isEdit = !!initialData;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const emptyForm = {
    tanggal: '',
    jam: '',
    kontak: '',
    sumber: 'Website',
    status: 'belum_closing',
    nominal: 0,
    catatan: '',
    produk: '',
    pic: '',
    nextFollowupAt: '',
  };

  const [form, setForm] = useState(emptyForm);
  const [displayNominal, setDisplayNominal] = useState('');
  const [saveError, setSaveError] = useState('');

  // Pilihan produk (katalog asli) & PIC (dari PIC yang sudah dipakai + akun admin)
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
    enabled: isOpen,
    initialData: [],
  });

  const { data: picOptions = [] } = useQuery({
    queryKey: ['leadPicOptions'],
    enabled: isOpen,
    initialData: [],
    queryFn: async () => {
      const { supabase } = await import("@/lib/supabase");
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch("/api/ops/leads?limit=1", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json().catch(() => null);
      return json?.options?.pics || [];
    },
  });

  useEffect(() => {
    if (isOpen) {
      setSaveError('');
      if (initialData) {
        setForm({
          tanggal: initialData.tanggal || '',
          jam: initialData.jam || '',
          kontak: initialData.kontak || '',
          sumber: initialData.sumber || 'Website',
          status: initialData.status || 'belum_closing',
          nominal: initialData.nominal || 0,
          catatan: initialData.catatan || '',
          produk: initialData.produk || '',
          pic: initialData.pic || '',
          nextFollowupAt: isoToWibInput(initialData.next_followup_at) || '',
        });
        setDisplayNominal(initialData.nominal ? formatRupiah(initialData.nominal) : '');
      } else {
        setForm({ ...emptyForm, tanggal: defaultDate || '', nextFollowupAt: wibInputFrom(1, 10) });
        setDisplayNominal('');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialData, defaultDate]);

  const saveMutation = useMutation({
    mutationFn: (data) => isEdit
      ? base44.entities.Lead.update(initialData.id, data)
      : base44.entities.Lead.create(data),
    onSuccess: () => {
      setSaveError('');
      queryClient.invalidateQueries(['leads']);
      queryClient.invalidateQueries({ queryKey: ['followups'] });
      toast({
        title: isEdit ? "✅ Lead berhasil diupdate" : "✅ Lead berhasil ditambahkan",
        description: isEdit ? undefined : "Lead langsung masuk jadwal follow-up.",
        variant: "success",
      });
      onClose();
    },
    onError: (e) => {
      setSaveError(e instanceof Error ? e.message : "Gagal menyimpan lead. Coba lagi.");
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setSaveError('');
    if (!form.tanggal || !form.kontak.trim()) return;
    const payload = {
      tanggal: form.tanggal,
      jam: form.jam.trim(),
      kontak: form.kontak.trim(),
      sumber: form.sumber,
      status: form.status,
      nominal: form.status === 'closing' ? (form.nominal || 0) : 0,
      catatan: form.catatan.trim(),
      produk: form.produk.trim() || null,
      pic: form.pic.trim() || null,
    };
    const iso = wibInputToIso(form.nextFollowupAt);
    if (iso) payload.nextFollowupAt = iso;
    saveMutation.mutate(payload);
  };

  if (!isOpen) return null;

  const inputClass = "w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-700 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 text-sm font-semibold text-slate-900 dark:text-white";
  const labelClass = "text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1.5";

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="bg-white dark:bg-[#1a1d28] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white">
              {isEdit ? 'Edit Lead' : 'Tambah Lead Baru'}
            </h3>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Tutup">
              <X size={18} className="text-slate-500 dark:text-slate-400" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Tanggal <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  required
                  value={form.tanggal}
                  onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Jam</label>
                <input
                  type="text"
                  value={form.jam}
                  onChange={(e) => setForm({ ...form, jam: e.target.value })}
                  placeholder="10.00"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>No HP / Username IG <span className="text-red-500">*</span></label>
              <input
                type="text"
                required
                value={form.kontak}
                onChange={(e) => { setForm({ ...form, kontak: e.target.value }); if (saveError) setSaveError(''); }}
                placeholder="Contoh: 85892344482 atau @username"
                aria-invalid={saveError ? true : undefined}
                aria-describedby={saveError ? "lead-form-error" : undefined}
                className={`${inputClass} aria-invalid:border-red-400 aria-invalid:focus:border-red-500 aria-invalid:focus:ring-red-100`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Sumber</label>
                <select
                  value={form.sumber}
                  onChange={(e) => setForm({ ...form, sumber: e.target.value })}
                  className={inputClass}
                >
                  {SUMBER_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>PIC / Penanggung jawab</label>
                <input
                  type="text"
                  list="lead-pic-options"
                  value={form.pic}
                  onChange={(e) => setForm({ ...form, pic: e.target.value })}
                  placeholder="Pilih atau ketik nama"
                  className={inputClass}
                />
                <datalist id="lead-pic-options">
                  {picOptions.map((p) => <option key={p} value={p} />)}
                </datalist>
                <p className="mt-1 text-[10px] text-slate-400">Dipakai untuk filter & pembagian tugas di Follow-up Center.</p>
              </div>
            </div>

            <div>
              <label className={labelClass}>Produk yang diminati</label>
              <input
                type="text"
                list="lead-produk-options"
                value={form.produk}
                onChange={(e) => setForm({ ...form, produk: e.target.value })}
                placeholder="Contoh: Thobe Superblack"
                className={inputClass}
              />
              <datalist id="lead-produk-options">
                {(products || []).map((p) => <option key={p.id || p.name} value={p.name} />)}
              </datalist>
              <p className="mt-1 text-[10px] text-slate-400">Bisa dipilih dari katalog atau diketik bebas.</p>
            </div>

            <div>
              <label className={labelClass}>Status</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, status: 'belum_closing' })}
                  className={`flex-1 px-4 py-2.5 rounded-lg border-2 text-sm font-bold transition-all ${
                    form.status === 'belum_closing'
                      ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-400 text-amber-700 dark:text-amber-300'
                      : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Belum Closing
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, status: 'closing' })}
                  className={`flex-1 px-4 py-2.5 rounded-lg border-2 text-sm font-bold transition-all ${
                    form.status === 'closing'
                      ? 'bg-green-50 dark:bg-green-900/30 border-green-500 text-green-700 dark:text-green-300'
                      : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Closing
                </button>
              </div>
            </div>

            {form.status === 'closing' && (
              <div>
                <label className={labelClass}>Nominal Transaksi</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 font-semibold text-sm">Rp</span>
                  <input
                    type="text"
                    value={displayNominal}
                    onChange={(e) => {
                      const numeric = parseRupiah(e.target.value);
                      setForm({ ...form, nominal: numeric });
                      setDisplayNominal(formatRupiah(numeric));
                    }}
                    placeholder="0"
                    className="w-full pl-10 pr-3 py-2.5 bg-gray-50 dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-700 rounded-lg focus:border-green-500 focus:ring-2 focus:ring-green-100 dark:focus:ring-green-900/30 text-sm font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            )}

            {/* Relasi transaksi: hanya tampil kalau lead ini closing karena sebuah pesanan. */}
            {isEdit && initialData?.order_number && (
              <div>
                <label className={labelClass}>Transaksi</label>
                <a
                  href={`/ops/transaksi?search=${encodeURIComponent(initialData.order_number)}`}
                  className="flex items-center justify-between gap-2 rounded-lg border-2 border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-blue-700 transition-colors hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-300"
                >
                  <span className="font-mono">{initialData.order_number}</span>
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Buka transaksi →</span>
                </a>
              </div>
            )}

            {/* Follow-up: setiap lead baru langsung punya jadwalnya sendiri */}
            <div className="rounded-xl border-2 border-blue-100 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-900/10 p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <CalendarClock size={15} className="text-blue-600 dark:text-blue-400" />
                <label className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  Jadwal follow-up pertama (WIB)
                </label>
              </div>
              <input
                type="datetime-local"
                value={form.nextFollowupAt}
                onChange={(e) => setForm({ ...form, nextFollowupAt: e.target.value })}
                className={inputClass}
              />
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, nextFollowupAt: wibInputFrom(0, Math.min(23, new Date(Date.now() + 7 * 3600 * 1000).getUTCHours() + 2)) })}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-50"
                >
                  Hari ini (+2 jam)
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, nextFollowupAt: wibInputFrom(1, 10) })}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-50"
                >
                  Besok 10.00
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, nextFollowupAt: wibInputFrom(3, 10) })}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-50"
                >
                  H+3
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                <User size={11} className="inline -mt-0.5" /> Lead baru otomatis dijadwalkan ke antrean Follow-up Center.
                Standar respons cepat: hubungi di jam pertama setelah lead masuk.
              </p>
            </div>

            <div>
              <label className={labelClass}>Catatan</label>
              <textarea
                value={form.catatan}
                onChange={(e) => setForm({ ...form, catatan: e.target.value })}
                rows={2}
                placeholder="Catatan tambahan (opsional)"
                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-slate-900 border-2 border-gray-200 dark:border-slate-700 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 text-sm font-medium text-slate-900 dark:text-white resize-none"
              />
            </div>

            {saveError && (
              <motion.div
                id="lead-form-error"
                role="alert"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2.5 rounded-xl border-2 border-red-200 bg-red-50 px-3.5 py-3"
              >
                <AlertCircle size={16} className="mt-px shrink-0 text-red-600" />
                <p className="text-sm font-medium leading-snug text-red-700">{saveError}</p>
              </motion.div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-5 py-2.5 bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-all"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all"
              >
                <Save size={16} />
                {saveMutation.isPending ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </>
  );
}

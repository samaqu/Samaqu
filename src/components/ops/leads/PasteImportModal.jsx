import { useState, useMemo, useEffect } from "react";
import { base44 } from "@/lib/ops-api";
import { motion, AnimatePresence } from "framer-motion";
import { ClipboardPaste, CheckCircle2, XCircle, Loader2, Info, Copy, Upload } from "lucide-react";
import { useToast } from "@/components/ops/ui/use-toast";
import { normalizeKontak } from "@/lib/ops-followup";

const SOURCES = ["Meta ads", "WA", "IG", "Website"];
const BATCH_SIZE = 20;
const BATCH_DELAY = 300;

// Pecah tanggal mentah: yyyy-mm-dd atau d(m)/d(m)/yyyy
const splitDate = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return { y: m[1], a: Number(m[2]), b: Number(m[3]), iso: true };
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return { y, a: Number(m[1]), b: Number(m[2]) };
  }
  return null;
};

// Deteksi urutan tanggal dari SEMUA baris paste (10/1..10/9 → MM/DD, 1/10..30/10 → DD/MM)
const detectDateOrder = (samples) => {
  if (samples.some((s) => s.b > 12)) return 'mdy';
  if (samples.some((s) => s.a > 12)) return 'dmy';
  const aVals = new Set(samples.map((s) => s.a));
  const bVals = new Set(samples.map((s) => s.b));
  if (aVals.size === 1 && bVals.size > 1) return 'mdy';
  if (bVals.size === 1 && aVals.size > 1) return 'dmy';
  // Masih ragu (mis. hanya ada 10/1): pilih hasil yang paling dekat dengan hari ini
  if (samples.length === 0) return 'dmy';
  const s = samples[0];
  const pad2 = (n) => String(n).padStart(2, '0');
  const dmy = new Date(`${s.y}-${pad2(s.b)}-${pad2(s.a)}T00:00:00`);
  const mdy = new Date(`${s.y}-${pad2(s.a)}-${pad2(s.b)}T00:00:00`);
  if (isNaN(mdy)) return 'dmy';
  if (isNaN(dmy)) return 'mdy';
  return Math.abs(dmy - new Date()) <= Math.abs(mdy - new Date()) ? 'dmy' : 'mdy';
};

const toIso = (d, order) => {
  if (!d) return null;
  if (d.iso) return `${d.y}-${String(d.a).padStart(2, '0')}-${String(d.b).padStart(2, '0')}`;
  const month = order === 'mdy' ? d.a : d.b;
  const day = order === 'mdy' ? d.b : d.a;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${d.y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

// Parse nominal: "Rp379.000", "379000", "Rp 379,000" → 379000
const parseNominal = (raw) => {
  const s = String(raw || '').replace(/[^\d]/g, '');
  return s ? parseInt(s, 10) : 0;
};

// Parse sumber: "Meta Ads", "meta ads", "IG", "WhatsApp" → enum
const parseSumber = (raw) => {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  if (s.includes('meta') || s.includes('ads')) return 'Meta ads';
  if (s === 'wa' || s.includes('whatsapp')) return 'WA';
  if (s === 'ig' || s.includes('instagram')) return 'IG';
  if (s.includes('web')) return 'Website';
  return null;
};

// Parse keterangan: "Belum Closing" → belum_closing, "Closing" → closing
const parseStatus = (raw) => {
  const s = String(raw || '').trim().toLowerCase();
  if (s.startsWith('belum')) return 'belum_closing';
  if (s.includes('closing')) return 'closing';
  return null;
};

// Pecah satu baris: kalau ada TAB pakai TAB (hasil copy dari Google Sheet),
// kalau tidak anggap CSV (perhatikan tanda kutip).
function splitLine(line) {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; } else { q = !q; }
    } else if ((ch === ',' || ch === ';') && !q) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

// Parse semua baris TSV/CSV dari Google Sheets (paste) atau file .csv
export function parsePastedRows(text, existingKeys = new Set()) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim() !== '');
  const rows = [];
  let skipped = 0;
  const seenInPaste = new Set();
  // Baris lanjutan (sel Sheet yang mengandung enter) digabung ke baris sebelumnya
  const colRows = [];
  lines.forEach((line) => {
    const cols = splitLine(line);
    // Skip baris header (TANGGAL, JAM, ...)
    if (colRows.length === 0 && /tanggal/i.test(cols[0] || '')) return;
    if (cols[0] && splitDate(cols[0])) { colRows.push(cols); return; }
    if (colRows.length > 0) { colRows[colRows.length - 1] = colRows[colRows.length - 1].concat(cols); return; }
    colRows.push(cols);
  });
  const order = detectDateOrder(colRows.map((cols) => splitDate(cols[0])).filter(Boolean));
  colRows.forEach((cols) => {
    // Kolom: TANGGAL, JAM, NO/IG, lalu SUMBER/KETERANGAN/NOMINAL (bisa tergeser jika ada sel kosong — dicari dengan pola)
    const tanggal = toIso(splitDate(cols[0]), order);
    const jam = cols[1] || '';
    const kontak = (cols[2] || '').trim().replace(/^[=@"'\s]+|[@"'\s]+$/g, '');
    const rest = cols.slice(3);
    let sumber = null, status = null;
    rest.forEach((cell) => {
      if (!sumber) { const s = parseSumber(cell); if (s) { sumber = s; return; } }
      if (!status) { const st = parseStatus(cell); if (st) { status = st; return; } }
    });
    const nominal = status === 'closing' ? parseNominal(rest.filter((c) => c).pop()) : 0;
    const valid = !!(tanggal && kontak && sumber && status);
    if (!valid && cols.every((c) => !c)) return;
    if (!valid) { skipped += 1; rows.push({ tanggal, jam, kontak, sumber, status, nominal, valid }); return; }
    // Anti-duplikat: tanggal + kontak (dinormalisasi: 08xx = 62xx = 8xx, username case-insensitive)
    const key = `${tanggal}|${normalizeKontak(kontak)}`;
    const dupInPaste = seenInPaste.has(key);
    seenInPaste.add(key);
    const dupInDb = existingKeys.has(key);
    rows.push({ tanggal, jam, kontak, sumber, status, nominal, valid, duplicate: dupInPaste || dupInDb });
  });
  return { rows, skipped };
}

export default function PasteImportModal({ isOpen, onClose, onSuccess }) {
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [failedRows, setFailedRows] = useState(null);
  const [importError, setImportError] = useState('');
  const [isChecking, setIsChecking] = useState(true);
  const [existingKeys, setExistingKeys] = useState(new Set());

  // Muat semua lead yang sudah ada (kunci: tanggal + kontak) utk anti-duplikat
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setExistingKeys(new Set());
    setIsChecking(true);
    setImportError('');
    (async () => {
      const set = new Set();
      let cursor;
      try {
        do {
          const page = await base44.entities.Lead.list({ fields: ['kontak', 'tanggal'], limit: 500, cursor });
          (page.items || []).forEach((l) => set.add(`${l.tanggal}|${normalizeKontak(l.kontak)}`));
          cursor = page.next_cursor;
        } while (cursor && !cancelled);
        if (!cancelled) { setExistingKeys(set); setIsChecking(false); }
      } catch (error) {
        if (!cancelled) setImportError(error.message || 'Pemeriksaan duplikat gagal. Tutup lalu buka kembali import.');
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  const parsed = useMemo(() => parsePastedRows(text, existingKeys), [text, existingKeys]);
  const importable = useMemo(
    () => parsed.rows.filter((r) => r.valid && !r.duplicate),
    [parsed]
  );

  useEffect(() => { setFailedRows(null); setImportError(''); }, [text]);
  const pendingRows = failedRows ?? importable;
  const dupCount = parsed.rows.filter((r) => r.valid && r.duplicate).length;
  const failCount = failedRows?.length || 0;

  const handlePasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      setText(clip);
    } catch {
      toast({ title: "Tidak bisa akses clipboard, paste manual di kotak", variant: "destructive" });
    }
  };

  // Import per batch bertahap — anti rate limit, presisi, ada progress
  const runImport = async (rows) => {
    if (rows.length === 0) return;
    setIsImporting(true);
    setImportError('');
    setProgress({ done: 0, total: rows.length });
    let ok = 0;
    const saved = [];
    let failed = [];
    try {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        try {
          await base44.entities.Lead.bulkCreate(batch.map((r) => ({
            tanggal: r.tanggal, jam: r.jam, kontak: r.kontak,
            sumber: r.sumber, status: r.status, nominal: r.nominal,
          })));
        } catch (error) {
          failed = rows.slice(i);
          setImportError(error.message || 'Data gagal disimpan. Silakan ulangi import.');
          break;
        }
        ok += batch.length;
        saved.push(...batch);
        setProgress({ done: ok, total: rows.length });
        if (i + BATCH_SIZE < rows.length) await new Promise((r) => setTimeout(r, BATCH_DELAY));
      }
      setFailedRows(failed);
      setExistingKeys((keys) => new Set([...keys, ...saved.map((r) => `${r.tanggal}|${normalizeKontak(r.kontak)}`)]));
      if (ok > 0) {
        const latestDate = saved.reduce((latest, r) => r.tanggal > latest ? r.tanggal : latest, '');
        await onSuccess?.(ok, latestDate);
      }
      if (failed.length === 0) {
        toast({ title: `${ok} leads berhasil diimport`, variant: 'success' });
        setText('');
        onClose();
      } else {
        toast({ title: `${ok} berhasil, ${failed.length} belum tersimpan`, variant: 'destructive', duration: 7000 });
      }
    } finally {
      setIsImporting(false);
    }
  };

  const fmtRp = (v) => (v > 0 ? `Rp ${v.toLocaleString('id-ID')}` : '-');

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => { if (!isImporting) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#1a1d28] rounded-2xl shadow-2xl no-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                  <ClipboardPaste size={19} className="text-white" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white">Import Leads via Paste</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Copy kolom dari Google Sheet, lalu paste di sini</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              {/* Info format */}
              <div className="flex items-start gap-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 rounded-xl p-3">
                <Info size={15} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                  Copy kolom <b>TANGGAL, JAM, NO/IG, SUMBER, KETERANGAN, NOMINAL</b> dari Google Sheet (blok sel → Ctrl+C),
                  lalu paste di bawah — atau <b>pilih file .csv</b> hasil download dari Google Sheet (File → Download → CSV). Baris header ikut di-copy juga tidak masalah — otomatis dilewati.
                  Lead dengan <b>tanggal &amp; kontak yang sama</b> dengan data yang sudah ada otomatis dilewati (anti duplikat).
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  disabled={isImporting}
                  onClick={handlePasteFromClipboard}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all active:scale-[0.98]"
                >
                  <ClipboardPaste size={16} />
                  Paste dari Clipboard
                </button>
                <label
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold transition-all ${
                    isImporting
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer active:scale-[0.98]'
                  }`}
                >
                  <Upload size={16} />
                  Pilih file .csv / .txt
                  <input
                    type="file"
                    accept=".csv,.txt,text/csv,text/plain"
                    disabled={isImporting}
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files && e.target.files[0];
                      if (!file) return;
                      const content = await file.text();
                      setText(content);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>

              <textarea
                disabled={isImporting}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"10/8/2026\t19.36\t81279172039\tMeta Ads\tBelum Closing\n10/9/2026\t21.05\t8967130044\tWebsite\tClosing\tRp544.000"}
                rows={6}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y font-mono"
              />

              {/* Progress saat import */}
              {isImporting && (
                <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Loader2 size={14} className="animate-spin text-blue-600" />
                    <p className="text-xs font-bold text-blue-800 dark:text-blue-300">
                      Mengimport {progress.done} / {progress.total} leads...
                    </p>
                  </div>
                  <div className="h-2 bg-blue-100 dark:bg-blue-900 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {isChecking && !importError && <p className="text-sm text-muted-foreground">Memeriksa duplikat...</p>}
              {importError && <p role="alert" className="text-sm text-destructive">{importError}</p>}
              {/* Ringkasan gagal (retry) */}
              {!isImporting && failCount > 0 && (
                <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl p-3">
                  <p className="text-xs font-bold text-red-700 dark:text-red-400">
                    {failCount} lead gagal diimport — klik "Import {failCount} Leads" untuk mengulang hanya yang gagal.
                  </p>
                </div>
              )}

              {/* Preview */}
              {text.trim() !== '' && !isImporting && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      Pratinjau: <span className="text-emerald-600 dark:text-emerald-400">{importable.length} siap import</span>
                      {dupCount > 0 && <span className="text-amber-600 dark:text-amber-400"> · {dupCount} duplikat dilewati</span>}
                      {parsed.skipped > 0 && <span className="text-red-500"> · {parsed.skipped} invalid dilewati</span>}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                      Total Nominal: {fmtRp(importable.reduce((s, r) => s + r.nominal, 0))}
                    </p>
                  </div>
                  <div className="max-h-48 overflow-y-auto no-scrollbar">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-slate-500 dark:text-slate-400">
                          <th className="px-3 py-2 font-bold uppercase tracking-wider">Tanggal</th>
                          <th className="px-2 py-2 font-bold uppercase tracking-wider">Kontak</th>
                          <th className="px-2 py-2 font-bold uppercase tracking-wider">Sumber</th>
                          <th className="px-2 py-2 font-bold uppercase tracking-wider">Status</th>
                          <th className="px-3 py-2 font-bold uppercase tracking-wider text-right">Nominal (produk saja)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.rows.slice(0, 20).map((r, i) => (
                          <tr key={i} className={`border-t border-slate-100 dark:border-slate-800 ${r.valid && r.duplicate ? 'opacity-50' : ''}`}>
                            <td className="px-3 py-2 text-slate-900 dark:text-white font-semibold">{r.tanggal || <span className="text-red-500">?</span>}</td>
                            <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{r.kontak || <span className="text-red-500">?</span>}</td>
                            <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{r.sumber || <span className="text-red-500">?</span>}</td>
                            <td className="px-2 py-2">
                              {r.valid ? (
                                r.duplicate ? (
                                  <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400">
                                    <Copy size={11} /> Duplikat
                                  </span>
                                ) : (
                                  <span className={`inline-flex items-center gap-1 font-bold ${r.status === 'closing' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                    <CheckCircle2 size={11} /> {r.status === 'closing' ? 'Closing' : 'Belum'}
                                  </span>
                                )
                              ) : (
                                <span className="inline-flex items-center gap-1 font-bold text-red-500"><XCircle size={11} /> Invalid</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-slate-900 dark:text-white">{fmtRp(r.nominal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsed.rows.length > 20 && (
                      <p className="px-3 py-2 text-[11px] text-slate-400 text-center">+ {parsed.rows.length - 20} baris lainnya</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                disabled={isImporting}
                className="px-5 py-2.5 rounded-xl font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
              >
                {failCount > 0 ? 'Tutup' : 'Batal'}
              </button>
              <button
                onClick={() => runImport(pendingRows.filter((r) => r.valid && !r.duplicate))}
                disabled={isChecking || isImporting || pendingRows.filter((r) => r.valid && !r.duplicate).length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              >
                {isImporting && <Loader2 size={16} className="animate-spin" />}
                Import {pendingRows.filter((r) => r.valid && !r.duplicate).length > 0 ? `${pendingRows.filter((r) => r.valid && !r.duplicate).length} Leads` : ''}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
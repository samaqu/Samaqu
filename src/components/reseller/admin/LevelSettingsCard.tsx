"use client";

import { useMemo, useState } from "react";
import { AdminApiError, opsResellerApi } from "./api";
import RupiahInput from "@/components/reseller/RupiahInput";
import { rupiah } from "@/lib/reseller/format";
import { LEVELS, MAX_LEVEL_LABEL, hitungLevel, validateLevels, type LevelTier } from "@/lib/reseller/level";

const BADGE: Record<string, string> = {
  silver: "bg-slate-200 text-slate-700",
  gold: "bg-amber-100 text-amber-800",
  platinum: "bg-indigo-100 text-indigo-700",
};

/**
 * Pengaturan "Tingkatan reseller": nama dan batas belanja per bulan untuk Silver / Gold / Platinum.
 * Berlaku untuk SEMUA reseller (dihitung ulang otomatis). Level hanya tampilan motivasi — tidak mengubah
 * harga atau diskon. Level manual per reseller diatur di form "Ubah reseller".
 */
export default function LevelSettingsCard({
  levels,
  onChanged,
}: {
  levels: LevelTier[];
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<LevelTier[]>(() => levels.map((tier) => ({ ...tier })));
  const [saved, setSaved] = useState<LevelTier[]>(() => levels.map((tier) => ({ ...tier })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const checked = useMemo(() => validateLevels(rows), [rows]);
  const dirty = JSON.stringify(rows) !== JSON.stringify(saved);
  const isDefault = JSON.stringify(saved) === JSON.stringify(LEVELS);

  const update = (index: number, patch: Partial<LevelTier>) => {
    setOk("");
    setRows((prev) => prev.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)));
  };

  const run = async (payload: LevelTier[] | null, success: string) => {
    setError("");
    setOk("");
    setBusy(true);
    try {
      await opsResellerApi.updateSettings({ levels: payload });
      const next = payload ?? LEVELS.map((tier) => ({ ...tier }));
      setRows(next.map((tier) => ({ ...tier })));
      setSaved(next.map((tier) => ({ ...tier })));
      setOk(success);
      onChanged();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Gagal menyimpan tingkatan reseller.");
    } finally {
      setBusy(false);
    }
  };

  const sampleTiers = checked.ok ? checked.value : saved;
  const sample = [1_000_000, 3_000_000, 9_000_000].map((perBulan) => ({ perBulan, level: hitungLevel(perBulan * 3, 3, sampleTiers) }));

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 max-w-2xl space-y-4">
      <div>
        <h2 className="text-[15px] font-extrabold text-slate-900">Tingkatan reseller</h2>
        <p className="text-[12.5px] text-slate-500 mt-0.5">
          Reseller naik level kalau <b>rata-rata belanja per bulan</b> (3 bulan terakhir) mencapai batas di bawah. Berlaku
          untuk semua reseller dan dihitung ulang otomatis. Level hanya tampilan motivasi — tidak mengubah harga atau diskon.
        </p>
      </div>

      <div className="space-y-2.5">
        {rows.map((tier, index) => (
          <div key={tier.key} className="grid grid-cols-[88px_1fr] sm:grid-cols-[100px_1fr_1fr] gap-2 items-center">
            <span className={`inline-block text-center px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold ${BADGE[tier.key]}`}>
              Level {index + 1}
            </span>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Nama</label>
              <input
                className="w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-lg text-sm font-semibold text-slate-900"
                value={tier.label}
                maxLength={MAX_LEVEL_LABEL}
                onChange={(e) => update(index, { label: e.target.value })}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Mulai dari (per bulan)</label>
              {index === 0 ? (
                <div className="px-3 py-2.5 bg-slate-100 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-500">Rp0 (tetap)</div>
              ) : (
                <RupiahInput value={tier.min} onChange={(value) => update(index, { min: value })} placeholder="0" />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-[12px] text-slate-600">
        <p className="font-bold text-slate-700 mb-0.5">Contoh hasilnya</p>
        {sample.map((row) => (
          <p key={row.perBulan}>
            Rata-rata belanja {rupiah(row.perBulan)}/bulan → <b>{row.level.label}</b>
          </p>
        ))}
      </div>

      {!checked.ok ? <p className="text-sm text-red-600 font-semibold">{checked.error}</p> : null}
      {error ? <p className="text-sm text-red-600 font-semibold">{error}</p> : null}
      {ok ? <p className="text-sm text-emerald-600 font-semibold">{ok}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !dirty || !checked.ok}
          onClick={() => checked.ok && run(checked.value, "Tingkatan reseller tersimpan. Level semua reseller dihitung ulang.")}
          className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Menyimpan…" : "Simpan tingkatan"}
        </button>
        <button
          type="button"
          disabled={busy || isDefault}
          onClick={() => run(null, "Kembali ke batas standar.")}
          className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
        >
          Kembali ke standar
        </button>
      </div>
    </section>
  );
}

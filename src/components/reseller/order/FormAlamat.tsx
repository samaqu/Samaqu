"use client";

import { useEffect, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import WilayahSelect from "@/components/wilayah/WilayahSelect";
import { resellerApi } from "@/lib/reseller/client";
import { Note } from "../ui";
import type { AddressValue } from "./types";

/** Form penerima & alamat + "Tempel alamat, isi otomatis" (deteksi yang sama dengan admin). */

async function fetchWilayah(params: { province?: string; city?: string } = {}): Promise<string[]> {
  const q = new URLSearchParams();
  if (params.province) q.set("province", params.province);
  if (params.city) q.set("city", params.city);
  const res = await fetch(`/api/shipping/wilayah?${q.toString()}`);
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: { name: string }[] };
  return (json.data ?? []).map((row) => row.name);
}

export default function FormAlamat({
  value,
  onChange,
}: {
  value: AddressValue;
  onChange: (patch: Partial<AddressValue>) => void;
}) {
  const [provinceList, setProvinceList] = useState<string[]>([]);
  const [cityList, setCityList] = useState<string[]>([]);
  const [districtList, setDistrictList] = useState<string[]>([]);
  const [paste, setPaste] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchWilayah().then(setProvinceList).catch(() => setProvinceList([]));
  }, []);

  useEffect(() => {
    if (!value.province) {
      setCityList([]);
      return;
    }
    fetchWilayah({ province: value.province }).then(setCityList).catch(() => setCityList([]));
  }, [value.province]);

  useEffect(() => {
    if (!value.city) {
      setDistrictList([]);
      return;
    }
    fetchWilayah({ city: value.city }).then(setDistrictList).catch(() => setDistrictList([]));
  }, [value.city]);

  const detect = async () => {
    setError("");
    setHint("");
    if (!paste.trim()) {
      setError("Tempel dulu teks alamatnya.");
      return;
    }
    setDetecting(true);
    try {
      const r = await resellerApi.alamatTebak(paste);
      const patch: Partial<AddressValue> = {};
      if (!value.name && r.name) patch.name = r.name;
      if (!value.whatsapp && r.whatsapp) patch.whatsapp = r.whatsapp;
      if (r.street) patch.address = r.street;
      if (r.province) patch.province = r.province;
      if (r.city) patch.city = r.city;
      if (r.kecamatan) patch.district = r.kecamatan;
      if (r.postal_code) patch.postalCode = r.postal_code;
      onChange(patch);

      const notes = [
        ...(r.notes || []),
        ...(r.missing?.length ? [`Bagian yang belum terdeteksi: ${r.missing.join(", ")} — isi manual.`] : []),
      ];
      setHint(notes.join(" ") || "Alamat berhasil diisi otomatis. Periksa kembali sebelum simpan.");
    } catch {
      setError("Gagal membaca teks alamat. Coba lagi.");
    } finally {
      setDetecting(false);
    }
  };

  const reset = () => {
    setPaste("");
    setHint("");
    setError("");
    onChange({
      name: "",
      whatsapp: "",
      province: "",
      city: "",
      district: "",
      postalCode: "",
      address: "",
    });
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div>
        <div className="field" style={{ marginBottom: 8 }}>
          <label htmlFor="rs-tempel">Tempel alamat lengkap, isi otomatis</label>
          <textarea
            id="rs-tempel"
            className="in"
            placeholder="Nama, nomor HP, alamat, kecamatan, kota, provinsi, kode pos…"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
        </div>
        <div className="row">
          <button type="button" className="btn sm" disabled={detecting} onClick={detect}>
            {detecting ? <Loader2 size={14} /> : <Wand2 size={14} />}
            Isi otomatis
          </button>
          <button type="button" className="btn ghost sm" onClick={reset}>
            Reset
          </button>
        </div>
        {hint ? (
          <p className="hint" style={{ marginTop: 8 }}>
            {hint}
          </p>
        ) : null}
        {error ? (
          <div style={{ marginTop: 8 }}>
            <Note tone="err">{error}</Note>
          </div>
        ) : null}
      </div>

      <div className="grid2" style={{ gap: 12 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Nama penerima</label>
          <input className="in" value={value.name} onChange={(e) => onChange({ name: e.target.value })} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>WhatsApp penerima</label>
          <input
            className="in"
            inputMode="tel"
            placeholder="08xxxxxxxxxx"
            value={value.whatsapp}
            onChange={(e) => onChange({ whatsapp: e.target.value })}
          />
        </div>
      </div>

      <div className="grid3" style={{ gap: 12 }}>
        <WilayahSelect
          label="Provinsi"
          variant="store"
          value={value.province}
          options={provinceList}
          onChange={(province) => onChange({ province, city: "", district: "" })}
        />
        <WilayahSelect
          label="Kota / Kabupaten"
          variant="store"
          value={value.city}
          options={cityList}
          disabled={!value.province}
          onChange={(city) => onChange({ city, district: "" })}
        />
        <WilayahSelect
          label="Kecamatan"
          variant="store"
          value={value.district}
          options={districtList}
          disabled={!value.city}
          onChange={(district) => onChange({ district })}
        />
      </div>

      <div className="grid2" style={{ gap: 12 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Kode pos</label>
          <input
            className="in"
            inputMode="numeric"
            value={value.postalCode}
            onChange={(e) => onChange({ postalCode: e.target.value.replace(/\D/g, "").slice(0, 5) })}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Catatan (opsional)</label>
          <input className="in" value={value.notes} onChange={(e) => onChange({ notes: e.target.value })} />
        </div>
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Alamat lengkap</label>
        <textarea
          className="in"
          placeholder="Jalan, nomor rumah, RT/RW, kelurahan, patokan…"
          value={value.address}
          onChange={(e) => onChange({ address: e.target.value })}
        />
      </div>
    </div>
  );
}

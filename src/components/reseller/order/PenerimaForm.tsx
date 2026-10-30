"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Wand2 } from "lucide-react";
import WilayahSelect from "@/components/wilayah/WilayahSelect";
import { resellerApi } from "@/lib/reseller/client";
import { Note } from "../ui";
import type { AddressValue } from "./types";

/** Form penerima & alamat: tempel → ringkasan 3 baris; isian manual hanya saat perlu. */

async function fetchWilayah(params: { province?: string; city?: string } = {}): Promise<string[]> {
  const q = new URLSearchParams();
  if (params.province) q.set("province", params.province);
  if (params.city) q.set("city", params.city);
  const res = await fetch(`/api/shipping/wilayah?${q.toString()}`);
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: { name: string }[] };
  return (json.data ?? []).map((row) => row.name);
}

function waValid(value: string): boolean {
  return value.replace(/\D/g, "").length >= 9;
}

function addressMissing(value: AddressValue): boolean {
  return !value.address.trim() || !value.province || !value.city || !value.district;
}

function addressLine(value: AddressValue): string {
  const region = [value.district, value.city, value.province].filter(Boolean).join(", ");
  const postal = value.postalCode ? ` ${value.postalCode}` : "";
  return [value.address, region].filter(Boolean).join(", ") + postal;
}

export default function PenerimaForm({
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
  const [auto, setAuto] = useState(false);
  const [editName, setEditName] = useState(false);
  const [editContact, setEditContact] = useState(false);
  const [editAddress, setEditAddress] = useState(false);

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
      setAuto(true);
      setEditName(false);
      setEditContact(false);
      setEditAddress(false);

      const notes = [
        ...(r.notes || []),
        ...(r.missing?.length ? [`Belum terbaca: ${r.missing.join(", ")} — lengkapi manual.`] : []),
      ];
      setHint(notes.join(" ") || "Alamat terisi otomatis. Periksa ringkasan di bawah.");
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
    setAuto(false);
    setEditName(false);
    setEditContact(false);
    setEditAddress(false);
    onChange({
      name: "",
      whatsapp: "",
      province: "",
      city: "",
      district: "",
      postalCode: "",
      address: "",
      notes: "",
    });
  };

  const showNameInput = !auto || editName || !value.name.trim();
  const showContactInput = !auto || editContact || !waValid(value.whatsapp);
  const showAddressInput = !auto || editAddress || addressMissing(value);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="paste-box">
        <label htmlFor="rs-tempel" className="item-label">
          Tempel alamat penerima
        </label>
        <textarea
          id="rs-tempel"
          className="in"
          rows={3}
          placeholder="Nama, nomor HP, alamat, kecamatan, kota, provinsi, kode pos…"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <div className="row" style={{ marginTop: 8 }}>
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

      {auto ? (
        <div className="addr-summary">
          <div className="addr-row">
            <div>
              <div className="item-label">Nama penerima</div>
              {showNameInput ? (
                <input
                  className="in"
                  autoFocus={editName}
                  placeholder="Nama lengkap"
                  value={value.name}
                  onChange={(e) => onChange({ name: e.target.value })}
                />
              ) : (
                <div className="addr-val">{value.name}</div>
              )}
            </div>
            {!showNameInput ? (
              <button type="button" className="link-btn" onClick={() => setEditName(true)}>
                <Pencil size={12} /> Ubah
              </button>
            ) : null}
          </div>

          <div className="addr-row">
            <div>
              <div className="item-label">WhatsApp</div>
              {showContactInput ? (
                <input
                  className="in"
                  inputMode="tel"
                  autoFocus={editContact}
                  placeholder="08xxxxxxxxxx"
                  value={value.whatsapp}
                  onChange={(e) => onChange({ whatsapp: e.target.value })}
                />
              ) : (
                <div className="addr-val">{value.whatsapp}</div>
              )}
            </div>
            {!showContactInput ? (
              <button type="button" className="link-btn" onClick={() => setEditContact(true)}>
                <Pencil size={12} /> Ubah
              </button>
            ) : null}
          </div>

          <div className="addr-row">
            <div style={{ minWidth: 0 }}>
              <div className="item-label">Alamat</div>
              {showAddressInput ? (
                <div className="stack" style={{ gap: 10, marginTop: 4 }}>
                  <textarea
                    className="in"
                    rows={2}
                    placeholder="Jalan, nomor rumah, RT/RW, kelurahan, patokan…"
                    value={value.address}
                    onChange={(e) => onChange({ address: e.target.value })}
                  />
                  <div className="grid3" style={{ gap: 10 }}>
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
                  <div className="grid2" style={{ gap: 10 }}>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Kode pos</label>
                      <input
                        className="in"
                        inputMode="numeric"
                        value={value.postalCode}
                        onChange={(e) =>
                          onChange({ postalCode: e.target.value.replace(/\D/g, "").slice(0, 5) })
                        }
                      />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Catatan (opsional)</label>
                      <input
                        className="in"
                        value={value.notes}
                        onChange={(e) => onChange({ notes: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="addr-val">{addressLine(value)}</div>
              )}
            </div>
            {!showAddressInput ? (
              <button type="button" className="link-btn" onClick={() => setEditAddress(true)}>
                <Pencil size={12} /> Ubah
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
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
      )}
    </div>
  );
}

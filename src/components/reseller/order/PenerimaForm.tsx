"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Loader2, Pencil, Wand2 } from "lucide-react";
import WilayahSelect from "@/components/wilayah/WilayahSelect";
import { resellerApi } from "@/lib/reseller/client";
import { Note } from "../ui";
import type { AddressValue } from "./types";

/**
 * Form penerima & alamat. Dua cara yang jelas dipisah dengan tab:
 *  - "Tempel alamat" (cepat): tempel teks dari chat customer -> terisi otomatis -> cek ringkasan;
 *  - "Isi manual": kolom berurutan dari nama sampai kode pos.
 * Logika baca-alamat & validasi sama seperti sebelumnya; hanya tampilannya yang dirapikan.
 */

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
  // Sudah ada isian (mis. kembali ke langkah ini) -> langsung tampilkan tab manual.
  const [mode, setMode] = useState<"tempel" | "manual">(
    value.name || value.address || value.city ? "manual" : "tempel"
  );

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

  const wilayahFields = (
    <div className="fgrid c3">
      <WilayahSelect
        label="Provinsi"
        variant="reseller"
        value={value.province}
        options={provinceList}
        onChange={(province) => onChange({ province, city: "", district: "" })}
      />
      <WilayahSelect
        label="Kota / Kabupaten"
        variant="reseller"
        value={value.city}
        options={cityList}
        disabled={!value.province}
        onChange={(city) => onChange({ city, district: "" })}
      />
      <WilayahSelect
        label="Kecamatan"
        variant="reseller"
        value={value.district}
        options={districtList}
        disabled={!value.city}
        onChange={(district) => onChange({ district })}
      />
    </div>
  );

  const postalNotes = (
    <div className="fgrid c2">
      <div className="field">
        <label htmlFor="rs-kodepos">Kode pos</label>
        <input
          id="rs-kodepos"
          className="in"
          inputMode="numeric"
          placeholder="5 angka"
          value={value.postalCode}
          onChange={(e) => onChange({ postalCode: e.target.value.replace(/\D/g, "").slice(0, 5) })}
        />
      </div>
      <div className="field">
        <label htmlFor="rs-catatan">Catatan (opsional)</label>
        <input
          id="rs-catatan"
          className="in"
          placeholder="Mis. titip ke satpam"
          value={value.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </div>
    </div>
  );

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="seg" role="tablist" aria-label="Cara mengisi data penerima">
        <button type="button" role="tab" aria-selected={mode === "tempel"} className={mode === "tempel" ? "on" : ""} onClick={() => setMode("tempel")}>
          Tempel alamat <small>Cepat</small>
        </button>
        <button type="button" role="tab" aria-selected={mode === "manual"} className={mode === "manual" ? "on" : ""} onClick={() => setMode("manual")}>
          Isi manual
        </button>
      </div>

      {mode === "tempel" ? (
        <div className="stack" style={{ gap: 14 }}>
          <div className="paste-box">
            <label htmlFor="rs-tempel" className="paste-title">
              Tempel alamat dari chat customer
            </label>
            <textarea
              id="rs-tempel"
              className="in"
              rows={4}
              placeholder={"Contoh:\nBudi Santoso\n0812xxxxxxxx\nJl. Mawar No. 3, Kec. Coblong, Bandung, Jawa Barat 40132"}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
            <div className="paste-actions">
              <button type="button" className="btn" disabled={detecting} onClick={detect}>
                {detecting ? <Loader2 size={16} /> : <Wand2 size={16} />}
                Isi otomatis
              </button>
              <button type="button" className="btn ghost" onClick={reset}>
                Reset
              </button>
            </div>
            {hint ? <p className="paste-tip">{hint}</p> : null}
            {error ? <Note tone="err">{error}</Note> : null}
          </div>

          {auto ? (
            <div className="addr-summary">
              <div className="addr-head">
                <CheckCircle size={15} aria-hidden="true" />
                Terisi otomatis — cek datanya
              </div>
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
                    <div className="stack" style={{ gap: 12, marginTop: 4 }}>
                      <textarea
                        className="in"
                        rows={2}
                        placeholder="Jalan, nomor rumah, RT/RW, kelurahan, patokan…"
                        value={value.address}
                        onChange={(e) => onChange({ address: e.target.value })}
                      />
                      {wilayahFields}
                      {postalNotes}
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
          ) : null}
        </div>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          <div className="fgrid c2">
            <div className="field">
              <label htmlFor="rs-nama">
                Nama penerima <span className="req">*</span>
              </label>
              <input
                id="rs-nama"
                className="in"
                placeholder="Nama lengkap"
                value={value.name}
                onChange={(e) => onChange({ name: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="rs-wa">
                WhatsApp penerima <span className="req">*</span>
              </label>
              <input
                id="rs-wa"
                className="in"
                inputMode="tel"
                placeholder="08xxxxxxxxxx"
                value={value.whatsapp}
                onChange={(e) => onChange({ whatsapp: e.target.value })}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="rs-alamat">
              Alamat lengkap <span className="req">*</span>
            </label>
            <textarea
              id="rs-alamat"
              className="in"
              rows={3}
              placeholder="Jalan, nomor rumah, RT/RW, kelurahan, patokan…"
              value={value.address}
              onChange={(e) => onChange({ address: e.target.value })}
            />
          </div>

          {wilayahFields}
          {postalNotes}
        </div>
      )}
    </div>
  );
}

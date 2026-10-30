"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { ApiError, clearResellerToken, resellerApi } from "@/lib/reseller/client";
import BankSelect from "./BankSelect";
import { useReseller } from "./ResellerShell";
import { Note } from "./ui";

/** Profil reseller: data toko (baca saja) + rekening bank (bisa diubah) + keluar. */
export default function ProfilPanel() {
  const { me, refreshMe } = useReseller();
  const router = useRouter();
  const [bankName, setBankName] = useState(me.reseller.bank_name || "");
  const [bankNumber, setBankNumber] = useState(me.reseller.bank_number || "");
  const [bankHolder, setBankHolder] = useState(me.reseller.bank_holder || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setBankName(me.reseller.bank_name || "");
    setBankNumber(me.reseller.bank_number || "");
    setBankHolder(me.reseller.bank_holder || "");
  }, [me]);

  const saveBank = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      await resellerApi.updateBank({ bank_name: bankName, bank_number: bankNumber, bank_holder: bankHolder });
      await refreshMe();
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan rekening.");
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    try {
      await resellerApi.logout();
    } catch {
      /* abaikan */
    }
    clearResellerToken();
    router.replace("/reseller/login");
  };

  return (
    <div className="grid2" style={{ alignItems: "start" }}>
      <div className="card">
        <div className="card-h">
          <h2>Data toko</h2>
        </div>
        <div className="card-b">
          <div className="kv-list">
            <div className="it">
              <span className="muted">Nama toko</span>
              <b>{me.reseller.store_name}</b>
            </div>
            <div className="it">
              <span className="muted">Nama pemilik</span>
              <b>{me.reseller.owner_name}</b>
            </div>
            <div className="it">
              <span className="muted">WhatsApp</span>
              <b>{me.reseller.whatsapp || "—"}</b>
            </div>
            <div className="it">
              <span className="muted">Kota</span>
              <b>{me.reseller.city || "—"}</b>
            </div>
            <div className="it">
              <span className="muted">Info toko</span>
              <span style={{ textAlign: "right", maxWidth: 320 }}>{me.reseller.store_info || "—"}</span>
            </div>
            <div className="it">
              <span className="muted">Sosial media</span>
              <span style={{ textAlign: "right", maxWidth: 320 }}>{me.reseller.social_media || "—"}</span>
            </div>
          </div>
          <p className="hint" style={{ marginTop: 12 }}>
            Data toko diubah lewat admin SAMAQU. Hubungi admin kalau ada yang perlu diperbarui.
          </p>
        </div>
      </div>

      <div className="stack">
        <div className="card">
          <div className="card-h">
            <h2>Rekening bank</h2>
          </div>
          <div className="card-b">
            <form onSubmit={saveBank}>
              <div className="field">
                <BankSelect value={bankName} onChange={setBankName} />
              </div>
              <div className="field">
                <label>Nomor rekening</label>
                <input
                  className="in"
                  inputMode="numeric"
                  value={bankNumber}
                  onChange={(e) => setBankNumber(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Nama pemilik rekening</label>
                <input className="in" value={bankHolder} onChange={(e) => setBankHolder(e.target.value)} />
              </div>
              {error ? (
                <div style={{ marginBottom: 12 }}>
                  <Note tone="err">{error}</Note>
                </div>
              ) : null}
              {saved ? (
                <div style={{ marginBottom: 12 }}>
                  <Note tone="ok">Rekening tersimpan.</Note>
                </div>
              ) : null}
              <button className="btn blk" type="submit" disabled={saving}>
                {saving ? <Loader2 size={16} /> : null}
                Simpan rekening
              </button>
            </form>
            <p className="hint" style={{ marginTop: 10 }}>
              Penarikan ke rekening BSI bebas biaya admin; bank lain dikenakan biaya sesuai pengaturan.
            </p>
          </div>
        </div>

        <button className="btn danger blk" type="button" onClick={logout}>
          <LogOut size={16} />
          Keluar dari portal
        </button>
      </div>
    </div>
  );
}

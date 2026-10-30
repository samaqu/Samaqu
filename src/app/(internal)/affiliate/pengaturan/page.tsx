"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/affiliate/icons";
import { Badge, Empty, Field, Select, Tabs, useToast } from "@/components/affiliate/ui";
import { useAffiliate } from "@/components/affiliate/AffiliateShell";
import { affiliateFetch } from "@/lib/affiliate/client";
import { supabaseAffiliate as supabase } from "@/lib/supabase-affiliate";
import { tgl } from "@/lib/affiliate/format";

/**
 * Pengaturan Akun — profil, rekening pencairan, keamanan, dan preferensi notifikasi.
 * Struktur mengikuti mockup (tabs + form per tab).
 */

interface AccountRow {
  id: string;
  method: string;
  bank: string;
  number: string;
  holder: string;
  isPrimary: boolean;
  createdAt: string;
}

const PREFS_KEY = "sq_af_prefs";

export default function AffiliateSettingsPage() {
  const { me, refresh } = useAffiliate();
  const { toast } = useToast();
  const [tab, setTab] = useState("profil");
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [accountForm, setAccountForm] = useState<{ id: string; method: string; bank: string; number: string; holder: string } | null>(null);
  const [accountErr, setAccountErr] = useState<Record<string, string>>({});

  const [pw, setPw] = useState({ cur: "", next: "", cf: "" });
  const [pwErr, setPwErr] = useState<Record<string, string>>({});
  const [showPw, setShowPw] = useState(false);

  const [prefs, setPrefs] = useState({ pesanan: true, komisi: true, penarikan: true, promo: false });

  const loadAccounts = async () => {
    try {
      const json = await affiliateFetch<{ accounts: AccountRow[] }>("/api/affiliate/accounts");
      setAccounts(json.accounts || []);
    } catch (e) {
      console.error("[AFFILIATE] Gagal memuat rekening:", e);
    }
  };

  useEffect(() => {
    if (!me) return;
    setFullName(me.affiliate.full_name || "");
    setDisplayName(me.affiliate.display_name || "");
    setPhone(me.affiliate.phone || "");
    loadAccounts();
    try {
      setPrefs(JSON.parse(localStorage.getItem(PREFS_KEY) || JSON.stringify({ pesanan: true, komisi: true, penarikan: true, promo: false })));
    } catch {
      /* abaikan */
    }
  }, [me]);

  if (!me) return null;

  const saveProfile = async () => {
    const next: Record<string, string> = {};
    if (fullName.trim().length < 3) next.fullName = "Nama lengkap minimal 3 karakter.";
    if (displayName.trim() && displayName.trim().length < 3) next.displayName = "Nama tampilan minimal 3 karakter.";
    if (phone && !/^0\d{8,13}$/.test(phone.replace(/\D/g, ""))) next.phone = "Nomor telepon harus diawali 0 dan berisi 9–14 digit.";
    setErr(next);
    if (Object.keys(next).length) {
      toast("Gagal menyimpan, periksa kembali isian profil", "err");
      return;
    }

    setSaving(true);
    try {
      await affiliateFetch("/api/affiliate/me", {
        method: "PATCH",
        body: JSON.stringify({ fullName: fullName.trim(), displayName: displayName.trim(), phone: phone.trim() }),
      });
      await refresh();
      toast("Profil berhasil disimpan");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal menyimpan profil", "err");
    } finally {
      setSaving(false);
    }
  };

  const saveAccount = async () => {
    if (!accountForm) return;
    const next: Record<string, string> = {};
    if (!accountForm.bank) next.bank = "Pilih bank atau e-wallet.";
    if (!accountForm.id && accountForm.number.replace(/\D/g, "").length < 8) {
      next.number = "Nomor rekening minimal 8 digit angka.";
    }
    if (accountForm.holder.trim().length < 3) next.holder = "Nama pemilik wajib diisi.";
    setAccountErr(next);
    if (Object.keys(next).length) return;

    try {
      if (accountForm.id) {
        await affiliateFetch("/api/affiliate/accounts", {
          method: "PATCH",
          body: JSON.stringify({
            id: accountForm.id,
            bank: accountForm.bank,
            holder: accountForm.holder.trim(),
            number: accountForm.number,
          }),
        });
      } else {
        await affiliateFetch("/api/affiliate/accounts", {
          method: "POST",
          body: JSON.stringify({
            method: accountForm.method,
            bank: accountForm.bank,
            number: accountForm.number,
            holder: accountForm.holder.trim(),
          }),
        });
      }
      setAccountForm(null);
      await loadAccounts();
      toast(accountForm.id ? "Rekening berhasil diperbarui" : "Rekening berhasil ditambahkan");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal menyimpan rekening", "err");
    }
  };

  const setPrimary = async (id: string) => {
    try {
      await affiliateFetch("/api/affiliate/accounts", { method: "PATCH", body: JSON.stringify({ id, isPrimary: true }) });
      await loadAccounts();
      toast("Rekening utama diperbarui");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal memperbarui rekening", "err");
    }
  };

  const removeAccount = async (id: string) => {
    if (!window.confirm("Rekening ini akan dihapus dari daftar.")) return;
    try {
      await affiliateFetch(`/api/affiliate/accounts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await loadAccounts();
      toast("Rekening berhasil dihapus");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal menghapus rekening", "err");
    }
  };

  const savePassword = async () => {
    const next: Record<string, string> = {};
    if (!pw.cur) next.cur = "Kata sandi saat ini wajib diisi.";
    if (pw.next.length < 8 || !/\d/.test(pw.next) || !/[a-zA-Z]/.test(pw.next)) {
      next.next = "Minimal 8 karakter, kombinasi huruf dan angka.";
    }
    if (pw.cf !== pw.next) next.cf = "Konfirmasi tidak sama dengan kata sandi baru.";
    setPwErr(next);
    if (Object.keys(next).length) {
      toast("Gagal mengubah kata sandi", "err");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: pw.next });
    if (error) {
      toast(error.message || "Gagal mengubah kata sandi", "err");
      return;
    }
    setPw({ cur: "", next: "", cf: "" });
    toast("Kata sandi berhasil diubah");
  };

  const togglePref = (key: keyof typeof prefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* abaikan */
    }
  };

  const affiliate = me.affiliate;

  return (
    <div className="card">
      <div style={{ padding: "0 16px" }}>
        <Tabs
          items={[
            ["profil", "Profil"],
            ["pembayaran", "Informasi Pembayaran"],
            ["keamanan", "Keamanan"],
            ["notifikasi", "Preferensi Notifikasi"],
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      <div className="cp" style={{ padding: 24 }}>
        {tab === "profil" ? (
          <div>
            <div className="row" style={{ gap: 16, marginBottom: 20 }}>
              <div className="av" style={{ width: 72, height: 72, fontSize: 24 }}>
                {(displayName || fullName || "A")
                  .split(" ")
                  .map((x) => x[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </div>
              <div>
                <div className="b dark">{affiliate.full_name}</div>
                <div className="small muted">
                  {affiliate.affiliate_code} ·{" "}
                  <Badge
                    label={
                      affiliate.status === "aktif"
                        ? "Affiliate Aktif"
                        : affiliate.status === "menunggu"
                          ? "Menunggu Persetujuan"
                          : affiliate.status === "ditolak"
                            ? "Ditolak"
                            : "Nonaktif"
                    }
                  />
                </div>
                <div className="small muted" style={{ marginTop: 4 }}>
                  Bergabung {tgl(affiliate.created_at)}
                </div>
              </div>
            </div>

            <div className="grid g2" style={{ gap: "0 16px" }}>
              <Field label="Nama Lengkap" error={err.fullName}>
                <input
                  className={`inp ${err.fullName ? "e" : ""}`}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </Field>
              <Field label="Nama Tampilan" error={err.displayName} help="Ditampilkan di sidebar dan sapaan.">
                <input
                  className={`inp ${err.displayName ? "e" : ""}`}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </Field>
              <Field label="Email">
                <input className="inp" value={affiliate.email} disabled />
              </Field>
              <Field label="Nomor Telepon" error={err.phone}>
                <input
                  className={`inp ${err.phone ? "e" : ""}`}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
              <Field label="ID Affiliate">
                <input className="inp" value={affiliate.affiliate_code} disabled />
              </Field>
            </div>

            <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
              <button className="btn p" onClick={saveProfile} disabled={saving} type="button">
                {saving ? "Menyimpan…" : "Simpan Perubahan"}
              </button>
            </div>
          </div>
        ) : null}

        {tab === "pembayaran" ? (
          <div>
            <div className="row between" style={{ marginBottom: 14 }}>
              <p className="muted small">
                Rekening tersimpan dalam bentuk tersamar. Rekening utama dipakai otomatis saat
                penarikan.
              </p>
              <button
                className="btn p sm"
                onClick={() =>
                  setAccountForm({ id: "", method: "Transfer Bank", bank: "", number: "", holder: affiliate.full_name })
                }
                type="button"
              >
                <Icon name="plus" className="sm" />
                Tambah Rekening
              </button>
            </div>

            {accounts.length === 0 ? (
              <Empty icon="card" title="Belum ada rekening" text="Tambahkan rekening untuk penarikan dana." />
            ) : (
              accounts.map((a) => (
                <div className="box row between wrap" style={{ marginBottom: 10, background: "#fff" }} key={a.id}>
                  <div className="row">
                    <div className="aic">
                      <Icon name={a.method === "E-wallet" ? "cash" : "card"} />
                    </div>
                    <div>
                      <div className="b dark">
                        {a.bank} · {a.number}{" "}
                        {a.isPrimary ? <span className="badge b-pri">Utama</span> : null}
                      </div>
                      <div className="small muted">
                        {a.method} · a.n. {a.holder}
                      </div>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    {a.isPrimary ? null : (
                      <button className="btn s sm" onClick={() => setPrimary(a.id)} type="button">
                        Jadikan Utama
                      </button>
                    )}
                    <button
                      className="btn s sm"
                      onClick={() =>
                        setAccountForm({ id: a.id, method: a.method, bank: a.bank, number: "", holder: a.holder })
                      }
                      type="button"
                    >
                      <Icon name="edit" className="sm" />
                    </button>
                    <button
                      className="btn s sm"
                      style={{ color: "var(--af-err)" }}
                      onClick={() => removeAccount(a.id)}
                      type="button"
                    >
                      <Icon name="trash" className="sm" />
                    </button>
                  </div>
                </div>
              ))
            )}

            {accountForm ? (
              <div className="box mt">
                <div className="b dark" style={{ marginBottom: 12 }}>
                  {accountForm.id ? "Edit Rekening" : "Tambah Rekening"}
                </div>

                <Field label="Jenis">
                  <div className="grid g2" style={{ gap: 8 }}>
                    {["Transfer Bank", "E-wallet"].map((m) => (
                      <button
                        key={m}
                        className={`chip ${accountForm.method === m ? "on" : ""}`}
                        style={{ borderRadius: 10, padding: 10 }}
                        onClick={() => setAccountForm({ ...accountForm, method: m, bank: "" })}
                        type="button"
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label={accountForm.method === "E-wallet" ? "E-wallet" : "Bank"} error={accountErr.bank}>
                  <Select
                    value={accountForm.bank}
                    onChange={(v) => setAccountForm({ ...accountForm, bank: v })}
                    options={[
                      ["", "— Pilih —"],
                      ...(accountForm.method === "E-wallet"
                        ? ["DANA", "OVO", "GoPay", "ShopeePay", "LinkAja"]
                        : ["BCA", "BRI", "Mandiri", "BNI", "BSI", "CIMB Niaga", "Permata", "Danamon"]
                      ).map((b) => [b, b] as [string, string]),
                    ]}
                  />
                </Field>

                <Field
                  label={accountForm.method === "E-wallet" ? "Nomor E-wallet" : "Nomor Rekening"}
                  error={accountErr.number}
                  help={accountForm.id ? "Kosongkan jika tidak diubah" : "Nomor akan disimpan dalam bentuk tersamar."}
                >
                  <input
                    className={`inp ${accountErr.number ? "e" : ""}`}
                    inputMode="numeric"
                    value={accountForm.number}
                    onChange={(e) => setAccountForm({ ...accountForm, number: e.target.value })}
                    placeholder={accountForm.id ? "Kosongkan jika tidak diubah" : "Masukkan nomor"}
                  />
                </Field>

                <Field label="Nama Pemilik" error={accountErr.holder}>
                  <input
                    className={`inp ${accountErr.holder ? "e" : ""}`}
                    value={accountForm.holder}
                    onChange={(e) => setAccountForm({ ...accountForm, holder: e.target.value })}
                  />
                </Field>

                <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
                  <button className="btn s" onClick={() => setAccountForm(null)} type="button">
                    Batal
                  </button>
                  <button className="btn p" onClick={saveAccount} type="button">
                    Simpan Rekening
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "keamanan" ? (
          <div style={{ maxWidth: 440 }}>
            {(
              [
                ["cur", "Kata Sandi Saat Ini"],
                ["next", "Kata Sandi Baru"],
                ["cf", "Konfirmasi Kata Sandi Baru"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label} error={pwErr[key]} help={key === "next" ? "Minimal 8 karakter, kombinasi huruf dan angka." : undefined}>
                <div className="pwd">
                  <input
                    className={`inp ${pwErr[key] ? "e" : ""}`}
                    type={showPw ? "text" : "password"}
                    value={pw[key]}
                    onChange={(e) => setPw({ ...pw, [key]: e.target.value })}
                  />
                  <button type="button" onClick={() => setShowPw((v) => !v)} aria-label="Tampilkan">
                    <Icon name={showPw ? "eyeoff" : "eye"} className="sm" />
                  </button>
                </div>
              </Field>
            ))}
            <button className="btn p" onClick={savePassword} type="button">
              Ubah Kata Sandi
            </button>
          </div>
        ) : null}

        {tab === "notifikasi" ? (
          <div style={{ maxWidth: 560 }}>
            {(
              [
                ["pesanan", "Notifikasi pesanan", "Pesanan baru, dikirim, selesai, atau dibatalkan."],
                ["komisi", "Notifikasi komisi", "Komisi disetujui atau tidak disetujui."],
                ["penarikan", "Notifikasi penarikan", "Status pengajuan penarikan dana."],
                ["promo", "Informasi promosi", "Produk baru, kenaikan komisi, dan kampanye."],
              ] as const
            ).map(([key, label, desc]) => (
              <div
                className="row between"
                style={{ padding: "14px 0", borderBottom: "1px solid var(--af-bd)" }}
                key={key}
              >
                <div>
                  <div className="b dark">{label}</div>
                  <div className="small muted">{desc}</div>
                </div>
                <button
                  className={`sw ${prefs[key] ? "on" : ""}`}
                  onClick={() => togglePref(key)}
                  aria-label={label}
                  type="button"
                />
              </div>
            ))}
            <p className="small muted mt">Preferensi tersimpan otomatis di perangkat ini.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

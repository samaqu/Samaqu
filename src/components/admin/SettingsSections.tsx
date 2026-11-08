"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/AdminToast";
import PaymentMethodsManager from "@/components/admin/PaymentMethodsManager";
import MayarSettingsForm from "@/components/admin/MayarSettingsForm";
import { SettingsCard, Field } from "@/components/admin/SettingsCard";
import { FonnteSections } from "@/components/admin/FonnteSettingsCards";

/**
 * Seluruh isi panel "Pengaturan" dashboard admin (dulu ditulis inline di
 * `src/app/admin/page.tsx`). Semua kartu memakai pola yang sama dari
 * `SettingsCard`: default read-only + tombol Edit, baru setelah Edit muncul
 * input dan tombol Simpan/Batal.
 */
export default function SettingsPanel() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl italic" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>Pengaturan Toko</h2>
      <StoreInfoSection />
      <section className="card p-6 max-w-2xl">
        <h3 className="text-lg font-medium" style={{ color: "var(--espresso)" }}>Asal Pengiriman</h3>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Ditetapkan di sistem: <strong style={{ color: "var(--espresso)" }}>DEPOK</strong> — dipakai J&T untuk
          Tariff Check dan pembuatan resi. Jadi tidak perlu dipilih lagi di sini.
        </p>
      </section>
      <ShippingProviderSection />
      <CourierSettingsSection />
      <SocialMediaSection />
      <MetaPixelSection />
      <FonnteSections />
      <PaymentMethodsManager />
      <MayarSettingsForm />
    </div>
  );
}

const AVAILABLE_COURIERS = [
  { code: "jne", name: "JNE" },
  { code: "sicepat", name: "SiCepat" },
  { code: "jnt", name: "J&T Express" },
  { code: "ninja", name: "Ninja" },
  { code: "tiki", name: "TIKI" },
  { code: "wahana", name: "Wahana" },
  { code: "pos", name: "POS Indonesia" },
  { code: "lion", name: "Lion Parcel" },
  { code: "anteraja", name: "AnterAja" },
];

const PROVIDER_OPTIONS = [
  { value: "jnt" as const, label: "J&T API Langsung", desc: "Tarif & resi langsung dari API J&T" },
];

// Model teks MiMo (dari GET /v1/models). TTS/ASR tidak ditampilkan karena bukan untuk chat.
const CHAT_MODEL_OPTIONS = [
  { value: "mimo-v2.6-flash", label: "mimo-v2.6-flash — murah & cepat (rekomendasi)" },
  { value: "mimo-v2.6-pro", label: "mimo-v2.6-pro — paling pintar (lebih lambat)" },
  { value: "mimo-v2.6-pro-ultraspeed", label: "mimo-v2.6-pro-ultraspeed — tercepat (paling mahal)" },
  { value: "mimo-v2.5", label: "mimo-v2.5 — generasi lama (pensiun 21 Okt 2026)" },
  { value: "mimo-v2.5-pro", label: "mimo-v2.5-pro — generasi lama (pensiun 21 Okt 2026)" },
];

function StoreInfoSection() {
  const [form, setForm] = useState({ store_name: "", tagline: "", email: "", whatsapp: "", cyp_microcopy: "" });
  const [original, setOriginal] = useState({ store_name: "", tagline: "", email: "", whatsapp: "", cyp_microcopy: "" });
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    supabase.from("store_settings").select("*").eq("id", 1).single().then(({ data }) => {
      if (data) {
        const s = { store_name: data.store_name || "", tagline: data.tagline || "", email: data.email || "", whatsapp: data.whatsapp || "", cyp_microcopy: data.cyp_microcopy || "" };
        setForm(s); setOriginal(s);
      }
      setLoading(false);
    });
  }, []);

  const dirty = form.store_name !== original.store_name || form.tagline !== original.tagline || form.email !== original.email || form.whatsapp !== original.whatsapp || form.cyp_microcopy !== original.cyp_microcopy;

  async function handleSave() {
    setSaving(true);
    await supabase.from("store_settings").upsert({ id: 1, ...form, updated_at: new Date().toISOString() });
    setOriginal({ ...form });
    setSaving(false);
    setEditing(false);
    toast.showToast("success", "Perubahan berhasil disimpan");
  }

  function handleCancel() {
    setForm({ ...original });
    setEditing(false);
  }

  if (loading) return <div className="card p-6 max-w-2xl"><Loader2 size={20} className="animate-spin" style={{ color: "var(--gold)" }} /></div>;

  return (
    <SettingsCard
      title="Informasi Toko"
      editing={editing}
      onEdit={() => setEditing(true)}
      onCancel={handleCancel}
      onSave={handleSave}
      saving={saving}
      canSave={dirty}
    >
      <Field label="Nama Toko" value={form.store_name} editing={editing} onChange={(v) => setForm({ ...form, store_name: v })} />
      <Field label="Tagline" value={form.tagline} editing={editing} onChange={(v) => setForm({ ...form, tagline: v })} />
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Email" value={form.email} editing={editing} onChange={(v) => setForm({ ...form, email: v })} />
        <Field label="WhatsApp" value={form.whatsapp} editing={editing} onChange={(v) => setForm({ ...form, whatsapp: v })} />
      </div>
      <Field
        label="Teks Microcopy Create Your Price"
        value={form.cyp_microcopy}
        editing={editing}
        onChange={(v) => setForm({ ...form, cyp_microcopy: v })}
        multiline
        hint="Teks kecil yang muncul di bawah pilihan harga pada halaman produk CYP. Kosongkan untuk gunakan default."
        placeholder="Harga Minimum boleh dipilih. Itulah alasan kami membuat Create Your Price."
      />
    </SettingsCard>
  );
}

function ShippingOriginSection() {
  const [form, setForm] = useState({ origin_district_id: "", origin_province_id: "", origin_city_id: "" });
  const [original, setOriginal] = useState({ origin_district_id: "", origin_province_id: "", origin_city_id: "" });
  const [provinces, setProvinces] = useState<{ id: number; name: string }[]>([]);
  const [cities, setCities] = useState<{ id: number; name: string }[]>([]);
  const [districts, setDistricts] = useState<{ id: number; name: string }[]>([]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dropdownsLoading, setDropdownsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedDistrictId, setSavedDistrictId] = useState<string | null>(null);
  const toast = useToast();

  async function loadLists(provId: string, cityId: string) {
    if (!provId) { setCities([]); setDistricts([]); return; }
    const [cityRes, distRes] = await Promise.all([
      fetch(`/api/shipping/districts?provinceId=${provId}`),
      cityId ? fetch(`/api/shipping/districts?cityId=${cityId}`) : Promise.resolve(null),
    ]);
    const cityJson = await cityRes.json();
    setCities(cityJson.data || []);
    if (distRes) {
      const distJson = await distRes.json();
      setDistricts(distJson.data || []);
    } else {
      setDistricts([]);
    }
  }

  useEffect(() => {
    async function init() {
      const { data } = await supabase.from("store_settings").select("origin_district_id, origin_province_id, origin_city_id, origin_district_step_id").eq("id", 1).single();

      if (data?.origin_province_id && data?.origin_city_id) {
        const saved = {
          origin_province_id: String(data.origin_province_id),
          origin_city_id: String(data.origin_city_id),
          origin_district_id: "", // diisi setelah daftar kecamatan selesai dimuat
        };
        setForm(saved);
        setOriginal(saved);
        const stepId = data.origin_district_step_id || data.origin_district_id;
        if (stepId) setSavedDistrictId(String(stepId));
      }

      setLoading(false);

      try {
        const provRes = await fetch("/api/shipping/provinces");
        const provJson = await provRes.json();
        setProvinces(provJson.data || []);
        if (data?.origin_province_id && data?.origin_city_id) {
          await loadLists(String(data.origin_province_id), String(data.origin_city_id));
        }
      } catch (e) {
        console.error("[ADMIN] Load error:", e);
      } finally {
        setDropdownsLoading(false);
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nilai kecamatan baru dipasang SETELAH daftarnya ada, supaya <select> tidak
  // menampilkan pilihan kosong.
  useEffect(() => {
    if (savedDistrictId && districts.length > 0) {
      setForm((f) => ({ ...f, origin_district_id: savedDistrictId }));
      setOriginal((o) => ({ ...o, origin_district_id: savedDistrictId }));
      setSavedDistrictId(null);
    }
  }, [districts, savedDistrictId]);

  async function handleProvChange(provId: string) {
    setForm({ origin_province_id: provId, origin_city_id: "", origin_district_id: "" });
    setCities([]);
    setDistricts([]);
    if (!provId) return;
    const res = await fetch(`/api/shipping/districts?provinceId=${provId}`);
    const json = await res.json();
    setCities(json.data || []);
  }

  async function handleCityChange(cityId: string) {
    setForm((f) => ({ ...f, origin_city_id: cityId, origin_district_id: "" }));
    setDistricts([]);
    if (!cityId) return;
    const res = await fetch(`/api/shipping/districts?cityId=${cityId}`);
    const json = await res.json();
    setDistricts(json.data || []);
  }

  async function handleSave() {
    setSaving(true);
    const selectedProv = provinces.find((p) => String(p.id) === form.origin_province_id);
    const selectedCity = cities.find((c) => String(c.id) === form.origin_city_id);
    const selectedDist = districts.find((d) => String(d.id) === form.origin_district_id);

    // RajaOngkir V2 punya 2 sistem ID berbeda — perhitungan ongkir butuh ID dari
    // direct search, sedangkan dropdown memakai ID step-by-step.
    let directSearchId = form.origin_district_id ? Number(form.origin_district_id) : null;

    if (selectedDist?.name && selectedCity?.name && selectedProv?.name) {
      try {
        const searchQuery = encodeURIComponent(selectedDist.name);
        const searchRes = await fetch(`/api/shipping/search-destination?search=${searchQuery}&city=${encodeURIComponent(selectedCity.name)}&province=${encodeURIComponent(selectedProv.name)}&limit=5`);
        const searchJson = await searchRes.json();
        if (searchJson.match?.id) {
          directSearchId = searchJson.match.id;
        } else {
          console.warn("[ADMIN] Tidak ada direct search match, memakai ID step-by-step:", directSearchId);
        }
      } catch (e) {
        console.error("[ADMIN] Direct search gagal, memakai ID step-by-step:", e);
      }
    }

    await supabase.from("store_settings").upsert({
      id: 1,
      origin_province_id: form.origin_province_id ? Number(form.origin_province_id) : null,
      origin_city_id: form.origin_city_id ? Number(form.origin_city_id) : null,
      origin_district_id: directSearchId, // direct search ID (untuk hitung ongkir)
      origin_district_step_id: form.origin_district_id ? Number(form.origin_district_id) : null, // step-by-step ID (untuk dropdown)
      updated_at: new Date().toISOString(),
    });
    setOriginal({ ...form });
    setSaving(false);
    setEditing(false);
    toast.showToast("success", "Alamat pengiriman toko disimpan");
  }

  function handleCancel() {
    const provChanged = form.origin_province_id !== original.origin_province_id;
    const cityChanged = form.origin_city_id !== original.origin_city_id;
    setForm({ ...original });
    setEditing(false);
    // Kalau provinsi/kota sempat diubah, daftar pilihannya ikut dikembalikan agar
    // nilai aslinya punya option yang cocok.
    if (provChanged || cityChanged) loadLists(original.origin_province_id, original.origin_city_id);
  }

  if (loading) return <div className="card p-6 max-w-2xl"><Loader2 size={20} className="animate-spin" style={{ color: "var(--gold)" }} /></div>;

  const findName = (list: { id: number; name: string }[], id: string) => list.find((i) => String(i.id) === id)?.name;
  // "Memuat…" hanya selagi daftar wilayahnya masih diambil; sesudah itu nilai yang
  // tidak ketemu ditampilkan "Belum diatur" supaya tidak nyangkut di "Memuat…".
  const placeholder = (value: string) => (value && dropdownsLoading ? "Memuat…" : "Belum diatur");
  const selectStyle = { border: "1px solid #e4e4e7" };

  return (
    <SettingsCard
      title="Alamat Pengiriman Toko (Origin)"
      description="Lokasi toko Anda, digunakan sebagai asal pengiriman saat hitung ongkir."
      editing={editing}
      onEdit={() => setEditing(true)}
      onCancel={handleCancel}
      onSave={handleSave}
      saving={saving}
      canSave={!!form.origin_district_id}
      saveLabel="Simpan"
    >
      {editing ? (
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Provinsi</label>
            {dropdownsLoading && form.origin_province_id ? (
              <div className="mt-1 w-full rounded-xl px-3 py-2.5 bg-white text-sm" style={selectStyle}>
                {findName(provinces, form.origin_province_id) || "Memuat..."}
              </div>
            ) : (
              <select value={form.origin_province_id} onChange={(e) => handleProvChange(e.target.value)} className="mt-1 w-full rounded-xl px-3 py-2.5 bg-white text-sm outline-none" style={selectStyle}>
                <option value="">Pilih</option>
                {provinces.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Kota / Kabupaten</label>
            {dropdownsLoading && form.origin_city_id ? (
              <div className="mt-1 w-full rounded-xl px-3 py-2.5 bg-white text-sm" style={{ ...selectStyle, opacity: !form.origin_province_id ? 0.5 : 1 }}>
                {findName(cities, form.origin_city_id) || "Memuat..."}
              </div>
            ) : (
              <select value={form.origin_city_id} onChange={(e) => handleCityChange(e.target.value)} disabled={!form.origin_province_id} className="mt-1 w-full rounded-xl px-3 py-2.5 bg-white text-sm outline-none" style={{ ...selectStyle, opacity: !form.origin_province_id ? 0.5 : 1 }}>
                <option value="">Pilih</option>
                {cities.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Kecamatan</label>
            {dropdownsLoading && form.origin_district_id ? (
              <div className="mt-1 w-full rounded-xl px-3 py-2.5 bg-white text-sm" style={{ ...selectStyle, opacity: !form.origin_city_id ? 0.5 : 1 }}>
                {findName(districts, form.origin_district_id) || "Memuat..."}
              </div>
            ) : (
              <select value={form.origin_district_id} onChange={(e) => setForm((f) => ({ ...f, origin_district_id: e.target.value }))} disabled={!form.origin_city_id} className="mt-1 w-full rounded-xl px-3 py-2.5 bg-white text-sm outline-none" style={{ ...selectStyle, opacity: !form.origin_city_id ? 0.5 : 1 }}>
                <option value="">Pilih</option>
                {districts.map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
              </select>
            )}
          </div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Provinsi</label>
            <p className="mt-1 text-sm font-medium" style={{ color: form.origin_province_id ? "var(--fg)" : "var(--fg3)" }}>
              {findName(provinces, form.origin_province_id) || placeholder(form.origin_province_id)}
            </p>
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Kota / Kabupaten</label>
            <p className="mt-1 text-sm font-medium" style={{ color: form.origin_city_id ? "var(--fg)" : "var(--fg3)" }}>
              {findName(cities, form.origin_city_id) || placeholder(form.origin_city_id)}
            </p>
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Kecamatan</label>
            <p className="mt-1 text-sm font-medium" style={{ color: form.origin_district_id ? "var(--fg)" : "var(--fg3)" }}>
              {findName(districts, form.origin_district_id) || placeholder(form.origin_district_id)}
            </p>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}

function ShippingProviderSection() {
  const [provider, setProvider] = useState<"rajaongkir" | "jnt">("jnt");
  const [original, setOriginal] = useState<"rajaongkir" | "jnt">("jnt");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    supabase.from("store_settings").select("shipping_provider").eq("id", 1).single().then(({ data }) => {
      if (data?.shipping_provider) {
        setProvider(data.shipping_provider);
        setOriginal(data.shipping_provider);
      }
      setLoading(false);
    });
  }, []);

  const dirty = provider !== original;

  async function handleSave() {
    setSaving(true);
    await supabase.from("store_settings").upsert({ id: 1, shipping_provider: provider, updated_at: new Date().toISOString() });
    setOriginal(provider);
    setSaving(false);
    setEditing(false);
    toast.showToast("success", "Provider pengiriman disimpan");
  }

  function handleCancel() {
    setProvider(original);
    setEditing(false);
  }

  if (loading) return <div className="card p-6 max-w-2xl"><Loader2 size={20} className="animate-spin" style={{ color: "var(--gold)" }} /></div>;

  const active = PROVIDER_OPTIONS.find((o) => o.value === provider) || PROVIDER_OPTIONS[0];

  return (
    <SettingsCard
      title="Provider Pengiriman"
      description="Provider ongkir yang dipakai di checkout. Sekarang hanya J&T API langsung (tanpa perantara)."
      editing={editing}
      onEdit={() => setEditing(true)}
      onCancel={handleCancel}
      onSave={handleSave}
      saving={saving}
      canSave={dirty}
    >
      {editing ? (
        <div className="flex flex-col sm:flex-row gap-3">
          {PROVIDER_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex-1 flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer transition-all" style={{ border: `1.5px solid ${provider === opt.value ? "var(--gold)" : "#d4d4d8"}`, background: provider === opt.value ? "#fafafa" : "white" }}>
              <input type="radio" name="shipping_provider" checked={provider === opt.value} onChange={() => setProvider(opt.value)} className="sr-only" />
              <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ border: `2px solid ${provider === opt.value ? "var(--gold)" : "var(--text-muted)"}`, background: provider === opt.value ? "var(--gold)" : "transparent" }}>
                {provider === opt.value && <span className="w-2 h-2 rounded-full bg-white" />}
              </span>
              <div>
                <span className="text-sm font-medium" style={{ color: "var(--espresso)" }}>{opt.label}</span>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
      ) : (
        <div>
          <label className="block text-sm font-semibold" style={{ color: "var(--espresso)" }}>Provider Aktif</label>
          <p className="mt-1 text-sm font-medium" style={{ color: "var(--fg)" }}>{active.label}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{active.desc}</p>
        </div>
      )}
    </SettingsCard>
  );
}

function CourierSettingsSection() {
  const [enabled, setEnabled] = useState<string[]>([]);
  const [original, setOriginal] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    supabase.from("store_settings").select("enabled_couriers").eq("id", 1).single().then(({ data }) => {
      if (data?.enabled_couriers) {
        try {
          const list = typeof data.enabled_couriers === "string" ? JSON.parse(data.enabled_couriers) : data.enabled_couriers;
          setEnabled(list);
          setOriginal(list);
        } catch (e) {
          console.error("[ADMIN] Gagal membaca daftar ekspedisi, memakai default:", e);
          const defaults = ["jne", "sicepat", "jnt", "ninja", "tiki", "wahana", "pos", "lion", "anteraja"];
          setEnabled(defaults);
          setOriginal(defaults);
        }
      }
      setLoading(false);
    });
  }, []);

  function toggle(code: string) {
    setEnabled((prev) => prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]);
  }

  const dirty = JSON.stringify(enabled) !== JSON.stringify(original);

  async function handleSave() {
    setSaving(true);
    await supabase.from("store_settings").upsert({ id: 1, enabled_couriers: JSON.stringify(enabled), updated_at: new Date().toISOString() });
    setOriginal([...enabled]);
    setSaving(false);
    setEditing(false);
    toast.showToast("success", "Pilihan ekspedisi disimpan");
  }

  function handleCancel() {
    setEnabled([...original]);
    setEditing(false);
  }

  if (loading) return <div className="card p-6 max-w-2xl"><Loader2 size={20} className="animate-spin" style={{ color: "var(--gold)" }} /></div>;

  const activeCouriers = AVAILABLE_COURIERS.filter((c) => enabled.includes(c.code));

  return (
    <SettingsCard
      title="Ekspedisi Aktif"
      description="Pilih ekspedisi yang ingin ditampilkan di halaman checkout."
      editing={editing}
      onEdit={() => setEditing(true)}
      onCancel={handleCancel}
      onSave={handleSave}
      saving={saving}
      canSave={dirty}
    >
      {editing ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {AVAILABLE_COURIERS.map((c) => (
            <label key={c.code} className="flex items-center gap-2.5 rounded-xl px-4 py-3 cursor-pointer transition-all" style={{ border: `1.5px solid ${enabled.includes(c.code) ? "var(--gold)" : "#d4d4d8"}`, background: enabled.includes(c.code) ? "#fafafa" : "white" }}>
              <input type="checkbox" checked={enabled.includes(c.code)} onChange={() => toggle(c.code)} className="sr-only" />
              <span className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ border: `2px solid ${enabled.includes(c.code) ? "var(--gold)" : "var(--text-muted)"}`, background: enabled.includes(c.code) ? "var(--gold)" : "transparent" }}>
                {enabled.includes(c.code) && <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}><path d="M5 12l5 5L20 7" /></svg>}
              </span>
              <span className="text-sm font-medium" style={{ color: "var(--espresso)" }}>{c.name}</span>
            </label>
          ))}
        </div>
      ) : (
        <div>
          <label className="block text-sm font-semibold" style={{ color: "var(--espresso)" }}>Ekspedisi Ditampilkan</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {activeCouriers.length > 0 ? activeCouriers.map((c) => (
              <span key={c.code} className="badge" style={{ background: "var(--sub)", color: "var(--fg2)" }}>{c.name}</span>
            )) : (
              <span className="text-sm" style={{ color: "var(--fg3)" }}>Belum ada ekspedisi dipilih</span>
            )}
          </div>
        </div>
      )}
    </SettingsCard>
  );
}

function SocialMediaSection() {
  const [instagramUrl, setInstagramUrl] = useState("");
  const [original, setOriginal] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    supabase.from("store_settings").select("instagram_url").eq("id", 1).single().then(({ data }) => {
      const url = data?.instagram_url || "";
      setInstagramUrl(url);
      setOriginal(url);
      setLoading(false);
    });
  }, []);

  const dirty = instagramUrl !== original;

  async function handleSave() {
    setSaving(true);
    await supabase.from("store_settings").upsert({ id: 1, instagram_url: instagramUrl || null, updated_at: new Date().toISOString() });
    setOriginal(instagramUrl);
    setSaving(false);
    setEditing(false);
    toast.showToast("success", "Link Instagram disimpan");
  }

  function handleCancel() {
    setInstagramUrl(original);
    setEditing(false);
  }

  if (loading) return <div className="card p-6 max-w-2xl"><Loader2 size={20} className="animate-spin" style={{ color: "var(--gold)" }} /></div>;

  return (
    <SettingsCard
      title="Sosial Media"
      description={'Link yang muncul di footer website (kolom "Terhubung").'}
      editing={editing}
      onEdit={() => setEditing(true)}
      onCancel={handleCancel}
      onSave={handleSave}
      saving={saving}
      canSave={dirty}
    >
      <Field
        label="Link Instagram"
        value={instagramUrl}
        editing={editing}
        onChange={setInstagramUrl}
        placeholder="https://instagram.com/samaqu.id"
        hint="Kosongkan untuk menyembunyikan icon Instagram di footer."
      />
    </SettingsCard>
  );
}

function MetaPixelSection() {
  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [testEventCode, setTestEventCode] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [original, setOriginal] = useState({ pixelId: "", testEventCode: "", enabled: false });
  const [originalToken, setOriginalToken] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [tableReady, setTableReady] = useState(true);
  const toast = useToast();

  // Lewat API admin — access token CAPI disimpan di `meta_settings` (service-role only).
  // Route hanya mengembalikan token ke sesi admin yang terverifikasi.
  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    return { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` };
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/meta-settings", { headers: await authHeaders() });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Gagal memuat pengaturan Meta Pixel");
        setPixelId(json.pixelId || "");
        setEnabled(json.enabled === true);
        setTestEventCode(json.testEventCode || "");
        setAccessToken(json.accessToken || "");
        setOriginalToken(json.accessToken || "");
        setHasToken(json.hasToken === true);
        setTableReady(json.tableReady !== false);
        setOriginal({
          pixelId: json.pixelId || "",
          testEventCode: json.testEventCode || "",
          enabled: json.enabled === true,
        });
      } catch {
        toast.showToast("error", "Gagal memuat pengaturan Meta Pixel");
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (enabled && !pixelId.trim()) {
      toast.showToast("error", "Pixel ID wajib diisi jika tracking diaktifkan");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/meta-settings", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          pixelId: pixelId.trim(),
          enabled,
          testEventCode: testEventCode.trim(),
          accessToken: accessToken.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menyimpan pengaturan Meta Pixel");

      const savedToken = accessToken.trim() || originalToken;
      setAccessToken(savedToken);
      setOriginalToken(savedToken);
      setHasToken(!!savedToken);
      setShowToken(false);
      setTableReady(true);
      setOriginal({ pixelId: pixelId.trim(), testEventCode: testEventCode.trim(), enabled });
      setEditing(false);
      toast.showToast("success", "Pengaturan Meta Pixel disimpan");
    } catch (e) {
      toast.showToast("error", e instanceof Error ? e.message : "Gagal menyimpan pengaturan Meta Pixel");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setPixelId(original.pixelId);
    setTestEventCode(original.testEventCode);
    setEnabled(original.enabled);
    setAccessToken(originalToken);
    setShowToken(false);
    setEditing(false);
  }

  if (loading) return <div className="card p-6 max-w-2xl"><Loader2 size={20} className="animate-spin" style={{ color: "var(--gold)" }} /></div>;

  const dirty = pixelId !== original.pixelId || testEventCode !== original.testEventCode || enabled !== original.enabled || accessToken !== originalToken;

  return (
    <SettingsCard
      title="Meta Pixel"
      description="Konfigurasi Meta Pixel untuk tracking iklan Facebook/Instagram."
      headerRight={
        <span className="text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0" style={{ background: enabled ? "#f4f4f5" : "#f1f1f3", color: enabled ? "#3f3f46" : "var(--text-muted)" }}>
          {enabled ? "Aktif" : "Nonaktif"}
        </span>
      }
      editing={editing}
      onEdit={() => setEditing(true)}
      onCancel={handleCancel}
      onSave={handleSave}
      saving={saving}
      canSave={dirty}
    >
      {editing && (
        <div className="flex items-center gap-3">
          <button onClick={() => setEnabled(!enabled)} className="relative w-11 h-6 rounded-full transition-colors duration-200" style={{ background: enabled ? "var(--gold)" : "#d4d4d8" }}>
            <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200" style={{ transform: enabled ? "translateX(20px)" : "translateX(0)" }} />
          </button>
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{enabled ? "Tracking aktif di seluruh website" : "Tracking nonaktif"}</span>
        </div>
      )}

      <Field
        label="Pixel ID"
        value={pixelId}
        editing={editing}
        onChange={setPixelId}
        mono
        hint="Temukan di Meta Events Manager → Settings → Pixel ID."
      />

      {editing ? (
        <div>
          <label className="block text-sm font-semibold" style={{ color: "var(--espresso)" }}>Access Token (CAPI)</label>
          <div className="relative mt-1.5">
            <input
              type={showToken ? "text" : "password"}
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              className="w-full rounded-xl px-4 py-2.5 pr-10 bg-white text-sm outline-none font-mono"
              style={{ border: "1px solid #e4e4e7" }}
              placeholder={hasToken ? "Masukkan token baru untuk mengganti" : "Masukkan System User Access Token"}
            />
            <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--text-muted)" }}>
              {showToken ? "🙈" : "👁️"}
            </button>
          </div>
          <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
            {hasToken ? "Token tersimpan. Nilai hanya ditampilkan di sesi admin." : "Belum ada token tersimpan."} Kosongkan field untuk mempertahankan token lama. Digunakan untuk Conversions API (CAPI). Buat di Meta Business Suite → System Users.
          </p>
          {!tableReady && (
            <p className="text-[11px] mt-1" style={{ color: "#b45309" }}>
              Jalankan migration <span className="font-mono">supabase/migrations/20261023_meta_settings.sql</span> di Supabase SQL Editor agar token bisa disimpan.
            </p>
          )}
        </div>
      ) : (
        <Field label="Access Token (CAPI)" value={hasToken ? "••••••••" : ""} editing={false} mono />
      )}

      <Field
        label="Test Event Code"
        value={testEventCode}
        editing={editing}
        onChange={setTestEventCode}
        mono
        hint="Untuk testing di Meta Events Manager → Test Events. Kosongkan di production."
      />
    </SettingsCard>
  );
}

// Kartu Live Chat AI dulu tampil di dalam panel Pengaturan, sekarang pindah ke menu
// "Live Chat" (tab Pengaturan) supaya panel Pengaturan lebih rapi. Diekspor agar
// LiveChatView bisa memakainya.
export function ChatSection() {
  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [greeting, setGreeting] = useState("");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [keyPreview, setKeyPreview] = useState("");
  const [envKey, setEnvKey] = useState(false);
  const [envBaseUrl, setEnvBaseUrl] = useState("");
  const [envModel, setEnvModel] = useState("");
  const [tableReady, setTableReady] = useState(true);
  const [original, setOriginal] = useState({ enabled: false, baseUrl: "", model: "", greeting: "", extraInstructions: "" });
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testReply, setTestReply] = useState("");
  const toast = useToast();

  // Lewat API admin (bukan langsung Supabase) karena API key disimpan di tabel `chat_settings`
  // yang tanpa policy RLS — hanya service role yang boleh membacanya.
  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    return { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` };
  }

  async function load() {
    const res = await fetch("/api/admin/chat-settings", { headers: await authHeaders() });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Gagal memuat pengaturan chat");
    setTableReady(json.tableReady !== false);
    setEnabled(json.enabled === true);
    setBaseUrl(json.baseUrl || "");
    setModel(json.model || "");
    setGreeting(json.greeting || "");
    setExtraInstructions(json.extraInstructions || "");
    setKeyPreview(json.keyPreview || "");
    setEnvKey(!!json.envKey);
    setEnvBaseUrl(json.envBaseUrl || "");
    setEnvModel(json.envModel || "");
    setOriginal({
      enabled: json.enabled === true,
      baseUrl: json.baseUrl || "",
      model: json.model || "",
      greeting: json.greeting || "",
      extraInstructions: json.extraInstructions || "",
    });
  }

  useEffect(() => {
    load()
      .catch((e) => console.error("[ADMIN] Gagal memuat pengaturan chat:", e))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty =
    enabled !== original.enabled ||
    baseUrl !== original.baseUrl ||
    model !== original.model ||
    greeting !== original.greeting ||
    extraInstructions !== original.extraInstructions ||
    !!apiKey.trim();

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/chat-settings", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ enabled, apiKey, baseUrl, model, greeting, extraInstructions }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        toast.showToast("error", json.error || "Gagal menyimpan pengaturan");
        return;
      }
      toast.showToast("success", "Pengaturan live chat disimpan");
      setApiKey("");
      setShowKey(false);
      setEditing(false);
      await load();
    } catch (e) {
      console.error("[ADMIN] Gagal menyimpan pengaturan chat:", e);
      toast.showToast("error", "Gagal menyimpan pengaturan");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEnabled(original.enabled);
    setBaseUrl(original.baseUrl);
    setModel(original.model);
    setGreeting(original.greeting);
    setExtraInstructions(original.extraInstructions);
    setApiKey("");
    setShowKey(false);
    setEditing(false);
  }

  async function handleTest() {
    setTesting(true);
    setTestReply("");
    try {
      const res = await fetch("/api/admin/chat-settings", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ action: "test" }),
      });
      const json = await res.json();
      if (json.ok && json.reply) {
        setTestReply(json.reply);
        toast.showToast("success", "Asisten merespons dengan baik");
      } else {
        toast.showToast("error", json.error || "Gagal menghubungi asisten");
      }
    } catch (e) {
      console.error("[ADMIN] Gagal tes chat:", e);
      toast.showToast("error", "Gagal menghubungi asisten");
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <div className="card p-6 max-w-2xl"><Loader2 size={20} className="animate-spin" style={{ color: "var(--gold)" }} /></div>;

  const keyLabel = keyPreview || (envKey ? "(dari environment variable)" : "");

  return (
    <SettingsCard
      title="Live Chat AI"
      description="Asisten AI di website yang menjawab pertanyaan pelanggan seputar SAMAQU (produk, ukuran, cara pesan, dll)."
      headerRight={
        <span className="text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0" style={{ background: enabled ? "#f4f4f5" : "#f1f1f3", color: enabled ? "#3f3f46" : "var(--text-muted)" }}>
          {enabled ? "Aktif" : "Nonaktif"}
        </span>
      }
      editing={editing}
      onEdit={() => setEditing(true)}
      onCancel={handleCancel}
      onSave={handleSave}
      saving={saving}
      canSave={tableReady && dirty}
      saveLabel="Simpan"
    >
      {!tableReady && (
        <p className="text-[11px] rounded-xl px-3 py-2" style={{ background: "#fff7ed", color: "#9a3412" }}>
          Tabel <code>chat_settings</code> belum dibuat. Jalankan <code>supabase/chat-settings.sql</code> di Supabase SQL Editor dulu.
        </p>
      )}

      {editing && (
        <div className="flex items-center gap-3">
          <button onClick={() => setEnabled(!enabled)} className="relative w-11 h-6 rounded-full transition-colors duration-200" style={{ background: enabled ? "var(--gold)" : "#d4d4d8" }}>
            <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200" style={{ transform: enabled ? "translateX(20px)" : "translateX(0)" }} />
          </button>
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{enabled ? "Chat tampil di website" : "Chat disembunyikan"}</span>
        </div>
      )}

      {editing ? (
        <div>
          <label className="block text-sm font-semibold" style={{ color: "var(--espresso)" }}>API Key AI</label>
          <div className="relative mt-1.5">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full rounded-xl px-4 py-2.5 pr-10 bg-white text-sm outline-none font-mono"
              style={{ border: "1px solid #e4e4e7" }}
              placeholder={keyLabel ? "Masukkan API key baru untuk mengganti" : "Masukkan API key Xiaomi MiMo"}
            />
            <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--text-muted)" }}>
              {showKey ? "🙈" : "👁️"}
            </button>
          </div>
          <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
            {keyLabel ? `Key tersimpan saat ini: ${keyLabel}` : "Belum ada key tersimpan."} Ambil di platform.xiaomimimo.com → API Keys.
          </p>
        </div>
      ) : (
        <Field label="API Key AI" value={keyLabel} editing={false} mono />
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {editing ? (
          <div>
            <label className="block text-sm font-semibold" style={{ color: "var(--espresso)" }}>Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="mt-1.5 w-full rounded-xl px-3 py-2.5 bg-white text-sm outline-none font-mono"
              style={{ border: "1px solid #e4e4e7" }}
            >
              {CHAT_MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
              {model && !CHAT_MODEL_OPTIONS.some((o) => o.value === model) && (
                <option value={model}>{model} (nilai tersimpan)</option>
              )}
            </select>
            {envModel && <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>Default env: {envModel}</p>}
          </div>
        ) : (
          <Field label="Model" value={model} editing={false} mono />
        )}
        <Field
          label="Base URL"
          value={baseUrl}
          editing={editing}
          onChange={setBaseUrl}
          mono
          hint={envBaseUrl ? `Kosong = pakai ${envBaseUrl} (env).` : "Default: https://api.mimo.mi.com/v1"}
        />
      </div>

      <Field
        label="Sapaan Pembuka"
        value={greeting}
        editing={editing}
        onChange={setGreeting}
        multiline
        placeholder="Halo! Aku Samaqu Assistant, ada yang bisa dibantu soal produk & ukuran? 😊"
        hint="Kosongkan untuk pakai sapaan default."
      />

      {editing ? (
        <div>
          <label className="block text-sm font-semibold" style={{ color: "var(--espresso)" }}>Knowledge / Instruksi Tambahan</label>
          <textarea
            value={extraInstructions}
            onChange={(e) => setExtraInstructions(e.target.value)}
            rows={6}
            placeholder="Contoh: promo bulan ini, kebijakan khusus, info kain terbaru, dll."
            className="mt-1.5 w-full rounded-xl px-4 py-2.5 bg-white text-sm outline-none resize-y"
            style={{ border: "1px solid #e4e4e7" }}
          />
          <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
            Ditambahkan ke pengetahuan AI. Data produk & FAQ diambil otomatis dari katalog.
          </p>
        </div>
      ) : (
        extraInstructions && (
          <div>
            <label className="block text-sm font-semibold" style={{ color: "var(--espresso)" }}>Knowledge / Instruksi Tambahan</label>
            <p className="mt-1 text-sm whitespace-pre-wrap break-words" style={{ color: "var(--fg)" }}>{extraInstructions}</p>
          </div>
        )
      )}

      <div className="pt-1 space-y-2">
        <button
          onClick={handleTest}
          disabled={testing || !tableReady}
          className="text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-40"
          style={{ border: "1px solid #d4d4d8", color: "var(--espresso)" }}
        >
          {testing ? <Loader2 size={14} className="animate-spin inline mr-1.5" /> : null}
          Tes Asisten
        </button>
        {testReply && (
          <p className="text-xs rounded-xl px-3 py-2 whitespace-pre-wrap" style={{ background: "#f4f4f5", color: "var(--fg2)" }}>
            {testReply}
          </p>
        )}
      </div>
    </SettingsCard>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Plus, Trash2, Upload, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { requestRevalidate } from "@/lib/admin-revalidate";
import { useToast } from "@/components/AdminToast";
import AdminShell from "@/components/AdminShell";
import { uploadToCloudinary } from "@/lib/cloudinary";

const HERO_DEFAULTS = {
  eyebrow_text: "Premium Muslim Menswear", title_line1: "Busana yang Layak", title_line2: "Menemani Setiap Momen.",
  title_line1_color: "#f8f5f1", title_line2_color: "#e0b563",
  description: "Dirancang dengan material pilihan, potongan yang presisi, dan detail yang dibuat untuk kenyamanan dalam setiap aktivitas.",
  feature1: "6 Koleksi Eksklusif", feature2: "Berbagai Jenis Kain", feature3: "Panduan Size Lengkap", is_active: true,
  video_url: "",
};

interface HeroContent { eyebrow_text: string; title_line1: string; title_line2: string; title_line1_color: string; title_line2_color: string; description: string; feature1: string; feature2: string; feature3: string; is_active: boolean; video_url: string; }
interface CategoryImage { id: string; name: string; description: string; image_url: string; display_order: number; }
interface OrderStep { id: string; step_number: number; title: string; description: string; }
interface GaransiItem { id: string; title: string; description: string; display_order: number; }
interface TrustBadge { id: string; label: string; display_order: number; }
interface FaqItem { id: string; question: string; answer: string; category: string; type: string; display_order: number; }
interface MarqueeItem { id: string; label: string; display_order: number; }

export default function KontenWebsitePage() {
  const [hero, setHero] = useState<HeroContent>(HERO_DEFAULTS);
  const [categories, setCategories] = useState<CategoryImage[]>([]);
  const [steps, setSteps] = useState<OrderStep[]>([]);
  const [garansi, setGaransi] = useState<GaransiItem[]>([]);
  const [badges, setBadges] = useState<TrustBadge[]>([]);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [homeFaqs, setHomeFaqs] = useState<FaqItem[]>([]);
  const [marquee, setMarquee] = useState<MarqueeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  // Edit states
  const [editHero, setEditHero] = useState<HeroContent>(HERO_DEFAULTS);
  const [editSteps, setEditSteps] = useState<OrderStep[]>([]);
  const editStepsRef = useRef<OrderStep[]>([]);
  const [editGaransi, setEditGaransi] = useState<GaransiItem[]>([]);
  const editGaransiRef = useRef<GaransiItem[]>([]);
  const [editBadges, setEditBadges] = useState<TrustBadge[]>([]);
  const editBadgesRef = useRef<TrustBadge[]>([]);
  const [editFaqs, setEditFaqs] = useState<FaqItem[]>([]);
  const editFaqsRef = useRef<FaqItem[]>([]);
  const [editMarquee, setEditMarquee] = useState<MarqueeItem[]>([]);
  const editMarqueeRef = useRef<MarqueeItem[]>([]);
  const [editCategories, setEditCategories] = useState<CategoryImage[]>([]);
  const editCategoriesRef = useRef<CategoryImage[]>([]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  // Keep refs in sync with state
  editCategoriesRef.current = editCategories;
  editStepsRef.current = editSteps;
  editGaransiRef.current = editGaransi;
  editBadgesRef.current = editBadges;
  editFaqsRef.current = editFaqs;
  editMarqueeRef.current = editMarquee;

  // Trigger revalidation of homepage after content changes
  async function revalidateHomepage() {
    await requestRevalidate();
  }

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [heroRes, catRes, stepsRes, garansiRes, badgesRes, faqsRes, homeFaqsRes, marqueeRes] = await Promise.all([
      supabase.from("hero_content").select("*").eq("id", 1).single(),
      supabase.from("category_images").select("*").order("display_order"),
      supabase.from("order_steps").select("*").order("step_number"),
      supabase.from("garansi_items").select("*").order("display_order"),
      supabase.from("trust_badges").select("*").order("display_order"),
      supabase.from("faq_items").select("*").eq("type", "full").order("display_order"),
      supabase.from("faq_items").select("*").eq("type", "home").order("display_order"),
      supabase.from("marquee_items").select("*").order("display_order"),
    ]);
    if (heroRes.data) setHero(heroRes.data);
    if (catRes.data) setCategories(catRes.data);
    if (stepsRes.data) setSteps(stepsRes.data);
    if (garansiRes.data) setGaransi(garansiRes.data);
    if (badgesRes.data) setBadges(badgesRes.data);
    if (faqsRes.data) setFaqs(faqsRes.data);
    if (homeFaqsRes.data) setHomeFaqs(homeFaqsRes.data);
    if (marqueeRes.data) setMarquee(marqueeRes.data);
    setLoading(false);
  }

  // Hero handlers
  function openHeroEdit() { setEditHero({ ...hero }); setEditModal("hero"); }
  async function saveHero() {
    setSaving(true);
    await supabase.from("hero_content").upsert({ id: 1, ...editHero }, { onConflict: "id" });
    setHero(editHero); setEditModal(null); setSaving(false);
    toast.showToast("success", "Hero berhasil disimpan");
  }

  // Category handlers
  function openCategoryEdit() { const cats = categories.map((c) => ({ ...c })); setEditCategories(cats); editCategoriesRef.current = cats; setEditModal("kategori"); }
  async function saveCategories() {
    setSaving(true);
    const latestCats = editCategoriesRef.current; // Always read latest
    await safeDeleteAll("category_images");
    if (latestCats.length > 0) {
      await supabase.from("category_images").insert(latestCats.map((c, i) => ({ name: c.name, description: c.description, image_url: c.image_url, display_order: i })));
    }
    // Refetch from DB to ensure state matches
    const { data: refetched } = await supabase.from("category_images").select("*").order("display_order");
    setCategories(refetched || []);
    setEditModal(null); setSaving(false);
    toast.showToast("success", "Kategori berhasil disimpan");
    revalidateHomepage();
  }
  async function uploadCategoryImage(idx: number, file: File) {
    setUploadingId(editCategories[idx].id);
    try {
      const url = await uploadToCloudinary(file);
      if (url) {
        const u = [...editCategories]; u[idx] = { ...u[idx], image_url: url }; editCategoriesRef.current = u; setEditCategories(u);
        toast.showToast("success", "Gambar berhasil diupload");
      }
    } catch { toast.showToast("error", "Gagal upload gambar"); }
    setUploadingId(null);
  }

  // Helper: safely delete all rows from a table (fetch IDs first, then delete by ID)
  async function safeDeleteAll(table: string) {
    const { data: rows } = await supabase.from(table).select("id");
    if (rows && rows.length > 0) {
      for (const row of rows) await supabase.from(table).delete().eq("id", row.id);
    }
  }

  // Steps handlers
  function openStepsEdit() { setEditSteps(steps.map((s) => ({ ...s }))); setEditModal("steps"); }
  async function saveSteps() {
    setSaving(true);
    const latest = editStepsRef.current;
    await safeDeleteAll("order_steps");
    if (latest.length > 0) await supabase.from("order_steps").insert(latest.map((s, i) => ({ step_number: i + 1, title: s.title, description: s.description })));
    const { data: refetched } = await supabase.from("order_steps").select("*").order("step_number");
    setSteps(refetched || []); setEditModal(null); setSaving(false);
    toast.showToast("success", "Cara Pemesanan berhasil disimpan");
    revalidateHomepage();
  }

  // Garansi handlers
  function openGaransiEdit() { setEditGaransi(garansi.map((g) => ({ ...g }))); setEditBadges(badges.map((b) => ({ ...b }))); setEditModal("garansi"); }
  async function saveGaransi() {
    setSaving(true);
    const latestG = editGaransiRef.current;
    const latestB = editBadgesRef.current;
    await safeDeleteAll("garansi_items");
    if (latestG.length > 0) await supabase.from("garansi_items").insert(latestG.map((g, i) => ({ title: g.title, description: g.description, display_order: i })));
    await safeDeleteAll("trust_badges");
    if (latestB.length > 0) await supabase.from("trust_badges").insert(latestB.map((b, i) => ({ label: b.label, display_order: i })));
    const [gRefetch, bRefetch] = await Promise.all([
      supabase.from("garansi_items").select("*").order("display_order"),
      supabase.from("trust_badges").select("*").order("display_order"),
    ]);
    setGaransi(gRefetch.data || []); setBadges(bRefetch.data || []);
    setEditModal(null); setSaving(false);
    toast.showToast("success", "Jaminan berhasil disimpan");
    revalidateHomepage();
  }

  // FAQ handlers (type: full)
  const [editFaqsType, setEditFaqsType] = useState<"full" | "home">("full");
  function openFaqEdit() { setEditFaqsType("full"); setEditFaqs(faqs.map((f) => ({ ...f }))); setEditModal("faq"); }
  function openHomeFaqEdit() { setEditFaqsType("home"); setEditFaqs(homeFaqs.map((f) => ({ ...f }))); setEditModal("faq"); }
  async function saveFaqs() {
    setSaving(true);
    const latest = editFaqsRef.current;
    const type = editFaqsType;
    // Delete only items of this type
    const { data: existing } = await supabase.from("faq_items").select("id").eq("type", type);
    if (existing && existing.length > 0) {
      await supabase.from("faq_items").delete().in("id", existing.map((e) => e.id));
    }
    if (latest.length > 0) await supabase.from("faq_items").insert(latest.map((f, i) => ({ question: f.question, answer: f.answer, category: f.category || "Lainnya", type, display_order: i, is_active: true })));
    // Refetch both types
    const [refetched, refetchedHome] = await Promise.all([
      supabase.from("faq_items").select("*").eq("type", "full").order("display_order"),
      supabase.from("faq_items").select("*").eq("type", "home").order("display_order"),
    ]);
    setFaqs(refetched.data || []); setHomeFaqs(refetchedHome.data || []); setEditModal(null); setSaving(false);
    toast.showToast("success", `FAQ ${type === "home" ? "Homepage" : "Lengkap"} berhasil disimpan`);
    revalidateHomepage();
  }

  // Marquee handlers
  function openMarqueeEdit() { setEditMarquee(marquee.map((m) => ({ ...m }))); setEditModal("marquee"); }
  async function saveMarquee() {
    setSaving(true);
    const latest = editMarqueeRef.current;
    await safeDeleteAll("marquee_items");
    if (latest.length > 0) await supabase.from("marquee_items").insert(latest.map((m, i) => ({ label: m.label, display_order: i })));
    const { data: refetched } = await supabase.from("marquee_items").select("*").order("display_order");
    setMarquee(refetched || []); setEditModal(null); setSaving(false);
    toast.showToast("success", "Marquee berhasil disimpan");
    revalidateHomepage();
  }

  function CharCounter({ current, max }: { current: number; max: number }) {
    return <p className="text-[10px] mt-0.5" style={{ color: current > max * 0.9 ? "#52525b" : "var(--text-muted)" }}>{current}/{max}</p>;
  }

  if (loading) return <section className="min-h-screen flex items-center justify-center" style={{ background: "var(--cream)" }}><Loader2 size={24} className="animate-spin" style={{ color: "var(--gold)" }} /></section>;

  const sections = [
    { key: "hero", title: "Hero / Banner Utama", desc: hero.title_line1 + " " + hero.title_line2, active: hero.is_active, edit: openHeroEdit },
    { key: "kategori", title: "Kategori Koleksi", desc: `${categories.length} kategori`, active: categories.length > 0, edit: openCategoryEdit },
    { key: "steps", title: "Cara Pemesanan", desc: `${steps.length} langkah`, active: steps.length > 0, edit: openStepsEdit },
    { key: "garansi", title: "Jaminan SAMAQU", desc: `${garansi.length} jaminan + ${badges.length} badges`, active: true, edit: openGaransiEdit },
    { key: "faq-home", title: "FAQ Homepage", desc: `${homeFaqs.length} pertanyaan (tampil di section homepage)`, active: true, edit: openHomeFaqEdit },
    { key: "faq-full", title: "FAQ Lengkap (Halaman /faq)", desc: `${faqs.length} pertanyaan (tampil di halaman terpisah)`, active: true, edit: openFaqEdit },
    { key: "marquee", title: "Trust Marquee", desc: `${marquee.length} item scrolling`, active: true, edit: openMarqueeEdit },
  ];

  return (
    <AdminShell>
    <section className="min-h-screen" style={{ background: "var(--cream)" }}>
      <div className="max-w-4xl mx-auto px-5 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-2xl italic" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}>Konten Website</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Kelola konten yang tampil di halaman publik SAMAQU</p>
        </div>

        <div className="space-y-4">
          {sections.map((s) => (
            <div key={s.key} className="card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold" style={{ color: "var(--espresso)" }}>{s.title}</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: s.active ? "#f4f4f5" : "#f4f4f5", color: s.active ? "#3f3f46" : "var(--text-muted)" }}>{s.active ? "Aktif" : "Kosong"}</span>
                </div>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>{s.desc}</p>
              </div>
              {s.edit && <button onClick={s.edit} className="shrink-0 px-5 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-[#f4f4f5]" style={{ border: "1px solid #d4d4d8", color: "var(--gold)" }}>Edit Bagian</button>}
            </div>
          ))}
        </div>
      </div>

      {/* ═══ Hero Modal ═══ */}
      <AnimatePresence>
        {editModal === "hero" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.4)" }}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="card p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif italic text-xl" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>Hero / Banner Utama</h3>
                <button onClick={() => setEditModal(null)}><X size={20} style={{ color: "var(--text-muted)" }} /></button>
              </div>
              <div className="space-y-3">
                <div><label className="block text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Eyebrow Text</label><input value={editHero.eyebrow_text} onChange={(e) => setEditHero({ ...editHero, eyebrow_text: e.target.value.slice(0, 40) })} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ border: "1px solid #d4d4d8", background: "white" }} /><CharCounter current={editHero.eyebrow_text.length} max={40} /></div>
                <div><label className="block text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Title Line 1</label><div className="flex gap-2"><input value={editHero.title_line1} onChange={(e) => setEditHero({ ...editHero, title_line1: e.target.value.slice(0, 30) })} className="flex-1 rounded-lg px-3 py-2 text-sm outline-none" style={{ border: "1px solid #d4d4d8", background: "white" }} /><div className="relative"><input type="color" value={editHero.title_line1_color || "#f8f5f1"} onChange={(e) => setEditHero({ ...editHero, title_line1_color: e.target.value })} className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0.5" style={{ background: "white" }} /><span className="absolute -bottom-4 left-0 text-[9px] font-mono" style={{ color: "var(--text-muted)" }}>{editHero.title_line1_color || "#f8f5f1"}</span></div></div><CharCounter current={editHero.title_line1.length} max={30} /></div>
                <div className="mt-2"><label className="block text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Title Line 2</label><div className="flex gap-2"><input value={editHero.title_line2} onChange={(e) => setEditHero({ ...editHero, title_line2: e.target.value.slice(0, 30) })} className="flex-1 rounded-lg px-3 py-2 text-sm outline-none" style={{ border: "1px solid #d4d4d8", background: "white" }} /><div className="relative"><input type="color" value={editHero.title_line2_color || "#e0b563"} onChange={(e) => setEditHero({ ...editHero, title_line2_color: e.target.value })} className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0.5" style={{ background: "white" }} /><span className="absolute -bottom-4 left-0 text-[9px] font-mono" style={{ color: "var(--text-muted)" }}>{editHero.title_line2_color || "#e0b563"}</span></div></div><CharCounter current={editHero.title_line2.length} max={30} /></div>
                <div><label className="block text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Deskripsi</label><textarea value={editHero.description} onChange={(e) => setEditHero({ ...editHero, description: e.target.value.slice(0, 150) })} rows={3} className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none" style={{ border: "1px solid #d4d4d8", background: "white" }} /><CharCounter current={editHero.description.length} max={150} /></div>
                <div><label className="block text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Video Hero — link Cloudinary</label><input value={editHero.video_url} onChange={(e) => setEditHero({ ...editHero, video_url: e.target.value.trim() })} placeholder="https://res.cloudinary.com/<cloud>/video/upload/<versi>/<file>.mp4" className="w-full rounded-lg px-3 py-2 text-xs outline-none font-mono" style={{ border: "1px solid #d4d4d8", background: "white" }} /><p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Kosongkan = pakai video bawaan. Disarankan rasio <strong>16:9</strong> (mis. 1920×1080); video dipasang <em>cover</em>, jadi mengganti link tidak mengubah layout.</p></div>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((n) => { const k = `feature${n}` as keyof HeroContent; return <div key={k}><label className="block text-[10px] font-medium mb-1" style={{ color: "var(--text-muted)" }}>Fitur {n}</label><input value={editHero[k] as string} onChange={(e) => setEditHero({ ...editHero, [k]: e.target.value.slice(0, 30) })} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ border: "1px solid #d4d4d8", background: "white" }} /><CharCounter current={(editHero[k] as string).length} max={30} /></div>; })}
                </div>
              </div>
              <div className="flex gap-3 mt-5"><button onClick={() => setEditModal(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ border: "1px solid #d4d4d8" }}>Batal</button><button onClick={saveHero} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "var(--gold)" }}>{saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null} Simpan</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Kategori Koleksi Modal ═══ */}
      <AnimatePresence>
        {editModal === "kategori" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.4)" }}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="card p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif italic text-xl" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>Kategori Koleksi</h3>
                <button onClick={() => setEditModal(null)}><X size={20} style={{ color: "var(--text-muted)" }} /></button>
              </div>
              <div className="text-xs mb-4 px-3 py-2.5 rounded-lg space-y-1" style={{ background: "#f4f4f5", color: "#52525b" }}>
                <p className="font-semibold mb-1">Ukuran gambar yang disarankan:</p>
                <p><strong>Thobe & Kandora</strong> → 1080 × 1350px (4:5 portrait)</p>
                <p><strong>Koko, Vest, Kabak, Cover Hanger</strong> → 1920 × 1080px (16:9 landscape)</p>
                <p className="mt-1 opacity-75">Format JPG/PNG/WebP, max 2MB.</p>
              </div>
              <div className="space-y-4 mb-4">
                {editCategories.map((cat, i) => (
                  <div key={cat.id || i} className="p-4 rounded-xl" style={{ border: "1px solid #e4e4e7", background: "rgba(255,255,255,.5)" }}>
                    <div className="flex items-center justify-between mb-3">
                      <input value={cat.name} onChange={(e) => { const u = [...editCategories]; u[i] = { ...u[i], name: e.target.value }; editCategoriesRef.current = u; setEditCategories(u); }} className="text-sm font-semibold outline-none bg-transparent" style={{ color: "var(--espresso)" }} placeholder="Nama kategori" />
                      {editCategories.length > 1 && <button onClick={() => setEditCategories(editCategories.filter((_, j) => j !== i))} className="p-1 hover:bg-red-50 rounded"><Trash2 size={14} style={{ color: "#dc2626" }} /></button>}
                    </div>
                    <div className="flex gap-3">
                      <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0" style={{ background: "#f4f4f5" }}>
                        {cat.image_url ? <img src={cat.image_url} alt={cat.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={20} style={{ color: "var(--text-muted)" }} /></div>}
                      </div>
                      <div className="flex-1">
                        <textarea value={cat.description} onChange={(e) => { const v = e.target.value.slice(0, 60); const u = [...editCategories]; u[i] = { ...u[i], description: v }; editCategoriesRef.current = u; setEditCategories(u); }} rows={2} placeholder="Deskripsi singkat kategori (max 60 karakter)" className="w-full rounded-lg px-3 py-2 text-xs outline-none resize-none mb-1" style={{ border: "1px solid #d4d4d8", background: "white" }} />
                        <p className="text-[10px] mb-2" style={{ color: cat.description.length > 54 ? "#52525b" : "var(--text-muted)" }}>{cat.description.length}/60</p>
                        <label className="flex items-center gap-2 text-xs cursor-pointer px-3 py-2 rounded-lg transition-colors hover:bg-[#f4f4f5]" style={{ border: "1px dashed #d4d4d8", color: "var(--gold)" }}>
                          <Upload size={14} />
                          {uploadingId === cat.id ? "Uploading..." : "Ganti Gambar"}
                          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCategoryImage(i, f); }} />
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {editCategories.length < 6 && <button onClick={() => setEditCategories([...editCategories, { id: "new-" + Date.now(), name: "", description: "", image_url: "", display_order: editCategories.length }])} className="flex items-center gap-1.5 text-sm font-medium mb-4" style={{ color: "var(--gold)" }}><Plus size={14} /> Tambah Kategori</button>}
              <div className="flex gap-3"><button onClick={() => setEditModal(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ border: "1px solid #d4d4d8" }}>Batal</button><button onClick={saveCategories} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "var(--gold)" }}>{saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null} Simpan</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Steps Modal ═══ */}
      <AnimatePresence>
        {editModal === "steps" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.4)" }}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="card p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif italic text-xl" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>Cara Pemesanan</h3>
                <button onClick={() => setEditModal(null)}><X size={20} style={{ color: "var(--text-muted)" }} /></button>
              </div>
              <div className="space-y-4 mb-4">
                {editSteps.map((s, i) => (
                  <div key={s.id} className="p-4 rounded-xl" style={{ border: "1px solid #e4e4e7", background: "rgba(255,255,255,.5)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold" style={{ color: "var(--gold)" }}>Langkah {i + 1}</span>
                      {editSteps.length > 1 && <button onClick={() => setEditSteps(editSteps.filter((_, j) => j !== i))} className="p-1 hover:bg-red-50 rounded"><Trash2 size={14} style={{ color: "#dc2626" }} /></button>}
                    </div>
                    <input value={s.title} onChange={(e) => { const u = [...editSteps]; u[i] = { ...u[i], title: e.target.value.slice(0, 30) }; setEditSteps(u); }} placeholder="Judul" className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-1" style={{ border: "1px solid #d4d4d8", background: "white" }} />
                    <textarea value={s.description} onChange={(e) => { const u = [...editSteps]; u[i] = { ...u[i], description: e.target.value.slice(0, 100) }; setEditSteps(u); }} placeholder="Deskripsi" rows={2} className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none" style={{ border: "1px solid #d4d4d8", background: "white" }} />
                  </div>
                ))}
              </div>
              {editSteps.length < 6 && <button onClick={() => setEditSteps([...editSteps, { id: String(Date.now()), step_number: editSteps.length + 1, title: "", description: "" }])} className="flex items-center gap-1.5 text-sm font-medium mb-4" style={{ color: "var(--gold)" }}><Plus size={14} /> Tambah</button>}
              <div className="flex gap-3"><button onClick={() => setEditModal(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ border: "1px solid #d4d4d8" }}>Batal</button><button onClick={saveSteps} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "var(--gold)" }}>{saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null} Simpan</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Garansi Modal ═══ */}
      <AnimatePresence>
        {editModal === "garansi" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.4)" }}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="card p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif italic text-xl" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>Jaminan SAMAQU</h3>
                <button onClick={() => setEditModal(null)}><X size={20} style={{ color: "var(--text-muted)" }} /></button>
              </div>
              <p className="text-sm font-medium mb-3" style={{ color: "var(--espresso)" }}>Kartu Jaminan</p>
              <div className="space-y-3 mb-4">
                {editGaransi.map((g, i) => (
                  <div key={i} className="p-3 rounded-lg relative" style={{ border: "1px solid #e4e4e7" }}>
                    {editGaransi.length > 1 && <button onClick={() => setEditGaransi(editGaransi.filter((_, j) => j !== i))} className="absolute top-2 right-2 p-1 hover:bg-red-50 rounded"><Trash2 size={14} style={{ color: "#dc2626" }} /></button>}
                    <input value={g.title} onChange={(e) => { const u = [...editGaransi]; u[i] = { ...u[i], title: e.target.value }; setEditGaransi(u); }} placeholder="Judul" className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-2" style={{ border: "1px solid #d4d4d8", background: "white" }} />
                    <textarea value={g.description} onChange={(e) => { const u = [...editGaransi]; u[i] = { ...u[i], description: e.target.value }; setEditGaransi(u); }} placeholder="Deskripsi" rows={2} className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none" style={{ border: "1px solid #d4d4d8", background: "white" }} />
                  </div>
                ))}
              </div>
              {editGaransi.length < 6 && <button onClick={() => setEditGaransi([...editGaransi, { id: String(Date.now()), title: "", description: "", display_order: editGaransi.length }])} className="flex items-center gap-1.5 text-sm font-medium mb-6" style={{ color: "var(--gold)" }}><Plus size={14} /> Tambah Jaminan</button>}
              <p className="text-sm font-medium mb-3" style={{ color: "var(--espresso)" }}>Trust Badges</p>
              <div className="space-y-2 mb-4">
                {editBadges.map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={b.label} onChange={(e) => { const u = [...editBadges]; u[i] = { ...u[i], label: e.target.value }; setEditBadges(u); }} className="flex-1 rounded-lg px-3 py-2 text-sm outline-none" style={{ border: "1px solid #d4d4d8", background: "white" }} />
                    {editBadges.length > 1 && <button onClick={() => setEditBadges(editBadges.filter((_, j) => j !== i))} className="p-1"><Trash2 size={14} style={{ color: "#dc2626" }} /></button>}
                  </div>
                ))}
                {editBadges.length < 5 && <button onClick={() => setEditBadges([...editBadges, { id: String(Date.now()), label: "", display_order: editBadges.length }])} className="text-sm font-medium" style={{ color: "var(--gold)" }}><Plus size={14} className="inline mr-1" />Tambah Badge</button>}
              </div>
              <div className="flex gap-3"><button onClick={() => setEditModal(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ border: "1px solid #d4d4d8" }}>Batal</button><button onClick={saveGaransi} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "var(--gold)" }}>{saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null} Simpan</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ FAQ Modal ═══ */}
      <AnimatePresence>
        {editModal === "faq" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.4)" }}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="card p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif italic text-xl" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>FAQ</h3>
                <button onClick={() => setEditModal(null)}><X size={20} style={{ color: "var(--text-muted)" }} /></button>
              </div>
              <div className="space-y-4 mb-4">
                {editFaqs.map((f, i) => (
                  <div key={i} className="p-4 rounded-xl" style={{ border: "1px solid #e4e4e7", background: "rgba(255,255,255,.5)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold" style={{ color: "var(--gold)" }}>Pertanyaan {i + 1}</span>
                      {editFaqs.length > 1 && <button onClick={() => setEditFaqs(editFaqs.filter((_, j) => j !== i))} className="p-1 hover:bg-red-50 rounded"><Trash2 size={14} style={{ color: "#dc2626" }} /></button>}
                    </div>
                    <input value={f.question} onChange={(e) => { const u = [...editFaqs]; u[i] = { ...u[i], question: e.target.value }; setEditFaqs(u); }} placeholder="Pertanyaan" className="w-full rounded-lg px-3 py-2 text-sm outline-none mb-1" style={{ border: "1px solid #d4d4d8", background: "white" }} />
                    <textarea value={f.answer} onChange={(e) => { const u = [...editFaqs]; u[i] = { ...u[i], answer: e.target.value }; setEditFaqs(u); }} placeholder="Jawaban" rows={2} className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none mb-2" style={{ border: "1px solid #d4d4d8", background: "white" }} />
                    <select value={f.category || ""} onChange={(e) => { const u = [...editFaqs]; u[i] = { ...u[i], category: e.target.value }; setEditFaqs(u); }} className="w-full rounded-lg px-3 py-2 text-sm outline-none appearance-none" style={{ border: "1px solid #d4d4d8", background: "white", color: "var(--espresso)" }}>
                      <option value="">Pilih Kategori</option>
                      <option value="Order & Pembayaran">Order & Pembayaran</option>
                      <option value="Pengiriman">Pengiriman</option>
                      <option value="Produk, Kain & Size">Produk, Kain & Size</option>
                      <option value="Retur & Garansi">Retur & Garansi</option>
                    </select>
                  </div>
                ))}
              </div>
              {editFaqs.length < 30 && <button onClick={() => setEditFaqs([...editFaqs, { id: String(Date.now()), question: "", answer: "", category: "", type: editFaqsType, display_order: editFaqs.length }])} className="flex items-center gap-1.5 text-sm font-medium mb-4" style={{ color: "var(--gold)" }}><Plus size={14} /> Tambah</button>}
              <div className="flex gap-3"><button onClick={() => setEditModal(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ border: "1px solid #d4d4d8" }}>Batal</button><button onClick={saveFaqs} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "var(--gold)" }}>{saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null} Simpan</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Marquee Modal ═══ */}
      <AnimatePresence>
        {editModal === "marquee" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.4)" }}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="card p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif italic text-xl" style={{ fontFamily: "var(--font-cormorant), Georgia, serif" }}>Trust Marquee</h3>
                <button onClick={() => setEditModal(null)}><X size={20} style={{ color: "var(--text-muted)" }} /></button>
              </div>
              <div className="space-y-2 mb-4">
                {editMarquee.map((m, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={m.label} onChange={(e) => { const u = [...editMarquee]; u[i] = { ...u[i], label: e.target.value }; setEditMarquee(u); }} className="flex-1 rounded-lg px-3 py-2 text-sm outline-none" style={{ border: "1px solid #d4d4d8", background: "white" }} />
                    {editMarquee.length > 1 && <button onClick={() => setEditMarquee(editMarquee.filter((_, j) => j !== i))} className="p-1"><Trash2 size={14} style={{ color: "#dc2626" }} /></button>}
                  </div>
                ))}
                {editMarquee.length < 10 && <button onClick={() => setEditMarquee([...editMarquee, { id: String(Date.now()), label: "", display_order: editMarquee.length }])} className="text-sm font-medium" style={{ color: "var(--gold)" }}><Plus size={14} className="inline mr-1" />Tambah Item</button>}
              </div>
              <div className="flex gap-3"><button onClick={() => setEditModal(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ border: "1px solid #d4d4d8" }}>Batal</button><button onClick={saveMarquee} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "var(--gold)" }}>{saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null} Simpan</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>

    <style jsx global>{`
      .card { background: #ffffff; border: 1px solid #f1f1f3; border-radius: 1rem; box-shadow: 0 1px 2px rgba(0,0,0,.03); }
      .badge { font-size: .72rem; font-weight: 600; padding: .2rem .6rem; border-radius: 999px; white-space: nowrap; }
    `}</style>
    </AdminShell>
  );
}

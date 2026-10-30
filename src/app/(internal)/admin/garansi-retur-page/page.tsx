"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Upload, Image as ImageIcon, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/AdminToast";
import AdminShell from "@/components/AdminShell";
import { uploadToCloudinary } from "@/lib/cloudinary";

interface GaransiReturContent {
  id: number;
  hero_title: string;
  hero_kicker: string;
  hero_description: string;
  hero_bullet1: string;
  hero_bullet2: string;
  hero_bullet3: string;
  hero_closing: string;
  hero_cta_text: string;
  hero_image_url: string;
  garansi_title: string;
  garansi_desc: string;
  garansi1_title: string;
  garansi1_desc: string;
  garansi2_title: string;
  garansi2_desc: string;
  garansi2_note: string;
  garansi3_title: string;
  garansi3_desc: string;
  garansi3_note: string;
  retur_title: string;
  retur_desc: string;
  retur1: string;
  retur2: string;
  retur3: string;
  retur4: string;
  cara_title: string;
  cara1: string;
  cara2: string;
  cara3: string;
  cara4: string;
  no_retur_title: string;
  no_retur_desc: string;
  no_retur1: string;
  no_retur2: string;
  no_retur3: string;
  no_retur4: string;
  no_retur5: string;
  cta_title: string;
  cta_desc1: string;
  cta_desc2: string;
  cta_button_text: string;
  cta_image_url: string;
}

const DEFAULTS: GaransiReturContent = {
  id: 1,
  hero_title: "Garansi & Kebijakan Retur",
  hero_kicker: "BELANJA AMAN, HAK ANDA TERLINDUNGI",
  hero_description: "Kami memastikan setiap pembelian memberikan ketenangan. Kenali garansi dan kebijakan retur kami untuk pengalaman belanja yang lebih baik.",
  hero_bullet1: "Garansi produk cacat produksi",
  hero_bullet2: "Retur dalam 7 hari kerja",
  hero_bullet3: "Konsultasi sebelum retur",
  hero_closing: "Kami percaya transparansi adalah awal dari kepercayaan. Jika ada masalah, hubungi kami — kami siap membantu.",
  hero_cta_text: "Ajukan Retur via WhatsApp",
  hero_image_url: "/garansi/hero-web.png",
  garansi_title: "Yang Kami Jamin",
  garansi_desc: "Setiap produk SAMAQU memiliki jaminan untuk memastikan Anda mendapatkan yang terbaik.",
  garansi1_title: "Produk Sampai dengan Aman",
  garansi1_desc: "Kami memastikan setiap pesanan dikemas rapi dan terlindungi. Jika produk rusak atau cacat saat pengiriman, kami akan menggantinya dengan yang baru.",
  garansi2_title: "Garansi Penggantian Produk",
  garansi2_desc: "Jika Anda menerima produk dengan cacat produksi (jahitan lepas, bahan robek, atau ketidaksesuaian warna), hubungi kami dalam waktu 7 hari kerja.",
  garansi2_note: "Sertakan foto produk dan nomor pesanan saat menghubungi.",
  garansi3_title: "Konsultasi Ukuran Gratis",
  garansi3_desc: "Sebelum membeli, Anda bisa berkonsultasi dengan admin kami untuk memastikan ukuran yang tepat. Kami bantu menemukan yang paling nyaman.",
  garansi3_note: "",
  retur_title: "Kebijakan Retur",
  retur_desc: "Kami menerima retur dalam kondisi tertentu untuk memastikan kepuasan Anda.",
  retur1: "Kemasan asli masih utuh dan belum dibuka",
  retur2: "Label dan tag produk masih terpasang",
  retur3: "Dalam waktu 7 hari kerja sejak barang diterima",
  retur4: "Bukti pembelian atau screenshot order",
  cara_title: "Cara Mengajukan Retur",
  cara1: "Hubungi admin via WhatsApp dan sertakan nomor pesanan serta alasan retur.",
  cara2: "Kirim foto produk yang ingin diretur beserta kondisi kemasan.",
  cara3: "Tunggu konfirmasi dari admin mengenai persetujuan retur.",
  cara4: "Kirim produk ke alamat yang telah ditentukan dan konfirmasi resi pengiriman.",
  no_retur_title: "Yang Tidak Dapat Diretur",
  no_retur_desc: "Beberapa kondisi berikut tidak memenuhi syarat retur:",
  no_retur1: "Produk sudah dipakai atau dicuci",
  no_retur2: "Perubahan warna akibat pemakaian",
  no_retur3: "Ukuran sudah disesuaikan permintaan",
  no_retur4: "Kerusakan akibat pemakaian tidak tepat",
  no_retur5: "Kerusakan akibat pencucian tidak sesuai",
  cta_title: "Butuh Bantuan?",
  cta_desc1: "Jika Anda memiliki pertanyaan tentang garansi atau ingin mengajukan retur, jangan ragu untuk menghubungi admin kami.",
  cta_desc2: "Tim kami siap membantu Anda dengan sepenuh hati.",
  cta_button_text: "Hubungi Admin",
  cta_image_url: "/garansi/cta-web.png",
};

export default function GaransiReturAdminPage() {
  const [content, setContent] = useState<GaransiReturContent>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ hero: true });
  const toast = useToast();

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const { data } = await supabase.from("garansi_retur_page").select("*").eq("id", 1).single();
    if (data) setContent({ ...DEFAULTS, ...data });
    setLoading(false);
  }

  async function saveContent() {
    setSaving(true);
    const { id, ...updates } = content;
    await supabase.from("garansi_retur_page").upsert({ id: 1, ...updates }, { onConflict: "id" });
    setSaving(false);
    toast.showToast("success", "Konten Garansi & Retur berhasil disimpan");
  }

  async function uploadImage(field: keyof GaransiReturContent, file: File) {
    try {
      const url = await uploadToCloudinary(file);
      if (url) {
        setContent({ ...content, [field]: url });
        toast.showToast("success", "Gambar berhasil diupload");
      }
    } catch { toast.showToast("error", "Gagal upload gambar"); }
  }

  function toggleSection(key: string) {
    setExpandedSections({ ...expandedSections, [key]: !expandedSections[key] });
  }

  function SectionHeader({ title, sectionKey }: { title: string; sectionKey: string }) {
    const isOpen = expandedSections[sectionKey];
    return (
      <button onClick={() => toggleSection(sectionKey)} className="w-full flex items-center justify-between py-3 px-4 rounded-xl mb-2" style={{ background: "#fafafa", border: "1px solid #e4e4e7" }}>
        <h3 className="font-semibold text-sm" style={{ color: "var(--espresso)" }}>{title}</h3>
        {isOpen ? <ChevronUp size={16} style={{ color: "var(--text-muted)" }} /> : <ChevronDown size={16} style={{ color: "var(--text-muted)" }} />}
      </button>
    );
  }

  function InputField({ label, value, onChange, maxLen, textarea, rows }: { label: string; value: string; onChange: (v: string) => void; maxLen?: number; textarea?: boolean; rows?: number }) {
    return (
      <div className="mb-3">
        <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>{label}</label>
        {textarea ? (
          <textarea value={value} onChange={(e) => onChange(e.target.value.slice(0, maxLen || 999))} rows={rows || 3} className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none" style={{ border: "1px solid #d4d4d8", background: "white" }} />
        ) : (
          <input value={value} onChange={(e) => onChange(e.target.value.slice(0, maxLen || 999))} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ border: "1px solid #d4d4d8", background: "white" }} />
        )}
        {maxLen && <p className="text-[10px] mt-0.5" style={{ color: value.length > maxLen * 0.9 ? "#52525b" : "var(--text-muted)" }}>{value.length}/{maxLen}</p>}
      </div>
    );
  }

  function ImageUpload({ label, field }: { label: string; field: keyof GaransiReturContent }) {
    const url = content[field] as string;
    return (
      <div className="mb-3">
        <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>{label}</label>
        <div className="flex items-center gap-3">
          <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0" style={{ background: "#f4f4f5" }}>
            {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={20} style={{ color: "var(--text-muted)" }} /></div>}
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer px-3 py-2 rounded-lg transition-colors hover:bg-[#f4f4f5]" style={{ border: "1px dashed #d4d4d8", color: "var(--gold)" }}>
            <Upload size={14} /> Ganti Gambar
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(field, f); }} />
          </label>
        </div>
      </div>
    );
  }

  if (loading) return <section className="min-h-screen flex items-center justify-center" style={{ background: "var(--cream)" }}><Loader2 size={24} className="animate-spin" style={{ color: "var(--gold)" }} /></section>;

  return (
    <AdminShell>
      <section className="min-h-screen" style={{ background: "var(--cream)" }}>
        <div className="max-w-4xl mx-auto px-5 lg:px-8 py-6">
          <div className="mb-6">
            <h1 className="text-2xl italic" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}>Halaman Garansi & Retur</h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Kelola konten yang tampil di halaman garansi & kebijakan retur</p>
          </div>

          {/* Hero Section */}
          <SectionHeader title="Hero / Banner Utama" sectionKey="hero" />
          {expandedSections.hero && (
            <div className="card p-5 mb-4">
              <InputField label="Judul Hero" value={content.hero_title} onChange={(v) => setContent({ ...content, hero_title: v })} maxLen={60} />
              <InputField label="Kicker Text" value={content.hero_kicker} onChange={(v) => setContent({ ...content, hero_kicker: v })} maxLen={50} />
              <InputField label="Deskripsi" value={content.hero_description} onChange={(v) => setContent({ ...content, hero_description: v })} maxLen={200} textarea rows={3} />
              <InputField label="Bullet Point 1" value={content.hero_bullet1} onChange={(v) => setContent({ ...content, hero_bullet1: v })} maxLen={60} />
              <InputField label="Bullet Point 2" value={content.hero_bullet2} onChange={(v) => setContent({ ...content, hero_bullet2: v })} maxLen={60} />
              <InputField label="Bullet Point 3" value={content.hero_bullet3} onChange={(v) => setContent({ ...content, hero_bullet3: v })} maxLen={60} />
              <InputField label="Closing Text" value={content.hero_closing} onChange={(v) => setContent({ ...content, hero_closing: v })} maxLen={200} textarea rows={2} />
              <InputField label="Tombol CTA" value={content.hero_cta_text} onChange={(v) => setContent({ ...content, hero_cta_text: v })} maxLen={40} />
              <ImageUpload label="Gambar Hero (4:3, max 1080x810px)" field="hero_image_url" />
            </div>
          )}

          {/* Garansi Section */}
          <SectionHeader title="Yang Kami Jamin (3 Cards)" sectionKey="garansi" />
          {expandedSections.garansi && (
            <div className="card p-5 mb-4">
              <InputField label="Judul Section" value={content.garansi_title} onChange={(v) => setContent({ ...content, garansi_title: v })} maxLen={50} />
              <InputField label="Deskripsi Section" value={content.garansi_desc} onChange={(v) => setContent({ ...content, garansi_desc: v })} maxLen={200} textarea rows={2} />
              <div className="mt-4 p-4 rounded-xl" style={{ border: "1px solid #e4e4e7", background: "rgba(255,255,255,.5)" }}>
                <p className="text-xs font-semibold mb-3" style={{ color: "var(--gold)" }}>Card 1</p>
                <InputField label="Judul" value={content.garansi1_title} onChange={(v) => setContent({ ...content, garansi1_title: v })} maxLen={50} />
                <InputField label="Deskripsi" value={content.garansi1_desc} onChange={(v) => setContent({ ...content, garansi1_desc: v })} maxLen={200} textarea rows={3} />
              </div>
              <div className="mt-3 p-4 rounded-xl" style={{ border: "1px solid #e4e4e7", background: "rgba(255,255,255,.5)" }}>
                <p className="text-xs font-semibold mb-3" style={{ color: "var(--gold)" }}>Card 2</p>
                <InputField label="Judul" value={content.garansi2_title} onChange={(v) => setContent({ ...content, garansi2_title: v })} maxLen={50} />
                <InputField label="Deskripsi" value={content.garansi2_desc} onChange={(v) => setContent({ ...content, garansi2_desc: v })} maxLen={200} textarea rows={3} />
                <InputField label="Catatan (opsional)" value={content.garansi2_note} onChange={(v) => setContent({ ...content, garansi2_note: v })} maxLen={100} />
              </div>
              <div className="mt-3 p-4 rounded-xl" style={{ border: "1px solid #e4e4e7", background: "rgba(255,255,255,.5)" }}>
                <p className="text-xs font-semibold mb-3" style={{ color: "var(--gold)" }}>Card 3</p>
                <InputField label="Judul" value={content.garansi3_title} onChange={(v) => setContent({ ...content, garansi3_title: v })} maxLen={50} />
                <InputField label="Deskripsi" value={content.garansi3_desc} onChange={(v) => setContent({ ...content, garansi3_desc: v })} maxLen={200} textarea rows={3} />
                <InputField label="Catatan (opsional)" value={content.garansi3_note} onChange={(v) => setContent({ ...content, garansi3_note: v })} maxLen={100} />
              </div>
            </div>
          )}

          {/* Kebijakan Retur Section */}
          <SectionHeader title="Kebijakan Retur (4 Items)" sectionKey="retur" />
          {expandedSections.retur && (
            <div className="card p-5 mb-4">
              <InputField label="Judul Section" value={content.retur_title} onChange={(v) => setContent({ ...content, retur_title: v })} maxLen={50} />
              <InputField label="Deskripsi Section" value={content.retur_desc} onChange={(v) => setContent({ ...content, retur_desc: v })} maxLen={200} textarea rows={2} />
              <div className="mt-4 space-y-3">
                {[1, 2, 3, 4].map((n) => (
                  <InputField key={n} label={`Item ${n}`} value={content[`retur${n}` as keyof GaransiReturContent] as string} onChange={(v) => setContent({ ...content, [`retur${n}`]: v })} maxLen={100} />
                ))}
              </div>
            </div>
          )}

          {/* Cara Mengajukan Section */}
          <SectionHeader title="Cara Mengajukan Retur (4 Steps)" sectionKey="cara" />
          {expandedSections.cara && (
            <div className="card p-5 mb-4">
              <InputField label="Judul Section" value={content.cara_title} onChange={(v) => setContent({ ...content, cara_title: v })} maxLen={50} />
              <div className="mt-4 space-y-3">
                {[1, 2, 3, 4].map((n) => (
                  <InputField key={n} label={`Langkah ${n}`} value={content[`cara${n}` as keyof GaransiReturContent] as string} onChange={(v) => setContent({ ...content, [`cara${n}`]: v })} maxLen={150} textarea rows={2} />
                ))}
              </div>
            </div>
          )}

          {/* Tidak Dapat Diretur Section */}
          <SectionHeader title="Yang Tidak Dapat Diretur (5 Items)" sectionKey="noRetur" />
          {expandedSections.noRetur && (
            <div className="card p-5 mb-4">
              <InputField label="Judul Section" value={content.no_retur_title} onChange={(v) => setContent({ ...content, no_retur_title: v })} maxLen={50} />
              <InputField label="Deskripsi Section" value={content.no_retur_desc} onChange={(v) => setContent({ ...content, no_retur_desc: v })} maxLen={200} textarea rows={2} />
              <div className="mt-4 space-y-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <InputField key={n} label={`Item ${n}`} value={content[`no_retur${n}` as keyof GaransiReturContent] as string} onChange={(v) => setContent({ ...content, [`no_retur${n}`]: v })} maxLen={100} />
                ))}
              </div>
            </div>
          )}

          {/* CTA Section */}
          <SectionHeader title="CTA / Bantuan" sectionKey="cta" />
          {expandedSections.cta && (
            <div className="card p-5 mb-4">
              <InputField label="Judul CTA" value={content.cta_title} onChange={(v) => setContent({ ...content, cta_title: v })} maxLen={50} />
              <InputField label="Deskripsi 1" value={content.cta_desc1} onChange={(v) => setContent({ ...content, cta_desc1: v })} maxLen={200} textarea rows={2} />
              <InputField label="Deskripsi 2" value={content.cta_desc2} onChange={(v) => setContent({ ...content, cta_desc2: v })} maxLen={200} textarea rows={2} />
              <InputField label="Tombol CTA" value={content.cta_button_text} onChange={(v) => setContent({ ...content, cta_button_text: v })} maxLen={40} />
              <ImageUpload label="Gambar CTA (4:5, max 1080x1350px)" field="cta_image_url" />
            </div>
          )}

          {/* Save Button */}
          <div className="sticky bottom-0 py-4" style={{ background: "var(--cream)" }}>
            <button onClick={saveContent} disabled={saving} className="w-full py-3 rounded-xl text-sm font-semibold text-white" style={{ background: "var(--gold)" }}>
              {saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null} Simpan Semua Perubahan
            </button>
          </div>
        </div>
      </section>

      <style jsx global>{`
        .card { background: #ffffff; border: 1px solid #f1f1f3; border-radius: 1rem; box-shadow: 0 1px 2px rgba(0,0,0,.03); }
      `}</style>
    </AdminShell>
  );
}

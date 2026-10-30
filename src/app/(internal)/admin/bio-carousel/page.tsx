"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Upload, GripVertical, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/AdminToast";
import AdminShell from "@/components/AdminShell";
import { uploadToCloudinary } from "@/lib/cloudinary";

interface CarouselImage {
  id: string;
  image_url: string;
  alt: string;
  sort_order: number;
  enabled: boolean;
  created_at: string;
}

export default function BioCarouselPage() {
  const [images, setImages] = useState<CarouselImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    fetchImages();
  }, []);

  async function fetchImages() {
    const { data } = await supabase.from("bio_carousel_images").select("*").order("sort_order");
    if (data) setImages(data);
    setLoading(false);
  }

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const imageUrl = await uploadToCloudinary(file);

      // Find max sort_order
      const maxSort = images.length > 0 ? Math.max(...images.map(i => i.sort_order)) : 0;

      // Create in DB
      const { data: newImage, error } = await supabase
        .from("bio_carousel_images")
        .insert({ image_url: imageUrl, alt: file.name.replace(/\.[^.]+$/, ""), sort_order: maxSort + 1 })
        .select()
        .single();
      if (error) throw new Error("Failed to save");
      setImages(prev => [...prev, newImage]);
      toast.showToast("success", "Gambar berhasil ditambahkan");
    } catch {
      toast.showToast("error", "Gagal upload gambar");
    }
    setUploading(false);
  }

  async function deleteImage(id: string) {
    if (!confirm("Hapus gambar ini?")) return;
    setSaving(id);
    const { error } = await supabase.from("bio_carousel_images").delete().eq("id", id);
    if (!error) {
      setImages(prev => prev.filter(i => i.id !== id));
      toast.showToast("success", "Gambar dihapus");
    } else {
      toast.showToast("error", "Gagal menghapus gambar");
    }
    setSaving(null);
  }

  async function updateImage(id: string, updates: Partial<CarouselImage>) {
    setSaving(id);
    const { error } = await supabase.from("bio_carousel_images").update(updates).eq("id", id);
    if (!error) {
      setImages(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
      toast.showToast("success", "Berhasil diupdate");
    } else {
      toast.showToast("error", "Gagal update");
    }
    setSaving(null);
  }

  async function moveImage(id: string, direction: "up" | "down") {
    const idx = images.findIndex(i => i.id === id);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= images.length) return;

    const a = images[idx];
    const b = images[swapIdx];

    // Swap sort_order
    await Promise.all([
      supabase.from("bio_carousel_images").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("bio_carousel_images").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);

    const newImages = [...images];
    const temp = newImages[idx].sort_order;
    newImages[idx] = { ...newImages[idx], sort_order: newImages[swapIdx].sort_order };
    newImages[swapIdx] = { ...newImages[swapIdx], sort_order: temp };
    // Re-sort
    newImages.sort((a, b) => a.sort_order - b.sort_order);
    setImages(newImages);
  }

  if (loading) {
    return (
      <AdminShell>
        <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" size={24} /></div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: "var(--espresso)" }}>Foto Carousel Bio Link</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Ukuran rekomendasi: <strong>1024 x 498 px</strong> (format landscape)
          </p>
        </div>

        {/* Upload button */}
        <div className="mb-6">
          <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-colors" style={{ background: "var(--gold)", color: "white" }}>
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {uploading ? "Uploading..." : "Tambah Foto"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ""; }}
            />
          </label>
        </div>

        {/* Image list */}
        <div className="space-y-3">
          {images.map((img, idx) => (
            <div key={img.id} className="flex items-center gap-4 p-4 rounded-xl" style={{ background: "#ffffff", border: "1px solid #e4e4e7" }}>
              {/* Drag handle */}
              <GripVertical size={16} style={{ color: "var(--text-muted)" }} className="shrink-0" />

              {/* Preview */}
              <div className="w-24 h-12 rounded-lg overflow-hidden shrink-0" style={{ background: "#f4f4f5" }}>
                <img src={img.image_url} alt={img.alt} className="w-full h-full object-cover" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: "var(--espresso)" }}>{img.alt || "Tanpa judul"}</p>
                <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{img.image_url}</p>
              </div>

              {/* Sort buttons */}
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  onClick={() => moveImage(img.id, "up")}
                  disabled={idx === 0 || saving === img.id}
                  className="text-[10px] px-2 py-0.5 rounded border disabled:opacity-30"
                  style={{ borderColor: "#d4d4d8", color: "var(--text-muted)" }}
                >
                  ▲
                </button>
                <button
                  onClick={() => moveImage(img.id, "down")}
                  disabled={idx === images.length - 1 || saving === img.id}
                  className="text-[10px] px-2 py-0.5 rounded border disabled:opacity-30"
                  style={{ borderColor: "#d4d4d8", color: "var(--text-muted)" }}
                >
                  ▼
                </button>
              </div>

              {/* Toggle */}
              <button
                onClick={() => updateImage(img.id, { enabled: !img.enabled })}
                disabled={saving === img.id}
                className="w-10 h-5 rounded-full relative transition-colors shrink-0"
                style={{ background: img.enabled ? "var(--gold)" : "#d4d4d8" }}
              >
                <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all" style={{ left: img.enabled ? "22px" : "2px" }} />
              </button>

              {/* Delete */}
              <button
                onClick={() => deleteImage(img.id)}
                disabled={saving === img.id}
                className="p-2 rounded-lg transition-colors shrink-0 hover:bg-red-50"
                style={{ color: "#dc2626" }}
              >
                {saving === img.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          ))}

          {images.length === 0 && (
            <div className="text-center py-12 rounded-xl" style={{ background: "#ffffff", border: "1px solid #e4e4e7" }}>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Belum ada foto. Klik &quot;Tambah Foto&quot; untuk menambahkan.</p>
            </div>
          )}
        </div>

        {/* Preview section */}
        {images.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--espresso)" }}>Preview</h2>
            <div className="rounded-xl overflow-hidden" style={{ background: "#1a1613", padding: "16px" }}>
              <div className="relative aspect-[2.06/1] rounded-xl overflow-hidden">
                {images.filter(i => i.enabled).map((img, idx) => (
                  <div key={img.id} className="absolute inset-0 transition-opacity duration-500" style={{ opacity: idx === 0 ? 1 : 0 }}>
                    <img src={img.image_url} alt={img.alt} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import AdminShell from "@/components/AdminShell";
import { useToast } from "@/components/AdminToast";
import { uploadToCloudinary, validateMediaFile } from "@/lib/cloudinary";
import {
  DEFAULT_BIO_CONTENT,
  normalizeBioContent,
  type BelanjaIcon,
  type BioPageContent,
  type GuaranteeIcon,
  type RowIcon,
  type SocialPlatform,
} from "@/lib/bio-page-content";

const POSITION_OPTIONS = [
  { label: "Atas", value: "50% 20%" },
  { label: "Tengah", value: "50% 50%" },
  { label: "Bawah", value: "50% 80%" },
];

/** Cocokkan nilai object-position lama (mis. "50% 30%") ke salah satu pilihan. */
function positionBucket(value: string): string {
  const parts = value.trim().split(/\s+/);
  const vertical = parts[1] ?? parts[0] ?? "50%";
  if (vertical === "top") return "50% 20%";
  if (vertical === "bottom") return "50% 80%";
  const n = Number.parseFloat(vertical);
  if (Number.isNaN(n) || (n > 35 && n < 65)) return "50% 50%";
  return n <= 35 ? "50% 20%" : "50% 80%";
}

const BELANJA_ICONS: BelanjaIcon[] = ["whatsapp", "globe"];
const ROW_ICONS: RowIcon[] = ["ruler", "instagram", "link"];
const GUARANTEE_ICONS: GuaranteeIcon[] = ["shield", "refund", "exchange", "chat"];
const SOCIAL_PLATFORMS: SocialPlatform[] = ["instagram", "whatsapp", "website"];

const inputStyle = {
  border: "1px solid var(--bd)",
  background: "white",
  color: "var(--espresso)",
} as const;

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
        style={inputStyle}
      />
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
        style={inputStyle}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

function PositionPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const active = positionBucket(value);
  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
        Posisi Foto
      </span>
      <div className="inline-flex rounded-lg p-1" style={{ background: "#f4f4f5" }}>
        {POSITION_OPTIONS.map((opt) => {
          const isActive = active === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: isActive ? "#ffffff" : "transparent",
                color: isActive ? "var(--espresso)" : "var(--text-muted)",
                boxShadow: isActive ? "0 1px 2px rgba(0,0,0,.08)" : "none",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
        Bagian foto yang ditampilkan di kartu.
      </p>
    </div>
  );
}

function ImageField({
  label,
  value,
  uploading,
  onChange,
  objectPosition,
}: {
  label: string;
  value: string;
  uploading: boolean;
  onChange: (file: File) => void;
  objectPosition?: string;
}) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <div className="flex items-center gap-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg" style={{ background: "#f4f4f5" }}>
          {value && (
            <img
              src={value}
              alt=""
              className="h-full w-full object-cover"
              style={{ objectPosition: objectPosition || "50% 50%" }}
            />
          )}
        </div>
        <label
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium"
          style={{ border: "1px solid var(--bd)", color: "var(--espresso)" }}
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? "Uploading..." : "Ganti Foto"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onChange(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}

function VideoField({
  label,
  value,
  uploading,
  onChange,
  onUrlChange,
  onClear,
}: {
  label: string;
  value: string;
  uploading: boolean;
  onChange: (file: File) => void;
  onUrlChange: (url: string) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        {value ? (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] font-medium underline underline-offset-2"
            style={{ color: "var(--text-muted)" }}
          >
            Pakai foto hero
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-black">
          {value ? (
            <video
              src={value}
              className="h-full w-full object-cover"
              muted
              loop
              autoPlay
              playsInline
              preload="metadata"
            />
          ) : (
            <span className="grid h-full w-full place-items-center text-[10px]" style={{ color: "#a1a1aa" }}>
              Belum ada
            </span>
          )}
        </div>
        <label
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium"
          style={{ border: "1px solid var(--bd)", color: "var(--espresso)" }}
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? "Uploading..." : "Ganti Video"}
          <input
            type="file"
            accept="video/mp4,video/webm"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onChange(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <input
        value={value}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder="https://res.cloudinary.com/.../video.mp4"
        className="mt-2 w-full rounded-lg px-3 py-2.5 text-sm outline-none"
        style={inputStyle}
      />
      <p className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
        Kalau diisi, video menggantikan foto hero. Bingkai hero tetap 420px dan video dipotong
        otomatis, jadi ukuran video tidak mengubah layout.
      </p>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section
      className="rounded-2xl p-5"
      style={{ background: "#ffffff", border: "1px solid var(--bd)", boxShadow: "0 1px 2px rgba(0,0,0,.05)" }}
    >
      <h2 className="text-sm font-semibold" style={{ color: "var(--espresso)" }}>
        {title}
      </h2>
      {subtitle && (
        <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
          {subtitle}
        </p>
      )}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function IconButton({ onClick, label, danger }: { onClick: () => void; label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="rounded-lg p-2 transition-colors hover:bg-black/5"
      style={{ color: danger ? "#dc2626" : "var(--text-muted)" }}
    >
      {danger ? <Trash2 size={14} /> : <Plus size={14} />}
    </button>
  );
}

export default function BiolinkPage() {
  const [content, setContent] = useState<BioPageContent>(DEFAULT_BIO_CONTENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("bio_page_content")
        .select("content")
        .eq("id", 1)
        .maybeSingle();
      if (!error && data?.content) setContent(normalizeBioContent(data.content));
      setLoading(false);
    }
    load();
  }, []);

  function patch(updater: (draft: BioPageContent) => BioPageContent) {
    setContent((prev) => updater(prev));
  }

  async function uploadImage(key: string, file: File, apply: (url: string) => void) {
    setUploading(key);
    try {
      const url = await uploadToCloudinary(file);
      apply(url);
      toast.showToast("success", "Foto berhasil diupload");
    } catch {
      toast.showToast("error", "Gagal upload foto");
    }
    setUploading(null);
  }

  async function uploadVideo(file: File) {
    setUploading("hero-video");
    try {
      await validateMediaFile(file);
      const url = await uploadToCloudinary(file);
      patch((c) => ({ ...c, hero: { ...c.hero, video_url: url } }));
      toast.showToast("success", "Video berhasil diupload");
    } catch (error) {
      toast.showToast("error", error instanceof Error ? error.message : "Gagal upload video");
    }
    setUploading(null);
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("bio_page_content").upsert(
      { id: 1, content, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
    setSaving(false);
    if (error) {
      toast.showToast("error", "Gagal menyimpan. Pastikan tabel bio_page_content sudah dibuat.");
      return;
    }
    toast.showToast("success", "Halaman bio berhasil disimpan");
  }

  if (loading) {
    return (
      <AdminShell>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="animate-spin" size={24} />
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <section className="max-w-4xl p-5 lg:p-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: "var(--espresso)" }}>
              Bio Link
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              Kelola semua foto, video & konten halaman samaqu.id/bio.
            </p>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
            style={{ background: "var(--gold)" }}
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>

        <div className="space-y-4">
          <Card title="Header">
            <ImageField
              label="Logo"
              value={content.logo_url}
              uploading={uploading === "logo"}
              onChange={(file) =>
                uploadImage("logo", file, (url) =>
                  patch((c) => ({ ...c, logo_url: url }))
                )
              }
            />
            <Field
              label="Eyebrow"
              value={content.eyebrow}
              onChange={(value) => patch((c) => ({ ...c, eyebrow: value }))}
            />
            <Field
              label="Deskripsi"
              value={content.description}
              onChange={(value) => patch((c) => ({ ...c, description: value }))}
            />
          </Card>

          <Card
            title="Hero / Best Seller"
            subtitle="Video (opsional) tampil menggantikan foto. Bingkai hero tetap sama."
          >
            <VideoField
              label="Video Hero"
              value={content.hero.video_url}
              uploading={uploading === "hero-video"}
              onChange={uploadVideo}
              onUrlChange={(url) =>
                patch((c) => ({ ...c, hero: { ...c.hero, video_url: url } }))
              }
              onClear={() => patch((c) => ({ ...c, hero: { ...c.hero, video_url: "" } }))}
            />
            <ImageField
              label="Foto Hero (fallback kalau video kosong)"
              value={content.hero.image_url}
              uploading={uploading === "hero"}
              onChange={(file) =>
                uploadImage("hero", file, (url) =>
                  patch((c) => ({ ...c, hero: { ...c.hero, image_url: url } }))
                )
              }
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Badge"
                value={content.hero.badge}
                onChange={(value) => patch((c) => ({ ...c, hero: { ...c.hero, badge: value } }))}
              />
              <Field
                label="Harga"
                value={content.hero.price}
                onChange={(value) => patch((c) => ({ ...c, hero: { ...c.hero, price: value } }))}
              />
              <Field
                label="Judul"
                value={content.hero.title}
                onChange={(value) => patch((c) => ({ ...c, hero: { ...c.hero, title: value } }))}
              />
              <Field
                label="Judul (aksen)"
                value={content.hero.title_accent}
                onChange={(value) => patch((c) => ({ ...c, hero: { ...c.hero, title_accent: value } }))}
              />
              <Field
                label="Label Harga"
                value={content.hero.price_label}
                onChange={(value) => patch((c) => ({ ...c, hero: { ...c.hero, price_label: value } }))}
              />
              <Field
                label="Teks Tombol"
                value={content.hero.cta}
                onChange={(value) => patch((c) => ({ ...c, hero: { ...c.hero, cta: value } }))}
              />
            </div>
            <Field
              label="Link Hero"
              value={content.hero.href}
              onChange={(value) => patch((c) => ({ ...c, hero: { ...c.hero, href: value } }))}
            />
          </Card>

          <Card title="Kategori" subtitle="Foto produk di grid kategori.">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                label="Judul Section"
                value={content.categories.heading}
                onChange={(value) =>
                  patch((c) => ({ ...c, categories: { ...c.categories, heading: value } }))
                }
              />
              <Field
                label="Teks Link"
                value={content.categories.link_label}
                onChange={(value) =>
                  patch((c) => ({ ...c, categories: { ...c.categories, link_label: value } }))
                }
              />
              <Field
                label="Link 'Lihat semua'"
                value={content.categories.link_href}
                onChange={(value) =>
                  patch((c) => ({ ...c, categories: { ...c.categories, link_href: value } }))
                }
              />
            </div>

            <div className="space-y-3">
              {content.categories.items.map((item, index) => (
                <div key={index} className="rounded-xl p-3" style={{ border: "1px solid var(--bd)" }}>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold" style={{ color: "var(--espresso)" }}>
                      Kategori {index + 1}
                    </span>
                    <IconButton
                      danger
                      label="Hapus kategori"
                      onClick={() =>
                        patch((c) => ({
                          ...c,
                          categories: {
                            ...c.categories,
                            items: c.categories.items.filter((_, i) => i !== index),
                          },
                        }))
                      }
                    />
                  </div>
                  <ImageField
                    label="Foto"
                    value={item.image_url}
                    objectPosition={item.position}
                    uploading={uploading === `cat-${index}`}
                    onChange={(file) =>
                      uploadImage(`cat-${index}`, file, (url) =>
                        patch((c) => ({
                          ...c,
                          categories: {
                            ...c.categories,
                            items: c.categories.items.map((it, i) =>
                              i === index ? { ...it, image_url: url } : it
                            ),
                          },
                        }))
                      )
                    }
                  />
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Field
                      label="Label"
                      value={item.label}
                      onChange={(value) =>
                        patch((c) => ({
                          ...c,
                          categories: {
                            ...c.categories,
                            items: c.categories.items.map((it, i) =>
                              i === index ? { ...it, label: value } : it
                            ),
                          },
                        }))
                      }
                    />
                    <Field
                      label="Link"
                      value={item.href}
                      onChange={(value) =>
                        patch((c) => ({
                          ...c,
                          categories: {
                            ...c.categories,
                            items: c.categories.items.map((it, i) =>
                              i === index ? { ...it, href: value } : it
                            ),
                          },
                        }))
                      }
                    />
                    <PositionPicker
                      value={item.position}
                      onChange={(value) =>
                        patch((c) => ({
                          ...c,
                          categories: {
                            ...c.categories,
                            items: c.categories.items.map((it, i) =>
                              i === index ? { ...it, position: value } : it
                            ),
                          },
                        }))
                      }
                    />
                  </div>
                </div>
              ))}
              <AddButton
                label="Tambah Kategori"
                onClick={() =>
                  patch((c) => ({
                    ...c,
                    categories: {
                      ...c.categories,
                      items: [
                        ...c.categories.items,
                        { label: "Kategori Baru", image_url: "", href: "https://samaqu.id", position: "50% 50%" },
                      ],
                    },
                  }))
                }
              />
            </div>
          </Card>

          <Card title="Belanja" subtitle="Dua kartu besar (WhatsApp & Website).">
            <Field
              label="Judul Section"
              value={content.belanja.heading}
              onChange={(value) =>
                patch((c) => ({ ...c, belanja: { ...c.belanja, heading: value } }))
              }
            />
            {content.belanja.items.map((item, index) => (
              <div key={index} className="rounded-xl p-3" style={{ border: "1px solid var(--bd)" }}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: "var(--espresso)" }}>
                    Kartu {index + 1}
                  </span>
                  <IconButton
                    danger
                    label="Hapus kartu"
                    onClick={() =>
                      patch((c) => ({
                        ...c,
                        belanja: { ...c.belanja, items: c.belanja.items.filter((_, i) => i !== index) },
                      }))
                    }
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Label"
                    value={item.label}
                    onChange={(value) =>
                      patch((c) => ({
                        ...c,
                        belanja: {
                          ...c.belanja,
                          items: c.belanja.items.map((it, i) => (i === index ? { ...it, label: value } : it)),
                        },
                      }))
                    }
                  />
                  <Field
                    label="Subtitle"
                    value={item.subtitle}
                    onChange={(value) =>
                      patch((c) => ({
                        ...c,
                        belanja: {
                          ...c.belanja,
                          items: c.belanja.items.map((it, i) => (i === index ? { ...it, subtitle: value } : it)),
                        },
                      }))
                    }
                  />
                  <Field
                    label="Link"
                    value={item.href}
                    onChange={(value) =>
                      patch((c) => ({
                        ...c,
                        belanja: {
                          ...c.belanja,
                          items: c.belanja.items.map((it, i) => (i === index ? { ...it, href: value } : it)),
                        },
                      }))
                    }
                  />
                  <SelectField
                    label="Ikon"
                    value={item.icon}
                    options={BELANJA_ICONS}
                    onChange={(value) =>
                      patch((c) => ({
                        ...c,
                        belanja: {
                          ...c.belanja,
                          items: c.belanja.items.map((it, i) => (i === index ? { ...it, icon: value } : it)),
                        },
                      }))
                    }
                  />
                </div>
              </div>
            ))}
            <AddButton
              label="Tambah Kartu"
              onClick={() =>
                patch((c) => ({
                  ...c,
                  belanja: {
                    ...c.belanja,
                    items: [
                      ...c.belanja.items,
                      { label: "Kartu Baru", subtitle: "", href: "https://samaqu.id", icon: "globe" },
                    ],
                  },
                }))
              }
            />
          </Card>

          <Card title="Baris Link" subtitle="Daftar link ringkas (ikon + judul + subtitle).">
            {content.rows.map((item, index) => (
              <div key={index} className="rounded-xl p-3" style={{ border: "1px solid var(--bd)" }}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: "var(--espresso)" }}>
                    Baris {index + 1}
                  </span>
                  <IconButton
                    danger
                    label="Hapus baris"
                    onClick={() => patch((c) => ({ ...c, rows: c.rows.filter((_, i) => i !== index) }))}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Label"
                    value={item.label}
                    onChange={(value) =>
                      patch((c) => ({ ...c, rows: c.rows.map((it, i) => (i === index ? { ...it, label: value } : it)) }))
                    }
                  />
                  <Field
                    label="Subtitle"
                    value={item.subtitle}
                    onChange={(value) =>
                      patch((c) => ({ ...c, rows: c.rows.map((it, i) => (i === index ? { ...it, subtitle: value } : it)) }))
                    }
                  />
                  <Field
                    label="Link"
                    value={item.href}
                    onChange={(value) =>
                      patch((c) => ({ ...c, rows: c.rows.map((it, i) => (i === index ? { ...it, href: value } : it)) }))
                    }
                  />
                  <SelectField
                    label="Ikon"
                    value={item.icon}
                    options={ROW_ICONS}
                    onChange={(value) =>
                      patch((c) => ({ ...c, rows: c.rows.map((it, i) => (i === index ? { ...it, icon: value } : it)) }))
                    }
                  />
                </div>
              </div>
            ))}
            <AddButton
              label="Tambah Baris"
              onClick={() =>
                patch((c) => ({
                  ...c,
                  rows: [...c.rows, { label: "Link Baru", subtitle: "", href: "https://samaqu.id", icon: "link" }],
                }))
              }
            />
          </Card>

          <Card title="Garansi">
            <Field
              label="Judul Section"
              value={content.guarantee.heading}
              onChange={(value) =>
                patch((c) => ({ ...c, guarantee: { ...c.guarantee, heading: value } }))
              }
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {content.guarantee.items.map((item, index) => (
                <div key={index} className="rounded-xl p-3" style={{ border: "1px solid var(--bd)" }}>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold" style={{ color: "var(--espresso)" }}>
                      Item {index + 1}
                    </span>
                    <IconButton
                      danger
                      label="Hapus item"
                      onClick={() =>
                        patch((c) => ({
                          ...c,
                          guarantee: {
                            ...c.guarantee,
                            items: c.guarantee.items.filter((_, i) => i !== index),
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-3">
                    <Field
                      label="Judul"
                      value={item.title}
                      onChange={(value) =>
                        patch((c) => ({
                          ...c,
                          guarantee: {
                            ...c.guarantee,
                            items: c.guarantee.items.map((it, i) => (i === index ? { ...it, title: value } : it)),
                          },
                        }))
                      }
                    />
                    <Field
                      label="Subtitle"
                      value={item.subtitle}
                      onChange={(value) =>
                        patch((c) => ({
                          ...c,
                          guarantee: {
                            ...c.guarantee,
                            items: c.guarantee.items.map((it, i) => (i === index ? { ...it, subtitle: value } : it)),
                          },
                        }))
                      }
                    />
                    <SelectField
                      label="Ikon"
                      value={item.icon}
                      options={GUARANTEE_ICONS}
                      onChange={(value) =>
                        patch((c) => ({
                          ...c,
                          guarantee: {
                            ...c.guarantee,
                            items: c.guarantee.items.map((it, i) => (i === index ? { ...it, icon: value } : it)),
                          },
                        }))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
            <AddButton
              label="Tambah Item Garansi"
              onClick={() =>
                patch((c) => ({
                  ...c,
                  guarantee: {
                    ...c.guarantee,
                    items: [...c.guarantee.items, { title: "Item Baru", subtitle: "", icon: "shield" }],
                  },
                }))
              }
            />
          </Card>

          <Card title="Ikon Sosial">
            {content.socials.map((item, index) => (
              <div key={index} className="flex items-end gap-3">
                <div className="w-40">
                  <SelectField
                    label="Platform"
                    value={item.platform}
                    options={SOCIAL_PLATFORMS}
                    onChange={(value) =>
                      patch((c) => ({
                        ...c,
                        socials: c.socials.map((it, i) => (i === index ? { ...it, platform: value } : it)),
                      }))
                    }
                  />
                </div>
                <div className="flex-1">
                  <Field
                    label="Link"
                    value={item.href}
                    onChange={(value) =>
                      patch((c) => ({
                        ...c,
                        socials: c.socials.map((it, i) => (i === index ? { ...it, href: value } : it)),
                      }))
                    }
                  />
                </div>
                <IconButton
                  danger
                  label="Hapus sosial"
                  onClick={() =>
                    patch((c) => ({ ...c, socials: c.socials.filter((_, i) => i !== index) }))
                  }
                />
              </div>
            ))}
            <AddButton
              label="Tambah Ikon Sosial"
              onClick={() =>
                patch((c) => ({
                  ...c,
                  socials: [...c.socials, { platform: "instagram", href: "https://instagram.com/samaqu.id" }],
                }))
              }
            />
          </Card>

          <Card title="Footer & Marquee">
            <Field
              label="Teks Footer"
              value={content.footer}
              onChange={(value) => patch((c) => ({ ...c, footer: value }))}
            />
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                Marquee (satu baris = satu item)
              </span>
              <textarea
                value={content.marquee.join("\n")}
                onChange={(e) =>
                  patch((c) => ({
                    ...c,
                    marquee: e.target.value.split("\n").filter((line) => line.trim() !== ""),
                  }))
                }
                rows={4}
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                style={inputStyle}
              />
            </label>
          </Card>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
            style={{ background: "var(--gold)" }}
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </section>
    </AdminShell>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium"
      style={{ border: "1px dashed var(--bd)", color: "var(--text-muted)" }}
    >
      <Plus size={14} /> {label}
    </button>
  );
}

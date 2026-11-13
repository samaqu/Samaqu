"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  Copy,
  Download,
  FileText,
  HelpCircle,
  Images,
  LayoutDashboard,
  MessageCircle,
  Play,
  Search,
  Shirt,
  Sparkles,
  X,
} from "lucide-react";
import { resellerApi } from "@/lib/reseller/client";
import {
  MATERI_KATEGORI,
  MATERI_NADA,
  infoMateri,
  parseBodyMateri,
  parseYoutubeId,
  pilihBaru,
  pisahVarianTeks,
  unduhUrl,
  youtubeEmbedUrl,
  youtubeThumb,
  type MateriKategori,
  type MateriRow,
} from "@/lib/reseller/materi";
import { PanelDetailShell } from "@/components/ops/transaksi/PanelDetailPesanan";
import { RS_DRAWER_CSS } from "./ResellerOrderDrawer";
import { Note } from "./ui";

const TIPE_ICON = { video: Play, artikel: BookOpen, teks: FileText, galeri: Images } as const;
const KATEGORI_ICON = {
  panduan: LayoutDashboard,
  produk: Shirt,
  jualan: MessageCircle,
  teks: FileText,
  konten: Camera,
  faq: HelpCircle,
} as const;
const kategoriLabel = (key: string) => MATERI_KATEGORI.find((item) => item.key === key)?.label ?? key;

/* Penanda "sudah dibaca": hanya di browser reseller (tanpa database). */
const DIBACA_KEY = "samaqu:reseller-materi-dibaca";
function bacaDibaca(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DIBACA_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((item: unknown): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}
function simpanDibaca(ids: Set<string>) {
  try {
    window.localStorage.setItem(DIBACA_KEY, JSON.stringify([...ids].slice(-500)));
  } catch {
    /* penyimpanan diblokir — penanda tidak tersimpan, halaman tetap jalan */
  }
}

/** Halaman Materi reseller: banner + progres baca, "Mulai dari sini", bagian per kategori, dan drawer detail. */
export default function MateriPanel() {
  const [rows, setRows] = useState<MateriRow[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await resellerApi.materi();
      setRows(res.data);
    } catch {
      setError("Gagal memuat materi. Periksa koneksi lalu coba lagi.");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return <MateriView rows={rows} error={error} onRetry={load} />;
}

/** Tampilan halaman (tanpa pemuatan data) — dipisah supaya bisa dirender/dites langsung. `rows` null = memuat. */
export function MateriView({
  rows,
  error,
  onRetry,
  dibacaAwal,
}: {
  rows: MateriRow[] | null;
  error: string;
  onRetry: () => void;
  /** Untuk tes/pratinjau: id materi yang dianggap sudah dibaca saat pertama tampil. */
  dibacaAwal?: string[];
}) {
  const [kategori, setKategori] = useState<"semua" | MateriKategori>("semua");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<MateriRow | null>(null);
  const [dibaca, setDibaca] = useState<Set<string>>(() => new Set(dibacaAwal ?? []));

  useEffect(() => {
    setDibaca((prev) => new Set([...prev, ...bacaDibaca()]));
  }, []);

  const buka = (row: MateriRow) => {
    setOpen(row);
    setDibaca((prev) => {
      if (prev.has(row.id)) return prev;
      const next = new Set(prev);
      next.add(row.id);
      simpanDibaca(next);
      return next;
    });
  };

  const semua = rows ?? [];
  const baruIds = useMemo(() => pilihBaru(semua), [semua]);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of semua) map.set(row.category, (map.get(row.category) ?? 0) + 1);
    return map;
  }, [semua]);

  const needle = query.trim().toLowerCase();
  const filtering = kategori !== "semua" || needle !== "";
  const shown = useMemo(
    () =>
      semua.filter((row) => {
        if (kategori !== "semua" && row.category !== kategori) return false;
        if (!needle) return true;
        return `${row.title} ${row.summary ?? ""} ${kategoriLabel(row.category)}`.toLowerCase().includes(needle);
      }),
    [semua, kategori, needle]
  );

  const videoCount = semua.filter((row) => row.type === "video").length;
  const dibacaCount = semua.filter((row) => dibaca.has(row.id)).length;
  // "Mulai dari sini": tiga panduan pertama (urutan dari admin); hanya saat tidak sedang mencari/memfilter.
  const mulai = !filtering ? semua.filter((row) => row.category === "panduan").slice(0, 3) : [];
  const mulaiIds = new Set(mulai.map((row) => row.id));

  const sections: { key: string; label: string; desc: string; kat: MateriKategori | null; items: MateriRow[] }[] = filtering
    ? [
        {
          key: "hasil",
          label: kategori === "semua" ? `Hasil untuk "${query.trim()}"` : kategoriLabel(kategori),
          desc: kategori === "semua" ? "" : MATERI_KATEGORI.find((item) => item.key === kategori)?.desc ?? "",
          kat: kategori === "semua" ? null : kategori,
          items: shown,
        },
      ]
    : MATERI_KATEGORI.map((item) => ({
        key: item.key,
        label: item.label,
        desc: item.desc,
        kat: item.key as MateriKategori,
        items: semua.filter((row) => row.category === item.key && !mulaiIds.has(row.id)),
      })).filter((section) => section.items.length > 0);

  return (
    <div className="mt-page">
      <section className="mt-hero">
        <div className="mt-hero-txt">
          <span className="mt-hero-kick">
            <Sparkles size={13} /> Materi reseller
          </span>
          <h1>Belajar jualan SAMAQU, lebih cepat.</h1>
          <p>Panduan portal, pengetahuan produk, teks siap pakai, dan foto untuk postinganmu.</p>
        </div>
        {rows && rows.length > 0 ? (
          <div className="mt-hero-side">
            <div className="mt-hero-stats" aria-label="Ringkasan materi">
              <div>
                <b>{rows.length}</b>
                <span>Materi</span>
              </div>
              <div>
                <b>{videoCount}</b>
                <span>Video</span>
              </div>
              <div>
                <b>
                  {dibacaCount}/{rows.length}
                </b>
                <span>Dibaca</span>
              </div>
            </div>
            <div
              className="mt-progress"
              role="progressbar"
              aria-label="Progres membaca materi"
              aria-valuemin={0}
              aria-valuemax={rows.length}
              aria-valuenow={dibacaCount}
            >
              <span style={{ width: `${Math.round((dibacaCount / rows.length) * 100)}%` }} />
            </div>
          </div>
        ) : null}
      </section>

      <div className="mt-tools">
        <label className="mt-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" placeholder="Cari materi…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Cari materi" />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Hapus pencarian">
              <X size={14} />
            </button>
          ) : null}
        </label>

        <div className="mt-chips" role="tablist" aria-label="Kategori materi">
          <button type="button" role="tab" aria-selected={kategori === "semua"} className={kategori === "semua" ? "on" : ""} onClick={() => setKategori("semua")}>
            Semua <small>{semua.length}</small>
          </button>
          {MATERI_KATEGORI.filter((item) => (counts.get(item.key) ?? 0) > 0 || kategori === item.key).map((item) => (
            <button
              type="button"
              role="tab"
              key={item.key}
              aria-selected={kategori === item.key}
              className={kategori === item.key ? "on" : ""}
              onClick={() => setKategori(item.key)}
            >
              {item.label} <small>{counts.get(item.key) ?? 0}</small>
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <Note tone="err">
          {error}{" "}
          <button className="btn sm ghost" type="button" onClick={onRetry} style={{ marginLeft: 8 }}>
            Coba lagi
          </button>
        </Note>
      ) : null}

      {rows === null ? (
        <div className="mt-vgrid" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="sk mt-sk" />
          ))}
        </div>
      ) : semua.length === 0 && !error ? (
        <div className="mt-empty">
          <span className="mt-empty-ic">
            <BookOpen size={26} />
          </span>
          <b>Materi belum tersedia</b>
          <p>Admin SAMAQU sedang menyiapkan materi. Cek lagi nanti ya.</p>
        </div>
      ) : (
        <>
          {mulai.length > 0 ? (
            <section className="mt-start" aria-labelledby="mt-start-h">
              <div className="mt-start-h">
                <h2 id="mt-start-h">Mulai dari sini</h2>
                <p>Tiga materi pertama untuk reseller baru. Baca berurutan.</p>
              </div>
              <ol className="mt-steps">
                {mulai.map((row, index) => {
                  const sudah = dibaca.has(row.id);
                  return (
                    <li key={row.id}>
                      <button type="button" className={`mt-step${sudah ? " done" : ""}`} onClick={() => buka(row)}>
                        {row.type === "video" && parseYoutubeId(row.video_url) ? (
                          <span className="mt-step-thumb" aria-hidden="true">
                            <img src={youtubeThumb(parseYoutubeId(row.video_url) as string)} alt="" loading="lazy" />
                            <i>{sudah ? <Check size={11} strokeWidth={3} /> : index + 1}</i>
                            <Play size={16} fill="currentColor" className="mt-step-play" />
                          </span>
                        ) : (
                          <span className="mt-step-no" aria-hidden="true">
                            {sudah ? <Check size={16} strokeWidth={3} /> : index + 1}
                          </span>
                        )}
                        <span className="mt-step-txt">
                          <b>{row.title}</b>
                          <small>{row.summary || infoMateri(row)}</small>
                          <em>{infoMateri(row)}</em>
                        </span>
                        <ChevronRight size={18} className="mt-go" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}

          {sections.length === 0 || (filtering && shown.length === 0) ? (
            <div className="mt-empty">
              <span className="mt-empty-ic">
                <Search size={24} />
              </span>
              <b>Tidak ada materi yang cocok</b>
              <p>Coba kata kunci lain atau pilih kategori Semua.</p>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => {
                  setQuery("");
                  setKategori("semua");
                }}
              >
                Lihat semua materi
              </button>
            </div>
          ) : (
            sections.map((section) => {
              const visual = section.items.filter((row) => row.type === "video" || row.type === "galeri");
              const teks = section.items.filter((row) => row.type !== "video" && row.type !== "galeri");
              const nada = section.kat ? MATERI_NADA[section.kat] : "slate";
              const SectionIcon = section.kat ? KATEGORI_ICON[section.kat] : Search;
              return (
                <section className="mt-sec" key={section.key}>
                  <header className={`mt-sec-h tone-${nada}`}>
                    <span className="mt-sec-ic" aria-hidden="true">
                      <SectionIcon size={18} />
                    </span>
                    <div className="mt-sec-txt">
                      <h2>{section.label}</h2>
                      {section.desc ? <p>{section.desc}</p> : null}
                    </div>
                    <span className="mt-sec-n">{section.items.length}</span>
                  </header>

                  {visual.length > 0 ? (
                    <div className="mt-vgrid">
                      {visual.map((row) => (
                        <MateriCard key={row.id} row={row} baru={baruIds.has(row.id)} sudah={dibaca.has(row.id)} onOpen={() => buka(row)} />
                      ))}
                    </div>
                  ) : null}

                  {teks.length > 0 ? (
                    <div className="mt-rows">
                      {teks.map((row) => (
                        <MateriRowItem key={row.id} row={row} baru={baruIds.has(row.id)} sudah={dibaca.has(row.id)} onOpen={() => buka(row)} />
                      ))}
                    </div>
                  ) : null}
                </section>
              );
            })
          )}
        </>
      )}

      <MateriDrawer row={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/** Kartu visual (video & foto): thumbnail sungguhan. */
function MateriCard({ row, baru, sudah, onOpen }: { row: MateriRow; baru: boolean; sudah: boolean; onOpen: () => void }) {
  const ytId = row.type === "video" ? parseYoutubeId(row.video_url) : null;
  const foto = row.type === "galeri" ? row.images[0] : null;
  const Icon = TIPE_ICON[row.type];

  return (
    <button type="button" className={`mt-card t-${row.type}`} onClick={onOpen}>
      <span className="mt-media">
        {ytId ? (
          <>
            <img src={youtubeThumb(ytId)} alt="" loading="lazy" />
            <span className="mt-play" aria-hidden="true">
              <Play size={22} fill="currentColor" />
            </span>
          </>
        ) : foto ? (
          <>
            <img src={foto} alt="" loading="lazy" />
            <span className="mt-count">
              <Images size={12} /> {row.images.length}
            </span>
          </>
        ) : (
          <span className="mt-ph" aria-hidden="true">
            <Icon size={28} />
          </span>
        )}
        {baru ? <span className="mt-new">Baru</span> : null}
      </span>
      <span className="mt-body">
        <span className="mt-meta">
          <Icon size={12} aria-hidden="true" /> {infoMateri(row)}
          {sudah ? (
            <span className="mt-pill read">
              <Check size={11} strokeWidth={3} /> Dibaca
            </span>
          ) : null}
        </span>
        <span className="mt-title">{row.title}</span>
        {row.summary ? <span className="mt-sum">{row.summary}</span> : null}
      </span>
    </button>
  );
}

/** Baris ringkas (artikel & teks siap salin): ikon berwarna kategori, judul, ringkasan, dan keterangan isi. */
function MateriRowItem({ row, baru, sudah, onOpen }: { row: MateriRow; baru: boolean; sudah: boolean; onOpen: () => void }) {
  const KategoriIcon = KATEGORI_ICON[row.category];
  const TipeIcon = TIPE_ICON[row.type];
  return (
    <button type="button" className={`mt-row tone-${MATERI_NADA[row.category]}${sudah ? " done" : ""}`} onClick={onOpen}>
      <span className="mt-row-ic" aria-hidden="true">
        <KategoriIcon size={20} />
      </span>
      <span className="mt-row-txt">
        <span className="mt-row-t">{row.title}</span>
        {row.summary ? <span className="mt-row-s">{row.summary}</span> : null}
        <span className="mt-row-m">
          <span className="mt-info">
            <TipeIcon size={12} aria-hidden="true" /> {infoMateri(row)}
          </span>
          {baru ? <span className="mt-pill new">Baru</span> : null}
          {sudah ? (
            <span className="mt-pill read">
              <Check size={11} strokeWidth={3} /> Dibaca
            </span>
          ) : null}
        </span>
      </span>
      <ChevronRight size={18} className="mt-go" aria-hidden="true" />
    </button>
  );
}

export function MateriDrawer({ row, onClose }: { row: MateriRow | null; onClose: () => void }) {
  return (
    <PanelDetailShell open={!!row} onClose={onClose} tema="mono">
      <style>{RS_DRAWER_CSS}</style>
      <style>{MT_DRAWER_CSS}</style>
      {row ? <DrawerBody key={row.id} row={row} onClose={onClose} /> : null}
    </PanelDetailShell>
  );
}

function DrawerBody({ row, onClose }: { row: MateriRow; onClose: () => void }) {
  const [play, setPlay] = useState(false);
  const ytId = row.type === "video" ? parseYoutubeId(row.video_url) : null;
  const blocks = useMemo(() => (row.type === "artikel" || row.type === "video" || row.type === "galeri" ? parseBodyMateri(row.body) : []), [row]);
  const varian = useMemo(() => (row.type === "teks" ? pisahVarianTeks(row.body) : []), [row]);

  return (
    <div className="rso">
      <div className="rso-head">
        <div>
          <span className="rso-kicker">{kategoriLabel(row.category)}</span>
          <h2>{row.title}</h2>
        </div>
        <button type="button" className="rso-x" onClick={onClose} aria-label="Tutup">
          <X size={16} />
        </button>
      </div>

      <div className="rso-body mtd">
        {ytId ? (
          <div className="mtd-video">
            {play ? (
              <iframe
                src={youtubeEmbedUrl(ytId)}
                title={row.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
              />
            ) : (
              <button type="button" className="mtd-poster" onClick={() => setPlay(true)} aria-label={`Putar video ${row.title}`}>
                <img src={youtubeThumb(ytId)} alt="" />
                <span className="mt-play lg" aria-hidden="true">
                  <Play size={30} fill="currentColor" />
                </span>
              </button>
            )}
          </div>
        ) : null}

        {row.summary ? <p className="mtd-lead">{row.summary}</p> : null}

        {blocks.length > 0 ? (
          <div className="mtd-text">
            {blocks.map((block, index) =>
              block.t === "h" ? (
                <h3 key={index}>{block.text}</h3>
              ) : block.t === "ul" ? (
                <ul key={index}>
                  {block.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p key={index}>{block.text}</p>
              )
            )}
          </div>
        ) : null}

        {varian.map((text, index) => (
          <CopyBlock key={index} text={text} label={varian.length > 1 ? `Pilihan ${index + 1}` : "Teks siap pakai"} />
        ))}

        {row.type === "galeri" ? (
          <div className="mtd-gallery">
            {row.images.map((url, index) => (
              <figure key={url + index}>
                <a href={url} target="_blank" rel="noreferrer" aria-label={`Buka foto ${index + 1}`}>
                  <img src={url} alt={`${row.title} ${index + 1}`} loading="lazy" />
                </a>
                <a className="btn ghost sm" href={unduhUrl(url)} download target="_blank" rel="noreferrer">
                  <Download size={13} /> Unduh
                </a>
              </figure>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CopyBlock({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard diblokir — teks tetap terlihat dan bisa disalin manual */
    }
  };
  return (
    <div className="mtd-copy">
      <div className="mtd-copy-h">
        <span>{label}</span>
        <button type="button" className={copied ? "ok" : ""} onClick={copy}>
          {copied ? <Check size={13} strokeWidth={3} /> : <Copy size={13} />} {copied ? "Tersalin" : "Salin teks"}
        </button>
      </div>
      <pre>{text}</pre>
    </div>
  );
}

/* Gaya isi drawer materi (kerangka & header: RS_DRAWER_CSS / PanelDetailShell). */
const MT_DRAWER_CSS = `
.mtd{gap:12px;padding:12px 12px 20px}
.mtd-video{width:min(100%,calc(66vh * .5625));margin:0 auto;aspect-ratio:9/16;border-radius:18px;overflow:hidden;background:#000;box-shadow:0 10px 30px rgba(17,17,17,.18)}
.mtd-video iframe{display:block;width:100%;height:100%;border:0}
.mtd-poster{position:relative;display:block;width:100%;height:100%;padding:0;border:0;background:#000;cursor:pointer}
.mtd-poster img{display:block;width:100%;height:100%;object-fit:cover}
.mt-play{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.94);color:#111;box-shadow:0 6px 20px rgba(0,0,0,.35)}
.mt-play.lg{width:68px;height:68px;margin:-34px 0 0 -34px}
.mtd-lead{margin:0;font-size:14px;font-weight:700;color:#111;line-height:1.5}
.mtd-text{display:flex;flex-direction:column;gap:10px;background:#fff;border:1px solid #e4e4e0;border-radius:16px;padding:14px}
.mtd-text h3{margin:6px 0 0;font-size:14.5px;font-weight:800;color:#111}
.mtd-text p{margin:0;font-size:13.5px;line-height:1.65;color:#374151}
.mtd-text ul{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px}
.mtd-text li{font-size:13.5px;line-height:1.55;color:#374151}
.mtd-copy{background:#fff;border:1px solid #e4e4e0;border-radius:16px;overflow:hidden}
.mtd-copy-h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;background:#f6f6f4;border-bottom:1px solid #e4e4e0}
.mtd-copy-h span{font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#6b7280}
.mtd-copy-h button{display:inline-flex;align-items:center;gap:5px;min-height:34px;padding:0 12px;border:0;border-radius:10px;background:#111;color:#fff;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer}
.mtd-copy-h button.ok{background:#15803d}
.mtd-copy pre{margin:0;padding:14px;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:13.5px;line-height:1.65;color:#111}
.mtd-gallery{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.mtd-gallery figure{margin:0;display:flex;flex-direction:column;gap:6px}
.mtd-gallery figure > a:first-child{display:block;border-radius:14px;overflow:hidden;background:#f3f3f0;aspect-ratio:4/5}
.mtd-gallery img{display:block;width:100%;height:100%;object-fit:cover}
.mtd-gallery .btn{justify-content:center}
`;

"use client";

/**
 * Beranda panel admin — tampilan dari mockup HTML (samaqu-admin-dashboard-2/pages/index.html),
 * datanya asli dari API ops:
 *   - kartu statistik & "Pesanan terbaru" ← GET /api/ops/transaksi
 *   - "Stok menipis"                      ← GET /api/ops/product-variants
 * Omset mengikuti aturan bersama `SALE_STATUSES` (diproses/dikirim/selesai) seperti dashboard lain.
 */
import { useEffect, useState } from "react";
import { statusLabel, SALE_STATUSES } from "@/lib/transaksi";
import { orderStatusKey } from "@/lib/order-flow";
import { opsGet } from "../panel-api";
import { useWibGreeting, useWibToday, wibDateOffset, dailyIndexForDate } from "../wib-date";
import styles from "../panel.module.css";

const HERO_ART =
  "https://res.cloudinary.com/j4ka1ty6/image/upload/w_440,h_200,c_fill,f_auto,q_auto/v1792159516/1640fd4d-496e-470d-b933-af298a247885.png";

/**
 * Kutipan harian di banner sambutan. Dipilih secara deterministik dari tanggal WIB
 * (`dailyIndexForDate`), jadi tidak acak dan tidak bergantung jumlah kunjungan: semua admin
 * melihat kutipan yang sama pada hari yang sama, dan berganti saat hari WIB berganti.
 */
const dailyQuotes = [
  "Pelan-pelan, yang penting selesai.",
  "Kerja rapi, hati happy.",
  "Satu per satu, semua beres.",
  "Semangat kecil, hasil besar.",
  "Terima kasih sudah teliti hari ini.",
  "Awali hari dengan senyuman.",
  "Sedikit progres tetap berarti.",
  "Rapi datanya, lancar kerjanya.",
  "Fokus hari ini, bangga nanti.",
  "Setiap detail itu berarti.",
  "Kerjakan dengan hati.",
  "Hari baik dimulai dari sini.",
  "Teliti itu bentuk kepedulian.",
  "Kamu hebat sudah sampai sini.",
  "Selesaikan satu, lanjut berikutnya.",
  "Kerja tenang, hasil maksimal.",
  "Hal kecil bikin perbedaan besar.",
  "Jangan lupa istirahat sejenak.",
  "Hari ini kesempatan baru.",
  "Progres lebih penting dari sempurna.",
  "Semoga semua urusan lancar.",
  "Senyum dulu, lanjut lagi.",
  "Teratur hari ini, ringan esok.",
  "Terima kasih sudah berusaha.",
  "Kesalahan kecil, pelajaran besar.",
  "Kerja sama bikin semuanya mudah.",
  "Satu langkah lebih maju.",
  "Jaga kualitas, jaga semangat.",
  "Semua proses punya arti.",
  "Tutup hari dengan rasa syukur.",
];

const rupiah = (n: number) => "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
const sumStock = (m?: Record<string, number> | null) =>
  Object.values(m ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);
const isSale = (status: string) => (SALE_STATUSES as readonly string[]).includes(status);
const STATUS_TONE: Record<string, string> = {
  pending: "#e8890c",
  diproses: "#e8890c",
  dikirim: "#2f9e5b",
  selesai: "#2f9e5b",
  dibatalkan: "#d63340",
};

type TxItem = { product_name?: string; series?: string | null; color?: string | null; size?: string | null };
type TxRow = {
  order_number: string;
  date_wib: string;
  time_wib?: string;
  status: string;
  total: number;
  customer_name?: string;
  qty_total?: number;
  awb_no?: string | null;
  shipping_status?: string | null;
  tracking_status_code?: number | null;
  item_summary?: string;
  items?: TxItem[];
};
type VariantRow = {
  id: string;
  product_name?: string;
  series_name?: string | null;
  color?: string | null;
  stock_efektif?: Record<string, number> | null;
};

type MetricCard = {
  label: string;
  value: string;
  caption: string;
  delta?: string;
  down?: boolean;
  icon: StatIconName;
  /** Warna ikon per kategori (tetap dalam palet tema). */
  iconColor: string;
  /** Warna angka bila memang perlu peringatan. */
  valueColor?: string;
  /** Tooltip untuk memperjelas arti angka. */
  hint?: string;
};

function Heart() {
  return (
    <svg className={styles.heart} viewBox="0 0 24 24">
      <path d="M12 21s-8-5-8-11a4.5 4.5 0 018-3 4.5 4.5 0 018 3c0 6-8 11-8 11z" />
    </svg>
  );
}

function Hand() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M7 11V6a1.5 1.5 0 013 0v4M10 10V4.5a1.5 1.5 0 013 0V10M13 10V5.5a1.5 1.5 0 013 0V11M16 11V8a1.5 1.5 0 013 0v6a7 7 0 01-7 7h-1a6 6 0 01-5-3l-2.5-4a1.5 1.5 0 012.5-1.6L7 14" />
      <path d="M3 4l1.5 1.5M2 8h2" stroke="var(--panel-hand, #f3a7c0)" />
    </svg>
  );
}

type StatIconName = "bag" | "basket" | "truck" | "box";

function StatIcon({ name }: { name: StatIconName }) {
  switch (name) {
    case "bag":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M5 8h14l-1 13H6zM9 8V6a3 3 0 016 0v2" />
        </svg>
      );
    case "basket":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M3 9h18l-2 11H5zM8 9l4-6 4 6" />
        </svg>
      );
    case "truck":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M2 7h12v10H2zM14 10h4l3 3v4h-7" />
          <circle cx="6" cy="18" r="2" />
          <circle cx="17" cy="18" r="2" />
        </svg>
      );
    case "box":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" />
        </svg>
      );
  }
}

function EmptyOrdersArt() {
  return (
    <svg viewBox="0 0 120 90">
      <ellipse cx="60" cy="82" rx="42" ry="6" fill="#fbe3ec" />
      <path d="M22 44l14-24h48l14 24v30a4 4 0 01-4 4H26a4 4 0 01-4-4z" fill="#f9c9d9" />
      <path d="M22 44h26l4 8h16l4-8h26v30a4 4 0 01-4 4H26a4 4 0 01-4-4z" fill="#f4a3be" />
      <rect x="40" y="26" width="40" height="22" rx="3" fill="#fff" />
      <path d="M46 33h28M46 39h18" stroke="#f4a3be" strokeWidth="3" strokeLinecap="round" />
      <path d="M92 12l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#f3a7c0" />
      <circle cx="24" cy="22" r="3" fill="#fbd3e1" />
    </svg>
  );
}

function EmptyStockArt() {
  return (
    <svg viewBox="0 0 120 90">
      <ellipse cx="60" cy="82" rx="42" ry="6" fill="#fbe3ec" />
      <path d="M60 20l32 14v34L60 82 28 68V34z" fill="#f4a3be" />
      <path d="M60 20l32 14-32 14-32-14z" fill="#fbd3e1" />
      <path d="M60 48v34L28 68V34z" fill="#f9c9d9" />
      <path d="M44 27l32 14v10" stroke="#fff" strokeWidth="4" fill="none" />
      <circle cx="92" cy="62" r="13" fill="#2f9e5b" />
      <path d="M86 62l4 4 8-8" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PanelAdminHome() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<TxRow[]>([]);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  // Kunci tanggal WIB hari ini — ikut berubah otomatis saat lewat tengah malam WIB.
  const today = useWibToday();
  const greeting = useWibGreeting();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 60 hari terakhir: cukup untuk pesanan hari ini, "perlu dikirim" yang masih terbuka,
        // dan pembanding kemarin.
        const start = wibDateOffset(-60);
        const end = today;
        const [tx, vr] = await Promise.all([
          opsGet<{ items?: TxRow[] }>(`/api/ops/transaksi?start=${start}&end=${end}`),
          opsGet<{ items?: VariantRow[] }>("/api/ops/product-variants"),
        ]);
        if (cancelled) return;
        setOrders(Array.isArray(tx.items) ? tx.items : []);
        setVariants(Array.isArray(vr.items) ? vr.items : []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Gagal memuat data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [today]);

  const yesterday = wibDateOffset(-1);
  const quote = dailyQuotes[dailyIndexForDate(today, dailyQuotes.length)];

  const todayOrders = orders.filter((o) => o.date_wib === today);
  const yestOrders = orders.filter((o) => o.date_wib === yesterday);
  const omsetToday = todayOrders.filter((o) => isSale(o.status)).reduce((a, o) => a + (Number(o.total) || 0), 0);
  const omsetYest = yestOrders.filter((o) => isSale(o.status)).reduce((a, o) => a + (Number(o.total) || 0), 0);
  const deltaOmset = omsetYest > 0 ? Math.round(((omsetToday - omsetYest) / omsetYest) * 100) : omsetToday > 0 ? 100 : 0;
  const deltaMasuk =
    yestOrders.length > 0 ? Math.round(((todayOrders.length - yestOrders.length) / yestOrders.length) * 100) : todayOrders.length > 0 ? 100 : 0;

  const perluDikirim = orders.filter((o) => o.status === "diproses" && !o.awb_no).length;
  const lowStock = variants.filter((v) => {
    const total = sumStock(v.stock_efektif);
    return total > 0 && total <= 5;
  });

  const latest = [...orders]
    .sort((a, b) => `${b.date_wib} ${b.time_wib ?? ""}`.localeCompare(`${a.date_wib} ${a.time_wib ?? ""}`))
    .slice(0, 5);

  const metrics: MetricCard[] = [
    {
      label: "Omset hari ini",
      value: rupiah(omsetToday),
      caption: "Dari kemarin",
      delta: `${deltaOmset >= 0 ? "↗" : "↘"} ${Math.abs(deltaOmset)}%`,
      down: deltaOmset < 0,
      icon: "bag",
      iconColor: "var(--panel-metric-revenue, currentColor)",
    },
    {
      label: "Pesanan masuk",
      value: String(todayOrders.length),
      caption: "Hari ini",
      delta: `${deltaMasuk >= 0 ? "↗" : "↘"} ${Math.abs(deltaMasuk)}%`,
      down: deltaMasuk < 0,
      icon: "basket",
      iconColor: "var(--panel-metric-orders, currentColor)",
    },
    {
      label: "Perlu dikirim",
      value: String(perluDikirim),
      caption: "Menunggu resi",
      icon: "truck",
      iconColor: "var(--panel-metric-shipping, currentColor)",
    },
    {
      label: "Varian menipis",
      value: String(lowStock.length),
      caption: "Sisa stok 1–5 unit",
      icon: "box",
      iconColor: lowStock.length > 0
        ? "var(--panel-metric-stock, currentColor)"
        : "var(--panel-metric-stock-idle, currentColor)",
      valueColor: lowStock.length > 0 ? "var(--panel-metric-stock, inherit)" : undefined,
      hint: `${lowStock.length} varian dengan sisa stok 1–5 unit (bukan jumlah unit fisik)`,
    },
  ];

  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <h2 className={styles.heroTitle}>
            <span>
              {greeting}, <span className={styles.heroName}>Lea</span>
            </span>
            <Hand />
          </h2>
          <p className={styles.heroSub}>
            {quote} <Heart />
          </p>
        </div>
        <img className={styles.heroArt} src={HERO_ART} alt="" />
        <div className={styles.quote}>Terima kasih sudah menjadi bagian dari SAMAQU.</div>
      </section>

      {error ? <div className={styles.alert}>{error}</div> : null}

      <section className={styles.stats}>
        {metrics.map((m) => (
          <div key={m.label} className={styles.card} title={m.hint}>
            <div className={styles.stHead}>
              <span className={styles.stIcon} style={{ color: m.iconColor }}>
                <StatIcon name={m.icon} />
              </span>
              <span className={styles.stLabel}>{m.label}</span>
            </div>
            <div className={styles.stValue} style={m.valueColor ? { color: m.valueColor } : undefined}>
              {loading ? "—" : m.value}
            </div>
            <div className={styles.stFoot}>
              {m.delta ? (
                <span
                  className={styles.delta}
                  style={
                    m.down
                      ? { background: "var(--panel-down-bg, #fdecec)", color: "var(--panel-down-fg, #c2255c)" }
                      : { background: "var(--panel-up-bg, #e3f7ea)", color: "var(--panel-up-fg, #2f9e5b)" }
                  }
                >
                  {m.delta}
                </span>
              ) : null}
              <span>{m.caption}</span>
            </div>
          </div>
        ))}
      </section>

      <section className={styles.grid2}>
        <div className={styles.card}>
          <div className={styles.ph}>
            <div
              className={styles.ic}
              style={{ background: "var(--panel-soon-bg, #fde4ec)", color: "var(--panel-soon-fg, #d6336c)" }}
            >
              <StatIcon name="bag" />
            </div>
            <div>
              <b>Pesanan terbaru</b>
              <small>Pesanan terakhir dari semua sumber.</small>
            </div>
            <span className={styles.all}>Lihat semua ›</span>
          </div>

          {loading ? (
            <div className={styles.empty}>
              <p>Memuat pesanan…</p>
            </div>
          ) : latest.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyBox}>
                <EmptyOrdersArt />
              </div>
              <b>Belum ada pesanan</b>
              <p>Pesanan akan muncul di sini begitu ada transaksi.</p>
              <button className={styles.btn}>+&nbsp;&nbsp;Buat Pesanan Baru</button>
            </div>
          ) : (
            <div className={styles.list}>
              {latest.map((o) => (
                <div key={o.order_number} className={styles.listRow}>
                  <div className={styles.listMain}>
                    <b>{o.order_number}</b>
                    <small>
                      {o.customer_name || "-"}
                      {o.item_summary ? ` · ${o.item_summary}` : ""}
                    </small>
                  </div>
                  <div className={styles.listVal}>
                    {rupiah(o.total)}
                    <small style={{ color: STATUS_TONE[orderStatusKey(o)] ?? "var(--mut)" }}>
                      {statusLabel(orderStatusKey(o))}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.ph}>
            <div className={styles.ic} style={{ background: "#fff1db", color: "#e8890c" }}>
              <StatIcon name="box" />
            </div>
            <div>
              <b>Stok menipis</b>
              <small>Varian dengan sisa stok ≤ 5 unit.</small>
            </div>
            <span className={styles.all}>Lihat semua ›</span>
          </div>

          {loading ? (
            <div className={styles.empty}>
              <p>Memuat stok…</p>
            </div>
          ) : lowStock.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyBox}>
                <EmptyStockArt />
              </div>
              <b>Semua stok aman</b>
              <p>Tidak ada varian yang perlu segera diisi ulang.</p>
            </div>
          ) : (
            <div className={styles.list}>
              {lowStock.slice(0, 5).map((v) => {
                const parts = [v.series_name, v.color && v.color !== "default" ? v.color : null].filter(Boolean).join(" · ");
                return (
                  <div key={v.id} className={styles.listRow}>
                    <div className={styles.listMain}>
                      <b>{v.product_name || v.id}</b>
                      <small>{parts || "-"}</small>
                    </div>
                    <div className={styles.listVal} style={{ color: "var(--panel-danger, #e8365d)" }}>
                      {sumStock(v.stock_efektif)} unit
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

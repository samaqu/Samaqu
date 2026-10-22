"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon } from "./icons";
import { money, num } from "@/lib/affiliate/format";

/**
 * Primitif UI portal Affiliate.
 *
 * Struktur & class name-nya PERSIS mengikuti mockup
 * ("Mockup Affliate/SAMAQU-Affiliate-Center.html") supaya tampilannya sama.
 */

/* ── Badge ─────────────────────────────────────────────────────────── */

const BADGE_TONE: Record<string, string> = {
  Selesai: "ok",
  Disetujui: "ok",
  Dibayarkan: "pri",
  Berhasil: "ok",
  Aktif: "ok",
  "Affiliate Aktif": "ok",
  Dikirim: "info",
  Diproses: "info",
  "Menunggu Pembayaran": "warn",
  "Menunggu Validasi": "warn",
  Menunggu: "warn",
  Dibatalkan: "err",
  Diretur: "err",
  "Tidak Disetujui": "err",
  Ditolak: "err",
  "Tidak Dipromosikan": "gray",
  "Dibatalkan Affiliate": "gray",
  "Aktif Dipromosikan": "ok",
  Tersedia: "ok",
  "Stok Terbatas": "warn",
  Habis: "err",
};

export function Badge({ label }: { label: string }) {
  const tone = BADGE_TONE[label] || "gray";
  return <span className={`badge b-${tone}`}>{label}</span>;
}

/* ── Stat card ─────────────────────────────────────────────────────── */

export function Stat({
  icon,
  label,
  value,
  sub,
  delta,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  delta?: number;
}) {
  return (
    <div className="card stat">
      <div className="top">
        <div className="lb">{label}</div>
        <div className="ic">
          <Icon name={icon} />
        </div>
      </div>
      <div className="v">{value}</div>
      <div className="row between" style={{ marginTop: 6 }}>
        <div className="sub">{sub || ""}</div>
        {delta === undefined ? null : (
          <span className={`delta ${delta >= 0 ? "up" : "dn"}`}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Tabs ──────────────────────────────────────────────────────────── */

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: [string, string, number?][];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="tabs">
      {items.map(([v, l, c]) => (
        <button
          key={v}
          className={`tab ${v === value ? "on" : ""}`}
          onClick={() => onChange(v)}
          type="button"
        >
          {l}
          {c !== undefined ? <span className="c">{c}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ── Segmented control ─────────────────────────────────────────────── */

export function Seg({
  items,
  value,
  onChange,
}: {
  items: [string, string][];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="seg">
      {items.map(([v, l]) => (
        <button
          key={v}
          className={v === value ? "on" : ""}
          onClick={() => onChange(v)}
          type="button"
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/* ── Search ────────────────────────────────────────────────────────── */

export function Search({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="search">
      <Icon name="search" className="sm" />
      <input
        className="inp"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

/* ── Select ────────────────────────────────────────────────────────── */

export function Select({
  value,
  onChange,
  options,
  style,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: (string | [string, string])[];
  style?: React.CSSProperties;
  disabled?: boolean;
}) {
  return (
    <select
      className="sel"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={style}
      disabled={disabled}
    >
      {options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        return (
          <option key={v} value={v}>
            {l}
          </option>
        );
      })}
    </select>
  );
}

/* ── Field ─────────────────────────────────────────────────────────── */

export function Field({
  label,
  children,
  error,
  help,
}: {
  label: string;
  children: ReactNode;
  error?: string;
  help?: string;
}) {
  return (
    <div className="fg">
      <label className="fl">{label}</label>
      {children}
      {error ? <div className="fe">{error}</div> : help ? <div className="fh">{help}</div> : null}
    </div>
  );
}

/* ── Empty state ───────────────────────────────────────────────────── */

export function Empty({
  icon = "search",
  title,
  text,
  action,
}: {
  icon?: string;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="ei">
        <Icon name={icon} className="lg" />
      </div>
      <div className="b dark">{title}</div>
      {text ? <div className="small" style={{ marginTop: 4 }}>{text}</div> : null}
      {action ? <div className="mt">{action}</div> : null}
    </div>
  );
}

/* ── Tabel ─────────────────────────────────────────────────────────── */

export interface Column<T> {
  label: string;
  render: (row: T) => ReactNode;
  num?: boolean;
  className?: string;
}

export function Table<T>({
  columns,
  rows,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: ReactNode;
}) {
  if (!rows.length) return <>{empty ?? <Empty title="Data tidak ditemukan" />}</>;
  return (
    <div className="tw">
      <table className="t">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={c.num ? "num" : ""}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {columns.map((c, i) => (
                <td key={i} className={c.num ? "num" : ""}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Pager ─────────────────────────────────────────────────────────── */

export function Pager({
  page,
  pages,
  total,
  size,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  size: number;
  onPage: (page: number) => void;
}) {
  if (pages <= 1) return null;
  const buttons: (number | "…")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) buttons.push(i);
    else if (buttons[buttons.length - 1] !== "…") buttons.push("…");
  }

  return (
    <div className="pg">
      <div className="small muted">
        Menampilkan {(page - 1) * size + 1}–{Math.min(page * size, total)} dari {total} data
      </div>
      <div className="ps">
        <button onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Sebelumnya">
          ‹
        </button>
        {buttons.map((b, i) =>
          b === "…" ? (
            <button key={`e${i}`} disabled>
              …
            </button>
          ) : (
            <button key={b} className={b === page ? "on" : ""} onClick={() => onPage(b)}>
              {b}
            </button>
          ),
        )}
        <button onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Berikutnya">
          ›
        </button>
      </div>
    </div>
  );
}

/** Helper untuk state pagination di halaman. */
export function paginate<T>(items: T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return {
    rows: items.slice((current - 1) * size, current * size),
    page: current,
    pages,
    total: items.length,
    size,
  };
}

/* ── Produk mini ───────────────────────────────────────────────────── */

export function ProductCell({
  name,
  category,
  image,
  size = 42,
}: {
  name: string;
  category?: string;
  image?: string | null;
  size?: number;
}) {
  return (
    <div className="row">
      {image ? (
        <img className="thumb" style={{ width: size, height: size }} src={image} alt="" />
      ) : (
        <div
          className="thumb"
          style={{ width: size, height: size, display: "grid", placeItems: "center" }}
        >
          <Icon name="bag" className="sm" />
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div className="b dark" style={{ whiteSpace: "normal", maxWidth: 240 }}>
          {name}
        </div>
        {category ? <div className="small muted">{category}</div> : null}
      </div>
    </div>
  );
}

/* ── Modal ─────────────────────────────────────────────────────────── */

export interface ModalContent {
  title: string;
  body: ReactNode;
  foot?: ReactNode;
  size?: "sm" | "lg" | "";
}

const ModalContext = createContext<{
  open: (content: ModalContent) => void;
  close: () => void;
} | null>(null);

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error("useModal harus dipakai di dalam <ModalProvider>");
  return ctx;
}

export function ModalProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ModalContent | null>(null);

  const close = useCallback(() => setContent(null), []);
  const open = useCallback((next: ModalContent) => setContent(next), []);

  useEffect(() => {
    document.body.style.overflow = content ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [content]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContent(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <ModalContext.Provider value={{ open, close }}>
      {children}
      {content ? (
        <div className="af-root">
          <div className="mbg" onClick={(e) => e.target === e.currentTarget && close()}>
            <div className={`md ${content.size || ""}`} role="dialog" aria-modal="true">
              <div className="mh">
                <h3>{content.title}</h3>
                <button className="iconbtn" onClick={close} aria-label="Tutup" type="button">
                  <Icon name="x" />
                </button>
              </div>
              <div className="mb">{content.body}</div>
              {content.foot ? <div className="mf">{content.foot}</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </ModalContext.Provider>
  );
}

/* ── Toast ─────────────────────────────────────────────────────────── */

interface ToastItem {
  id: number;
  message: string;
  type: "ok" | "err" | "info";
}

const ToastContext = createContext<{
  toast: (message: string, type?: "ok" | "err" | "info") => void;
} | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast harus dipakai di dalam <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const toast = useCallback((message: string, type: "ok" | "err" | "info" = "ok") => {
    const id = ++seq.current;
    setItems((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="af-root">
        <div className="toasts" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className={`toast ${t.type}`}>
              <Icon name={t.type === "ok" ? "cc" : t.type === "err" ? "xc" : "info"} className="sm" />
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

/* ── Copy link ─────────────────────────────────────────────────────── */

export function CopyButton({ value, label = "Salin" }: { value: string; label?: string }) {
  const { toast } = useToast();

  const copy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement("textarea");
        ta.value = value;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      toast("Tautan berhasil disalin");
    } catch {
      toast("Gagal menyalin tautan", "err");
    }
  };

  return (
    <button className="btn s sm" onClick={copy} type="button">
      <Icon name="copy" className="sm" />
      {label}
    </button>
  );
}

/* ── Helpers tampilan ──────────────────────────────────────────────── */

export function moneyText(value: number | null | undefined) {
  return money(value);
}

export function numText(value: number | null | undefined) {
  return num(value);
}

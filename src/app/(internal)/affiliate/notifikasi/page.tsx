"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/affiliate/icons";
import { Empty, Tabs } from "@/components/affiliate/ui";
import { affiliateFetch } from "@/lib/affiliate/client";
import { jam } from "@/lib/affiliate/format";

/**
 * Pusat Notifikasi — notifikasi dibangun dari data nyata (pesanan, komisi,
 * pencairan). Status "sudah dibaca" disimpan di localStorage per perangkat.
 */

interface NotificationRow {
  id: string;
  cat: string;
  title: string;
  body: string;
  to: string;
  date: string;
}

const READ_KEY = "sq_af_read";

const CAT_ICON: Record<string, string> = {
  Pesanan: "receipt",
  Komisi: "coins",
  Penarikan: "cash",
  Produk: "bag",
  "Informasi Sistem": "info",
};

export default function AffiliateNotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [cat, setCat] = useState("");
  const [read, setRead] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const json = await affiliateFetch<{ notifications: NotificationRow[] }>(
          "/api/affiliate/notifications",
        );
        if (!alive) return;
        setNotifications(json.notifications || []);
        try {
          setRead(JSON.parse(localStorage.getItem(READ_KEY) || "[]"));
        } catch {
          setRead([]);
        }
      } catch (e) {
        console.error("[AFFILIATE] Gagal memuat notifikasi:", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const saveRead = (ids: string[]) => {
    setRead(ids);
    try {
      localStorage.setItem(READ_KEY, JSON.stringify(ids));
    } catch {
      /* abaikan */
    }
  };

  const list = useMemo(
    () =>
      notifications.filter((n) => {
        if (tab === "unread" && read.includes(n.id)) return false;
        if (cat && n.cat !== cat) return false;
        return true;
      }),
    [notifications, tab, cat, read],
  );

  const unreadCount = notifications.filter((n) => !read.includes(n.id)).length;

  return (
    <div className="card">
      <div className="ch">
        <div>
          <h3>Notifikasi</h3>
          <p>{unreadCount} belum dibaca</p>
        </div>
        <button
          className="btn s sm"
          onClick={() => saveRead(notifications.map((n) => n.id))}
          disabled={!unreadCount}
          type="button"
        >
          <Icon name="check" className="sm" />
          Tandai semua sudah dibaca
        </button>
      </div>

      <div style={{ padding: "0 16px" }}>
        <Tabs
          items={[
            ["all", "Semua", notifications.length],
            ["unread", "Belum Dibaca", unreadCount],
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      <div className="filters">
        <div className="row wrap" style={{ gap: 6 }}>
          <button className={`chip ${!cat ? "on" : ""}`} onClick={() => setCat("")} type="button">
            Semua Kategori
          </button>
          {Object.keys(CAT_ICON).map((c) => (
            <button
              key={c}
              className={`chip ${cat === c ? "on" : ""}`}
              onClick={() => setCat(c)}
              type="button"
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="cp muted small">Memuat notifikasi…</div>
      ) : list.length === 0 ? (
        <Empty icon="bell" title="Tidak ada notifikasi" text="Semua notifikasi sudah kamu baca." />
      ) : (
        list.map((n) => {
          const isRead = read.includes(n.id);
          return (
            <div className="list-i" key={n.id} style={isRead ? undefined : { background: "#F9FAFB" }}>
              <div className="aic">
                <Icon name={CAT_ICON[n.cat] || "info"} className="sm" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}>
                  <b className="dark">{n.title}</b>
                  {isRead ? null : (
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--af-pri)" }} />
                  )}
                </div>
                <div className="small muted" style={{ marginTop: 2, lineHeight: 1.5 }}>
                  {n.body}
                </div>
                <div className="small" style={{ color: "#9CA3AF", marginTop: 4 }}>
                  {n.cat} · {jam(n.date)}
                </div>
              </div>
              <div className="row" style={{ gap: 4 }}>
                {isRead ? null : (
                  <button
                    className="btn s sm"
                    onClick={() => saveRead([...read, n.id])}
                    title="Tandai sudah dibaca"
                    type="button"
                  >
                    <Icon name="check" className="sm" />
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

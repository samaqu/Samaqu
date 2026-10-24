"use client";

/**
 * Halaman "Transaksi" dashboard internal (/ops).
 *
 * Tata letaknya memakai layout menu Transaksi panel admin (KPI, tab tahap, filter
 * "belum di packing", pencarian, navigasi bulan, filter tanggal/sumber) tetapi dengan
 * tema dashboard ops (putih/slate + aksen biru), bukan tema berry panel.
 *
 * Datanya BUKAN tabel baru: baris di sini adalah pesanan di tabel `orders` yang sama
 * dengan website (jadi penjualan dari checkout otomatis muncul), ditambah transaksi
 * manual yang dicatat lewat tombol "Tambah Transaksi".
 */

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { base44 } from "@/lib/ops-api";
import { SALE_BASIS_NOTE, SALE_STATUSES, orderRevenue, saleCount } from "@/lib/transaksi";
import { ORDER_STAGE_TABS, matchesStage, orderStage } from "@/lib/order-flow";
import DateFilter from "@/components/ops/leads/DateFilter";
import ConfirmDeleteModal from "@/components/ops/ConfirmDeleteModal";
import TransaksiFormModal from "@/components/ops/transaksi/TransaksiFormModal";
import TransaksiDetailDrawer from "@/components/ops/transaksi/TransaksiDetailDrawer";
import StageIcon from "@/components/ops/transaksi/StageIcon";
import AnimatedNumber from "@/components/AnimatedNumber";
import { MONTHS, SOURCE_STYLES, formatRupiah, formatTanggalSingkatID, itemVariantText, pad } from "@/components/ops/transaksi/transaksi-format";
import { useToast } from "@/components/ops/ui/use-toast";
import "@/app/panel-admin/panel-transaksi.css";
import "@/app/ops/ops-transaksi.css";

const digits = (value) => String(value ?? "").replace(/\D/g, "");
/** Bandingkan nomor HP tanpa peduli 08… / 628… / 8…. */
const phoneKey = (value) => digits(value).replace(/^0+/, "").replace(/^62/, "");

export default function Transaksi({ variant = "ops" }) {
  // `variant="panel"` merender tampilan ala mockup (panel admin). Default "ops" = tak berubah.
  const isPanel = variant === "panel";
  const now = new Date();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [searchInput, setSearchInput] = useState("");
  const search = useDeferredValue(searchInput).trim();
  const [sourceFilter, setSourceFilter] = useState("all");
  // Filter TAHAP (`order-flow`: Belum Bayar / Belum di Packing / …).
  const [stageFilter, setStageFilter] = useState("semua");

  // Filter TANGGAL (satu hari, WIB) — disimpan di URL seperti halaman Leads.
  const [selectedDate, setSelectedDate] = useState("");
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("tanggal") || "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(param)) {
      setSelectedDate(param);
      setYear(Number(param.slice(0, 4)));
      setMonth(Number(param.slice(5, 7)) - 1);
    }
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (selectedDate) params.set("tanggal", selectedDate);
    else params.delete("tanggal");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [selectedDate]);

  const start = `${year}-${pad(month + 1)}-01`;
  const end = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["transaksi", "orders", start, end],
    queryFn: () => base44.entities.Transaction.orders({ start, end }),
    initialData: [],
  });

  const visibleOrders = useMemo(() => {
    const query = search.toLowerCase();
    const queryPhone = phoneKey(search);
    return orders.filter((order) => {
      if (sourceFilter !== "all" && (order.source_key || order.source) !== sourceFilter) return false;
      // Saring per TAHAP (order-flow, sama seperti halaman Pesanan admin).
      if (!matchesStage(order, stageFilter)) return false;
      if (selectedDate && order.date_wib !== selectedDate) return false;
      if (!query) return true;
      if (String(order.customer_name || "").toLowerCase().includes(query)) return true;
      if (String(order.order_number || "").toLowerCase().includes(query)) return true;
      if (String(order.customer_whatsapp || "").includes(search)) return true;
      // Cari juga lewat isi kolom Produk (nama produk + kain/series/ukuran) — sumber datanya
      // sama dengan kolom itu, jadi yang terlihat di tabel itulah yang bisa dicari.
      if ((order.items || []).some((item) => `${item.product_name || ""} ${itemVariantText(item)}`.toLowerCase().includes(query))) return true;
      return queryPhone.length >= 4 && phoneKey(order.customer_whatsapp).includes(queryPhone);
    });
  }, [orders, search, sourceFilter, stageFilter, selectedDate]);

  // Opsi filter diambil dari data yang benar-benar ada di bulan itu.
  const sourceOptions = useMemo(() => [...new Set(orders.map((o) => o.source_key || o.source))], [orders]);

  const markedDates = useMemo(() => [...new Set(orders.map((o) => o.date_wib).filter(Boolean))], [orders]);

  // Kolom HPP hanya dirender kalau server mengirim data HPP (Owner).
  const hppVisible = orders.some((order) => order.hpp_visible);

  const filtersActive =
    Boolean(search) ||
    sourceFilter !== "all" ||
    stageFilter !== "semua" ||
    Boolean(selectedDate);

  const resetFilters = () => {
    setSearchInput("");
    setSourceFilter("all");
    setStageFilter("semua");
    setSelectedDate("");
  };

  const prevMonth = () => {
    setSelectedDate("");
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else setMonth(month - 1);
  };
  const nextMonth = () => {
    setSelectedDate("");
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else setMonth(month + 1);
  };

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const cancelMutation = useMutation({
    mutationFn: (order) => base44.entities.Transaction.cancel(order.order_number),
    onSuccess: (result) => {
      // Stok dikembalikan oleh jalur pembatalan yang sama dengan panel admin.
      queryClient.invalidateQueries({ queryKey: ["transaksi"] });
      toast({ title: "✅ Transaksi dibatalkan", description: `No. Order ${result?.order_number ?? ""}`, variant: "success" });
      setCancelTarget(null);
      setDetail(null);
    },
    onError: (error) =>
      toast({
        title: "Gagal membatalkan",
        description: error instanceof Error ? error.message : "Coba lagi.",
        variant: "destructive",
      }),
  });

  /**
   * Hapus transaksi manual (untuk membuang data uji). Server menolak kalau pesanan sudah punya
   * resi J&T atau kalau itu pesanan website, dan mengembalikan stok lebih dulu.
   */
  const deleteMutation = useMutation({
    mutationFn: (order) => base44.entities.Transaction.deleteOrder(order.order_number),
    onSuccess: (result, order) => {
      queryClient.invalidateQueries({ queryKey: ["transaksi"] });
      setDeleteTarget(null);
      setDetail((current) => (current?.order_number === order.order_number ? null : current));
      toast({
        title: "✅ Transaksi dihapus",
        description: `${result?.order_number || order.order_number} · stok sudah dikembalikan`,
        variant: "success",
      });
    },
    onError: (error) =>
      toast({
        title: "Gagal menghapus",
        description: error instanceof Error ? error.message : "Coba lagi.",
        variant: "destructive",
      }),
  });

  /**
   * Setelah aksi resi di drawer Detail:
   * - sukses → baris yang sedang dibuka langsung diperbarui (nomor resi + status kirim), lalu
   *   daftar disegarkan supaya penanda resi muncul tanpa reload;
   * - kondisi "resi terbit tapi gagal dicatat" → data transaksi diambil ulang dari server
   *   supaya admin melihat kondisi sebenarnya.
   */
  const handleResiCreated = async (patch, refreshFromServer = false) => {
    if (patch && !refreshFromServer) {
      setDetail((current) => (current ? { ...current, ...patch } : current));
      // Perbarui baris tabel SEKARANG, tanpa menunggu refetch. Dulu tabel baru berubah
      // setelah reload karena cache daftar masih dianggap segar (staleTime 60 detik).
      queryClient.setQueryData(["transaksi", "orders", start, end], (rows) =>
        Array.isArray(rows)
          ? rows.map((row) => (row.order_number === detail?.order_number ? { ...row, ...patch } : row))
          : rows,
      );
    }
    try {
      // `staleTime: 0` memaksa ambil data server — bukan mengembalikan cache yang masih segar.
      const fresh = await queryClient.fetchQuery({ queryKey: ["transaksi", "orders", start, end], staleTime: 0 });
      if (refreshFromServer) {
        const found = (fresh || []).find((row) => row.order_number === detail?.order_number);
        if (found) setDetail(found);
      }
    } catch {
      // daftar tetap disegarkan lewat invalidasi di bawah
    }
    queryClient.invalidateQueries({ queryKey: ["transaksi"] });
  };

  // ── Data KPI tampilan transaksi ──
  // KPI dihitung dari SELURUH data bulan (bukan hasil filter) — sama seperti mockup.
  // Omset tetap memakai aturan `SALE_STATUSES` (bukan sekadar "bukan batal") supaya angkanya
  // sama dengan menu lain, bukan angka karangan.
  //
  // Jumlah TRANSAKSI memakai aturan bersama `saleCount()` (diproses/dikirim/selesai) — sama angka
  // dengan kartu "Total Transaksi" di dashboard ops dan "N transaksi" di Laporan Keuangan. Dulu
  // kartu ini menghitung SEMUA baris bulan itu, termasuk yang belum bayar & dibatalkan, jadi
  // angkanya beda sendiri dari layar lain.
  const panelKpis = useMemo(() => {
    const sold = orders.filter((order) => SALE_STATUSES.includes(order.status));
    return {
      total: saleCount(orders),
      revenue: sold.reduce((sum, order) => sum + orderRevenue(order), 0),
      unpaid: orders.filter((order) => orderStage(order) === "belum_bayar").length,
      toProcess: orders.filter((order) => orderStage(order) === "belum_dipacking" || orderStage(order) === "sudah_dipacking").length,
    };
  }, [orders]);

  // Tab = TAHAP resmi aplikasi (`ORDER_STAGE_TABS` order-flow — SAMA dengan halaman Pesanan admin):
  // Semua · Belum Bayar · Menunggu Pickup · Dikirim · Selesai · Dibatalkan.
  // "Belum di Packing" tetap jadi filter cepat di bar bawah (sub-status pesanan `diproses`).
  const stageTabs = useMemo(
    () =>
      ORDER_STAGE_TABS.map((tab) => ({
        ...tab,
        count: tab.key === "semua" ? orders.length : orders.filter((order) => orderStage(order) === tab.key).length,
      })),
    [orders],
  );

  // Warna badge STATUS pesanan (bukan tahap packing) untuk tabel panel.
  const PANEL_STATUS_COLOR = { pending: "bayar", diproses: "siap", dikirim: "kirim", selesai: "selesai", dibatalkan: "batal" };

  // Modal/overlay dipakai bersama oleh tampilan ops & panel supaya tidak ada logika kembar.
  const overlays = (
    <>
      <TransaksiFormModal
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        initialData={editing}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["transaksi"] })}
        variant={isPanel ? "panel" : "ops"}
      />

      <TransaksiDetailDrawer
        open={!!detail}
        order={detail}
        variant="panel"
        onResiCreated={handleResiCreated}
        onClose={() => setDetail(null)}
        onEdit={(order) => {
          setDetail(null);
          setEditing(order);
          setFormOpen(true);
        }}
        onCancel={(order) => setCancelTarget(order)}
        onDelete={(order) => setDeleteTarget(order)}
      />

      <ConfirmDeleteModal
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelMutation.mutate(cancelTarget)}
        title="Batalkan transaksi ini?"
        itemName={cancelTarget ? `${cancelTarget.order_number} · ${cancelTarget.customer_name}` : undefined}
        message={
          cancelTarget?.awb_no
            ? `Resi J&T ${cancelTarget.awb_no} akan dibatalkan (void) LEBIH DULU di J&T. Kalau paketnya sudah dijemput/diproses J&T, pembatalan akan ditolak dan stok tidak dikembalikan.`
            : "Stok produk dikembalikan kalau pesanannya belum dikirim."
        }
        confirmLabel="Batalkan"
        busyLabel="Membatalkan..."
        isDeleting={cancelMutation.isPending}
      />

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget)}
        title="Hapus transaksi ini?"
        itemName={deleteTarget ? `${deleteTarget.order_number} · ${deleteTarget.customer_name}` : undefined}
        message={
          deleteTarget?.awb_no
            ? "Transaksi, produk, dan riwayat resinya dihapus permanen. Resinya sudah di-void saat pembatalan — kalau ragu, cek dulu di J&T. Tindakan ini tidak bisa dibatalkan."
            : "Transaksi dan produknya dihapus permanen, dan stok dikembalikan lebih dulu. Tindakan ini tidak bisa dibatalkan."
        }
        confirmLabel="Hapus"
        busyLabel="Menghapus..."
        isDeleting={deleteMutation.isPending}
      />
    </>
  );

  return (
    <div className={isPanel ? undefined : "ops-tx"}>
        <section className="ks">
          <div className="card k">
            <small>Total transaksi</small>
            <b><AnimatedNumber value={isLoading ? 0 : panelKpis.total} /></b>
            {/* Keterangan kartu (permintaan pemilik 2026-10-24): angka besar = transaksi diakui
                (`saleCount`), jadi keterangannya menyebut status yang TIDAK dihitung —
                `SALE_BASIS_NOTE` ("Di luar batal & belum bayar"), kalimat yang sama di dashboard
                admin, panel Order Management, dan beranda panel admin. Keterangan ini selalu
                tampil (tidak berganti jadi teks loading). */}
            <i>{SALE_BASIS_NOTE}</i>
          </div>
          <div className="card k">
            <small>Omset bulan ini</small>
            <b><AnimatedNumber value={isLoading ? 0 : panelKpis.revenue} format={(n) => `Rp ${formatRupiah(n)}`} /></b>
            <i>Tidak termasuk dibatalkan</i>
          </div>
          <div className="card k">
            <small>Belum bayar</small>
            <b style={{ color: "#c76f00" }}><AnimatedNumber value={isLoading ? 0 : panelKpis.unpaid} /></b>
            <i>Perlu follow-up</i>
          </div>
          <div className="card k">
            <small>Perlu diproses</small>
            <b style={{ color: "#2e64c9" }}><AnimatedNumber value={isLoading ? 0 : panelKpis.toProcess} /></b>
            <i>Packing + siap kirim</i>
          </div>
        </section>

        <div className="bar">
          <div className="tabs">
            {stageTabs.filter((tab) => tab.key !== "belum_dipacking").map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`tab${stageFilter === tab.key ? " on" : ""}`}
                onClick={() => setStageFilter(tab.key)}
              >
                <span className="ti">
                  <StageIcon stage={tab.key} />
                </span>
                <span className="tl2">{tab.label}</span>
                <em>{tab.count}</em>
              </button>
            ))}
          </div>

          <div className="f">
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Cari nama / nomor HP / No. Order..."
              aria-label="Cari transaksi"
            />
            {/* Filter cepat khusus admin: antrean pesanan yang belum dipacking.
                Bukan tab — packing adalah sub-status dari pesanan `diproses`. */}
            <button
              type="button"
              className={`packf${stageFilter === "belum_dipacking" ? " on" : ""}`}
              onClick={() => setStageFilter((current) => (current === "belum_dipacking" ? "semua" : "belum_dipacking"))}
              aria-pressed={stageFilter === "belum_dipacking"}
              title="Tampilkan hanya pesanan yang belum dipacking"
            >
              Belum di packing
              <em>{stageTabs.find((tab) => tab.key === "belum_dipacking")?.count ?? 0}</em>
            </button>
            <div className="ptx-month">
              <button type="button" onClick={prevMonth} aria-label="Bulan sebelumnya">
                ‹
              </button>
              <b>
                {MONTHS[month]} {year}
              </b>
              <button type="button" onClick={nextMonth} aria-label="Bulan berikutnya">
                ›
              </button>
            </div>
            <DateFilter
              value={selectedDate}
              onChange={setSelectedDate}
              month={month}
              year={year}
              onMonthChange={(nextYear, nextMonthIndex) => {
                setYear(nextYear);
                setMonth(nextMonthIndex);
              }}
              markedDates={markedDates}
              markedLabel="ada transaksi"
            />
            <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} aria-label="Filter sumber">
              <option value="all">Semua sumber</option>
              {sourceOptions.map((source) => (
                <option key={source} value={source}>
                  {SOURCE_STYLES[source]?.label || source}
                </option>
              ))}
            </select>
            {filtersActive ? (
              <button type="button" className="btn-sec" onClick={resetFilters}>
                Reset
              </button>
            ) : null}
            <button
              type="button"
              className="btn"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Tambah Transaksi
            </button>
          </div>
        </div>

        <div className="card tw">
          {isLoading ? (
            <div style={{ padding: 48, textAlign: "center", color: "#8a7d83" }}>Memuat…</div>
          ) : visibleOrders.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "#8a7d83" }}>
              <b style={{ color: "#2a1a22" }}>
                {filtersActive ? "Tidak ada transaksi yang cocok" : `Belum ada transaksi di ${MONTHS[month]} ${year}`}
              </b>
              <p style={{ fontSize: 13, marginTop: 4 }}>
                {filtersActive ? "Ubah pencarian atau filter, atau tampilkan semua." : 'Klik "Tambah Transaksi" untuk mencatat penjualan manual.'}
              </p>
            </div>
          ) : (
            <table>
              {/* Lebar kolom dipatok di sini (`table-layout: fixed`) supaya semua tab tampil sama. */}
              <colgroup>
                <col style={{ width: hppVisible ? "15%" : "16%" }} />
                <col style={{ width: hppVisible ? "18%" : "20%" }} />
                <col style={{ width: hppVisible ? "21%" : "24%" }} />
                <col style={{ width: hppVisible ? "9%" : "11%" }} />
                {hppVisible ? <col style={{ width: "11%" }} /> : null}
                <col style={{ width: hppVisible ? "11%" : "13%" }} />
                <col style={{ width: hppVisible ? "10%" : "12%" }} />
                <col style={{ width: hppVisible ? "5%" : "4%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>No. Pesanan</th>
                  <th>Pelanggan</th>
                  <th>Produk</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  {hppVisible ? <th style={{ textAlign: "right" }}>HPP</th> : null}
                  <th>No. Resi</th>
                  <th>Status</th>
                  <th className="chev" />
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => {
                  const firstItem = order.items?.[0] || null;
                  const extraItems = Math.max(0, (order.items?.length || 0) - 1);
                  const variantText = itemVariantText(firstItem);
                  return (
                    <tr key={order.id} onClick={() => setDetail(order)}>
                      <td data-label="No. Pesanan">
                        <span className="id">{order.order_number}</span>
                        <small>
                          {formatTanggalSingkatID(order.date_wib)} · {order.time_wib}
                        </small>
                      </td>
                      <td data-label="Pelanggan">
                        <b>{order.customer_name}</b>
                        <small>{order.customer_whatsapp || "-"}</small>
                      </td>
                      <td data-label="Produk">
                        <span style={{ fontWeight: 600 }}>{firstItem ? firstItem.product_name : order.item_summary}</span>
                        <small>
                          {variantText ? `${variantText} × ${firstItem?.quantity}` : `× ${order.qty_total}`}
                          {extraItems > 0 ? ` · +${extraItems} lainnya` : ""}
                        </small>
                      </td>
                      <td className="mono" style={{ textAlign: "right" }} data-label="Total">
                        Rp {formatRupiah(order.total)}
                        <small style={{ textAlign: "right" }}>
                          {SOURCE_STYLES[order.source_key]?.label || order.source_label}
                        </small>
                      </td>
                      {hppVisible ? (
                        <td className="mono" style={{ textAlign: "right" }} data-label="HPP">
                          {order.hpp ? `Rp ${formatRupiah(order.hpp.total_hpp)}` : "-"}
                          {order.hpp?.packaging_status === "belum" ? (
                            <small style={{ textAlign: "right" }}>belum dikemas</small>
                          ) : null}
                        </td>
                      ) : null}
                      <td data-label="No. Resi">
                        {order.awb_no ? (
                          <span
                            className={`resi-no${order.status === "dibatalkan" ? " resi-void" : ""}`}
                            title={
                              order.status === "dibatalkan"
                                ? `Resi ${order.awb_no} sudah di-void (pesanan dibatalkan)`
                                : `No. Resi J&T ${order.awb_no}`
                            }
                          >
                            {order.awb_no}
                          </span>
                        ) : (
                          <span className="resi-empty">–</span>
                        )}
                        {/* Penanda packing khusus pesanan lunas yang belum dikirim:
                            resi sudah dibuat = menunggu dijemput kurir J&T. */}
                        {order.status === "diproses" ? (
                          <small className={order.awb_no ? "pack-done" : "pack-todo"}>
                            {order.awb_no ? "Menunggu pickup" : "Belum di packing"}
                          </small>
                        ) : null}
                      </td>
                      <td data-label="Status">
                        <span className={`bd s-${PANEL_STATUS_COLOR[order.status] || "batal"}`}>{order.status_label}</span>
                      </td>
                      <td className="chev" style={{ textAlign: "right" }}>
                        ›
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {overlays}
      </div>
  );
}

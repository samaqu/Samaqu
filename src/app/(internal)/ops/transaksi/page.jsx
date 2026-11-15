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
import { matchesStage } from "@/lib/order-flow";
import { countByStage, stageCounts, stageTabsWithCounts } from "@/lib/order-shared";
import DateFilter from "@/components/ops/leads/DateFilter";
import ConfirmDeleteModal from "@/components/ops/ConfirmDeleteModal";
import PreorderReasonDialog from "@/components/ops/transaksi/PreorderReasonDialog";
import TransaksiFormModal from "@/components/ops/transaksi/TransaksiFormModal";
import TransaksiDetailDrawer from "@/components/ops/transaksi/TransaksiDetailDrawer";
import ResellerEditItemModal from "@/components/ops/transaksi/ResellerEditItemModal";
import { isResellerOrderNumber } from "@/lib/reseller/order-number";
import StageIcon from "@/components/ops/transaksi/StageIcon";
import AnimatedNumber from "@/components/AnimatedNumber";
import { MONTHS, SOURCE_STYLES, formatRupiah, formatTanggalSingkatID, itemVariantText, pad } from "@/components/ops/transaksi/transaksi-format";
import { useToast } from "@/components/ops/ui/use-toast";
import "@/app/(internal)/panel-admin/panel-transaksi.css";
import "@/app/(internal)/ops/ops-transaksi.css";

const digits = (value) => String(value ?? "").replace(/\D/g, "");
/** Bandingkan nomor HP tanpa peduli 08… / 628… / 8…. */
const phoneKey = (value) => digits(value).replace(/^0+/, "").replace(/^62/, "");

export default function Transaksi({ variant = "ops", mode = "reguler" }) {
  // `variant="panel"` merender tampilan ala mockup (panel admin). Default "ops" = tak berubah.
  const isPanel = variant === "panel";
  // `mode="preorder"` = menu Pre-Order: halaman yang SAMA, tapi daftar hanya PO + ringkasan kebutuhan
  // + tombol "Stok sudah ready". Default "reguler": PO yang masih menunggu stok disembunyikan dari tabel.
  const isPoPage = mode === "preorder";
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
    // Status bisa berubah dari cron tracking J&T tanpa interaksi halaman ini.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Daftar yang tampil di halaman ini. Tabel reguler TIDAK memuat pre-order yang masih menunggu stok
  // (belum ada yang bisa dikerjakan); setelah "stok sudah ready" PO muncul di sini seperti pesanan biasa.
  // KPI Total/Omset tetap dihitung dari SEMUA pesanan (`orders`).
  const listOrders = useMemo(
    () => (isPoPage ? orders.filter((order) => order.is_preorder) : orders.filter((order) => !order.preorder_waiting)),
    [orders, isPoPage],
  );
  // Menu Pre-Order: chip Menunggu stok / Sudah ready / Semua (pengganti tab tahap).
  const [poFilter, setPoFilter] = useState("menunggu");

  const { data: poSummary, isLoading: poSummaryLoading } = useQuery({
    queryKey: ["transaksi", "preorder-summary"],
    queryFn: () => base44.entities.Preorder.summary(),
    enabled: isPoPage,
    refetchInterval: 60_000,
  });
  const poReadyByNumber = useMemo(
    () => new Map((poSummary?.orders || []).map((entry) => [entry.order_number, entry])),
    [poSummary],
  );

  const visibleOrders = useMemo(() => {
    const query = search.toLowerCase();
    const queryPhone = phoneKey(search);
    return listOrders.filter((order) => {
      if (sourceFilter !== "all" && (order.source_key || order.source) !== sourceFilter) return false;
      if (isPoPage) {
        if (poFilter === "menunggu" && !order.preorder_waiting) return false;
        if (poFilter === "ready" && (order.preorder_waiting || order.status === "dibatalkan")) return false;
      } else if (!matchesStage(order, stageFilter)) {
        // Saring per TAHAP (order-flow, sama seperti halaman Pesanan admin).
        return false;
      }
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
  }, [listOrders, isPoPage, poFilter, search, sourceFilter, stageFilter, selectedDate]);

  // Opsi filter diambil dari data yang benar-benar ada di bulan itu.
  const sourceOptions = useMemo(() => [...new Set(listOrders.map((o) => o.source_key || o.source))], [listOrders]);

  const markedDates = useMemo(() => [...new Set(listOrders.map((o) => o.date_wib).filter(Boolean))], [listOrders]);

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
  const [resellerEdit, setResellerEdit] = useState(null);
  const [detail, setDetail] = useState(null);

  // Drawer yang sedang terbuka ikut memakai baris terbaru setelah polling.
  useEffect(() => {
    if (!detail) return;
    const fresh = orders.find((o) => o.order_number === detail.order_number);
    if (fresh && fresh !== detail) setDetail(fresh);
  }, [orders, detail]);

  /**
   * Buka detail langsung dari tautan `?order=NOMOR-PESANAN`.
   *
   * Dipakai menu Retur (`ReturnsView`) supaya "No. Pesanan" pada detail retur bisa diklik dan
   * membuka pesanan aslinya di sini. Tanpa ini parameter diabaikan dan admin mendarat di daftar
   * tanpa tahu pesanan mana yang dimaksud.
   *
   * Dibaca sekali saat halaman dibuka. `getOrder` membaca langsung ke database (bukan menunggu
   * daftar bulan berjalan), jadi pesanan lama tetap terbuka walau bulannya sudah berganti.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const wanted = String(new URLSearchParams(window.location.search).get("order") || "").trim();
    if (!wanted) return;
    let cancelled = false;
    base44.entities.Transaction.getOrder(wanted)
      .then((found) => {
        if (!cancelled && found) setDetail(found);
      })
      .catch(() => {
        // Pesanan tidak ditemukan / gagal dibaca: daftar tetap tampil normal tanpa drawer.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Pre-order: batal/hapus lewat dialog alasan wajib (bukan konfirmasi biasa).
  const cancelMutation = useMutation({
    mutationFn: ({ order, why }) => base44.entities.Transaction.cancel(order.order_number, why),
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
    mutationFn: ({ order, why }) => base44.entities.Transaction.deleteOrder(order.order_number, why),
    onSuccess: (result, { order }) => {
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

  /** "Stok sudah ready" satu PO: stok dipotong, lalu PO mengikuti alur pesanan reguler. */
  const readyMutation = useMutation({
    mutationFn: (order) => base44.entities.Preorder.ready(order.order_number),
    onSuccess: (_result, order) => {
      queryClient.invalidateQueries({ queryKey: ["transaksi"] });
      toast({ title: "✅ Stok sudah ready", description: `${order.order_number} · stok dipotong, siap dibuatkan resi`, variant: "success" });
    },
    onError: (error) =>
      toast({ title: "Gagal menandai ready", description: error instanceof Error ? error.message : "Coba lagi.", variant: "destructive" }),
  });

  /** Proses semua PO yang stoknya cukup, urut siapa transfer duluan; yang belum cukup dilewati. */
  const [readyAllOpen, setReadyAllOpen] = useState(false);
  const readyAllMutation = useMutation({
    mutationFn: () => base44.entities.Preorder.readyAll(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["transaksi"] });
      setReadyAllOpen(false);
      const done = result?.readied?.length || 0;
      const skipped = result?.skipped?.length || 0;
      const failed = result?.failed?.length || 0;
      toast({
        title: done > 0 ? `✅ ${done} pre-order ditandai ready` : "Tidak ada yang diproses",
        description: [skipped ? `${skipped} dilewati (stok belum cukup)` : "", failed ? `${failed} gagal` : ""].filter(Boolean).join(" · ") || undefined,
        variant: failed ? "destructive" : "success",
      });
    },
    onError: (error) => {
      setReadyAllOpen(false);
      toast({ title: "Gagal memproses", description: error instanceof Error ? error.message : "Coba lagi.", variant: "destructive" });
    },
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
    // Hitungan per tahap memakai SATU helper bersama (`stageCounts`) — angka di sini, di
    // chip "Belum di packing", dan di tab selalu berasal dari hitungan yang sama, supaya
    // tidak mungkin lagi ada chip 0 padahal barisnya ada (kasus pesanan reseller).
    const counts = stageCounts(orders);
    return {
      total: saleCount(orders),
      // Hanya kartu OMSET yang mengikuti filter tanggal (permintaan pemilik 2026-11-13): saat
      // satu tanggal dipilih, omset = penjualan tanggal itu (`date_wib`, basis WIB yang sama
      // dengan pengelompokan bulan). Tanpa tanggal, tetap omset sebulan. Kartu lain tidak berubah.
      revenue: (selectedDate ? sold.filter((order) => order.date_wib === selectedDate) : sold).reduce(
        (sum, order) => sum + orderRevenue(order),
        0,
      ),
      unpaid: counts.belum_bayar,
      toProcess: counts.perlu_diproses,
    };
  }, [orders, selectedDate]);

  // Tab = TAHAP resmi aplikasi (`ORDER_STAGE_TABS_VISIBLE` order-flow — SAMA dengan halaman
  // Pesanan admin). "Belum di Packing" SENGAJA tidak jadi tab: ia sub-status dari `diproses`
  // dan tampil sebagai chip filter di baris filter (lihat `belumDipacking` di bawah).
  // Angkanya tetap dari helper yang sama, jadi chip dan isi tabel tidak mungkin berbeda.
  // Dihitung dari daftar yang TAMPIL (tanpa PO menunggu stok) supaya angka tab = isi tabel.
  const stageTabs = useMemo(() => stageTabsWithCounts(listOrders), [listOrders]);

  const belumDipacking = useMemo(() => countByStage(listOrders, "belum_dipacking"), [listOrders]);

  // Ringkasan menu Pre-Order (dari semua PO bulan terpilih + antrean stok dari server).
  const poStats = useMemo(() => {
    const waiting = listOrders.filter((order) => order.preorder_waiting).length;
    const ready = listOrders.filter((order) => order.is_preorder && !order.preorder_waiting && order.status !== "dibatalkan").length;
    return { waiting, ready, total: listOrders.length };
  }, [listOrders]);

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
        presetPreorder={isPoPage}
      />

      <TransaksiDetailDrawer
        open={!!detail}
        order={detail}
        variant="panel"
        owner={isPanel ? "panel" : "ops"}
        onResiCreated={handleResiCreated}
        onClose={() => setDetail(null)}
        onEdit={(order) => {
          setDetail(null);
          if (order.source_key === "reseller" || isResellerOrderNumber(order.order_number)) {
            setResellerEdit(order);
            return;
          }
          setEditing(order);
          setFormOpen(true);
        }}
        onCancel={(order) => setCancelTarget(order)}
        onDelete={(order) => setDeleteTarget(order)}
      />

      {resellerEdit ? (
        <ResellerEditItemModal
          order={resellerEdit}
          onClose={() => setResellerEdit(null)}
          onSaved={() => {
            setResellerEdit(null);
            queryClient.invalidateQueries({ queryKey: ["transaksi"] });
            toast({ title: "Ukuran/warna diperbarui", variant: "success" });
          }}
        />
      ) : null}

      {/* Pre-order: batal/hapus wajib beralasan (kebijakan: PO tidak dapat dibatalkan ke customer). */}
      <PreorderReasonDialog
        isOpen={!!cancelTarget?.is_preorder}
        action="batal"
        itemName={cancelTarget ? `${cancelTarget.order_number} · ${cancelTarget.customer_name}` : undefined}
        isBusy={cancelMutation.isPending}
        onClose={() => setCancelTarget(null)}
        onConfirm={(why) => cancelMutation.mutate({ order: cancelTarget, why })}
      />
      <PreorderReasonDialog
        isOpen={!!deleteTarget?.is_preorder}
        action="hapus"
        itemName={deleteTarget ? `${deleteTarget.order_number} · ${deleteTarget.customer_name}` : undefined}
        isBusy={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={(why) => deleteMutation.mutate({ order: deleteTarget, why })}
      />

      <ConfirmDeleteModal
        isOpen={isPoPage && readyAllOpen}
        onClose={() => setReadyAllOpen(false)}
        onConfirm={() => readyAllMutation.mutate()}
        title="Proses semua yang stoknya cukup?"
        message={`${poSummary?.ready_now_count || 0} pre-order akan ditandai ready dan stoknya dipotong, urut siapa transfer duluan. Yang stoknya belum cukup dilewati.`}
        confirmLabel="Proses"
        busyLabel="Memproses..."
        isDeleting={readyAllMutation.isPending}
      />

      <ConfirmDeleteModal
        isOpen={!!cancelTarget && !cancelTarget.is_preorder}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelMutation.mutate({ order: cancelTarget })}
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
        isOpen={!!deleteTarget && !deleteTarget.is_preorder}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate({ order: deleteTarget })}
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
        {isPoPage ? (
          <>
            <section className="ks" data-testid="preorder-kpis">
              <div className="card k">
                <small>Menunggu stok</small>
                <b style={{ color: "#7e22ce" }}>
                  <AnimatedNumber value={isLoading || poSummaryLoading ? 0 : poSummary?.waiting_count ?? poStats.waiting} />
                </b>
                <i>Sudah Lunas, belum diproses</i>
              </div>
              <div className="card k">
                <small>Bisa diproses sekarang</small>
                <b style={{ color: "#2e64c9" }}>
                  <AnimatedNumber value={isLoading || poSummaryLoading ? 0 : poSummary?.ready_now_count ?? 0} />
                </b>
                <i>Stok cukup, urut siapa transfer duluan</i>
              </div>
              <div className="card k">
                <small>Sudah ready bulan ini</small>
                <b><AnimatedNumber value={isLoading ? 0 : poStats.ready} /></b>
                <i>Diproses seperti pesanan biasa</i>
              </div>
              <div className="card k">
                <small>Total pre-order bulan ini</small>
                <b><AnimatedNumber value={isLoading ? 0 : poStats.total} /></b>
                <i>Termasuk yang dibatalkan</i>
              </div>
            </section>

            {/* Ringkasan kebutuhan barang: apa yang harus datang supaya PO bisa diproses. Baca-saja. */}
            {(poSummary?.demand || []).length > 0 ? (
              <div className="card tw" data-testid="preorder-demand" style={{ marginBottom: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Kebutuhan barang (PO menunggu)</th>
                      <th style={{ textAlign: "right" }}>Dibutuhkan</th>
                      <th style={{ textAlign: "right" }}>Stok</th>
                      <th style={{ textAlign: "right" }}>Kurang</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poSummary.demand.map((row) => {
                      const kurang = Math.max(0, row.needed - row.stock);
                      return (
                        <tr key={row.key} style={{ cursor: "default" }}>
                          <td>
                            <b>{row.product_name}</b>
                            <small>
                              {[row.series, row.color && row.color !== "default" ? row.color : "", row.size].filter(Boolean).join(" · ")} · {row.orders} pesanan
                            </small>
                          </td>
                          <td className="mono" style={{ textAlign: "right" }}>{row.needed}</td>
                          <td className="mono" style={{ textAlign: "right" }}>{row.stock}</td>
                          <td className="mono" style={{ textAlign: "right", color: kurang > 0 ? "#b45309" : "#047857", fontWeight: 700 }}>
                            {kurang > 0 ? kurang : "cukup"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : (
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
            <small>{selectedDate ? "Omset tanggal ini" : "Omset bulan ini"}</small>
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
        )}

        <div className="bar">
          <div className="tabs">
            {isPoPage
              ? [
                  { key: "menunggu", label: "Menunggu stok", count: poStats.waiting, stage: "menunggu_stok" },
                  { key: "ready", label: "Sudah ready", count: poStats.ready, stage: "belum_dipacking" },
                  { key: "semua", label: "Semua", count: poStats.total, stage: "semua" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    data-testid={`po-tab-${tab.key}`}
                    className={`tab${poFilter === tab.key ? " on" : ""}`}
                    onClick={() => setPoFilter(tab.key)}
                  >
                    <span className="ti">
                      <StageIcon stage={tab.stage} />
                    </span>
                    <span className="tl2">{tab.label}</span>
                    <em>{tab.count}</em>
                  </button>
                ))
              : stageTabs.map((tab) => (
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
            {isPoPage ? null : (
              <button
                type="button"
                className={`packf${stageFilter === "belum_dipacking" ? " on" : ""}`}
                onClick={() => setStageFilter((current) => (current === "belum_dipacking" ? "semua" : "belum_dipacking"))}
                aria-pressed={stageFilter === "belum_dipacking"}
                title="Tampilkan hanya pesanan yang belum dipacking"
              >
                Belum di packing
                <em>{belumDipacking}</em>
              </button>
            )}
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
            {isPoPage ? (
              <button
                type="button"
                className="btn-sec"
                data-testid="po-ready-all"
                disabled={!poSummary || (poSummary.ready_now_count || 0) === 0 || readyAllMutation.isPending}
                onClick={() => setReadyAllOpen(true)}
                title="Tandai ready semua pre-order yang stoknya cukup, urut siapa transfer duluan"
              >
                Proses semua yang stoknya cukup
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
              {isPoPage ? "Tambah Pre-Order" : "Tambah Transaksi"}
            </button>
          </div>
        </div>

        <div className="card tw">
          {isLoading ? (
            <div style={{ padding: 48, textAlign: "center", color: "#8a7d83" }}>Memuat…</div>
          ) : visibleOrders.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "#8a7d83" }}>
              <b style={{ color: "#2a1a22" }}>
                {filtersActive
                  ? "Tidak ada transaksi yang cocok"
                  : isPoPage
                    ? poFilter === "menunggu"
                      ? `Tidak ada pre-order yang menunggu stok di ${MONTHS[month]} ${year}`
                      : `Belum ada pre-order di ${MONTHS[month]} ${year}`
                    : `Belum ada transaksi di ${MONTHS[month]} ${year}`}
              </b>
              <p style={{ fontSize: 13, marginTop: 4 }}>
                {filtersActive
                  ? "Ubah pencarian atau filter, atau tampilkan semua."
                  : isPoPage
                    ? 'Klik "Tambah Pre-Order" untuk mencatat pesanan yang customer-nya sudah transfer.'
                    : 'Klik "Tambah Transaksi" untuk mencatat penjualan manual.'}
              </p>
            </div>
          ) : (
            <table>
              {/* Lebar kolom dipatok di sini (`table-layout: fixed`) supaya semua tab tampil sama. */}
              <colgroup>
                <col style={{ width: "16%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "24%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "4%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>No. Pesanan</th>
                  <th>Pelanggan</th>
                  <th>Produk</th>
                  <th style={{ textAlign: "right" }}>Total</th>
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
                        {order.is_preorder ? (
                          <em
                            data-testid="po-badge"
                            style={{ marginLeft: 6, fontStyle: "normal", fontSize: 10, fontWeight: 800, color: "#7e22ce", background: "#f3e8ff", borderRadius: 6, padding: "1px 6px" }}
                          >
                            PRE-ORDER
                          </em>
                        ) : null}
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
                          order.preorder_waiting ? (
                            <small className="pack-todo">Menunggu stok</small>
                          ) : (
                            <small className={order.awb_no ? "pack-done" : "pack-todo"}>
                              {order.awb_no ? "Menunggu pickup" : "Belum di packing"}
                            </small>
                          )
                        ) : null}
                      </td>
                      <td data-label="Status">
                        <span className={`bd s-${PANEL_STATUS_COLOR[order.status] || "batal"}`}>{order.status_label}</span>
                        {/* Menu Pre-Order: tombol "Stok sudah ready" langsung di baris (stok dicek server). */}
                        {isPoPage && order.preorder_waiting ? (
                          <button
                            type="button"
                            className="btn-sec"
                            data-testid="po-ready"
                            style={{ marginTop: 6, padding: "2px 8px", fontSize: 11 }}
                            disabled={readyMutation.isPending || poReadyByNumber.get(order.order_number)?.can_ready === false}
                            title={
                              poReadyByNumber.get(order.order_number)?.can_ready === false
                                ? "Stok belum cukup untuk pesanan ini"
                                : "Tandai barang sudah ada: stok dipotong, lalu siap dibuatkan resi"
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              readyMutation.mutate(order);
                            }}
                          >
                            Stok sudah ready
                          </button>
                        ) : null}
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

"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Package, Plus, Receipt, RefreshCw } from "lucide-react";
import ConfirmDeleteModal from "@/components/ops/ConfirmDeleteModal";
import { useToast } from "@/components/ops/ui/use-toast";
import PengeluaranHeader from "./PengeluaranHeader";
import PengeluaranTable from "./PengeluaranTable";
import ExpenseDrawer from "./ExpenseDrawer";
import BarangDrawer from "./BarangDrawer";
import { currentWibPeriod, pesanError, pengeluaranFetch, rupiah } from "./helpers";
import { EMPTY_SUMMARY, type ExpenseItem, type ExpenseRow, type PengeluaranResponse, type PengeluaranTipe } from "./types";

const TABS: { key: PengeluaranTipe; label: string; icon: typeof Package }[] = [
  { key: "packing", label: "Pengeluaran Packing", icon: Package },
  { key: "operasional", label: "Pengeluaran Operasional", icon: Receipt },
];

/** Data awal kosong (pola halaman ops lain) — query tetap jalan karena `initialDataUpdatedAt: 0`. */
const INITIAL_DATA: PengeluaranResponse = {
  items: [],
  summary: { packing: EMPTY_SUMMARY, operasional: EMPTY_SUMMARY },
};

const INITIAL_BARANG: { items: ExpenseItem[] } = { items: [] };

/**
 * Halaman Pengeluaran (/ops/pengeluaran).
 * Packing & operasional dalam satu halaman, data langsung dari API internal (bukan shim base44).
 */
export default function PengeluaranView() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [periode, setPeriode] = useState(currentWibPeriod);
  const [tab, setTab] = useState<PengeluaranTipe>("packing");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [barangOpen, setBarangOpen] = useState(false);
  const [confirmRow, setConfirmRow] = useState<ExpenseRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const query = useQuery<PengeluaranResponse>({
    queryKey: ["ops-pengeluaran", periode.tahun, periode.bulan],
    queryFn: () =>
      pengeluaranFetch<PengeluaranResponse>(
        `/api/ops/pengeluaran?bulan=${periode.bulan}&tahun=${periode.tahun}`,
      ),
    initialData: INITIAL_DATA,
    staleTime: 30_000,
  });

  const barangQuery = useQuery<{ items: ExpenseItem[] }>({
    queryKey: ["ops-pengeluaran-barang"],
    queryFn: () => pengeluaranFetch<{ items: ExpenseItem[] }>("/api/ops/pengeluaran/barang"),
    initialData: INITIAL_BARANG,
    staleTime: 60_000,
  });

  const rows = query.data?.items ?? [];
  const summary =
    (tab === "packing" ? query.data?.summary?.packing : query.data?.summary?.operasional) ?? EMPTY_SUMMARY;
  const items = barangQuery.data?.items ?? [];

  const tabRows = useMemo(() => rows.filter((row) => row.tipe === tab), [rows, tab]);
  const loading = query.isFetching && rows.length === 0 && !query.isError;
  const errorMessage = query.isError ? pesanError(query.error) : "";

  const refreshData = () => qc.invalidateQueries({ queryKey: ["ops-pengeluaran"] });

  function bukaTambah() {
    setEditing(null);
    setDrawerOpen(true);
  }

  function bukaUbah(row: ExpenseRow) {
    setEditing(row);
    setDrawerOpen(true);
  }

  function tutupDrawer() {
    setDrawerOpen(false);
    setEditing(null);
  }

  async function hapusPengeluaran() {
    if (!confirmRow || deleting) return;
    setDeleting(true);
    try {
      await pengeluaranFetch(`/api/ops/pengeluaran?id=${encodeURIComponent(confirmRow.id)}`, {
        method: "DELETE",
      });
      toast({ title: "Pengeluaran dihapus", description: "Baris pengeluaran sudah dihapus.", variant: "success" });
      setConfirmRow(null);
      refreshData();
    } catch (e) {
      toast({ title: "Gagal menghapus", description: pesanError(e), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  const namaKonfirmasi = confirmRow
    ? confirmRow.tipe === "packing"
      ? `${confirmRow.nama_barang || "Barang"} · ${rupiah(confirmRow.jumlah)}`
      : `${confirmRow.kategori || "Operasional"} · ${rupiah(confirmRow.jumlah)}`
    : undefined;

  const tipeAktif = editing?.tipe ?? tab;
  const judulDetail = tab === "packing" ? "Detail Pengeluaran Packing" : "Detail Pengeluaran Operasional";

  return (
    <div className="space-y-5 bg-[#F9FAFB]">
      <PengeluaranHeader
        bulan={periode.bulan}
        tahun={periode.tahun}
        tipe={tab}
        summary={summary}
        loading={loading}
        isFetching={query.isFetching && !loading}
        onChange={(bulan, tahun) => setPeriode({ bulan, tahun })}
      />

      {errorMessage ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="flex items-start gap-2 text-sm font-semibold text-red-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {errorMessage}
          </p>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
          >
            <RefreshCw size={13} /> Coba lagi
          </button>
        </div>
      ) : null}

      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 md:p-5">
        <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {TABS.map((item) => {
            const aktif = tab === item.key;
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                aria-pressed={aktif}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
                  aktif ? "bg-[#18181b] text-white shadow-sm" : "text-slate-600 hover:bg-white"
                }`}
              >
                <Icon size={14} className="shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">{judulDetail}</h2>
            <p className="text-xs font-semibold text-slate-500">
              {tabRows.length} transaksi · total {rupiah(summary.total_biaya)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tab === "packing" ? (
              <button
                type="button"
                onClick={() => setBarangOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <Package size={15} /> Kelola Barang
              </button>
            ) : null}
            <button
              type="button"
              onClick={bukaTambah}
              className="inline-flex items-center gap-2 rounded-xl bg-[#18181b] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-black"
            >
              <Plus size={15} /> Tambah
            </button>
          </div>
        </div>

        {!errorMessage ? (
          <PengeluaranTable
            tipe={tab}
            rows={tabRows}
            items={items}
            loading={loading}
            onEdit={bukaUbah}
            onDelete={(row) => setConfirmRow(row)}
          />
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-[#F9FAFB] py-12 text-center">
            <p className="text-sm font-bold text-slate-700">Data pengeluaran belum bisa dimuat</p>
            <p className="mt-1 text-xs text-slate-500">Perbaiki pesan error di atas, lalu muat ulang.</p>
          </div>
        )}
      </section>

      <ExpenseDrawer
        open={drawerOpen}
        tipe={tipeAktif}
        row={editing}
        items={items}
        onClose={tutupDrawer}
        onSaved={refreshData}
        onManageItems={() => setBarangOpen(true)}
      />

      <BarangDrawer
        open={barangOpen}
        items={items}
        loading={barangQuery.isFetching && items.length === 0}
        errorMessage={barangQuery.isError ? pesanError(barangQuery.error) : ""}
        onClose={() => setBarangOpen(false)}
        onChanged={() => qc.invalidateQueries({ queryKey: ["ops-pengeluaran-barang"] })}
      />

      <ConfirmDeleteModal
        isOpen={!!confirmRow}
        onClose={() => {
          if (!deleting) setConfirmRow(null);
        }}
        onConfirm={hapusPengeluaran}
        title="Yakin ingin menghapus pengeluaran ini?"
        itemName={namaKonfirmasi}
        message="Data pengeluaran akan dihapus permanen dan tidak bisa dikembalikan."
        confirmLabel="Hapus"
        isDeleting={deleting}
      />
    </div>
  );
}

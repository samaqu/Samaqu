"use client";

import { useMemo, useState } from "react";
import { Cake, ChevronRight, Download, Loader2, Phone, Search, ShoppingBag, X } from "lucide-react";
import CustomerDetailDrawer from "@/components/admin/CustomerDetailDrawer";
import { customersToCsv } from "@/lib/customer-csv";
import {
  ACCOUNT_FILTERS,
  CUSTOMER_SORTS,
  CUSTOMER_TABS,
  PERIOD_FILTERS,
  countByTab,
  distinctCities,
  filterByTab,
  filterCustomers,
  hanyaPesananBatal,
  pernahBelanja,
  sortCustomers,
  type AccountFilter,
  type CustomerSort,
  type CustomerTab,
  type DirectoryCustomer,
  type PeriodFilter,
} from "@/lib/customer-directory";

/**
 * Daftar pelanggan (presentational) — dipakai panel admin (`/admin` → Pelanggan) **dan**
 * dashboard ops (`/ops/pelanggan`), supaya datanya benar-benar satu pusat.
 *
 * Gaya sengaja pakai kelas Tailwind netral (slate) + `dark:` — bukan variabel tema admin —
 * supaya tampil benar di dua tema sekaligus. Detail (alamat + riwayat belanja) dibuka lewat
 * `CustomerDetailDrawer` (drawer itu mandiri, tak bergantung tema).
 */

const BULAN_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const SELECT_CLASS =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

function money(n: number) {
  return "Rp " + (n || 0).toLocaleString("id-ID");
}

/** Badge status pelanggan — dipakai versi kartu (mobile) & tabel (desktop). */
function CustomerBadges({ c }: { c: DirectoryCustomer }) {
  return (
    <>
      {!c.registered && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          Belum daftar
        </span>
      )}
      {hanyaPesananBatal(c) && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
          Hanya pesanan batal
        </span>
      )}
      {c.addressIncomplete && (
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
          title="Kecamatan tidak tersimpan di pesanannya (data lama checkout) — perlu dilengkapi manual"
        >
          Alamat belum lengkap
        </span>
      )}
      {!c.hasAddress && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          Belum ada alamat
        </span>
      )}
    </>
  );
}

function parseBirth(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function exportCsv(rows: DirectoryCustomer[]) {
  const blob = new Blob([customersToCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pelanggan-samaqu-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function CustomerCard({ c, currentMonth, onDetail }: { c: DirectoryCustomer; currentMonth: number; onDetail: () => void }) {
  const b = c.birthDate ? parseBirth(c.birthDate) : null;
  const isBirthdayMonth = !!b && b.m === currentMonth;
  const isBirthdayToday = !!b && b.m === currentMonth && b.d === new Date().getDate();

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#1a1d28] lg:p-5">
      <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm lg:text-base font-bold truncate text-slate-900 dark:text-white">{c.name}</h3>
                <CustomerBadges c={c} />
              </div>
              <p className="text-xs flex items-center gap-1.5 mt-0.5 text-slate-500 dark:text-slate-400">
                <Phone size={12} strokeWidth={1.9} /> {c.whatsapp || "Tanpa nomor"}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm lg:text-base font-extrabold text-slate-900 dark:text-white">{money(c.totalSpend)}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {c.ordersCount} pesanan
                {c.ordersCount > c.paidOrdersCount ? ` · ${c.paidOrdersCount} lunas` : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                isBirthdayMonth ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              <Cake size={12} strokeWidth={2} />
              {b ? `${b.d} ${BULAN_SHORT[b.m - 1]} ${b.y}` : "Ulang tahun belum diisi"}
              {isBirthdayToday && " · hari ini 🎉"}
            </span>
            {c.lastOrderAt && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                Belanja terakhir {formatDate(c.lastOrderAt)}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onDetail}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold rounded-lg px-2.5 py-1.5 border border-slate-200 text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            <ShoppingBag size={13} strokeWidth={2} />
            Riwayat Belanja &amp; Alamat ({c.orders.length})
            <ChevronRight size={14} strokeWidth={2} className="text-blue-600" />
          </button>
      </div>
    </article>
  );
}

export default function CustomerDirectoryView({
  customers,
  loading = false,
  showExport = false,
  emptyText = "Belum ada pelanggan",
  initialQuery = "",
}: {
  customers: DirectoryCustomer[];
  loading?: boolean;
  /** Tampilkan tombol Export CSV (dipakai panel admin). */
  showExport?: boolean;
  emptyText?: string;
  /** Pencarian awal — dipakai tautan dari menu lain (mis. Database Kota → profil pelanggan). */
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [account, setAccount] = useState<AccountFilter>("all");
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [city, setCity] = useState("all");
  const [birthday, setBirthday] = useState(false);
  const [sort, setSort] = useState<CustomerSort>("newest");
  const [tab, setTab] = useState<CustomerTab>("all");
  const [selected, setSelected] = useState<DirectoryCustomer | null>(null);

  const currentMonth = new Date().getMonth() + 1;

  // Tab memisahkan pelanggan; hitungannya diambil dari data yang sama dengan yang ditampilkan.
  const tabCounts = useMemo(() => countByTab(customers), [customers]);

  /**
   * Ringkasan cepat SEBELUM difilter: berapa total, berapa yang punya akun, berapa yang
   * belum daftar, dan berapa yang sudah/belum pernah belanja. Angkanya dari data yang sama
   * dengan tab & tabel, jadi tidak mungkin berbeda.
   */
  const summary = useMemo(() => {
    const total = customers.length;
    const registered = customers.filter((c) => c.registered).length;
    const buyers = customers.filter(pernahBelanja).length;
    return {
      total,
      registered,
      guest: total - registered,
      buyers,
      nonBuyers: total - buyers,
    };
  }, [customers]);

  const shareOf = (value: number) => (summary.total > 0 ? Math.round((value / summary.total) * 100) : 0);

  const inTab = useMemo(() => filterByTab(customers, tab), [customers, tab]);
  const cities = useMemo(() => distinctCities(inTab), [inTab]);

  const visible = useMemo(
    () => sortCustomers(filterCustomers(inTab, { query, account, period, city, birthdayThisMonth: birthday }), sort),
    [inTab, query, account, period, city, birthday, sort]
  );

  const activeFilters = account !== "all" || period !== "all" || city !== "all" || birthday || Boolean(query);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 flex items-center justify-center dark:border-slate-800 dark:bg-[#1a1d28]">
        <Loader2 size={22} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Ringkasan cepat: total, akun, dan status belanja — dihitung dari data yang sama. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {[
          { label: "Total pelanggan", value: summary.total, caption: "tercatat" },
          { label: "Punya akun", value: summary.registered, caption: `${shareOf(summary.registered)}% dari total` },
          { label: "Belum daftar", value: summary.guest, caption: "dari pesanan" },
          { label: "Pernah belanja", value: summary.buyers, caption: `${shareOf(summary.buyers)}% dari total` },
          { label: "Belum belanja", value: summary.nonBuyers, caption: "belum ada transaksi" },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-[#1a1d28]"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {item.label}
            </p>
            <p className="mt-1 text-xl font-black tabular-nums text-slate-900 dark:text-white">
              {item.value.toLocaleString("id-ID")}
            </p>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{item.caption}</p>
          </div>
        ))}
      </div>

      {/* Tab: memisahkan pelanggan supaya daftarnya mudah dibaca */}
      <div className="rounded-2xl border border-slate-200 bg-white p-1.5 dark:border-slate-800 dark:bg-[#1a1d28]">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
          {CUSTOMER_TABS.map((item) => {
            const active = item.key === tab;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                aria-pressed={active}
                title={item.hint}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all ${
                  active
                    ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <span className="truncate">{item.label}</span>
                <span
                  className={`shrink-0 px-1.5 py-0.5 rounded-full text-[11px] font-black ${
                    active
                      ? "bg-white/20 text-white dark:bg-slate-900/10 dark:text-slate-900"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  {tabCounts[item.key]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cari + filter */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#1a1d28]">
        <div className="relative">
          <Search size={16} strokeWidth={1.9} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama atau WhatsApp…"
            className="w-full pl-9 pr-9 py-2.5 rounded-xl text-sm outline-none border border-slate-200 bg-slate-50 text-slate-800 focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-label="Bersihkan">
              <X size={15} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <select value={account} onChange={(e) => setAccount(e.target.value as AccountFilter)} className={SELECT_CLASS} aria-label="Filter akun">
            {ACCOUNT_FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodFilter)} className={SELECT_CLASS} aria-label="Filter belanja terakhir">
            {PERIOD_FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <select value={city} onChange={(e) => setCity(e.target.value)} className={SELECT_CLASS} aria-label="Filter kota">
            <option value="all">Semua kota</option>
            {cities.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setBirthday((v) => !v)}
            className={`text-sm font-semibold px-3 py-2.5 rounded-xl border transition-colors ${
              birthday
                ? "bg-amber-100 border-amber-300 text-amber-800"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
            }`}
          >
            🎂 Ulang tahun bulan ini
          </button>
          <select value={sort} onChange={(e) => setSort(e.target.value as CustomerSort)} className={`${SELECT_CLASS} ml-auto`} aria-label="Urutkan">
            {CUSTOMER_SORTS.map((s) => <option key={s.key} value={s.key}>Urut: {s.label}</option>)}
          </select>
          {showExport && (
            <button
              type="button"
              onClick={() => exportCsv(visible)}
              disabled={visible.length === 0}
              className="text-sm font-semibold px-3.5 py-2.5 rounded-xl inline-flex items-center gap-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
              title="Unduh daftar pelanggan (Nama, No WA, Tanggal Lahir)"
            >
              <Download size={14} strokeWidth={2} /> Export
            </button>
          )}
        </div>

        <p className="text-xs mt-3 text-slate-500 dark:text-slate-400">
          Menampilkan <b className="text-slate-700 dark:text-slate-200">{visible.length}</b> dari {inTab.length} pelanggan
          {activeFilters ? <span className="text-slate-400 dark:text-slate-500"> · filter aktif</span> : null}
        </p>
      </div>

      {/* Daftar */}
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-[#1a1d28]">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {inTab.length === 0 ? emptyText : "Tidak ada pelanggan yang cocok di tab ini"}
          </p>
          {activeFilters && inTab.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setAccount("all");
                setPeriod("all");
                setCity("all");
                setBirthday(false);
              }}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Reset filter
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {/* Desktop/tablet: tabel padat (tanpa garis vertikal/zebra) supaya angka antar
              pelanggan mudah dibandingkan. Detail tetap lewat drawer yang sama. */}
          <div className="hidden lg:block rounded-2xl border border-slate-200 bg-white overflow-hidden dark:border-slate-800 dark:bg-[#1a1d28]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  <th className="px-4 py-2.5 font-black">Pelanggan</th>
                  <th className="px-3 py-2.5 font-black">Kota</th>
                  <th className="px-3 py-2.5 font-black text-right">Pesanan</th>
                  <th className="px-3 py-2.5 font-black text-right">Total Belanja</th>
                  <th className="hidden xl:table-cell px-3 py-2.5 font-black whitespace-nowrap">Terakhir Belanja</th>
                  <th className="hidden xl:table-cell px-3 py-2.5 font-black whitespace-nowrap">Ulang Tahun</th>
                  <th className="px-4 py-2.5" aria-label="Detail" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visible.map((c) => {
                  const b = c.birthDate ? parseBirth(c.birthDate) : null;
                  const isBirthdayMonth = !!b && b.m === currentMonth;
                  const isBirthdayToday = !!b && b.m === currentMonth && b.d === new Date().getDate();
                  return (
                    <tr
                      key={c.key}
                      onClick={() => setSelected(c)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelected(c);
                        }
                      }}
                      tabIndex={0}
                      className="cursor-pointer hover:bg-slate-50 focus:bg-slate-50 focus:outline-none dark:hover:bg-slate-800/60 dark:focus:bg-slate-800/60"
                    >
                      <td className="px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{c.name}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{c.whatsapp || "Tanpa nomor"}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <CustomerBadges c={c} />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <p
                          className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[130px]"
                          title={c.cities.join(", ")}
                        >
                          {c.cities[0] || "-"}
                          {c.cities.length > 1 ? (
                            <span className="text-slate-400 dark:text-slate-500"> +{c.cities.length - 1}</span>
                          ) : null}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{c.ordersCount}</p>
                        {c.ordersCount > c.paidOrdersCount ? (
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">{c.paidOrdersCount} lunas</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <p className="text-sm font-extrabold text-slate-900 dark:text-white">{money(c.totalSpend)}</p>
                      </td>
                      <td className="hidden xl:table-cell px-3 py-2.5 whitespace-nowrap">
                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {c.lastOrderAt ? formatDate(c.lastOrderAt) : "-"}
                        </p>
                      </td>
                      <td className="hidden xl:table-cell px-3 py-2.5 whitespace-nowrap">
                        <p
                          className={`text-xs font-semibold ${
                            isBirthdayMonth ? "text-amber-600 dark:text-amber-400" : "text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          {b ? `${b.d} ${BULAN_SHORT[b.m - 1]} ${b.y}` : "-"}
                          {isBirthdayToday ? " 🎉" : ""}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <ChevronRight size={16} strokeWidth={2} className="inline text-slate-400" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: tetap kartu, bukan tabel. */}
          <div className="grid gap-3 lg:hidden">
            {visible.map((c) => (
              <CustomerCard key={c.key} c={c} currentMonth={currentMonth} onDetail={() => setSelected(c)} />
            ))}
          </div>
        </>
      )}

      <CustomerDetailDrawer customer={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

"use client";

import { useState, useMemo, useEffect } from "react";
import { useNavigate, useLocation } from "@/lib/ops-router";
import { base44 } from "@/lib/ops-api";
import { createPageUrl } from "@/lib/ops-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  ShoppingBag, 
  Search, 
  Calendar, 
  DollarSign,
  Package,
  TrendingUp,
  ArrowUpRight,
  RefreshCw
} from "lucide-react";
import { MetricCardSkeleton } from "@/components/ops/ui/skeleton";

function AnimatedCounter({ value, prefix = "", suffix = "" }) {
  return <span>{prefix}{value.toLocaleString('id-ID')}{suffix}</span>;
}

export default function RekapPembelian() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Initialize from navigation state if available (after import)
  // Fix: Use Local Date for default instead of UTC to match user's timezone
  const getLocalDate = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().split('T')[0];
  };

  const initialDate = location.state?.date || getLocalDate();
  const initialFilterType = location.state?.filterType || "daily"; // Default to daily to see recent imports easier
  
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState(initialFilterType); // 'daily' | 'monthly' | 'all'
  const [dateFilter, setDateFilter] = useState(initialDate);
  
  // Parse initial date to set month/year correctly
  const initialDateObj = new Date(initialDate);
  const [monthFilter, setMonthFilter] = useState(initialDateObj.getMonth());
  const [yearFilter, setYearFilter] = useState(initialDateObj.getFullYear());

  // Clear location state after using it to prevent stuck state on refresh
  useEffect(() => {
    if (location.state) {
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  // Fetch data sorted by created_date to ensure latest imports show up first
  const { data: stockIns = [], isLoading, refetch } = useQuery({
    queryKey: ['stockIns'],
    queryFn: () => base44.entities.StockIn.list('-created_date', 2000),
    refetchOnMount: true, // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window gets focus
  });

  // Force refetch on mount and when location state changes (e.g. after import)
  useEffect(() => {
    refetch();
  }, [refetch, location.state]);

  const filteredData = useMemo(() => {
    return stockIns.filter(item => {
      if (!item.date) return false;

      // ✅ Robust Date Parsing (String Based)
      const rawItemDate = String(item.date || '').trim();
      const itemDateStr = rawItemDate.substring(0, 10);

      const year = parseInt(itemDateStr.substring(0, 4));
      const month = parseInt(itemDateStr.substring(5, 7)) - 1; // 0-indexed

      let matchDate = true;

      if (filterType === 'all') {
        matchDate = true;
      } else if (filterType === 'daily') {
        const filterDateStr = String(dateFilter || '').trim().substring(0, 10);
        matchDate = itemDateStr === filterDateStr;
      } else {
        matchDate = month === parseInt(monthFilter) &&
                    year === parseInt(yearFilter);
      }

      const searchLower = searchTerm.toLowerCase();
      const matchSearch = !searchTerm || 
        (item.product_name?.toLowerCase().includes(searchLower)) ||
        (item.sku?.toLowerCase().includes(searchLower));

      return matchDate && matchSearch;
    });
  }, [stockIns, filterType, dateFilter, monthFilter, yearFilter, searchTerm]);

  const stats = useMemo(() => {
    const totalSpent = filteredData.reduce((sum, item) => sum + ((item.qty || 0) * (item.cost_per_unit || 0)), 0);
    const totalItems = filteredData.reduce((sum, item) => sum + (item.qty || 0), 0);
    const totalTransactions = filteredData.length;
    return { totalSpent, totalItems, totalTransactions };
  }, [filteredData]);

  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gray-100 dark:bg-[#0f1117] transition-colors duration-300">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700;800&display=swap');
        .font-outfit { font-family: 'Outfit', sans-serif; }
        .font-inter { font-family: 'Inter', sans-serif; }
      `}</style>

      <div className="max-w-[1400px] mx-auto space-y-8">
        {/* Header - SAME AS DASHBOARD */}
        <div className="bg-gradient-to-br from-[#18181b] to-[#27272a] dark:from-[#1a1d28] dark:to-[#1e222d] rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden transition-colors duration-300">
          {/* Decorative background elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16"></div>
          <div className="absolute bottom-0 left-0 w-40 h-40 bg-white/5 rounded-full blur-2xl -ml-10 -mb-10"></div>
          
          <div className="relative z-10">
            {/* Top Section */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/10 shadow-inner">
                  <ShoppingBag size={28} className="text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight font-jakarta text-white">
                    Rekap Pembelian
                  </h1>
                  <p className="text-blue-100 font-medium mt-1 font-inter">
                    Catatan harian pembelian
                  </p>
                </div>
              </div>

              {/* Filter Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => refetch()}
                  className="p-2.5 bg-white/10 backdrop-blur-sm border border-white/10 rounded-lg text-white hover:bg-white/20 transition-all"
                  title="Refresh Data"
                >
                  <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
                </button>
                <button
                  onClick={() => navigate(createPageUrl('ImportPembelian'))}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/10 backdrop-blur-sm border border-white/10 rounded-lg text-white hover:bg-white/20 transition-all font-bold text-sm font-jakarta"
                >
                  <TrendingUp size={16} />
                  Import CSV
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap gap-3 items-center">
              <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-xl p-1 flex items-center">
                <button
                  onClick={() => setFilterType('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterType === 'all' ? 'bg-white/20 text-white' : 'text-blue-100 hover:text-white'}`}
                >
                  Semua
                </button>
                <button
                  onClick={() => setFilterType('daily')}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterType === 'daily' ? 'bg-white/20 text-white' : 'text-blue-100 hover:text-white'}`}
                >
                  Harian
                </button>
                <button
                  onClick={() => setFilterType('monthly')}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterType === 'monthly' ? 'bg-white/20 text-white' : 'text-blue-100 hover:text-white'}`}
                >
                  Bulanan
                </button>
              </div>

              {filterType === 'daily' && (
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="px-4 py-2.5 bg-white/10 backdrop-blur-sm border border-white/10 rounded-lg text-white font-medium text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
                />
              )}

              {filterType === 'monthly' && (
                <div className="flex items-center bg-white/10 backdrop-blur-md border border-white/10 rounded-xl p-1">
                  <select 
                    value={monthFilter}
                    onChange={(e) => setMonthFilter(e.target.value)}
                    className="bg-transparent px-4 py-2 rounded-lg text-white font-bold text-sm focus:outline-none cursor-pointer font-jakarta appearance-none"
                  >
                    {months.map((m, i) => (
                      <option key={i} value={i} className="text-gray-900">{m}</option>
                    ))}
                  </select>
                  <div className="w-px h-6 bg-white/20 mx-1"></div>
                  <select 
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    className="bg-transparent px-4 py-2 rounded-lg text-white font-bold text-sm focus:outline-none cursor-pointer font-jakarta appearance-none"
                  >
                    {years.map((y) => (
                      <option key={y} value={y} className="text-gray-900">{y}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {/* Metrics Grid - Inside Header */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
              {isLoading ? (
                <>
                  <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl p-5 animate-pulse h-24"></div>
                  <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl p-5 animate-pulse h-24"></div>
                  <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl p-5 animate-pulse h-24"></div>
                </>
              ) : (
                <>
                  {/* Total Pembelian */}
                  <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl p-5 hover:bg-white/15 transition-all duration-300 group">
                    <div className="flex flex-col h-full justify-between gap-4">
                      <div className="flex items-center gap-2 text-blue-100">
                        <DollarSign size={18} />
                        <p className="text-xs font-bold uppercase tracking-widest">TOTAL PEMBELIAN</p>
                      </div>
                      <div>
                        <p className="text-2xl md:text-3xl font-black text-white font-inter tracking-tight">
                          Rp <AnimatedCounter value={stats.totalSpent} />
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-blue-200">Modal yang dikeluarkan</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Total Item Masuk */}
                  <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl p-5 hover:bg-white/15 transition-all duration-300 group">
                    <div className="flex flex-col h-full justify-between gap-4">
                      <div className="flex items-center gap-2 text-blue-100">
                        <Package size={18} />
                        <p className="text-xs font-bold uppercase tracking-widest">TOTAL ITEM MASUK</p>
                      </div>
                      <div>
                        <p className="text-2xl md:text-3xl font-black text-white font-inter tracking-tight">
                          <AnimatedCounter value={stats.totalItems} />
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-blue-200">Unit stok yang dibeli</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Jumlah Transaksi */}
                  <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl p-5 hover:bg-white/15 transition-all duration-300 group">
                    <div className="flex flex-col h-full justify-between gap-4">
                      <div className="flex items-center gap-2 text-blue-100">
                        <TrendingUp size={18} />
                        <p className="text-xs font-bold uppercase tracking-widest">JUMLAH TRANSAKSI</p>
                      </div>
                      <div>
                        <p className="text-2xl md:text-3xl font-black text-white font-inter tracking-tight">
                          <AnimatedCounter value={stats.totalTransactions} />
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-blue-200">Total pembelian masuk</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Search & Content */}
        <div className="space-y-3">
          {/* Info count */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-slate-400 font-inter transition-colors duration-300">
              Menampilkan <span className="text-blue-600 dark:text-blue-400 font-bold">{filteredData.length > 10 ? '1-10' : `1-${filteredData.length}`}</span> dari <span className="text-blue-600 dark:text-blue-400 font-bold">{filteredData.length}</span> pembelian
            </p>
            <div className="relative max-w-xs">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" size={18} />
              <input 
                type="text"
                placeholder="Cari SKU atau produk..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg font-inter text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
          </div>

          {/* Google Sheet Style Table */}
          <div className="bg-white dark:bg-[#1a1d28] rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden transition-colors duration-300">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                {/* Dark Blue Header */}
                <thead>
                  <tr className="bg-[#1e3a5f]">
                    <th className="px-4 py-3.5 text-left font-inter text-xs font-bold text-white uppercase tracking-wide border-r border-[#2d4a6f]">
                      Tanggal
                    </th>
                    <th className="px-4 py-3.5 text-left font-inter text-xs font-bold text-white uppercase tracking-wide border-r border-[#2d4a6f]">
                      SKU
                    </th>
                    <th className="px-4 py-3.5 text-left font-inter text-xs font-bold text-white uppercase tracking-wide border-r border-[#2d4a6f]">
                      Produk
                    </th>
                    <th className="px-4 py-3.5 text-center font-inter text-xs font-bold text-white uppercase tracking-wide border-r border-[#2d4a6f]">
                      Qty
                    </th>
                    <th className="px-4 py-3.5 text-center font-inter text-xs font-bold text-white uppercase tracking-wide border-r border-[#2d4a6f]">
                      Harga Satuan
                    </th>
                    <th className="px-4 py-3.5 text-center font-inter text-xs font-bold text-white uppercase tracking-wide">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center justify-center text-gray-400 dark:text-slate-500">
                          <ShoppingBag size={48} className="mb-3 opacity-20" />
                          <p className="font-inter text-sm font-medium">Belum ada data pembelian</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((item, index) => {
                      const rowBg = index % 2 === 0 ? 'bg-white dark:bg-[#16171d]' : 'bg-blue-50/30 dark:bg-[#1a1d28]';
                      return (
                        <tr key={item.id} className={`${rowBg} hover:bg-blue-100/50 dark:hover:bg-slate-800 transition-colors border-b border-gray-100 dark:border-slate-800/50`}>
                          <td className="px-4 py-3.5 text-left align-middle font-inter text-sm text-gray-700 dark:text-slate-200 border-r border-gray-100 dark:border-slate-800/50">
                            {format(new Date(item.date), 'dd MMM yyyy')}
                          </td>
                          <td className="px-4 py-3.5 text-left align-middle font-inter text-sm font-semibold text-gray-900 dark:text-white border-r border-gray-100 dark:border-slate-800/50">
                            {item.sku}
                          </td>
                          <td className="px-4 py-3.5 text-left align-middle font-inter text-sm font-medium text-gray-700 dark:text-slate-300 border-r border-gray-100 dark:border-slate-800/50">
                            {item.product_name}
                          </td>
                          <td className="px-4 py-3.5 text-center align-middle font-inter text-sm font-semibold text-gray-900 dark:text-white border-r border-gray-100 dark:border-slate-800/50">
                            {item.qty}
                          </td>
                          <td className="px-4 py-3.5 text-center align-middle font-inter text-sm font-semibold text-blue-600 dark:text-blue-400 border-r border-gray-100 dark:border-slate-800/50">
                            Rp {item.cost_per_unit?.toLocaleString('id-ID') || 0}
                          </td>
                          <td className="px-4 py-3.5 text-center align-middle font-inter text-sm font-bold text-green-600 dark:text-green-400">
                            Rp {((item.qty || 0) * (item.cost_per_unit || 0)).toLocaleString('id-ID')}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
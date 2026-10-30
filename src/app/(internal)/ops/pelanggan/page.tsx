"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { base44 } from "@/lib/ops-api";
import CustomerDirectoryView from "@/components/customers/CustomerDirectoryView";
import type { DirectoryCustomer } from "@/lib/customer-directory";

/**
 * Pusat data pelanggan di dashboard ops — sumber yang sama dengan panel Pelanggan admin
 * (`GET /api/ops/customers` → `buildCustomerDirectory`), tampilannya pakai komponen bersama
 * `CustomerDirectoryView` (filter + sort + drawer detail).
 *
 * Mendukung `?q=` supaya tautan dari menu lain (mis. Database Kota) langsung membuka
 * pelanggan yang dimaksud. Tanpa parameter itu halaman tampil seperti biasa.
 */
export default function OpsPelangganPage() {
  const [initialQuery, setInitialQuery] = useState("");

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("q") || "";
    if (param) setInitialQuery(param);
  }, []);

  const { data: customers = [], isLoading } = useQuery<DirectoryCustomer[]>({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list(),
    initialData: [],
  });

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-br from-[#18181b] to-[#27272a] rounded-3xl relative overflow-hidden p-6 md:p-8 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16" />
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/10 shrink-0">
            <Users size={26} className="text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Pelanggan</h1>
            <p className="text-blue-100 font-medium mt-1">Pusat data pelanggan — akun terdaftar &amp; pembeli dari pesanan</p>
          </div>
        </div>
      </div>

      <CustomerDirectoryView
        customers={customers}
        loading={isLoading}
        emptyText="Belum ada pelanggan"
        initialQuery={initialQuery}
      />
    </div>
  );
}

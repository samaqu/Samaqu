"use client";

import { createContext, useContext, ReactNode, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { useSafeLocale } from "@/lib/safe-i18n";

export interface AkunCustomer {
  id: string;
  name: string;
  whatsapp: string;
  email?: string;
  chest_size?: number | null;
  shoulder_size?: number | null;
  length_size?: number | null;
  sleeve_size?: number | null;
}

interface AkunCtxValue {
  customer: AkunCustomer | null;
  ready: boolean;
}

const AkunCtx = createContext<AkunCtxValue>({ customer: null, ready: false });

export function useAkunCustomer() {
  return useContext(AkunCtx);
}

export function AkunProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useSafeLocale();
  const [customer, setCustomer] = useState<AkunCustomer | null>(null);
  const [ready, setReady] = useState(false);

  const prefix = `/${locale}`;
  const to = (href: string) => `${prefix}${href}`;

  const bare = pathname.replace(/^\/(id|en)/, "") || "/";
  const isAuthRoute =
    bare === "/akun/login" || bare === "/akun/register" || bare === "/akun/lupa-password";

  useEffect(() => {
    let alive = true;
    // Sudah punya customer (mis. pindah halaman di dalam /akun) — jangan fetch ulang.
    if (isAuthRoute || customer) { setReady(true); return; }
    async function init() {
      try {
        // getCurrentCustomer() sudah mengembalikan email dari session, jadi cukup satu
        // alur: session (lokal) + satu query `customers`.
        const c = await getCurrentCustomer();
        if (!alive) return;
        if (!c) {
          // Jangan biarkan shell berputar selamanya kalau sesi tidak valid.
          setReady(true);
          router.replace(to("/akun/login"));
          return;
        }
        setCustomer(c as AkunCustomer);
        setReady(true);
      } catch (error) {
        // Error jaringan/RLS tidak boleh membuat dashboard stuck di spinner.
        console.error("[AkunProvider] gagal memuat customer:", error);
        if (alive) setReady(true);
      }
    }
    init();
    return () => { alive = false; };
    // deps cuma pathname: saat keluar dari /akun/login customer belum terisi,
    // jadi effect harus jalan lagi setelah pindah ke halaman akun.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <AkunCtx.Provider value={{ customer, ready }}>
      {children}
    </AkunCtx.Provider>
  );
}

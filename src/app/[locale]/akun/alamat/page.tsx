"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { useSafeLocale } from "@/lib/safe-i18n";
import { AkunHeader } from "@/components/akun/AkunShell";

interface Address {
  id: string;
  label: string;
  recipient_name: string;
  phone: string;
  address: string;
  city: string;
  kecamatan?: string | null;
  province?: string | null;
  postal_code: string;
  is_default: boolean;
}

export default function AlamatPage() {
  const locale = useSafeLocale();
  const to = (href: string) => `/${locale}${href}`;
  const [list, setList] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  async function load(customerId: string) {
    const { data } = await supabase
      .from("saved_addresses")
      .select("*")
      .eq("customer_id", customerId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    setList((data as Address[]) || []);
  }

  useEffect(() => {
    async function init() {
      const c = await getCurrentCustomer();
      if (!c) return;
      await load(c.id);
      setLoading(false);
    }
    init();
  }, []);

  async function hapus(addr: Address) {
    setMenuFor(null);
    const c = await getCurrentCustomer();
    if (!c) return;
    await supabase.from("saved_addresses").delete().eq("id", addr.id);
    const remaining = list.filter((a) => a.id !== addr.id);
    if (addr.is_default && remaining.length > 0) {
      await supabase.from("saved_addresses").update({ is_default: true }).eq("id", remaining[0].id);
    }
    await load(c.id);
  }

  async function jadikanUtama(addr: Address) {
    setMenuFor(null);
    const c = await getCurrentCustomer();
    if (!c) return;
    await supabase.from("saved_addresses").update({ is_default: false }).eq("customer_id", c.id);
    await supabase.from("saved_addresses").update({ is_default: true }).eq("id", addr.id);
    await load(c.id);
  }

  return (
    <>
      <AkunHeader title="Alamat Pengiriman" back="/akun" />

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 md:gap-5">
          {[0, 1].map((i) => <div key={i} className="akun-card h-32 animate-pulse" />)}
        </div>
      ) : list.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 md:gap-5">
          {list.map((a) => (
            <article key={a.id} className="akun-card p-5 flex gap-3 relative">
              <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="#000000" strokeWidth="1.6"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-sm md:text-base" style={{ color: "#000000" }}>{a.label || "Alamat"}</span>
                  {a.is_default && <span className="akun-pill akun-pill-selesai">Alamat Utama</span>}
                </div>
                <p className="text-[13px] md:text-sm text-[#777777] mt-1.5 leading-relaxed">
                  {a.recipient_name} • {a.phone}<br />
                  {a.address}{a.kecamatan ? `, ${a.kecamatan}` : ""}, {a.city}{a.province ? `, ${a.province}` : ""} {a.postal_code}
                </p>
              </div>
              {!a.is_default && (
                <button onClick={() => setMenuFor(menuFor === a.id ? null : a.id)} className="shrink-0 text-[#9aa5a1] px-1" aria-label="Opsi">
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
                </button>
              )}
              {menuFor === a.id && (
                <div className="absolute right-4 top-12 z-20 w-44 rounded-xl bg-white shadow-lg border border-[#E8E8E8] py-1.5">
                  <Link href={to(`/akun/alamat/${a.id}`)} onClick={() => setMenuFor(null)} className="block px-4 py-2.5 text-sm font-semibold hover:bg-[#f2efe8]" style={{ color: "#000000" }}>Ubah</Link>
                  <button onClick={() => jadikanUtama(a)} className="block w-full text-left px-4 py-2.5 text-sm font-semibold hover:bg-[#f2efe8]" style={{ color: "#000000" }}>Jadikan utama</button>
                  <button onClick={() => hapus(a)} className="block w-full text-left px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50">Hapus</button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="akun-card p-8 md:p-12 text-center md:max-w-[520px] md:mx-auto">
          <div className="mx-auto w-16 h-16 rounded-2xl grid place-items-center" style={{ background: "#f2f2f2" }}>
            <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="#000000" strokeWidth="1.5"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>
          </div>
          <p className="mt-4 font-extrabold" style={{ color: "#000000" }}>Belum ada alamat tersimpan</p>
          <p className="text-sm text-[#777777] mt-1">Tambah alamat untuk mempercepat proses checkout.</p>
        </div>
      )}

      <Link href={to("/akun/alamat/baru")} className="akun-btn-green block text-center w-full mt-5 py-4 rounded-full font-extrabold text-sm md:text-base transition active:scale-[.99]">
        + Tambah Alamat Baru
      </Link>
    </>
  );
}
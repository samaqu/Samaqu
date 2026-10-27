"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { useSafeLocale } from "@/lib/safe-i18n";
import { AkunHeader } from "@/components/akun/AkunShell";
import { rupiah } from "@/lib/akun-format";

interface WProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  minimum_price?: number | null;
  create_your_price_enabled?: boolean;
}

export default function WishlistPage() {
  const locale = useSafeLocale();
  const to = (href: string) => `/${locale}${href}`;
  const [items, setItems] = useState<WProduct[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const c = await getCurrentCustomer();
      if (!c) return;
      const { data: rows } = await supabase.from("wishlists").select("product_id").eq("customer_id", c.id);
      const ids = (rows || []).map((r) => r.product_id);
      if (ids.length === 0) { setLoading(false); return; }
      const { data: prods } = await supabase.from("products").select("id, name, category, price, image, minimum_price, create_your_price_enabled").eq("is_published", true).in("id", ids);
      setItems((prods as WProduct[]) || []);
      const { data: imgs } = await supabase.from("product_images").select("product_id, url, is_video").in("product_id", ids).order("display_order");
      if (imgs) {
        const t: Record<string, string> = {};
        for (const p of (prods as WProduct[]) || []) {
          const first = imgs.find((i: { product_id: string; url: string; is_video: boolean }) => i.product_id === p.id && !i.is_video);
          t[p.id] = first?.url || (p.image && !/\.(mp4|webm|ogg)$/i.test(p.image) ? p.image : "");
        }
        setThumbs(t);
      }
      setLoading(false);
    }
    init();
  }, []);

  async function hapus(productId: string) {
    const c = await getCurrentCustomer();
    if (!c) return;
    setItems((prev) => prev.filter((p) => p.id !== productId));
    await supabase.from("wishlists").delete().eq("customer_id", c.id).eq("product_id", productId);
  }

  function priceOf(p: WProduct) {
    return p.create_your_price_enabled && p.minimum_price
      ? `Mulai dari ${rupiah(p.minimum_price)}`
      : rupiah(p.price);
  }

  return (
    <>
      <AkunHeader title="Wishlist" back="/akun" />

      {loading ? (
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4 md:gap-5">
          {[0, 1, 2].map((i) => <div key={i} className="akun-card h-64 animate-pulse" />)}
        </div>
      ) : items.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4 md:gap-5">
          {items.map((p) => (
            <article key={p.id} className="akun-card p-3 md:p-4 flex md:block gap-3 relative">
              <Link href={to(`/katalog/${p.id}`)} className="thumb akun-thumb w-20 h-20 md:w-full md:h-44 shrink-0 overflow-hidden block">
                {thumbs[p.id] ? (
                  <img src={thumbs[p.id]} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <svg viewBox="0 0 24 24" className="w-9 h-9 md:w-14 md:h-14" fill="none" stroke="#000000" strokeWidth="1.1"><path d="M9 3h6l3 3-2 2v13H8V8L6 6z" /></svg>
                )}
              </Link>
              <button onClick={() => hapus(p.id)} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 grid place-items-center shadow" aria-label="Hapus dari wishlist">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="#000000"><path d="M12 20s-7-4.35-7-9a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 4.65-7 9-7 9Z" /></svg>
              </button>
              <div className="min-w-0 flex-1 md:mt-3">
                <Link href={to(`/katalog/${p.id}`)}>
                  <p className="font-bold text-sm md:text-base leading-snug" style={{ color: "#000000" }}>{p.name}</p>
                </Link>
                <p className="text-[12px] md:text-sm text-[#777777]">{p.category}</p>
                <p className="font-extrabold mt-1 md:mt-2" style={{ color: "#000000" }}>{priceOf(p)}</p>
                <div className="flex items-center gap-2 mt-2.5">
                  <Link href={to(`/katalog/${p.id}`)} className="akun-btn-gold flex-1 py-2.5 rounded-full text-xs font-extrabold text-center">Pilih Opsi</Link>
                  <button onClick={() => hapus(p.id)} className="w-9 h-9 grid place-items-center rounded-full border border-[#DFDFDF] text-[#9aa5a1]" aria-label="Hapus">
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></svg>
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="akun-card p-8 md:p-12 text-center md:max-w-[520px] md:mx-auto">
          <div className="mx-auto w-20 h-20 rounded-2xl grid place-items-center" style={{ background: "#f2f2f2" }}>
            <svg viewBox="0 0 24 24" className="w-10 h-10" fill="none" stroke="#000000" strokeWidth="1.5"><path d="M12 20s-7-4.35-7-9a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 4.65-7 9-7 9Z" /></svg>
          </div>
          <p className="mt-5 text-lg font-extrabold" style={{ color: "#000000" }}>Wishlist kamu masih kosong</p>
          <p className="text-sm text-[#777777] mt-1">Tandai koleksi favoritmu biar gampang dicari lagi.</p>
          <Link href={to("/katalog")} className="akun-btn-gold mt-6 inline-block w-full md:w-auto md:px-10 py-3.5 rounded-full font-extrabold text-sm tracking-wide text-center">LIHAT KOLEKSI</Link>
        </div>
      )}
    </>
  );
}
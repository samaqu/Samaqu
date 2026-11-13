"use client";

import Link from "next/link";
import { ArrowRight, Tag } from "lucide-react";
import type { ResellerDiscountView } from "@/lib/reseller/client";

/** 25 -> "25", 17.5 -> "17,5" */
function angka(persen: number): string {
  return String(Math.round(persen * 100) / 100).replace(".", ",");
}

/**
 * Kartu "Diskon kamu" di Beranda — angkanya dari pengaturan admin (diskon khusus reseller, atau default).
 * Berbentuk tiket: angka persen besar di kiri, penjelasan di kanan.
 */
export default function DiscountCard({ diskon }: { diskon: ResellerDiscountView }) {
  const adaDiskon = diskon.persen > 0;
  // Diskon 0% tidak perlu label "khusus untuk kamu" — tidak ada keistimewaan yang dirayakan.
  const khusus = diskon.sumber === "khusus" && adaDiskon;

  return (
    <section className={`disc-card${khusus ? " khusus" : ""}`} aria-label={`Diskon reseller kamu ${angka(diskon.persen)} persen`}>
      <div className="disc-main">
        <div className="disc-num" aria-hidden="true">
          <small>Diskon</small>
          <b>
            {angka(diskon.persen)}
            <span>%</span>
          </b>
        </div>

        <div className="disc-txt">
          <span className="disc-tag">
            <Tag size={12} /> {khusus ? "Khusus untuk kamu" : "Diskon reseller"}
          </span>
          <p className="disc-title">
            {adaDiskon ? `Belanja stok ${angka(diskon.persen)}% lebih murah dari harga katalog` : "Harga beli sama dengan harga katalog"}
          </p>
          <p className="disc-sub">Beberapa series bisa punya diskon khusus yang berbeda. Harga akhir tampil di Katalog.</p>
        </div>
      </div>

      <Link href="/reseller/katalog" className="btn disc-cta">
        Lihat Katalog <ArrowRight size={16} />
      </Link>
    </section>
  );
}

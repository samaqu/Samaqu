import { bigShoulders, instrumentSans } from "@/lib/promo/free-cover-hanger-font";

/**
 * Layout promo: font Big Shoulders Display + Instrument Sans hanya dimuat di
 * subtree promo ini, dan variabelnya juga dipasang di sini agar tidak bocor ke
 * halaman lain.
 */
export default function PromoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${bigShoulders.variable} ${instrumentSans.variable}`}>{children}</div>
  );
}

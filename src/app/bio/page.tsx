import BioLinkPage from "@/components/BioLinkPage";
import type { BioOpenOrderPhase } from "@/components/BioOpenOrderBanner";
import { plusJakarta } from "@/lib/bio-font";
import { fetchBioPageContent } from "@/lib/bio-page-content";
import { readOpenOrderWindow } from "@/lib/open-order-settings";
import {
  openOrderDeadline,
  openOrderStartDeadline,
  resolveOpenOrderState,
} from "@/lib/open-order-window";

export const dynamic = "force-dynamic";

export default async function Page() {
  const content = await fetchBioPageContent();

  // Jendela Open Order — biar halaman bio bisa ngasih tahu kalau ada event yang lagi
  // dibuka atau mau dibuka. Periodenya sudah lewat → nggak ada bar pengumuman sama sekali
  // (nggak ada tombol mati di halaman).
  const window = await readOpenOrderWindow();
  const state = resolveOpenOrderState(window);
  const phase: BioOpenOrderPhase | null =
    state === "open" ? "live" : state === "before" ? "upcoming" : null;
  const target = state === "open" ? openOrderDeadline(window) : openOrderStartDeadline(window);

  const openOrder =
    phase && target
      ? { phase, target, href: "/id/open-order" }
      : null;

  return (
    <div
      className={plusJakarta.variable}
      style={{ fontFamily: "var(--font-plus-jakarta), system-ui, sans-serif" }}
    >
      <BioLinkPage content={content} openOrder={openOrder} />
    </div>
  );
}

"use client";

import {
  MessageCircle,
  Package,
  Ruler,
  Search,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { toolLabel } from "./utils";

const ICONS: Record<string, LucideIcon> = {
  cari_produk: Search,
  panduan_ukuran: Ruler,
  cek_status_pesanan: Package,
  hubungi_admin: MessageCircle,
  cek_ongkir: Truck,
  cari_area_ongkir: Truck,
};

export default function ToolBadge({ tool }: { tool: string }) {
  const Icon = ICONS[tool] || Search;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ background: "#F4F4F1", color: "#6B6A64", border: "1px solid #E7E6E1" }}
    >
      <Icon size={11} />
      {toolLabel(tool)} · {tool}
    </span>
  );
}

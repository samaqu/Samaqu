"use client";

import { Trash2 } from "lucide-react";
import { rupiah } from "@/lib/reseller/format";
import ItemEditor from "./ItemEditor";
import type { OrderLine } from "./types";

/** Satu item pesanan: kartu terbuka (edit) atau baris ringkas saat tertutup. */
export default function ItemCard({
  line,
  open,
  onToggle,
  onChange,
  onVariant,
  onRemove,
  onReplace,
}: {
  line: OrderLine;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<OrderLine>) => void;
  onVariant: (patch: { color?: string; size?: string }) => void;
  onRemove: () => void;
  onReplace: () => void;
}) {
  const title = line.product.series
    ? `${line.product.name} — ${line.product.series}`
    : line.product.name;

  if (!open) {
    return (
      <div className="item-compact" data-line-uid={line.uid}>
        <div className="min-w-0">
          <div className="bold" style={{ fontSize: 12.5 }}>
            {title}
          </div>
          <div className="small muted">
            {line.size || "Ukuran belum dipilih"} × {line.quantity}
          </div>
        </div>
        <div className="ic-actions">
          <b className="ic-price">{rupiah(line.sellPrice)}</b>
          <button type="button" className="ic-btn" onClick={onToggle}>
            Ubah
          </button>
          <button type="button" className="ic-btn danger" aria-label={`Hapus ${title}`} onClick={onRemove}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-line-uid={line.uid}>
      <ItemEditor
        line={line}
        onChange={onChange}
        onVariant={onVariant}
        onRemove={onRemove}
      />
      <div className="item-card-actions">
        <button type="button" className="btn ghost sm" onClick={onReplace}>
          Ganti produk
        </button>
        <button type="button" className="btn ghost sm" onClick={onToggle}>
          Tutup
        </button>
      </div>
    </div>
  );
}

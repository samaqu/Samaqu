"use client";

import { ChevronRight, Tag, Trash2 } from "lucide-react";
import { rupiah } from "@/lib/reseller/format";
import ProductPhoto from "../ProductPhoto";
import ItemEditor from "./ItemEditor";
import type { OrderLine } from "./types";

/**
 * Satu item pesanan: kartu terbuka (edit) atau, setelah Simpan, sel daftar ringkas ala app native.
 * Sel ringkas memuat foto, nama, ukuran x jumlah, lencana diskon, dan harga jual; seluruh sel bisa diketuk
 * untuk membuka lagi, sedangkan tombol hapus terpisah supaya tidak salah pencet.
 */
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
        <button type="button" className="ic-main" onClick={onToggle} aria-label={`Ubah ${title}`}>
          <ProductPhoto src={line.product.image} name={line.product.name} series={line.product.series} className="ic-photo" />
          <span className="ic-txt">
            <span className="ic-name">{title}</span>
            <span className="ic-meta">
              <span>
                {line.size || "Ukuran belum dipilih"} × {line.quantity}
              </span>
              <span className="ic-disc">
                <Tag size={11} aria-hidden="true" />
                Diskon {line.product.discount_percent}%
              </span>
            </span>
            <span className="ic-price">
              Harga jual <b>{rupiah(line.sellPrice)}</b>
            </span>
          </span>
          <ChevronRight size={18} className="ic-chev" aria-hidden="true" />
        </button>
        <button type="button" className="ic-del" aria-label={`Hapus ${title}`} onClick={onRemove}>
          <Trash2 size={17} />
        </button>
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
        onReplace={onReplace}
        onSave={onToggle}
      />
    </div>
  );
}

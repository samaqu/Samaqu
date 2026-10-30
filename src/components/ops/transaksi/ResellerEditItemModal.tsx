"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { base44 } from "@/lib/ops-api";
import { RESELLER_EDIT_NOTICE, orderEditGuard } from "@/lib/order-edit";

type EditItem = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
  color: string;
  size: string;
  initialColor: string;
  initialSize: string;
  image: string | null;
};

type VariantGroup = { color: string; stock: Record<string, number> };

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

/** Edit terbatas pesanan reseller: HANYA ukuran/warna (qty, produk, harga terkunci). */
export default function ResellerEditItemModal({
  order,
  onClose,
  onSaved,
}: {
  order: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<EditItem[]>([]);
  const [variants, setVariants] = useState<Record<string, VariantGroup[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const guard = useMemo(() => orderEditGuard(order), [order]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setItems(
      (order?.items || []).map((item: any) => {
        const color = String(item.color || "default");
        const size = String(item.size || "").toUpperCase();
        return {
          id: String(item.id),
          product_id: String(item.product_id || ""),
          product_name: String(item.product_name || ""),
          quantity: Number(item.quantity) || 1,
          price: Number(item.price) || 0,
          color,
          size,
          initialColor: color,
          initialSize: size,
          image: item.product_image || null,
        };
      }),
    );

    base44.entities.ProductVariant.list()
      .then((rows: any[]) => {
        if (!alive) return;
        const map: Record<string, VariantGroup[]> = {};
        for (const row of rows || []) {
          const productId = String(row.product_id || "");
          if (!productId) continue;
          const group: VariantGroup = {
            color: String(row.color || "default"),
            stock: row.stock && typeof row.stock === "object" ? row.stock : {},
          };
          (map[productId] = map[productId] || []).push(group);
        }
        setVariants(map);
      })
      .catch(() => alive && setError("Gagal memuat varian produk."))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [order]);

  const colorsOf = (item: EditItem): VariantGroup[] => variants[item.product_id] || [];

  const stockOf = (item: EditItem, color: string, size: string): number => {
    const group = colorsOf(item).find((row) => row.color === color);
    return Math.max(0, Number(group?.stock?.[size]) || 0);
  };

  const sizesOf = (item: EditItem, color: string): string[] => {
    const group = colorsOf(item).find((row) => row.color === color);
    if (!group) return [item.size].filter(Boolean);
    return SIZES.filter((size) => size in group.stock);
  };

  const updateItem = (id: string, patch: Partial<EditItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const chooseColor = (item: EditItem, color: string) => {
    const sizes = sizesOf(item, color);
    const currentOk = sizes.includes(item.size) && stockOf(item, color, item.size) > 0;
    const nextSize = currentOk ? item.size : sizes.find((size) => stockOf(item, color, size) > 0) || sizes[0] || item.size;
    updateItem(item.id, { color, size: nextSize });
  };

  const save = async () => {
    if (!guard.canEdit || saving) return;
    setError("");
    for (const item of items) {
      if (!item.size) {
        setError(`Pilih ukuran untuk ${item.product_name}.`);
        return;
      }
      const stock = stockOf(item, item.color, item.size);
      const changed = item.color !== item.initialColor || item.size !== item.initialSize;
      if (changed && stock < 1) {
        setError(`Stok ukuran ${item.size} ${item.product_name} sedang habis. Pilih ukuran lain.`);
        return;
      }
    }
    setSaving(true);
    try {
      await base44.entities.Transaction.updateManual({
        order_number: order.order_number,
        items: items.map((item) => ({
          source_item_id: item.id,
          product_id: item.product_id,
          quantity: item.quantity,
          price: item.price,
          color: item.color,
          size: item.size,
        })),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan perubahan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200">
          <div>
            <h3 className="font-extrabold text-slate-900 text-sm">Ubah item reseller</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 font-mono">{order.order_number}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Tutup">
            <X size={17} className="text-slate-500" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800 leading-relaxed">
            {RESELLER_EDIT_NOTICE}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-6 justify-center">
              <Loader2 size={16} className="animate-spin" /> Memuat varian…
            </div>
          ) : (
            items.map((item) => {
              const colors = colorsOf(item);
              const sizes = sizesOf(item, item.color);
              return (
                <div key={item.id} className="rounded-xl border border-slate-200 p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-extrabold text-slate-900 leading-tight">{item.product_name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Qty {item.quantity} · Rp {item.price.toLocaleString("id-ID")} · terkunci
                      </p>
                    </div>
                    {item.image ? (
                      <img src={item.image} alt="" className="w-10 h-12 rounded-lg object-cover border border-slate-200 shrink-0" />
                    ) : null}
                  </div>

                  {colors.length > 1 ? (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Warna</p>
                      <div className="flex flex-wrap gap-1.5">
                        {colors.map((group) => {
                          const total = Object.values(group.stock).reduce((sum, value) => sum + (Number(value) || 0), 0);
                          const active = item.color === group.color;
                          return (
                            <button
                              key={group.color}
                              type="button"
                              disabled={!active && total < 1}
                              onClick={() => chooseColor(item, group.color)}
                              className={`px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold border disabled:opacity-40 ${
                                active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"
                              }`}
                            >
                              {group.color === "default" ? "Default" : group.color}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Ukuran</p>
                    <div className="grid grid-cols-6 gap-1.5">
                      {sizes.map((size) => {
                        const stock = stockOf(item, item.color, size);
                        const active = item.size === size;
                        return (
                          <button
                            key={size}
                            type="button"
                            disabled={stock < 1 && !active}
                            onClick={() => updateItem(item.id, { size })}
                            className={`min-h-[44px] rounded-lg border text-[11.5px] font-bold flex flex-col items-center justify-center ${
                              active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"
                            } disabled:opacity-35`}
                          >
                            <span>{size}</span>
                            <span className={`text-[9px] ${active ? "text-white/70" : "text-slate-400"}`}>{stock}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {!guard.canEdit ? (
            <p className="text-[12px] font-semibold text-red-600">{guard.reason}</p>
          ) : null}
          {error ? <p className="text-[12px] font-semibold text-red-600">{error}</p> : null}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-slate-200">
          <button type="button" onClick={onClose} className="flex-1 min-h-[44px] rounded-xl bg-slate-100 text-slate-700 text-sm font-bold">
            Batal
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!guard.canEdit || saving || loading}
            className="flex-1 min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : null}
            Simpan ukuran/warna
          </button>
        </div>
      </div>
    </div>
  );
}

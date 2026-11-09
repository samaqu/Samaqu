"use client";

import { useState, useEffect } from "react";
import { m as motion, AnimatePresence } from "framer-motion";
import { X, SlidersHorizontal, Check } from "lucide-react";
import { colorMap, type Category } from "@/lib/katalog-data";

const allSizes = ["S", "M", "L", "XL", "XXL"];

const allColors = [
  "Superblack", "Broken White", "Latte", "Grey Indigo", "Mint", "Navy",
  "Coffee Brown", "Deep Maroon", "Charcoal Grey", "Soft Grey",
];

const priceRanges = [
  { id: "under300", label: "Di bawah Rp 300.000", min: 0, max: 299999 },
  { id: "300to500", label: "Rp 300.000 – 500.000", min: 300000, max: 500000 },
  { id: "above500", label: "Di atas Rp 500.000", min: 500001, max: Infinity },
];

export interface FilterState {
  sizes: string[];
  colors: string[];
  priceRange: string | null;
}

interface FilterDrawerProps {
  open: boolean;
  onClose: () => void;
  initial: FilterState;
  onApply: (filters: FilterState) => void;
  activeCount: number;
}

export default function FilterDrawer({ open, onClose, initial, onApply, activeCount }: FilterDrawerProps) {
  const [sizes, setSizes] = useState<string[]>(initial.sizes);
  const [colors, setColors] = useState<string[]>(initial.colors);
  const [priceRange, setPriceRange] = useState<string | null>(initial.priceRange);

  useEffect(() => {
    if (open) {
      setSizes(initial.sizes);
      setColors(initial.colors);
      setPriceRange(initial.priceRange);
    }
  }, [open, initial]);

  function toggleSize(s: string) {
    setSizes((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }

  function toggleColor(c: string) {
    setColors((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  }

  function resetLocal() {
    setSizes([]);
    setColors([]);
    setPriceRange(null);
  }

  function apply() {
    onApply({ sizes, colors, priceRange });
    onClose();
  }

  const localCount = sizes.length + colors.length + (priceRange ? 1 : 0);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[9990]"
            style={{ background: "rgba(0,0,0,.35)", backdropFilter: "blur(2px)" }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-0 right-0 bottom-0 z-[9991] w-full max-w-[380px] flex flex-col"
            style={{ background: "var(--cream)", boxShadow: "-8px 0 40px -12px rgba(0,0,0,.18)" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 shrink-0"
              style={{ borderBottom: "1px solid rgba(0,0,0,.15)" }}>
              <div className="flex items-center gap-2.5">
                <SlidersHorizontal size={17} style={{ color: "#000000" }} />
                <h2 className="text-[15px] font-ui font-semibold" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}>
                  Filter Produk
                </h2>
              </div>
              <button onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
                style={{ border: "1px solid rgba(0,0,0,.25)" }}
                aria-label="Tutup filter">
                <X size={16} style={{ color: "var(--espresso)" }} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {/* Ukuran */}
              <FilterSection title="Ukuran">
                <div className="flex flex-wrap gap-2">
                  {allSizes.map((s) => {
                    const active = sizes.includes(s);
                    return (
                      <button key={s} onClick={() => toggleSize(s)}
                        className="w-11 h-11 flex items-center justify-center text-[13px] font-ui font-medium rounded-lg transition-all duration-200"
                        style={{
                          background: active ? "var(--espresso)" : "rgba(255,255,255,.5)",
                          color: active ? "var(--cream)" : "var(--coffee)",
                          border: `1.5px solid ${active ? "var(--espresso)" : "rgba(0,0,0,.25)"}`,
                        }}>
                        {s}
                      </button>
                    );
                  })}
                </div>
              </FilterSection>

              {/* Warna */}
              <FilterSection title="Warna">
                <div className="flex flex-wrap gap-2">
                  {allColors.map((c) => {
                    const active = colors.includes(c);
                    return (
                      <button key={c} onClick={() => toggleColor(c)}
                        className="flex items-center gap-2 px-3 py-2 text-[12px] font-ui rounded-lg transition-all duration-200"
                        style={{
                          background: active ? "var(--espresso)" : "rgba(255,255,255,.5)",
                          color: active ? "var(--cream)" : "var(--coffee)",
                          border: `1.5px solid ${active ? "var(--espresso)" : "rgba(0,0,0,.25)"}`,
                        }}>
                        <span className="w-4 h-4 rounded-full shrink-0 relative"
                          style={{ background: colorMap[c] || "#ccc", border: "1px solid rgba(0,0,0,.1)" }}>
                          {active && (
                            <span className="absolute inset-0 flex items-center justify-center">
                              <Check size={10} strokeWidth={3} style={{ color: colorMap[c] === "#f5f0e8" || colorMap[c] === "#f8f8f8" ? "var(--espresso)" : "white" }} />
                            </span>
                          )}
                        </span>
                        {c}
                      </button>
                    );
                  })}
                </div>
              </FilterSection>

              {/* Harga */}
              <FilterSection title="Rentang Harga">
                <div className="flex flex-col gap-2">
                  {priceRanges.map((r) => {
                    const active = priceRange === r.id;
                    return (
                      <button key={r.id} onClick={() => setPriceRange(active ? null : r.id)}
                        className="flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all duration-200"
                        style={{
                          background: active ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.5)",
                          border: `1.5px solid ${active ? "#000000" : "rgba(0,0,0,.2)"}`,
                        }}>
                        <div className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center"
                          style={{ border: `2px solid ${active ? "#000000" : "rgba(0,0,0,.4)"}` }}>
                          {active && <div className="w-2 h-2 rounded-full" style={{ background: "#000000" }} />}
                        </div>
                        <span className="text-[12px] font-ui" style={{ color: active ? "var(--espresso)" : "var(--coffee)" }}>
                          {r.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </FilterSection>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 shrink-0 flex gap-3" style={{ borderTop: "1px solid rgba(0,0,0,.12)" }}>
              <button onClick={resetLocal}
                className="px-5 py-3 rounded-xl text-[12px] font-ui font-semibold transition-all duration-200 hover:scale-[1.02]"
                style={{ border: "1.5px solid rgba(0,0,0,.3)", color: "var(--coffee)", background: "transparent" }}>
                Reset
              </button>
              <button onClick={apply}
                className="flex-1 py-3 rounded-xl text-[12px] tracking-[0.06em] uppercase font-ui font-semibold transition-all duration-200 active:scale-[0.98]"
                style={{ background: "#000000", color: "white", boxShadow: "0 4px 16px -4px rgba(0,0,0,.4)" }}>
                Terapkan{localCount > 0 ? ` (${localCount})` : ""}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="text-[11px] tracking-[0.12em] uppercase font-ui font-medium mb-3" style={{ color: "var(--stone)" }}>
        {title}
      </p>
      {children}
    </div>
  );
}

/* ── Helper: apply filter state to product list ── */
export function applyFilters<T extends { colors: string[]; price: number }>(
  items: T[],
  filters: FilterState
): T[] {
  let result = items;
  if (filters.sizes.length > 0) {
    // Products with any matching size — since sizes aren't in product data,
    // we keep all products when size filter is active (size is per-variant, not per-product)
  }
  if (filters.colors.length > 0) {
    result = result.filter((p) => p.colors.some((c) => filters.colors.includes(c)));
  }
  if (filters.priceRange) {
    const range = priceRanges.find((r) => r.id === filters.priceRange);
    if (range) {
      result = result.filter((p) => p.price >= range.min && p.price <= range.max);
    }
  }
  return result;
}

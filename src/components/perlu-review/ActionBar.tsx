"use client";

import { useEffect, useRef, useState } from "react";

export default function ActionBar({
  busy,
  onEdit,
  onApprove,
  onReject,
  onDelete,
}: {
  busy: boolean;
  onEdit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className="sticky bottom-0 z-20 rounded-b-2xl border-t px-4 py-3 sm:px-5" style={{ borderColor: "#E7E6E1", background: "#FBFCFD" }}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="max-w-md text-[10px] leading-relaxed" style={{ color: "#8A8880" }}>
          Stok dan order baru dibuat setelah Setujui & Proses. Draft tidak mengubah stok.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              disabled={busy}
              onClick={() => setMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="h-9 rounded-lg border bg-white px-3 text-[11px] font-bold disabled:opacity-50"
              style={{ borderColor: "#E7E6E1", color: "#6B6A64" }}
            >
              Lainnya
            </button>
            {menuOpen ? (
              <div className="absolute bottom-[calc(100%+8px)] left-0 z-30 min-w-[140px] overflow-hidden rounded-xl border bg-white py-1 shadow-lg" style={{ borderColor: "#E7E6E1" }} role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="block w-full px-3 py-2 text-left text-[11px] font-bold hover:bg-[#FCE8E8]"
                  style={{ color: "#9B2C2C" }}
                >
                  Hapus
                </button>
              </div>
            ) : null}
          </div>
          <span className="h-6 w-px" style={{ background: "#E7E6E1" }} aria-hidden="true" />
          <button
            type="button"
            disabled={busy}
            onClick={onReject}
            className="h-9 rounded-lg border px-3 text-[11px] font-bold disabled:opacity-50"
            style={{ borderColor: "#F3CFCB", color: "#9B2C2C", background: "#fff" }}
          >
            Tolak
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onEdit}
            className="h-9 rounded-lg border px-3 text-[11px] font-bold disabled:opacity-50"
            style={{ borderColor: "#DADDE0", color: "#36434A", background: "#fff" }}
          >
            Edit
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onApprove}
            className="h-9 rounded-lg px-3.5 text-[11px] font-bold text-white disabled:opacity-50"
            style={{ background: "#1F7A4D" }}
          >
            Setujui & Proses
          </button>
        </div>
      </div>
    </div>
  );
}

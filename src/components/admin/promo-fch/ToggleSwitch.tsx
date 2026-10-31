"use client";

/**
 * Toggle switch halaman promo — bentuknya benar-benar switch (bukan pill teks),
 * warna ON memakai aksen biru, OFF memakai token netral.
 */

import { PROMO_COLORS } from "./primitives";

export function ToggleSwitch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Label aksesibilitas (tidak tampil). */
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        width: 46,
        height: 26,
        padding: 3,
        background: checked ? PROMO_COLORS.accent : PROMO_COLORS.toggleOff,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span
        className="block rounded-full bg-white transition-transform duration-200"
        style={{
          width: 20,
          height: 20,
          transform: checked ? "translateX(20px)" : "translateX(0)",
          boxShadow: "0 1px 3px rgba(0,0,0,.25)",
        }}
      />
    </button>
  );
}

/** Ikon per tab tahap — satu sumber untuk dashboard ops dan /admin. */
export default function StageIcon({ stage }: { stage: string }) {
  switch (stage) {
    case "belum_bayar":
      return (
        <svg viewBox="0 0 24 24">
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="M3 10h18M7 15h3" />
        </svg>
      );
    case "menunggu_stok":
      return (
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "menunggu_ongkir":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M2 7h12v10H2zM14 10h4l3 3v4h-7" />
          <circle cx="6" cy="18" r="2" />
          <path d="M17 18h.01" />
        </svg>
      );
    case "belum_dipacking":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" />
        </svg>
      );
    case "sudah_dipacking":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />
        </svg>
      );
    case "dikirim":
      return (
        <svg viewBox="0 0 24 24">
          <path d="M2 7h12v10H2zM14 10h4l3 3v4h-7" />
          <circle cx="6" cy="18" r="2" />
          <circle cx="17" cy="18" r="2" />
        </svg>
      );
    case "selesai":
      return (
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12l3 3 5-6" />
        </svg>
      );
    case "dibatalkan":
      return (
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9l6 6M15 9l-6 6" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24">
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      );
  }
}

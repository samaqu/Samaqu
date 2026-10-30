/**
 * Interval yang berhenti saat tab tidak terlihat dan langsung menyegarkan data
 * ketika tab dibuka lagi.
 *
 * Dashboard internal sering dibiarkan terbuka sepanjang hari. `setInterval` biasa
 * tetap memanggil API walau tab di background, sehingga server terus bekerja tanpa
 * ada yang melihat hasilnya. Helper ini hanya menjalankan callback saat tab aktif.
 *
 * Pemanggil tetap melakukan fetch pertama sendiri; helper ini hanya mengurus
 * pengulangan + refresh saat tab kembali terlihat.
 */
export function startVisiblePolling(run: () => void, intervalMs: number): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  let timer: number | null = null;
  let disposed = false;

  const isVisible = () => document.visibilityState !== "hidden";

  const stop = () => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };

  const start = () => {
    if (disposed || timer !== null) return;
    timer = window.setInterval(() => {
      if (isVisible()) run();
    }, intervalMs);
  };

  const onVisibilityChange = () => {
    if (disposed) return;
    if (isVisible()) {
      // Tab kembali aktif: data langsung segar, lalu interval berjalan lagi.
      run();
      start();
    } else {
      stop();
    }
  };

  start();
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    disposed = true;
    stop();
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

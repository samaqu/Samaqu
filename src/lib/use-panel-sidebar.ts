"use client";

import { useEffect, useState } from "react";

/**
 * Status sidebar panel Admin Operasional (terlipat / tidak) untuk halaman yang perlu
 * menyesuaikan lebar kolom. Nilainya dibaca dari atribut `data-panel-sidebar` di <html>
 * yang dipasang PanelShell (dan script anti-kedip di layout), lalu dipantau lewat
 * MutationObserver supaya ikut berubah saat tombol lipat ditekan.
 */
export function usePanelSidebarCollapsed(): boolean {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const read = () =>
      setCollapsed(document.documentElement.getAttribute("data-panel-sidebar") === "collapsed");
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-panel-sidebar"],
    });
    return () => observer.disconnect();
  }, []);

  return collapsed;
}

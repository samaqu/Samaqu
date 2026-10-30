"use client";

import { ReactNode } from "react";
import { ToastProvider } from "@/components/AdminToast";
import "@/app/(internal)/panel-admin/panel-transaksi.css";
import "@/app/(internal)/panel-admin/panel-mono.css";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      {children}
    </ToastProvider>
  );
}

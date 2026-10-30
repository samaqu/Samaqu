"use client";

import { useParams } from "next/navigation";
import TopupPaymentView from "@/components/reseller/payment/TopupPaymentView";

export default function TopUpPaymentPage() {
  const params = useParams<{ kode: string }>();
  const code = decodeURIComponent(params?.kode || "");
  if (!code) return null;
  return <TopupPaymentView code={code} />;
}

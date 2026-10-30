"use client";

import { useParams } from "next/navigation";
import PesananDetailPanel from "@/components/reseller/PesananDetailPanel";

export default function ResellerPesananDetailPage() {
  const params = useParams<{ orderNumber: string }>();
  const orderNumber = decodeURIComponent(params?.orderNumber || "");
  if (!orderNumber) return null;
  return <PesananDetailPanel orderNumber={orderNumber} />;
}

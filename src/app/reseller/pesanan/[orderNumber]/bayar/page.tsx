"use client";

import { useParams } from "next/navigation";
import OrderPaymentView from "@/components/reseller/payment/OrderPaymentView";

export default function OrderShortfallPaymentPage() {
  const params = useParams<{ orderNumber: string }>();
  const orderNumber = decodeURIComponent(params?.orderNumber || "");
  if (!orderNumber) return null;
  return <OrderPaymentView orderNumber={orderNumber} />;
}

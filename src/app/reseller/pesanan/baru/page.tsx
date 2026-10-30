"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import OrderForm from "@/components/reseller/order/OrderForm";

function OrderFormWithParams() {
  const params = useSearchParams();
  return <OrderForm preselectProductId={params.get("produk") || undefined} />;
}

export default function PesananBaruPage() {
  return (
    <Suspense fallback={null}>
      <OrderFormWithParams />
    </Suspense>
  );
}

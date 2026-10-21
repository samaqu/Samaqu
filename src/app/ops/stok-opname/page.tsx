import StokOpnameList from "@/components/stock-opname/StokOpnameList";

/** Stok Opname di dashboard ops (dipakai juga oleh panel admin & /admin). */
export default function OpsStokOpnamePage() {
  return <StokOpnameList basePath="/ops/stok-opname" />;
}

export type Draft = {
  id: string;
  status: string;
  customer_name: string | null;
  customer_whatsapp: string | null;
  proof_url: string | null;
  proof_key: string | null;
  payload: any;
  created_at: string;
  approved_order_number: string | null;
};

export const money = (value: unknown) => "Rp" + Number(value || 0).toLocaleString("id-ID");

export const time = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  });

export const phone = (value: string | null) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.startsWith("62") ? `0${digits.slice(2)}` : digits;
};

export const totalDraft = (payload: any) => {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const subtotal = items.reduce(
    (sum: number, item: any) => sum + (Number(item?.price) || 0) * (Number(item?.quantity) || 0),
    0,
  );
  return subtotal + (Number(payload?.shipping_cost) || 0) - (Number(payload?.discount) || 0);
};

/** Nama produk untuk tampilan; ukuran yang menempel di nama dipindah ke baris meta. */
export const productName = (item: any) =>
  String(item?.product_name || item?.product_id || "Produk")
    .replace(/\s+size\s+[A-Z0-9]+$/i, "")
    .trim();

export const itemMeta = (item: any) => {
  const qty = Number(item?.quantity) || 1;
  const size = String(item?.size || "").trim();
  const series = String(item?.series || "").trim();
  return [series, size ? `Ukuran ${size}` : "", `${qty} pcs`].filter(Boolean).join(" · ");
};

export const addressText = (shipping: any, name?: string | null, whatsapp?: string | null) =>
  [
    name,
    whatsapp ? phone(whatsapp) : "",
    shipping?.address,
    shipping?.kecamatan ? `Kec. ${shipping.kecamatan}` : "",
    shipping?.city,
    shipping?.province,
    shipping?.postal_code,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");

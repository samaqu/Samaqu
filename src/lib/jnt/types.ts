// ─── Shared types for J&T Express API ───

export interface JntConfig {
  env: "testing" | "production";
  orderUsername: string;
  orderApiKey: string;
  orderKey: string; // signature key for order
  tariffKey: string;
  tariffCusName: string;
  trackUsername: string;
  trackPassword: string;
  companyId: string;
}

// ─── Tariff Check ───

export interface TariffRequest {
  weight: number; // kg
  sendSiteCode: string; // origin city code (UPPERCASE)
  destAreaCode: string; // destination district code (UPPERCASE)
  cusName: string; // customer/username from dashboard
  productType: string; // e.g. "EZ"
}

export interface TariffService {
  name: string;
  cost: string;
  /** Kode yang dipakai Create Order (`expresstype`) — mis. EZ/ECO. */
  productCode?: string | null;
  /** Kode permintaan/kategori layanan dari J&T. */
  productType?: string | null;
  /** Beberapa respons J&T menyertakan ETA; dipakai kalau ada. */
  etd?: string | null;
  estimated_delivery?: string | null;
  estimate?: string | null;
}

export interface TariffResponse {
  is_success: string;
  message: string;
  content: string; // JSON-encoded array of TariffService[]
}

// ─── Create Order ───

export interface OrderRequest {
  username: string;
  api_key: string;
  orderid: string; // max 20 chars
  shipper_name: string;
  shipper_contact: string;
  shipper_phone: string; // format +62xxxx
  shipper_addr: string;
  origin_code: string; // city code UPPERCASE e.g. "JKT"
  receiver_name: string;
  receiver_phone: string;
  receiver_addr: string;
  receiver_zip: string; // 5 digits, "00000" if unknown
  destination_code: string; // city code UPPERCASE
  receiver_area: string; // district code UPPERCASE e.g. "JKT001"
  qty: number;
  weight: number; // kg, max 100, 2 decimals
  goodsdesc: string; // max 40 chars
  servicetype: number; // 1=pickup, 6=dropoff
  insurance: number; // IDR
  orderdate: string; // YYYY-MM-DD hh:mm:ss
  item_name: string;
  cod: number; // IDR, 0 if not COD
  sendstarttime: string;
  sendendtime: string;
  expresstype: string; // productCode J&T: "EZ", "ECO", dst.
  goodsvalue: number; // IDR
}

export interface OrderDetailResponse {
  awb_no: string;
  orderid: string;
  desCode: string;
  etd: string;
  status: string;
  reason?: string;
}

export interface OrderResponse {
  success: boolean;
  desc: string;
  detail: OrderDetailResponse[];
}

// ─── Tracking ───

export interface TrackRequest {
  awb: string;
  eccompanyid: string;
}

export interface TrackDetailCost {
  shipping_cost: number;
  add_cost: number;
  insurance_cost: number;
  cod: number;
  return_cost: number;
}

export interface TrackSender {
  name: string;
  addr: string;
  city: string;
  zipcode?: string;
}

export interface TrackReceiver {
  name: string;
  addr: string;
  city: string;
  zipcode?: string;
}

export interface TrackDriver {
  name: string;
  phone?: string;
}

export interface TrackDetail {
  shipped_date: string;
  services_code: string;
  actual_amount: number;
  weight: number;
  qty: number;
  itemname: string;
  detail_cost: TrackDetailCost;
  sender: TrackSender;
  receiver: TrackReceiver;
  driver: TrackDriver;
  delivDriver: TrackDriver;
}

export interface TrackHistoryItem {
  date_time: string;
  city_name: string;
  status: string;
  status_code: number;
  storeName: string;
  nextSiteName: string;
  note: string;
  receiver: string;
  driverName: string;
  driverPhone: string;
  /** Penanda J&T pada scan serah terima: `"FALSE"` = paket TIDAK diserahkan ke penerima di waybill. */
  presenter?: string;
  /** Nama pihak yang benar-benar menerima saat `presenter = "FALSE"` — sering kosong dari J&T. */
  presentername?: string;
}

export interface TrackResponse {
  awb: string;
  orderid: string;
  detail: TrackDetail;
  history: TrackHistoryItem[];
}

export interface TrackErrorResponse {
  error_id: string;
  error_message: string;
}

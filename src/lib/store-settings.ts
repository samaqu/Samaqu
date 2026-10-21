"use client";

import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { OPEN_ORDER_PERIOD, DEFAULT_OPEN_ORDER_ADDON_WEIGHT } from "./open-order-config";

interface StoreSettings {
  store_name: string;
  tagline: string;
  email: string;
  whatsapp: string;
  origin_district_id: number | null;
  enabled_couriers: string[];
  instagram_url: string;
  cyp_microcopy: string;
  /** Periode Open Order yang ditampilkan di /open-order — diatur dari menu admin "Open Order". */
  open_order_period: string;
  /** Buka/tutup Open Order. false → wizard /open-order menampilkan pesan periode ditutup. */
  open_order_active: boolean;
  /** Tanggal mulai jendela Open Order (YYYY-MM-DD) — diatur dari menu admin "Open Order". */
  open_order_start_date: string | null;
  /** Tanggal tutup jendela Open Order (YYYY-MM-DD). */
  open_order_end_date: string | null;
  /** Jam buka jendela Open Order (HH:MM, WIB) — kolom opsional, kosong = 00:00. */
  open_order_start_time: string | null;
  /** Jam tutup jendela Open Order (HH:MM, WIB) — kolom opsional, kosong = 23:59. */
  open_order_end_time: string | null;
  /**
   * Berat kirim add-on "Extra Cover & Hanger" (gram) — diatur dari menu admin "Open Order".
   * Null/kosong = pakai default 300 g (`DEFAULT_OPEN_ORDER_ADDON_WEIGHT`).
   */
  open_order_addon_weight: number | null;
}

const DEFAULTS: StoreSettings = {
  store_name: "SAMAQU",
  tagline: "Busana yang Layak Menemani Setiap Momen",
  email: "halo@samaqu.id",
  whatsapp: "+62 895 6359 65400",
  origin_district_id: null,
  enabled_couriers: ["jne", "sicepat", "jnt", "ninja", "tiki", "wahana", "pos", "lion", "anteraja"],
  instagram_url: "https://instagram.com/samaqu.id",
  cyp_microcopy: "Harga Minimum boleh dipilih. Itulah alasan kami membuat Create Your Price.",
  open_order_period: OPEN_ORDER_PERIOD,
  open_order_active: true,
  open_order_start_date: null,
  open_order_end_date: null,
  open_order_start_time: null,
  open_order_end_time: null,
  open_order_addon_weight: DEFAULT_OPEN_ORDER_ADDON_WEIGHT,
};

let cached: StoreSettings = DEFAULTS;

export function useStoreSettings() {
  const [settings, setSettings] = useState<StoreSettings>(cached);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const { data } = await supabase.from("store_settings").select("*").eq("id", 1).single();
        if (data) {
          let couriers = DEFAULTS.enabled_couriers;
          if (data.enabled_couriers) {
            try {
              couriers = typeof data.enabled_couriers === "string"
                ? JSON.parse(data.enabled_couriers)
                : data.enabled_couriers;
            } catch { /* use defaults */ }
          }
          cached = {
            ...DEFAULTS,
            ...data,
            enabled_couriers: couriers,
          };
          setSettings(cached);
        }
      } catch { /* use defaults */ }
    }
    fetchSettings();
  }, []);

  return settings;
}

export function getWhatsAppNumber(): string {
  const digits = (cached?.whatsapp || DEFAULTS.whatsapp).replace(/[^0-9]/g, "");
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("62")) return digits;
  return `62${digits}`;
}

export function getWhatsAppLink(message: string): string {
  return `https://wa.me/${getWhatsAppNumber()}?text=${encodeURIComponent(message)}`;
}

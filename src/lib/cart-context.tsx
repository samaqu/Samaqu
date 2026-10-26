"use client";

import { createContext, useContext, useReducer, useEffect, useCallback, useRef, useState } from "react";
import { validateVoucher } from "./voucher-utils";

export interface CartItem {
  id: string;
  name: string;
  image: string;
  price: number;           // base price (fixed) or minimum_price (CYP)
  color: string;
  size: string;
  series?: string;
  kain?: string;
  qty: number;
  notes?: string;
  // Create Your Price
  customer_price?: number;   // harga pilihan customer (CYP only)
  minimum_price?: number;    // harga minimum untuk validasi (CYP only)
  create_your_price_enabled?: boolean; // apakah produk ini pakai CYP
}

interface VoucherState {
  code: string;
  id: string;
  discount: number;
}

interface CartState {
  items: CartItem[];
}

type CartAction =
  | { type: "ADD"; item: CartItem }
  | { type: "REMOVE"; index: number }
  | { type: "UPDATE_QTY"; index: number; qty: number }
  | { type: "UPDATE_PRICE"; index: number; price: number }
  | { type: "LOAD"; items: CartItem[] }
  | { type: "CLEAR" };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD": {
      const existing = state.items.findIndex(
        (i) => i.id === action.item.id && i.color === action.item.color && i.size === action.item.size && (i.series ?? "") === (action.item.series ?? "")
      );
      if (existing >= 0) {
        const items = [...state.items];
        items[existing] = { ...items[existing], qty: items[existing].qty + action.item.qty };
        return { items };
      }
      return { items: [...state.items, action.item] };
    }
    case "REMOVE":
      return { items: state.items.filter((_, i) => i !== action.index) };
    case "UPDATE_QTY": {
      if (action.qty <= 0) {
        return { items: state.items.filter((_, i) => i !== action.index) };
      }
      const items = [...state.items];
      items[action.index] = { ...items[action.index], qty: action.qty };
      return { items };
    }
    case "UPDATE_PRICE": {
      const items = [...state.items];
      const item = items[action.index];
      // Validate: price cannot be below minimum_price for CYP items
      if (item.create_your_price_enabled && item.minimum_price && action.price < item.minimum_price) {
        return state; // reject invalid price
      }
      items[action.index] = { ...item, customer_price: action.price };
      return { items };
    }
    case "LOAD":
      return { items: action.items };
    case "CLEAR":
      return { items: [] };
    default:
      return state;
  }
}

const CartContext = createContext<{
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (index: number) => void;
  updateQty: (index: number, qty: number) => void;
  updatePrice: (index: number, price: number) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
  voucher: VoucherState;
  applyVoucher: (code: string, whatsapp?: string) => Promise<{ ok: boolean; error?: string }>;
  removeVoucher: () => void;
} | null>(null);

const STORAGE_KEY = "samaqu-cart";
const VOUCHER_KEY = "samaqu-voucher";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });
  const [loaded, setLoaded] = useState(false);
  const [voucher, setVoucher] = useState<VoucherState>({ code: "", id: "", discount: 0 });
  const checkedVoucherRef = useRef("");

  // Load cart + voucher from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) dispatch({ type: "LOAD", items: JSON.parse(raw) });
    } catch {}
    try {
      const vRaw = localStorage.getItem(VOUCHER_KEY);
      if (vRaw) setVoucher(JSON.parse(vRaw));
    } catch {}
    setLoaded(true);
  }, []);

  // Persist cart
  useEffect(() => {
    if (loaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    }
  }, [state.items, loaded]);

  // Persist voucher
  useEffect(() => {
    if (loaded) {
      localStorage.setItem(VOUCHER_KEY, JSON.stringify(voucher));
    }
  }, [voucher, loaded]);

  const addItem = useCallback((item: CartItem) => {
    dispatch({ type: "ADD", item });
  }, []);

  const removeItem = useCallback((index: number) => {
    dispatch({ type: "REMOVE", index });
  }, []);

  const updateQty = useCallback((index: number, qty: number) => {
    dispatch({ type: "UPDATE_QTY", index, qty });
  }, []);

  const updatePrice = useCallback((index: number, price: number) => {
    dispatch({ type: "UPDATE_PRICE", index, price });
  }, []);

  const clearCart = useCallback(() => {
    dispatch({ type: "CLEAR" });
    checkedVoucherRef.current = "";
    setVoucher({ code: "", id: "", discount: 0 });
  }, []);

  const totalItems = state.items.reduce((sum, i) => sum + i.qty, 0);
  // Subtotal: CYP items use customer_price, fixed items use price
  const subtotal = state.items.reduce((sum, i) => {
    const unitPrice = (i.create_your_price_enabled && i.customer_price) ? i.customer_price : i.price;
    return sum + unitPrice * i.qty;
  }, 0);

  const applyVoucher = useCallback(async (code: string, whatsapp?: string) => {
    const result = await validateVoucher(code, subtotal, whatsapp);
    if (result.valid) {
      checkedVoucherRef.current = result.voucher.code;
      setVoucher({ code: result.voucher.code, id: result.voucher.id, discount: result.discount });
      return { ok: true };
    }
    return { ok: false, error: result.error };
  }, [subtotal]);

  const removeVoucher = useCallback(() => {
    checkedVoucherRef.current = "";
    setVoucher({ code: "", id: "", discount: 0 });
  }, []);

  // Voucher disimpan di localStorage. Saat halaman dibuka, cek ulang ke server:
  // kalau kode sudah dihapus/dinonaktifkan admin, diskon langsung dibersihkan.
  useEffect(() => {
    if (!loaded || !voucher.code) return;
    if (checkedVoucherRef.current === voucher.code) return;
    checkedVoucherRef.current = voucher.code;

    let active = true;
    validateVoucher(voucher.code, subtotal).then((result) => {
      if (!active) return;
      if (!result.valid) {
        checkedVoucherRef.current = "";
        setVoucher({ code: "", id: "", discount: 0 });
        return;
      }
      setVoucher({
        code: result.voucher.code,
        id: result.voucher.id,
        discount: result.discount,
      });
    });
    return () => {
      active = false;
    };
  }, [loaded, voucher.code, subtotal]);

  return (
    <CartContext.Provider value={{ items: state.items, addItem, removeItem, updateQty, updatePrice, clearCart, totalItems, subtotal, voucher, applyVoucher, removeVoucher }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

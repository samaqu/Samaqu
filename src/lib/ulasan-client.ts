"use client";

import { supabase } from "@/lib/supabase";
import { uploadToCloudinary } from "@/lib/cloudinary";

/** Ulasan milik customer yang sedang login (bentuk dari /api/customer/reviews). */
export type MyReview = {
  id: string;
  product_id: string | null;
  series_name: string | null;
  order_item_id: string | null;
  status: "pending" | "published" | "rejected";
  rating: number;
  content: string;
  image_url: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

async function sessionToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

export async function getMyReviews(): Promise<MyReview[]> {
  const token = await sessionToken();
  if (!token) return [];
  const res = await fetch("/api/customer/reviews", {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  return (json?.reviews || []) as MyReview[];
}

export type ReviewSubmitResult = {
  id: string;
  status: "pending" | "published" | "rejected";
  created_at?: string;
};

export async function submitMyReview(input: {
  order_item_id: string;
  rating: number;
  content: string;
  image_url?: string | null;
}): Promise<ReviewSubmitResult> {
  const token = await sessionToken();
  if (!token) throw new Error("Silakan masuk dulu.");

  const res = await fetch("/api/customer/reviews", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || "Gagal mengirim ulasan.");
  return json.review as ReviewSubmitResult;
}

export async function uploadReviewPhoto(file: File): Promise<string> {
  const token = await sessionToken();
  if (!token) throw new Error("Silakan masuk dulu.");
  return uploadToCloudinary(file, { scope: "review", token });
}

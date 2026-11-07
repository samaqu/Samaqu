export interface ChatLog {
  id: string;
  session_id: string | null;
  locale: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  question: string | null;
  question_images: string[] | null;
  answer: string | null;
  tools_used: string[] | null;
  escalated: boolean | null;
  error: string | null;
  created_at: string;
}

export interface SessionGroup {
  key: string;
  items: ChatLog[];
  name: string | null;
  phone: string | null;
  firstAt: string;
  lastAt: string;
  escalated: boolean;
  errors: number;
}

export type StatusTone = "answered" | "escalated" | "failed";

export interface ProductInfo {
  name: string;
  series: string | null;
  kain: string | null;
  price: number | null;
}

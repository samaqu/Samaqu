/**
 * Engine provider AI SAMAQU (endpoint OpenAI-compatible: Xiaomi MiMo).
 *
 * Dipakai bersama oleh dua audiens yang terpisah:
 *   - live chat CUSTOMER  → `src/app/api/chat/route.ts`         (publik)
 *   - asisten ADMIN       → `src/app/api/panel-ai/chat/route.ts` (wajib isOpsAdmin)
 *
 * Modul ini SENGAJA hanya berisi mesinnya: panggilan HTTP + parser SSE + retry.
 * System prompt, daftar tool, konfigurasi, dan log TIDAK ada di sini — itu milik
 * masing-masing audiens supaya konteks customer dan admin tidak pernah tercampur.
 *
 * Server-only.
 */

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** Bentuk delta yang dipakai MiMo/OpenAI: teks + potongan tool call per index. */
interface StreamDeltaShape {
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
}

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 60_000;

/** Pembatalan pengguna (bukan kegagalan provider) — jangan di-retry. */
function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError";
}

/**
 * Panggil provider dengan retry untuk kegagalan transient (network / 429 / 5xx).
 * Backoff linear 300·(i+1) ms. `attempts` = jumlah total percobaan.
 *
 * Catatan: `AbortError` (mis. admin menekan Stop) langsung dilempar tanpa retry, supaya
 * pembatalan tidak berubah menjadi panggilan model baru. `TimeoutError` tetap di-retry
 * seperti sebelumnya.
 *
 * `connectTimeoutMs` (opsional): batas menunggu RESPONS PERTAMA untuk SETIAP percobaan. Tanpa ini,
 * `init.signal` (timeout total) dipakai bersama semua percobaan, jadi kalau penyedia AI macet,
 * percobaan ke-2 dan ke-3 langsung gagal karena sinyalnya sudah habis (retry tidak menolong).
 * Dengan ini, penyedia yang macet dicoba lagi dengan batas baru. Setelah respons pertama diterima
 * batas ini dilepas; pembacaan stream tetap dibatasi `init.signal` seperti biasa.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = DEFAULT_ATTEMPTS,
  connectTimeoutMs?: number
): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    const attemptCtl = connectTimeoutMs ? new AbortController() : null;
    const timer = attemptCtl
      ? setTimeout(
          () => attemptCtl.abort(new DOMException("Penyedia AI tidak merespons tepat waktu", "TimeoutError")),
          connectTimeoutMs
        )
      : null;
    try {
      const res = await fetch(
        url,
        attemptCtl ? { ...init, signal: combineSignals([init.signal ?? undefined, attemptCtl.signal]) } : init
      );
      if ((res.status === 429 || res.status >= 500) && i < attempts - 1) {
        lastError = new Error(`HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 300 * (i + 1)));
        continue;
      }
      return res;
    } catch (e) {
      lastError = e;
      if (isAbortError(e)) throw e;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 300 * (i + 1)));
        continue;
      }
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Gagal menghubungi penyedia AI");
}

export interface ChatCompletionOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: unknown[];
  /** Tool OpenAI-style. Kosong = panggilan tanpa function calling. */
  tools?: readonly unknown[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  attempts?: number;
  /**
   * Batas menunggu respons pertama PER percobaan (opsional, mati bila kosong). Lihat `fetchWithRetry`.
   * Dipakai chat customer supaya penyedia AI yang macet sesaat dicoba ulang, bukan langsung gagal.
   */
  connectTimeoutMs?: number;
  /**
   * Sinyal tambahan dari pemanggil (mis. `req.signal` saat admin menekan Stop).
   * Digabung dengan timeout: mana pun yang lebih dulu membatalkan panggilan.
   */
  signal?: AbortSignal;
}

/**
 * Gabungkan beberapa AbortSignal jadi satu (perilaku `AbortSignal.any`).
 * `AbortSignal.any` dipakai kalau runtime menyediakannya; kalau tidak, digabung manual.
 */
export function combineSignals(signals: Array<AbortSignal | undefined>): AbortSignal {
  const list = signals.filter((s): s is AbortSignal => !!s);
  if (list.length === 0) return new AbortController().signal;
  if (list.length === 1) return list[0];

  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === "function") return anyFn(list);

  const controller = new AbortController();
  for (const s of list) {
    if (s.aborted) {
      controller.abort();
      break;
    }
    s.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

/**
 * Mulai panggilan streaming ke `{baseUrl}/chat/completions`.
 * Mengembalikan `Response` mentah supaya pemanggil bisa memutuskan cara menangani
 * status non-2xx (tiap audiens punya pesan error sendiri).
 */
export function streamChatCompletion(options: ChatCompletionOptions): Promise<Response> {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const hasTools = Array.isArray(options.tools) && options.tools.length > 0;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return fetchWithRetry(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.apiKey}` },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens ?? 450,
        ...(hasTools ? { tools: options.tools, tool_choice: "auto" } : {}),
        stream: true,
        // Matikan "thinking mode" — tanpa ini MiMo menulis penalaran dulu (tak terlihat
        // pengguna) sehingga balasan terasa lama. Paramnya harus di dalam chat_template_kwargs.
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: combineSignals([options.signal, AbortSignal.timeout(timeoutMs)]),
    },
    options.attempts ?? DEFAULT_ATTEMPTS,
    options.connectTimeoutMs
  );
}

/**
 * Baca stream SSE gaya OpenAI: teruskan potongan teks ke `onDelta`, kumpulkan tool call
 * (argumen datang bertahap per index). Mengembalikan teks lengkap + daftar tool call.
 */
export async function consumeOpenAIStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const toolCalls: ToolCall[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      let json: StreamDeltaShape;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }

      const delta = json.choices?.[0]?.delta;
      if (!delta) continue;

      if (typeof delta.content === "string" && delta.content) {
        content += delta.content;
        onDelta(delta.content);
      }

      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCalls[idx]) {
            toolCalls[idx] = { id: tc.id || `call_${idx}`, type: "function", function: { name: "", arguments: "" } };
          }
          if (tc.id) toolCalls[idx].id = tc.id;
          if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
          if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
        }
      }
    }
  }

  return { content, toolCalls: toolCalls.filter(Boolean) };
}

/** Baca argumen tool dengan aman (JSON rusak dari model → objek kosong). */
export function parseToolArgs(argsJson: string): Record<string, unknown> {
  try {
    const parsed = argsJson ? JSON.parse(argsJson) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

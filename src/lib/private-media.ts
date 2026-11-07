import { createHmac, timingSafeEqual } from "crypto";

/**
 * URL bertanda tangan untuk membuka bukti transfer di bucket private.
 *
 * Yang disimpan di database hanya object key R2. URL publik yang dikirim ke
 * browser adalah route same-origin berumur pendek; route itu yang menukar
 * tanda tangan menjadi presigned GET R2 (5 menit). Tidak ada object key atau
 * kredensial R2 yang bocor ke browser.
 */
export type PrivateProofKind = "topup" | "order-payment";

const SECRET = process.env.PRIVATE_MEDIA_SECRET || process.env.REVALIDATE_SECRET || "";

function signature(kind: string, id: string, exp: number): string {
  return createHmac("sha256", SECRET).update(`${kind}:${id}:${exp}`).digest("hex");
}

export function signPrivateProofUrl(
  kind: PrivateProofKind,
  id: string,
  ttlSeconds = 3600,
): string | null {
  if (!SECRET || !id) return null;
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, Math.min(ttlSeconds, 86400));
  const sig = signature(kind, id, exp);
  const params = new URLSearchParams({ kind, id, exp: String(exp), sig });
  return `/api/private-media?${params.toString()}`;
}

export function verifyPrivateProofUrl(
  kind: string,
  id: string,
  exp: number,
  sig: string,
): boolean {
  if (!SECRET || !kind || !id || !Number.isFinite(exp)) return false;
  if (exp <= Math.floor(Date.now() / 1000)) return false;

  const expected = signature(kind, id, exp);
  if (sig.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** URL tampilan: pakai signed private route kalau ada proof_key, kalau tidak URL lama. */
export function proofViewUrl(
  kind: PrivateProofKind,
  id: string,
  proofKey: string | null | undefined,
  legacyUrl: string | null | undefined,
): string | null {
  if (proofKey) return signPrivateProofUrl(kind, id) || legacyUrl || null;
  return legacyUrl || null;
}

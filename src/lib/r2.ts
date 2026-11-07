import { createHash, createHmac } from "crypto";

/**
 * Server-only R2 helper. Jangan diimpor dari komponen client.
 *
 * Publik: bucket `samaqu` (foto/video katalog, bio, dll).
 * Private: bucket `samaqu-private` (bukti transfer reseller).
 * Upload file besar memakai presigned PUT supaya body tidak lewat Vercel.
 */
const PUBLIC_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const PUBLIC_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const PUBLIC_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const PUBLIC_BUCKET = process.env.R2_BUCKET || "";
const PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "");

const PRIVATE_ACCOUNT_ID = process.env.R2_PRIVATE_ACCOUNT_ID || "";
const PRIVATE_ACCESS_KEY_ID = process.env.R2_PRIVATE_ACCESS_KEY_ID || "";
const PRIVATE_SECRET_ACCESS_KEY = process.env.R2_PRIVATE_SECRET_ACCESS_KEY || "";
const PRIVATE_BUCKET = process.env.R2_PRIVATE_BUCKET || "";

export function r2Configured(): boolean {
  return Boolean(
    PUBLIC_ACCOUNT_ID &&
      PUBLIC_ACCESS_KEY_ID &&
      PUBLIC_SECRET_ACCESS_KEY &&
      PUBLIC_BUCKET &&
      PUBLIC_BASE_URL,
  );
}

export function r2PrivateConfigured(): boolean {
  return Boolean(
    PRIVATE_ACCOUNT_ID &&
      PRIVATE_ACCESS_KEY_ID &&
      PRIVATE_SECRET_ACCESS_KEY &&
      PRIVATE_BUCKET,
  );
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

interface SignedUrlOptions {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  key: string;
  method: "PUT" | "GET";
  expiresSeconds: number;
}

function signR2Url({
  accountId,
  accessKeyId,
  secretAccessKey,
  bucket,
  key,
  method,
  expiresSeconds,
}: SignedUrlOptions): string {
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const canonicalUri = `/${bucket}/${key.split("/").map(encodeRfc3986).join("/")}`;

  const queryPairs: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresSeconds)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  queryPairs.sort(([a], [b]) => a.localeCompare(b));
  const canonicalQuery = queryPairs
    .map(([name, value]) => `${encodeRfc3986(name)}=${encodeRfc3986(value)}`)
    .join("&");

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = "host";
  const payloadHash = "UNSIGNED-PAYLOAD";
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, "auto");
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export function createR2UploadUrl(
  key: string,
  expiresSeconds = 600,
): { uploadUrl: string; publicUrl: string } {
  if (!r2Configured()) throw new Error("R2 belum dikonfigurasi");

  const uploadUrl = signR2Url({
    accountId: PUBLIC_ACCOUNT_ID,
    accessKeyId: PUBLIC_ACCESS_KEY_ID,
    secretAccessKey: PUBLIC_SECRET_ACCESS_KEY,
    bucket: PUBLIC_BUCKET,
    key,
    method: "PUT",
    expiresSeconds,
  });
  const publicUrl = `${PUBLIC_BASE_URL}/${key.split("/").map(encodeURIComponent).join("/")}`;

  return { uploadUrl, publicUrl };
}

export function createR2PrivateUploadUrl(
  key: string,
  expiresSeconds = 600,
): { uploadUrl: string } {
  if (!r2PrivateConfigured()) throw new Error("R2 private belum dikonfigurasi");

  return {
    uploadUrl: signR2Url({
      accountId: PRIVATE_ACCOUNT_ID,
      accessKeyId: PRIVATE_ACCESS_KEY_ID,
      secretAccessKey: PRIVATE_SECRET_ACCESS_KEY,
      bucket: PRIVATE_BUCKET,
      key,
      method: "PUT",
      expiresSeconds,
    }),
  };
}

export function createR2PrivateDownloadUrl(
  key: string,
  expiresSeconds = 600,
): { downloadUrl: string } {
  if (!r2PrivateConfigured()) throw new Error("R2 private belum dikonfigurasi");

  return {
    downloadUrl: signR2Url({
      accountId: PRIVATE_ACCOUNT_ID,
      accessKeyId: PRIVATE_ACCESS_KEY_ID,
      secretAccessKey: PRIVATE_SECRET_ACCESS_KEY,
      bucket: PRIVATE_BUCKET,
      key,
      method: "GET",
      expiresSeconds,
    }),
  };
}

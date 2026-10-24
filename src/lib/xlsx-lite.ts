import { inflateRawSync } from "node:zlib";

/**
 * Pembaca .xlsx seadanya — TANPA dependency.
 *
 * Kenapa tidak pakai library: `package-lock.json` proyek ini pernah drift dan `npm ci`
 * gagal, jadi menambah dependency demi satu fitur impor berisiko. Ekspor J&T cuma satu
 * worksheet berisi teks/angka, jadi cukup: buka zip → baca worksheet pertama → kembalikan
 * baris sebagai teks mentah.
 *
 * Didukung: string bersama (`sharedStrings.xml`), inline string (`t="inlineStr"`), angka,
 * sel kosong, entri zip tersimpan (method 0) maupun terkompresi (method 8).
 * TIDAK didukung (tidak dibutuhkan): formula, format tanggal Excel, lebih dari satu sheet, .xls lama.
 *
 * Server-only (`node:zlib`) — dipanggil route /api/ops/ongkir-jnt/upload.
 */

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

/** Satu baris worksheet sebagai peta kolom→teks, mis. `{ "No. Waybill": "1363779775" }`. */
export type SheetRow = Record<string, string>;
export type SheetTable = { header: string[]; rows: SheetRow[] };

type ZipEntry = { name: string; method: number; compressedSize: number; localOffset: number };

function readZipEntries(buf: Buffer): ZipEntry[] {
  // End of Central Directory bisa diakhiri komentar → dipindai dari belakang.
  let eocd = -1;
  const minPos = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("File bukan .xlsx yang sah (struktur zip tidak ditemukan).");

  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];

  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CENTRAL) break;
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.push({ name, method, compressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

function readEntry(buf: Buffer, entry: ZipEntry): Buffer {
  const p = entry.localOffset;
  if (buf.readUInt32LE(p) !== SIG_LOCAL) throw new Error(`Entri zip rusak: ${entry.name}`);
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const start = p + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compressedSize);
  return entry.method === 0 ? raw : inflateRawSync(raw);
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXml(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));/g,
    (match, dec, hex, named) => {
      if (dec) return String.fromCodePoint(Number(dec));
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      return NAMED_ENTITIES[named as string] ?? match;
    },
  );
}

/** Semua `<t>` digabung — nilai string di xlsx bisa dipecah jadi beberapa run. */
function textOf(xml: string): string {
  let out = "";
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out += decodeXml(m[1]);
  return out;
}

function sharedStrings(buf: Buffer, entry?: ZipEntry): string[] {
  if (!entry) return [];
  const out: string[] = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  const xml = readEntry(buf, entry).toString("utf8");
  while ((m = re.exec(xml))) out.push(textOf(m[1]));
  return out;
}

function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] || "A";
  let idx = 0;
  for (const ch of letters) idx = idx * 26 + (ch.charCodeAt(0) - 64);
  return idx - 1;
}

function attr(tag: string, name: string): string {
  const m = new RegExp(`${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]) : "";
}

/** Worksheet XML → array-of-arrays teks (sel kosong jadi ""). */
function sheetRows(xml: string, strings: string[]): string[][] {
  const out: string[][] = [];
  const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(xml))) {
    const cells: string[] = [];
    const body = rowMatch[2] || "";
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRe.exec(body))) {
      const tag = cellMatch[1] || "";
      const inner = cellMatch[2] || "";
      const type = attr(tag, "t");
      const ref = attr(tag, "r");
      const col = ref ? columnIndex(ref) : cells.length;

      let value = "";
      if (type === "inlineStr") {
        value = textOf(inner);
      } else if (type === "s") {
        const idx = Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
        value = Number.isFinite(idx) ? strings[idx] ?? "" : "";
      } else {
        // Angka dan string inline sama-sama tersimpan di `<v>`.
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        value = v == null ? textOf(inner) : decodeXml(v);
      }

      while (cells.length < col) cells.push("");
      cells[col] = value.trim();
    }

    out.push(cells);
  }

  return out;
}

/**
 * Worksheet pertama sebagai tabel ber-header: header = baris pertama yang berisi,
 * nama kolom dipakai apa adanya (trim) sebagai kunci tiap baris.
 */
export function readFirstSheetTable(buf: Buffer): SheetTable {
  const entries = readZipEntries(buf);
  const strings = sharedStrings(buf, entries.find((e) => e.name === "xl/sharedStrings.xml"));
  const sheets = entries
    .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (sheets.length === 0) throw new Error("File tidak punya worksheet — bukan ekspor Excel yang sah.");

  const grid = sheetRows(readEntry(buf, sheets[0]).toString("utf8"), strings);
  const headerIndex = grid.findIndex((row) => row.some((cell) => cell !== ""));
  if (headerIndex < 0) throw new Error("Worksheet kosong — tidak ada baris header.");

  const header = grid[headerIndex];
  const rows: SheetRow[] = [];
  for (const row of grid.slice(headerIndex + 1)) {
    if (!row.some((cell) => cell !== "")) continue;
    const record: SheetRow = {};
    header.forEach((name, i) => {
      if (name) record[name] = row[i] ?? "";
    });
    rows.push(record);
  }

  return { header, rows };
}

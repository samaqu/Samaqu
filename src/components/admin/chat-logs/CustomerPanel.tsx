"use client";

import type { ProductInfo, SessionGroup } from "./types";
import { formatDateTime, formatRupiah, waDigits } from "./utils";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-sm">
      <span style={{ color: "#6B6A64" }}>{label}</span>
      <span className="text-right font-medium" style={{ color: "#141414" }}>
        {value}
      </span>
    </div>
  );
}

export default function CustomerPanel({
  session,
  products,
}: {
  session: SessionGroup;
  products: ProductInfo[];
}) {
  const wa = waDigits(session.phone);

  return (
    <div className="h-full space-y-3 overflow-y-auto">
      <div className="rounded-2xl border bg-white p-4" style={{ borderColor: "#E7E6E1" }}>
        <p className="text-sm font-semibold" style={{ color: "#141414" }}>
          Pelanggan
        </p>
        <div className="mt-1 divide-y" style={{ borderColor: "#F0EFEA" }}>
          <InfoRow label="Nama" value={session.name || "Pengunjung"} />
          <InfoRow label="WhatsApp" value={session.phone || "-"} />
          <InfoRow label="Mulai chat" value={formatDateTime(session.firstAt)} />
          <InfoRow label="Jumlah pertanyaan" value={String(session.items.length)} />
        </div>
      </div>

      {products.length > 0 ? (
        <div className="rounded-2xl border bg-white p-4" style={{ borderColor: "#E7E6E1" }}>
          <p className="text-sm font-semibold" style={{ color: "#141414" }}>
            Produk Ditanyakan
          </p>
          <div className="mt-2 space-y-2">
            {products.map((product) => (
              <div
                key={`${product.name}-${product.series || ""}-${product.price || ""}`}
                className="rounded-xl p-3"
                style={{ background: "#FAF9F6" }}
              >
                <p className="text-sm font-semibold" style={{ color: "#141414" }}>
                  {product.name}
                </p>
                {product.series || product.kain ? (
                  <p className="mt-0.5 text-[11px]" style={{ color: "#6B6A64" }}>
                    {[product.series, product.kain].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
                {product.price != null ? (
                  <p className="mt-1 text-sm font-semibold" style={{ color: "#8A5A12" }}>
                    {formatRupiah(product.price)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {session.escalated ? (
        <div className="rounded-2xl p-4" style={{ background: "#141414" }}>
          <p className="text-sm font-semibold text-white">Perlu Tindakan</p>
          <p className="mt-1 text-xs" style={{ color: "#D6D3C8" }}>
            Ada jawaban yang diarahkan ke admin.
          </p>
          {wa ? (
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold"
              style={{ background: "#C8A45D", color: "#141414" }}
            >
              Balas di WhatsApp
            </a>
          ) : (
            <p className="mt-2 text-xs" style={{ color: "#D6D3C8" }}>
              Nomor WhatsApp belum tersedia.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

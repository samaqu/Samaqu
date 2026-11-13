"use client";

import { colorRows, sizeColumns, stockCell, stockTone, type StockPool } from "@/lib/reseller/stock-view";

const show = (stock: number | null) => (stock === null ? "–" : String(stock));

/**
 * Stok per ukuran satu kolam stok: deretan kotak (XS … XXL). Dipakai di drawer "Pilih Series".
 * Kalau produknya punya beberapa warna, tiap warna jadi satu baris berlabel.
 */
export function StockStrip({ pool }: { pool: StockPool }) {
  const sizes = sizeColumns([pool]);
  const rows = colorRows(pool);
  return (
    <div className="rsk-strips">
      {rows.map(({ color, label }) => (
        <div key={color}>
          {label ? <div className="rsk-strip-label">{label}</div> : null}
          <div className="rsk-strip">
            {sizes.map((size) => {
              const stock = stockCell(pool, color, size);
              return (
                <div key={size} className={`rsk-cell ${stockTone(stock)}`}>
                  <span>{size}</span>
                  <b>{show(stock)}</b>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Tabel stok semua kolam sebuah produk: baris = series yang berbagi stok (digabung), kolom = ukuran.
 * Dipakai di menu Stok. Di layar sempit tabel bisa digeser, kolom nama series tetap terlihat.
 */
export function StockTable({ pools }: { pools: StockPool[] }) {
  const sizes = sizeColumns(pools);
  return (
    <div className="rsk-scroll">
      <table className="rsk-tbl">
        <thead>
          <tr>
            <th scope="col">Series</th>
            {sizes.map((size) => (
              <th key={size} scope="col">
                {size}
              </th>
            ))}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {pools.flatMap((pool) =>
            colorRows(pool).map(({ color, label }) => {
              const rowTotal = sizes.reduce((sum, size) => sum + (stockCell(pool, color, size) ?? 0), 0);
              return (
                <tr key={`${pool.key}|${color}`}>
                  <th scope="row">
                    {/* Nama series tampil di SETIAP baris (juga baris warna) supaya tiap baris utuh dibaca sendiri. */}
                    <span className="rsk-series">{pool.series.join(" · ")}</span>
                    {label ?<small className="rsk-color">{label}</small> : null}
                  </th>
                  {sizes.map((size) => {
                    const stock = stockCell(pool, color, size);
                    return (
                      <td key={size} className={stockTone(stock)}>
                        {show(stock)}
                      </td>
                    );
                  })}
                  <td className="tot">{rowTotal}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

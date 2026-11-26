"use client";

/**
 * Langkah 4 — data pemesan.
 *
 * Kalau akun customer punya alamat tersimpan (tabel `saved_addresses`) — sama seperti halaman
 * checkout — alamat **utama** langsung dipakai dan ditampilkan sebagai kartu pilihan; customer
 * tinggal mengklik kartu lain kalau mau ganti, atau menekan "Gunakan Alamat Baru" untuk mengetik
 * alamat baru (form manual + pemilih wilayah).
 *
 * Provinsi/kota/kecamatan di form manual dipilih dari data RajaOngkir (lihat `LocationPicker`);
 * kecamatan itulah yang dipakai menghitung ongkir J&T di wizard. Ongkir yang sudah terhitung
 * (state wizard, sumber yang sama dengan langkah 5) ditampilkan di sini juga — di bawah Kode Pos.
 */

import { useState } from "react";
import { money } from "@/lib/open-order-catalog";
import LocationPicker from "./LocationPicker";
import type { CustomerData, DraftShipping, SavedAddress } from "./types";
import { DANGER, Field, FIELD_BG, MUTED, PrimaryButton, SummaryRow, TextArea, TextInput } from "./ui";

export default function StepCustomer({
  customer,
  onChange,
  onContinue,
  shipping,
  loadingOngkir,
  ongkirError,
  savedAddresses,
  selectedAddressId,
  onSelectAddress,
  onUseNewAddress,
}: {
  customer: CustomerData;
  onChange: (field: keyof CustomerData, value: string) => void;
  onContinue: () => void;
  shipping: DraftShipping | null;
  loadingOngkir: boolean;
  ongkirError: boolean;
  /** Alamat tersimpan akun (kosong = customer belum punya alamat tersimpan). */
  savedAddresses: SavedAddress[];
  selectedAddressId: string | null;
  onSelectAddress: (addr: SavedAddress) => void;
  /** Mulai alamat baru: wizard mengosongkan lokasi supaya pemilih wilayah mulai dari nol. */
  onUseNewAddress: () => void;
}) {
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  // Selama ada alamat tersimpan dan customer tidak memilih "alamat baru", form manual disembunyikan.
  const usingSaved = savedAddresses.length > 0 && !showNew;

  function handleContinue() {
    const required: (keyof CustomerData)[] = ["name", "whatsapp", "address", "district", "city", "postalCode"];
    if (required.some((field) => !customer[field].trim())) {
      setError("Lengkapi semua data pemesan dulu ya.");
      return;
    }
    setError("");
    onContinue();
  }

  return (
    <div>
      {/* Alamat tersimpan — kartu pilihan, sama seperti halaman checkout */}
      {savedAddresses.length > 0 &&
        (usingSaved ? (
          <div className="mb-5">
            <p className="text-[11px] tracking-[0.18em] uppercase font-ui mb-3" style={{ color: MUTED }}>
              Alamat Tersimpan
            </p>
            <div className="space-y-2">
              {savedAddresses.map((addr) => {
                const active = addr.id === selectedAddressId;
                return (
                  <button
                    key={addr.id}
                    type="button"
                    onClick={() => onSelectAddress(addr)}
                    className="w-full flex items-start gap-3 rounded-xl p-3 text-left transition-all"
                    style={{
                      border: `1.5px solid ${active ? "var(--gold)" : "rgba(0,0,0,.15)"}`,
                      background: active ? "rgba(0,0,0,.04)" : "white",
                    }}
                  >
                    <span
                      className="relative w-4 h-4 rounded-full border-2 shrink-0 mt-0.5"
                      style={{ borderColor: active ? "var(--gold)" : MUTED }}
                    >
                      {active && <span className="absolute inset-[3px] rounded-full" style={{ background: "var(--gold)" }} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium" style={{ color: "var(--espresso)" }}>{addr.label}</span>
                        {addr.is_default && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(0,0,0,.15)", color: "var(--gold)" }}>
                            Utama
                          </span>
                        )}
                      </span>
                      <span className="block text-xs mt-0.5" style={{ color: MUTED }}>
                        {addr.recipient_name} · {addr.phone}
                      </span>
                      <span className="block text-xs" style={{ color: MUTED }}>
                        {addr.address}
                        {addr.kecamatan ? `, ${addr.kecamatan}` : ""}, {addr.city}
                        {addr.province ? `, ${addr.province}` : ""} {addr.postal_code}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                setShowNew(true);
                onUseNewAddress();
              }}
              className="text-xs font-medium mt-2"
              style={{ color: "var(--gold)" }}
            >
              + Gunakan Alamat Baru
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setShowNew(false);
              const addr = savedAddresses.find((a) => a.id === selectedAddressId) ?? savedAddresses[0];
              if (addr) onSelectAddress(addr);
            }}
            className="text-xs font-medium mb-4"
            style={{ color: "var(--gold)" }}
          >
            ← Kembali ke alamat tersimpan
          </button>
        ))}

      {/* Form manual — disembunyikan selama memakai alamat tersimpan */}
      {!usingSaved && (
        <div className="space-y-4">
          <Field label="Nama Lengkap" required>
            <TextInput
              value={customer.name}
              onChange={(e) => onChange("name", e.target.value)}
              placeholder="Nama penerima paket"
              autoComplete="name"
            />
          </Field>

          <Field label="No. WhatsApp" required>
            <TextInput
              value={customer.whatsapp}
              onChange={(e) => onChange("whatsapp", e.target.value)}
              placeholder="0812-3456-7890"
              inputMode="tel"
              autoComplete="tel"
            />
          </Field>

          <Field label="Alamat Lengkap" required hint="Sertakan RT/RW, kelurahan, dan nomor rumah (jika ada).">
            <TextArea
              value={customer.address}
              onChange={(e) => onChange("address", e.target.value)}
              rows={3}
              placeholder="Nama jalan, nomor rumah, RT/RW, kelurahan"
              autoComplete="street-address"
            />
          </Field>

          <LocationPicker customer={customer} onChange={onChange} />

          <Field label="Kode Pos" required>
            <TextInput
              value={customer.postalCode}
              onChange={(e) => onChange("postalCode", e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="16412"
              inputMode="numeric"
              autoComplete="postal-code"
            />
          </Field>
        </div>
      )}

      {/* Ongkir dari kecamatan tujuan: terhitung otomatis (debounce 1 detik) begitu kecamatan
          dipilih, lalu dipakai lagi di langkah 5 — nilainya sama, tidak dihitung dua kali. */}
      <div className="mt-4 rounded-2xl px-5 py-4" style={{ background: FIELD_BG, border: "1px solid rgba(0,0,0,.25)" }}>
        <SummaryRow
          label={shipping ? `Ongkir (J&T — ${shipping.service})` : "Ongkir"}
          value={loadingOngkir ? "Menghitung…" : shipping ? money(shipping.cost) : "—"}
        />
        {ongkirError ? (
          <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: MUTED }}>
            Ongkir otomatis belum tersedia — admin akan menghitung dan mengabari kamu.
          </p>
        ) : !shipping && !loadingOngkir ? (
          <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: MUTED }}>
            {usingSaved
              ? "Ongkir J&T dihitung otomatis dari kecamatan alamat tersimpan ini."
              : "Pilih provinsi, kota, lalu kecamatan dulu supaya ongkir J&T muncul di sini."}
          </p>
        ) : null}
      </div>

      {error && (
        <p className="mt-4 text-[12px]" style={{ color: DANGER }}>
          {error}
        </p>
      )}

      <div className="mt-6">
        <PrimaryButton onClick={handleContinue}>Lanjut ke Review</PrimaryButton>
      </div>
    </div>
  );
}

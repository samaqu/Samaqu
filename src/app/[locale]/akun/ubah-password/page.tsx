"use client";

import { useAkunCustomer } from "@/components/akun/AkunContext";
import { AkunHeader } from "@/components/akun/AkunShell";
import ChangePasswordFlow from "@/components/akun/ChangePasswordFlow";

/**
 * Halaman privat (di dalam gerbang sesi `AkunProvider`): customer yang sudah login
 * bisa mengganti password setelah verifikasi OTP WhatsApp.
 */
export default function UbahPasswordPage() {
  const { customer, ready } = useAkunCustomer();

  if (!ready) {
    return <div className="md:max-w-[600px] akun-card h-72 animate-pulse" />;
  }

  if (!customer) return null;

  return (
    <>
      <AkunHeader title="Ubah Password" back="/akun/profil" />

      <div className="md:max-w-[600px] md:akun-card md:p-8">
        <h1 className="text-lg md:text-xl font-extrabold" style={{ color: "#000000" }}>
          Ubah Password
        </h1>
        <p className="mt-1 mb-5 text-[12.5px] md:text-sm leading-relaxed text-[#777777]">
          Demi keamanan, kami kirim kode verifikasi ke WhatsApp yang terdaftar sebelum
          password diganti.
        </p>

        <ChangePasswordFlow email={customer.email || ""} whatsapp={customer.whatsapp || ""} />
      </div>
    </>
  );
}

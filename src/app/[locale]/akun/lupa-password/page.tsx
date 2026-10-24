"use client";

import AuthHeader from "@/components/akun/AuthHeader";
import ForgotPasswordFlow from "@/components/akun/ForgotPasswordFlow";

export default function LupaPasswordPage() {
  return (
    <section
      className="relative min-h-screen flex items-center justify-center px-6 pt-20 pb-12"
      style={{ background: "#f0f2f5" }}
    >
      <AuthHeader title="Lupa Password" />

      <div className="w-full max-w-sm">
        <div className="lg:hidden text-center mb-8">
          <span
            className="text-3xl tracking-[0.2em] font-medium"
            style={{ fontFamily: "var(--font-cormorant), Georgia, serif", color: "var(--espresso)" }}
          >
            SAMAQU
          </span>
          <p className="text-[11px] tracking-[0.28em] uppercase mt-2" style={{ color: "var(--text-muted)" }}>
            Customer Account
          </p>
        </div>

        <div
          className="rounded-2xl bg-white p-6 sm:p-7"
          style={{ border: "1px solid rgba(0,0,0,.08)", boxShadow: "0 10px 30px -18px rgba(0,0,0,.25)" }}
        >
          <ForgotPasswordFlow />
        </div>
      </div>
    </section>
  );
}

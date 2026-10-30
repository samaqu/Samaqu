"use client";

// Dashboard admin ber-bahasa-locale (/id/admin).
//
// Dulu file ini salinan penuh dari `src/app/admin/page.tsx` dan sudah mulai drift
// (beberapa kartu di panel Pengaturan tidak ikut tersalin ke sini). Sekarang kedua
// route merender komponen yang SAMA, supaya perubahan tidak pernah cuma masuk ke
// satu sisi.
export { default } from "@/app/(internal)/admin/page";

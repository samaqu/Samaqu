// Halaman utama /ops kini menampilkan dashboard (bukan lagi redirect ke /ops/leads).
// Re-export dari halaman dashboard supaya URL tetap `/ops` (menu sidebar "Dashboard"
// memakai href "/ops" sehingga tetap tersorot aktif) dan implementasinya satu tempat.
export { default } from "./dashboard/page";

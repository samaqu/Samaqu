import localFont from "next/font/local";

export const plusJakarta = localFont({
  src: [
    { path: "../../public/fonts/plusjakartasans-light.woff2", weight: "300", style: "normal" },
    { path: "../../public/fonts/plusjakartasans-regular.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/plusjakartasans-medium.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/plusjakartasans-semibold.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/plusjakartasans-bold.woff2", weight: "700", style: "normal" },
    { path: "../../public/fonts/plusjakartasans-extrabold.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-plus-jakarta",
  display: "swap",
});

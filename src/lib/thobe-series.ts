export type ThobeSeriesPointIcon = "collar" | "placket" | "general";

export interface ThobeSeriesPoint {
  icon: ThobeSeriesPointIcon;
  title: string;
  desc: string;
}

export interface ThobeSeriesItem {
  id: string;
  name: string;
  tag: string;
  image: string;
  points: ThobeSeriesPoint[];
  fit: string;
}

const ALL_SERIES_POINT: ThobeSeriesPoint = {
  icon: "general",
  title: "Semua series",
  desc: "Zipper, lengan manset, kantong di dada",
};

export const THOBE_SERIES: ThobeSeriesItem[] = [
  {
    id: "jiharkah",
    name: "Jiharkah",
    tag: "Kerah Bulat · Placket Polos",
    image: "/series/thobe/jiharkah.png",
    points: [
      { icon: "collar", title: "Kerah bulat", desc: "Tampilan simpel dan rapi" },
      { icon: "placket", title: "Placket polos", desc: "Tanpa kancing diamond" },
      ALL_SERIES_POINT,
    ],
    fit: "Yang suka tampilan bersih dan rapi untuk harian.",
  },
  {
    id: "bayati",
    name: "Bayati",
    tag: "Kerah Bulat · Eyelet",
    image: "/series/thobe/bayati.png",
    points: [
      { icon: "collar", title: "Kerah bulat", desc: "Tampilan simpel dan rapi" },
      { icon: "placket", title: "Placket eyelet", desc: "Aksen eyelet berlubang" },
      ALL_SERIES_POINT,
    ],
    fit: "Yang mau aksen di placket tapi tetap praktis.",
  },
  {
    id: "imron",
    name: "Imron",
    tag: "Kerah Bulat · Kancing Diamond",
    image: "/series/thobe/imron.png",
    points: [
      { icon: "collar", title: "Kerah bulat", desc: "Tampilan simpel dan rapi" },
      { icon: "placket", title: "Placket kancing diamond", desc: "Aksen kancing diamond" },
      ALL_SERIES_POINT,
    ],
    fit: "Yang mau aksen di placket tapi tetap praktis.",
  },
  {
    id: "nahawand",
    name: "Nahawand",
    tag: "Kerah Kemeja · Placket Polos",
    image: "/series/thobe/nahawand.png",
    points: [
      { icon: "collar", title: "Kerah kemeja", desc: "Model kerah ala kemeja" },
      { icon: "placket", title: "Placket polos", desc: "Tanpa kancing diamond" },
      ALL_SERIES_POINT,
    ],
    fit: "Yang suka tampilan simpel dan gampang dipadukan.",
  },
  {
    id: "imalah",
    name: "Imalah",
    tag: "Kerah Kemeja · Pin Collar",
    image: "/series/thobe/imalah.png",
    points: [
      { icon: "collar", title: "Kerah kemeja + pin collar", desc: "Dilengkapi aksesoris pin collar" },
      { icon: "placket", title: "Placket polos", desc: "Tanpa kancing diamond" },
      ALL_SERIES_POINT,
    ],
    fit: "Yang mau tampilan formal yang lebih tegas.",
  },
  {
    id: "karim",
    name: "Karim",
    tag: "Kerah Kemeja · Kancing Diamond",
    image: "/series/thobe/karim.png",
    points: [
      { icon: "collar", title: "Kerah kemeja", desc: "Model kerah ala kemeja" },
      { icon: "placket", title: "Placket kancing diamond", desc: "Aksen kancing diamond" },
      ALL_SERIES_POINT,
    ],
    fit: "Yang mau aksen di placket tapi tetap praktis.",
  },
];

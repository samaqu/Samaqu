export type ThobeSeriesPointIcon = "collar" | "placket" | "general";

export interface ThobeSeriesPoint {
  icon: ThobeSeriesPointIcon;
  title: string;
  desc: string;
}

export interface ThobeSeriesCopy {
  tag: string;
  points: ThobeSeriesPoint[];
  fit: string;
}

export interface ThobeSeriesItem {
  id: string;
  name: string;
  image: string;
  copy: Record<"id" | "en", ThobeSeriesCopy>;
}

export interface ThobeSeriesDisplayItem extends ThobeSeriesCopy {
  id: string;
  name: string;
  image: string;
}

const ALL_SERIES_ID: ThobeSeriesPoint = {
  icon: "general",
  title: "Semua series",
  desc: "Zipper, lengan manset, kantong di dada",
};

const ALL_SERIES_EN: ThobeSeriesPoint = {
  icon: "general",
  title: "All series",
  desc: "Zipper, cuffed sleeves, chest pocket",
};

export const THOBE_SERIES: ThobeSeriesItem[] = [
  {
    id: "jiharkah",
    name: "Jiharkah",
    image: "/series/thobe/jiharkah.png",
    copy: {
      id: {
        tag: "Kerah Bulat · Placket Polos",
        points: [
          { icon: "collar", title: "Kerah bulat", desc: "Tampilan simpel dan rapi" },
          { icon: "placket", title: "Placket polos", desc: "Tanpa kancing diamond" },
          ALL_SERIES_ID,
        ],
        fit: "Yang suka tampilan bersih dan rapi untuk harian.",
      },
      en: {
        tag: "Round Collar · Plain Placket",
        points: [
          { icon: "collar", title: "Round collar", desc: "Simple and neat look" },
          { icon: "placket", title: "Plain placket", desc: "No diamond buttons" },
          ALL_SERIES_EN,
        ],
        fit: "For those who like a clean, neat look for everyday wear.",
      },
    },
  },
  {
    id: "imron",
    name: "Imron",
    image: "/series/thobe/imron.png",
    copy: {
      id: {
        tag: "Kerah Bulat · Kancing Diamond",
        points: [
          { icon: "collar", title: "Kerah bulat", desc: "Tampilan simpel dan rapi" },
          { icon: "placket", title: "Placket kancing diamond", desc: "Aksen kancing diamond" },
          ALL_SERIES_ID,
        ],
        fit: "Yang mau aksen di placket tapi tetap praktis.",
      },
      en: {
        tag: "Round Collar · Diamond Buttons",
        points: [
          { icon: "collar", title: "Round collar", desc: "Simple and neat look" },
          { icon: "placket", title: "Diamond button placket", desc: "Diamond button detail" },
          ALL_SERIES_EN,
        ],
        fit: "For those who want a placket detail yet stay practical.",
      },
    },
  },
  {
    id: "bayati",
    name: "Bayati",
    image: "/series/thobe/bayati.png",
    copy: {
      id: {
        tag: "Kerah Bulat · Eyelet",
        points: [
          { icon: "collar", title: "Kerah bulat", desc: "Tampilan simpel dan rapi" },
          { icon: "placket", title: "Placket eyelet", desc: "Aksen eyelet berlubang" },
          ALL_SERIES_ID,
        ],
        fit: "Yang mau aksen di placket tapi tetap praktis.",
      },
      en: {
        tag: "Round Collar · Eyelet",
        points: [
          { icon: "collar", title: "Round collar", desc: "Simple and neat look" },
          { icon: "placket", title: "Eyelet placket", desc: "Perforated eyelet detail" },
          ALL_SERIES_EN,
        ],
        fit: "For those who want a placket detail yet stay practical.",
      },
    },
  },
  {
    id: "nahawand",
    name: "Nahawand",
    image: "/series/thobe/nahawand.png",
    copy: {
      id: {
        tag: "Kerah Kemeja · Placket Polos",
        points: [
          { icon: "collar", title: "Kerah kemeja", desc: "Model kerah ala kemeja" },
          { icon: "placket", title: "Placket polos", desc: "Tanpa kancing diamond" },
          ALL_SERIES_ID,
        ],
        fit: "Yang suka tampilan simpel dan gampang dipadukan.",
      },
      en: {
        tag: "Shirt Collar · Plain Placket",
        points: [
          { icon: "collar", title: "Shirt collar", desc: "Shirt-style collar" },
          { icon: "placket", title: "Plain placket", desc: "No diamond buttons" },
          ALL_SERIES_EN,
        ],
        fit: "For those who like a simple look that's easy to mix and match.",
      },
    },
  },
  {
    id: "karim",
    name: "Karim",
    image: "/series/thobe/karim.png",
    copy: {
      id: {
        tag: "Kerah Kemeja · Kancing Diamond",
        points: [
          { icon: "collar", title: "Kerah kemeja", desc: "Model kerah ala kemeja" },
          { icon: "placket", title: "Placket kancing diamond", desc: "Aksen kancing diamond" },
          ALL_SERIES_ID,
        ],
        fit: "Yang mau aksen di placket tapi tetap praktis.",
      },
      en: {
        tag: "Shirt Collar · Diamond Buttons",
        points: [
          { icon: "collar", title: "Shirt collar", desc: "Shirt-style collar" },
          { icon: "placket", title: "Diamond button placket", desc: "Diamond button detail" },
          ALL_SERIES_EN,
        ],
        fit: "For those who want a placket detail yet stay practical.",
      },
    },
  },
  {
    id: "imalah",
    name: "Imalah",
    image: "/series/thobe/imalah.png",
    copy: {
      id: {
        tag: "Kerah Kemeja · Pin Collar",
        points: [
          { icon: "collar", title: "Kerah kemeja + pin collar", desc: "Dilengkapi aksesoris pin collar" },
          { icon: "placket", title: "Placket polos", desc: "Tanpa kancing diamond" },
          ALL_SERIES_ID,
        ],
        fit: "Yang mau tampilan formal yang lebih tegas.",
      },
      en: {
        tag: "Shirt Collar · Pin Collar",
        points: [
          { icon: "collar", title: "Shirt collar + pin collar", desc: "Includes a pin collar accessory" },
          { icon: "placket", title: "Plain placket", desc: "No diamond buttons" },
          ALL_SERIES_EN,
        ],
        fit: "For those who want a sharper formal look.",
      },
    },
  },
];

export function thobeSeriesForLocale(locale: string): ThobeSeriesDisplayItem[] {
  const lang: "id" | "en" = locale.toLowerCase().startsWith("en") ? "en" : "id";
  return THOBE_SERIES.map(({ id, name, image, copy }) => ({ id, name, image, ...copy[lang] }));
}

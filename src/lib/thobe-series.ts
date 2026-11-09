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
  title: "All series",
  desc: "Zipper, cuffed sleeves, chest pocket",
};

export const THOBE_SERIES: ThobeSeriesItem[] = [
  {
    id: "jiharkah",
    name: "Jiharkah",
    tag: "Round Collar · Plain Placket",
    image: "/series/thobe/jiharkah.png",
    points: [
      { icon: "collar", title: "Round collar", desc: "Simple and neat look" },
      { icon: "placket", title: "Plain placket", desc: "No diamond buttons" },
      ALL_SERIES_POINT,
    ],
    fit: "For those who like a clean, neat look for everyday wear.",
  },
  {
    id: "imron",
    name: "Imron",
    tag: "Round Collar · Diamond Buttons",
    image: "/series/thobe/imron.png",
    points: [
      { icon: "collar", title: "Round collar", desc: "Simple and neat look" },
      { icon: "placket", title: "Diamond button placket", desc: "Diamond button detail" },
      ALL_SERIES_POINT,
    ],
    fit: "For those who want a placket detail yet stay practical.",
  },
  {
    id: "bayati",
    name: "Bayati",
    tag: "Round Collar · Eyelet",
    image: "/series/thobe/bayati.png",
    points: [
      { icon: "collar", title: "Round collar", desc: "Simple and neat look" },
      { icon: "placket", title: "Eyelet placket", desc: "Perforated eyelet detail" },
      ALL_SERIES_POINT,
    ],
    fit: "For those who want a placket detail yet stay practical.",
  },
  {
    id: "nahawand",
    name: "Nahawand",
    tag: "Shirt Collar · Plain Placket",
    image: "/series/thobe/nahawand.png",
    points: [
      { icon: "collar", title: "Shirt collar", desc: "Shirt-style collar" },
      { icon: "placket", title: "Plain placket", desc: "No diamond buttons" },
      ALL_SERIES_POINT,
    ],
    fit: "For those who like a simple look that's easy to mix and match.",
  },
  {
    id: "karim",
    name: "Karim",
    tag: "Shirt Collar · Diamond Buttons",
    image: "/series/thobe/karim.png",
    points: [
      { icon: "collar", title: "Shirt collar", desc: "Shirt-style collar" },
      { icon: "placket", title: "Diamond button placket", desc: "Diamond button detail" },
      ALL_SERIES_POINT,
    ],
    fit: "For those who want a placket detail yet stay practical.",
  },
  {
    id: "imalah",
    name: "Imalah",
    tag: "Shirt Collar · Pin Collar",
    image: "/series/thobe/imalah.png",
    points: [
      { icon: "collar", title: "Shirt collar + pin collar", desc: "Includes a pin collar accessory" },
      { icon: "placket", title: "Plain placket", desc: "No diamond buttons" },
      ALL_SERIES_POINT,
    ],
    fit: "For those who want a sharper formal look.",
  },
];

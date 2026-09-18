export type PubgMapInfo = {
  id: string;
  name: string;
  englishName: string;
  apiNames: readonly string[];
  sizeCm: number;
  image: string;
  assetFile: string;
  summary: string;
};

export const PUBG_MAPS: readonly PubgMapInfo[] = [
  {
    id: "erangel",
    name: "艾伦格",
    englishName: "Erangel",
    apiNames: ["Baltic_Main", "Island_Main"],
    sizeCm: 816_000,
    image: "/maps/erangel.png",
    assetFile: "Erangel_Main_Low_Res.png",
    summary: "经典海岛地图，城镇、山地与开阔区域并存。",
  },
  {
    id: "miramar",
    name: "米拉玛",
    englishName: "Miramar",
    apiNames: ["Desert_Main"],
    sizeCm: 816_000,
    image: "/maps/miramar.png",
    assetFile: "Miramar_Main_Low_Res.png",
    summary: "大尺度沙漠地图，以山脊、盆地和长距离交火为主。",
  },
  {
    id: "vikendi",
    name: "维寒迪",
    englishName: "Vikendi",
    apiNames: ["DihorOtok_Main"],
    sizeCm: 816_000,
    image: "/maps/vikendi.png",
    assetFile: "Vikendi_Main_Low_Res.png",
    summary: "雪地与林地交错，地形高差和掩体密度变化明显。",
  },
  {
    id: "taego",
    name: "泰戈",
    englishName: "Taego",
    apiNames: ["Tiger_Main"],
    sizeCm: 816_000,
    image: "/maps/taego.png",
    assetFile: "Taego_Main_Low_Res.png",
    summary: "开阔乡野与集中城区构成的大型地图。",
  },
  {
    id: "deston",
    name: "帝斯顿",
    englishName: "Deston",
    apiNames: ["Kiki_Main"],
    sizeCm: 816_000,
    image: "/maps/deston.png",
    assetFile: "Deston_Main_Low_Res.png",
    summary: "城市、水域与湿地组合的大型地图。",
  },
  {
    id: "rondo",
    name: "荣都",
    englishName: "Rondo",
    apiNames: ["Neon_Main"],
    sizeCm: 816_000,
    image: "/maps/rondo.png",
    assetFile: "Rondo_Main_No_Text_Low_Res.png",
    summary: "自然地形与现代城区并置的大型地图。",
  },
  {
    id: "sanhok",
    name: "萨诺",
    englishName: "Sanhok",
    apiNames: ["Savage_Main"],
    sizeCm: 408_000,
    image: "/maps/sanhok.png",
    assetFile: "Sanhok_Main_Low_Res.png",
    summary: "紧凑热带地图，植被密集，交战节奏较快。",
  },
  {
    id: "paramo",
    name: "帕拉莫",
    englishName: "Paramo",
    apiNames: ["Chimera_Main"],
    sizeCm: 306_000,
    image: "/maps/paramo.png",
    assetFile: "Paramo_Main_Low_Res.png",
    summary: "高原地形构成的紧凑地图。",
  },
  {
    id: "karakin",
    name: "卡拉金",
    englishName: "Karakin",
    apiNames: ["Summerland_Main"],
    sizeCm: 204_000,
    image: "/maps/karakin.png",
    assetFile: "Karakin_Main_Low_Res.png",
    summary: "小型荒漠海岛，地形紧凑、转点距离短。",
  },
  {
    id: "haven",
    name: "褐湾",
    englishName: "Haven",
    apiNames: ["Heaven_Main"],
    sizeCm: 102_000,
    image: "/maps/haven.png",
    assetFile: "Haven_Main_Low_Res.png",
    summary: "以工业城区为核心的小型地图。",
  },
];

const MAP_LABELS: Record<string, string> = Object.fromEntries(
  PUBG_MAPS.flatMap((map) => map.apiNames.map((apiName) => [apiName, map.name])),
);

const MAP_SIZE_CM: Record<string, number> = Object.fromEntries(
  PUBG_MAPS.flatMap((map) => map.apiNames.map((apiName) => [apiName, map.sizeCm])),
);

MAP_LABELS.Range_Main = "训练场";
MAP_LABELS.Unknown = "未知地图";
MAP_SIZE_CM.Range_Main = 204_000;

export function mapLabel(mapName: string): string {
  return MAP_LABELS[mapName] ?? mapName.replace(/_Main$/, "") ?? mapName;
}

export function mapSizeCm(mapName: string): number {
  return MAP_SIZE_CM[mapName] ?? 816_000;
}

export function listMaps(): readonly PubgMapInfo[] {
  return PUBG_MAPS;
}

export function getMapById(id: string): PubgMapInfo | null {
  return PUBG_MAPS.find((map) => map.id === id.toLowerCase()) ?? null;
}

export function mapIdFromApiName(mapName: string): string | null {
  return PUBG_MAPS.find((map) => map.apiNames.includes(mapName))?.id ?? null;
}

export function mapSizeLabel(sizeCm: number): string {
  const sizeKm = sizeCm / 100_000;
  return `${sizeKm.toFixed(Number.isInteger(sizeKm) ? 0 : 1)} × ${sizeKm.toFixed(Number.isInteger(sizeKm) ? 0 : 1)} km`;
}

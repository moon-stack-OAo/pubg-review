const MAP_LABELS: Record<string, string> = {
  Baltic_Main: "艾伦格",
  Desert_Main: "米拉玛",
  Savage_Main: "萨诺",
  DihorOtok_Main: "维寒迪",
  Summerland_Main: "卡拉金",
  Tiger_Main: "泰戈",
  Kiki_Main: "帝斯顿",
  Chimera_Main: "帕拉莫",
  Neon_Main: "荣都",
  Heaven_Main: "褐湾",
  Range_Main: "训练场",
  Island_Main: "艾伦格",
  Unknown: "未知地图",
};

/** 地图边长（厘米），用于坐标归一化；未知地图默认 816000 */
const MAP_SIZE_CM: Record<string, number> = {
  Baltic_Main: 816_000,
  Desert_Main: 816_000,
  Tiger_Main: 816_000,
  DihorOtok_Main: 816_000,
  Kiki_Main: 816_000,
  Neon_Main: 816_000,
  Island_Main: 816_000,
  Savage_Main: 408_000,
  Chimera_Main: 306_000,
  Summerland_Main: 204_000,
  Range_Main: 204_000,
  Heaven_Main: 102_000,
};

export function mapLabel(mapName: string): string {
  return MAP_LABELS[mapName] ?? mapName.replace(/_Main$/, "") ?? mapName;
}

export function mapSizeCm(mapName: string): number {
  return MAP_SIZE_CM[mapName] ?? 816_000;
}

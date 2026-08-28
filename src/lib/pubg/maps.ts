const MAP_LABELS: Record<string, string> = {
  Baltic_Main: "Erangel",
  Desert_Main: "Miramar",
  Savage_Main: "Sanhok",
  DihorOtok_Main: "Vikendi",
  Summerland_Main: "Karakin",
  Tiger_Main: "Taego",
  Kiki_Main: "Deston",
  Chimera_Main: "Paramo",
  Neon_Main: "Rondo",
  Heaven_Main: "Haven",
  Range_Main: "Camp Jackal",
  Island_Main: "Erangel",
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

export type MapPoiKind =
  | "hotspot"
  | "building"
  | "compound"
  | "secret_room"
  | "vehicle_zone";

export type MapPoi = {
  id: string;
  mapId: string;
  name: string;
  kind: MapPoiKind;
  /** 遥测坐标系，与 sizeCm 同系；原点与官方一致 */
  x: number;
  y: number;
  radiusCm?: number;
  bounds?: {minX: number; minY: number; maxX: number; maxY: number};
  note?: string;
};

const KIND_LABELS: Record<MapPoiKind, string> = {
  hotspot: "热点",
  building: "建筑",
  compound: "院落近似",
  secret_room: "地堡/密室入口",
  vehicle_zone: "刷车区",
};

const SECRET_ROOM_NOTE =
  "社区清单（ziphow/pubg-map-toolkit points.js）换算；非官方 API；需钥匙或地图机制可能不同；入口近似，非逐房间还原";

const COMMUNITY_MAP_PX = 8192;

/** 社区图鉴常用 8192 像素全图 → 遥测厘米 */
function mapPxToCm(px: number, sizeCm: number): number {
  return Math.round((px / COMMUNITY_MAP_PX) * sizeCm);
}

type SecretRoomPx = readonly [communityId: string, name: string, px: number, py: number];

function buildSecretRooms(
  mapId: string,
  sizeCm: number,
  entries: readonly SecretRoomPx[],
): readonly MapPoi[] {
  return entries.map(([communityId, name, px, py]) => ({
    id: `${mapId}-bunker-${communityId.toLowerCase()}`,
    mapId,
    name,
    kind: "secret_room" as const,
    x: mapPxToCm(px, sizeCm),
    y: mapPxToCm(py, sizeCm),
    radiusCm: 4_000,
    note: SECRET_ROOM_NOTE,
  }));
}

/**
 * 艾伦格地堡/密室入口：社区清单转遥测坐标。
 * 像素源参考 ziphow/pubg-map-toolkit `points.js`（secret_room S101–S115）。
 */
const ERANGEL_SECRET_ROOMS = buildSecretRooms("erangel", 816_000, [
  ["S101", "地堡入口 · 西北", 1380, 1815],
  ["S102", "地堡入口 · 西侧内陆", 2592, 2220],
  ["S103", "地堡入口 · 北中（School 北）", 4127, 1972],
  ["S104", "地堡入口 · 极北", 5128, 670],
  ["S105", "地堡入口 · 东北", 6531, 2080],
  ["S106", "地堡入口 · 东岸", 6761, 4900],
  ["S107", "地堡入口 · 东中", 5474, 3430],
  ["S108", "地堡入口 · 中南（Pochinki 南）", 4661, 4420],
  ["S109", "地堡入口 · 西南内陆", 2706, 5094],
  ["S110", "地堡入口 · 近 Primorsk", 1264, 5536],
  ["S111", "地堡入口 · 近 Georgopol", 1484, 3546],
  ["S112", "地堡入口 · 近 Pochinki", 3011, 3754],
  ["S113", "地堡入口 · 南岛北侧", 4407, 5924],
  ["S114", "地堡入口 · 南岛西", 3304, 6705],
  ["S115", "地堡入口 · 近 Novorepnoye", 5677, 6733],
]);

/** 艾伦格样板：近似坐标（厘米），非游戏内精确落点 */
const ERANGEL_POIS: readonly MapPoi[] = [
  {
    id: "erangel-pochinki",
    mapId: "erangel",
    name: "Pochinki",
    kind: "hotspot",
    x: 326_400,
    y: 391_700,
    radiusCm: 18_000,
    note: "中央城镇热点，近似坐标",
  },
  {
    id: "erangel-school",
    mapId: "erangel",
    name: "School",
    kind: "building",
    x: 391_700,
    y: 310_100,
    radiusCm: 8_000,
    note: "学校建筑区，近似坐标",
  },
  {
    id: "erangel-military",
    mapId: "erangel",
    name: "Military Base",
    kind: "hotspot",
    x: 448_800,
    y: 652_800,
    radiusCm: 28_000,
    note: "南岛军事基地，近似坐标",
  },
  {
    id: "erangel-georgopol",
    mapId: "erangel",
    name: "Georgopol",
    kind: "hotspot",
    x: 163_200,
    y: 285_600,
    radiusCm: 24_000,
    note: "西部港口城区，近似坐标",
  },
  {
    id: "erangel-novo",
    mapId: "erangel",
    name: "Novorepnoye",
    kind: "hotspot",
    x: 571_200,
    y: 571_200,
    radiusCm: 20_000,
    note: "东南港口，近似坐标",
  },
  {
    id: "erangel-rozhok",
    mapId: "erangel",
    name: "Rozhok",
    kind: "hotspot",
    x: 424_300,
    y: 326_400,
    radiusCm: 12_000,
    note: "学校北侧村镇，近似坐标",
  },
  {
    id: "erangel-mylta",
    mapId: "erangel",
    name: "Mylta",
    kind: "hotspot",
    x: 587_500,
    y: 473_300,
    radiusCm: 14_000,
    note: "东部沿海，近似坐标",
  },
  {
    id: "erangel-primorsk",
    mapId: "erangel",
    name: "Primorsk",
    kind: "hotspot",
    x: 146_900,
    y: 587_500,
    radiusCm: 16_000,
    note: "西南沿海，近似坐标",
  },
  {
    id: "erangel-yasnaya",
    mapId: "erangel",
    name: "Yasnaya Polyana",
    kind: "hotspot",
    x: 489_600,
    y: 285_600,
    radiusCm: 16_000,
    note: "东北村镇，近似坐标",
  },
  {
    id: "erangel-sosnovka",
    mapId: "erangel",
    name: "Sosnovka",
    kind: "hotspot",
    x: 391_700,
    y: 620_200,
    radiusCm: 14_000,
    note: "南岛村镇（军事基地北侧），近似坐标",
  },
  {
    id: "erangel-school-compound",
    mapId: "erangel",
    name: "School 周边院落",
    kind: "compound",
    x: 391_700,
    y: 318_000,
    bounds: {
      minX: 378_000,
      minY: 300_000,
      maxX: 405_000,
      maxY: 336_000,
    },
    note: "建筑群/院落轮廓近似，非逐房间",
  },
  {
    id: "erangel-pochinki-compound",
    mapId: "erangel",
    name: "Pochinki 建筑群",
    kind: "compound",
    x: 326_400,
    y: 391_700,
    bounds: {
      minX: 310_000,
      minY: 375_000,
      maxX: 343_000,
      maxY: 408_000,
    },
    note: "城镇建筑群近似范围，非密室还原",
  },
  {
    id: "erangel-georgopol-vehicles",
    mapId: "erangel",
    name: "Georgopol 常见刷车区",
    kind: "vehicle_zone",
    x: 175_000,
    y: 300_000,
    radiusCm: 22_000,
    note: "粗粒度常见刷车区，非真实刷车点",
  },
  {
    id: "erangel-military-vehicles",
    mapId: "erangel",
    name: "Military 周边刷车区",
    kind: "vehicle_zone",
    x: 430_000,
    y: 630_000,
    radiusCm: 26_000,
    note: "粗粒度常见刷车区，非真实刷车点",
  },
  ...ERANGEL_SECRET_ROOMS,
];

const MIRAMAR_SECRET_ROOMS = buildSecretRooms("miramar", 816_000, [
  ["Umtbhc5yu44oc", "地堡/密室入口 · Umtbhc5yu44oc", 1798, 1681],
  ["Umtbhcqlia7zh", "地堡/密室入口 · Umtbhcqlia7zh", 3273, 1084],
  ["Umtbhdh6ok0jc", "地堡/密室入口 · Umtbhdh6ok0jc", 4637, 1444],
  ["Umtbhe2t4ztu2", "地堡/密室入口 · Umtbhe2t4ztu2", 6318, 1952],
  ["Umtbhexh4a15k", "地堡/密室入口 · Umtbhexh4a15k", 2807, 2519],
  ["Umtbhfkz0dhbh", "地堡/密室入口 · Umtbhfkz0dhbh", 1406, 3302],
  ["Umtbhgg4qhdeh", "地堡/密室入口 · Umtbhgg4qhdeh", 5163, 3225],
  ["Umtbhgxmr7636", "地堡/密室入口 · Umtbhgxmr7636", 3858, 3923],
  ["Umtbhh9hf95mk", "地堡/密室入口 · Umtbhh9hf95mk", 6202, 4285],
  ["Umtbhhmbv2we5", "地堡/密室入口 · Umtbhhmbv2we5", 1318, 5334],
  ["Umtbhhvllb4hx", "地堡/密室入口 · Umtbhhvllb4hx", 2684, 5005],
  ["Umtbhicj24i6s", "地堡/密室入口 · Umtbhicj24i6s", 4438, 5224],
  ["Umtbhizh7op0o", "地堡/密室入口 · Umtbhizh7op0o", 1421, 7284],
  ["Umtbhjpmumlrs", "地堡/密室入口 · Umtbhjpmumlrs", 3252, 6666],
  ["Umtbhkads6c2m", "地堡/密室入口 · Umtbhkads6c2m", 5269, 6313],
]);

/** Vikendi：社区 data.js 曾写 kmSize:6，本仓库现行 sizeCm=816000（8×8） */
const VIKENDI_SECRET_ROOMS = buildSecretRooms("vikendi", 816_000, [
  ["B301", "地堡/密室入口 · B301", 2764, 1584],
  ["B302", "地堡/密室入口 · B302", 5444, 1332],
  ["B303", "地堡/密室入口 · B303", 6294, 2474],
  ["B304", "地堡/密室入口 · B304", 6886, 3914],
  ["B305", "地堡/密室入口 · B305", 6118, 5912],
  ["B306", "地堡/密室入口 · B306", 3970, 6579],
  ["B307", "地堡/密室入口 · B307", 2388, 5670],
  ["B308", "地堡/密室入口 · B308", 1400, 3872],
  ["B309", "地堡/密室入口 · B309", 4130, 3232],
  ["B310", "地堡/密室入口 · B310", 4740, 4988],
]);

const TAEGO_SECRET_ROOMS = buildSecretRooms("taego", 816_000, [
  ["S401", "地堡/密室入口 · S401", 4855, 1727],
  ["S402", "地堡/密室入口 · S402", 2605, 1378],
  ["S403", "地堡/密室入口 · S403", 1405, 1192],
  ["S404", "地堡/密室入口 · S404", 1025, 3420],
  ["S405", "地堡/密室入口 · S405", 960, 5285],
  ["S406", "地堡/密室入口 · S406", 2430, 6486],
  ["S407", "地堡/密室入口 · S407", 4985, 6446],
  ["S408", "地堡/密室入口 · S408", 4445, 4994],
  ["S409", "地堡/密室入口 · S409", 6370, 7253],
  ["S410", "地堡/密室入口 · S410", 6445, 5597],
  ["S411", "地堡/密室入口 · S411", 7150, 3405],
  ["S412", "地堡/密室入口 · S412", 6945, 2086],
  ["S413", "地堡/密室入口 · S413", 6070, 3887],
  ["S414", "地堡/密室入口 · S414", 3595, 1979],
  ["S415", "地堡/密室入口 · S415", 1265, 2715],
]);

const DESTON_SECRET_ROOMS = buildSecretRooms("deston", 816_000, [
  ["S507", "地堡/密室入口 · S507", 1645, 4557],
  ["Umtboew4za3z9", "地堡/密室入口 · Umtboew4za3z9", 6142, 4234],
  ["Umtbof27bf9de", "地堡/密室入口 · Umtbof27bf9de", 6199, 4237],
  ["Umtbof5fvniqu", "地堡/密室入口 · Umtbof5fvniqu", 6207, 4186],
  ["Umtbof9gna6n8", "地堡/密室入口 · Umtbof9gna6n8", 6317, 4127],
  ["Umtbofg0nrshq", "地堡/密室入口 · Umtbofg0nrshq", 6501, 4067],
  ["Umtbofi0zcws1", "地堡/密室入口 · Umtbofi0zcws1", 6600, 4151],
  ["Umtbofns1joop", "地堡/密室入口 · Umtbofns1joop", 6538, 4346],
  ["Umtbofvfxtiey", "地堡/密室入口 · Umtbofvfxtiey", 6407, 4616],
  ["Umtbog8ans2b1", "地堡/密室入口 · Umtbog8ans2b1", 6160, 4713],
  ["Umtbogfelawre", "地堡/密室入口 · Umtbogfelawre", 6060, 4699],
  ["Umtbogipnmk55", "地堡/密室入口 · Umtbogipnmk55", 5961, 4766],
  ["Umtboglwjxk7o", "地堡/密室入口 · Umtboglwjxk7o", 6612, 4585],
  ["Umtbogqyj46gu", "地堡/密室入口 · Umtbogqyj46gu", 6571, 4650],
  ["Umtbogrvtpmgf", "地堡/密室入口 · Umtbogrvtpmgf", 6556, 4665],
  ["Umtbogzhpg5xv", "地堡/密室入口 · Umtbogzhpg5xv", 6798, 4535],
  ["Umtboh143w330", "地堡/密室入口 · Umtboh143w330", 6745, 4606],
  ["Umtbohvagzs4k", "地堡/密室入口 · Umtbohvagzs4k", 4595, 4087],
  ["Umtboi40274wl", "地堡/密室入口 · Umtboi40274wl", 3838, 4533],
  ["Umtboiqt3z09g", "地堡/密室入口 · Umtboiqt3z09g", 5101, 1966],
  ["Umtboixhfq4h8", "地堡/密室入口 · Umtboixhfq4h8", 6730, 1889],
  ["Umtbojjichq3q", "地堡/密室入口 · Umtbojjichq3q", 1926, 1472],
  ["Umtbojkyh0wcn", "地堡/密室入口 · Umtbojkyh0wcn", 1881, 1432],
  ["Umtbojonj2vk9", "地堡/密室入口 · Umtbojonj2vk9", 1961, 1810],
  ["Umtbok9kyejcb", "地堡/密室入口 · Umtbok9kyejcb", 5212, 901],
  ["Umtboknvm215l", "地堡/密室入口 · Umtboknvm215l", 2782, 527],
  ["Umtbol58gjdhi", "地堡/密室入口 · Umtbol58gjdhi", 1752, 3385],
  ["Umtbolk9uaifo", "地堡/密室入口 · Umtbolk9uaifo", 3295, 3593],
  ["Umtbom0w2d7l3", "地堡/密室入口 · Umtbom0w2d7l3", 4539, 2742],
  ["Umtbomf8s7gwz", "地堡/密室入口 · Umtbomf8s7gwz", 7385, 3158],
  ["Umtbon6kx4wv9", "地堡/密室入口 · Umtbon6kx4wv9", 2302, 4727],
  ["Umtboni65d00k", "地堡/密室入口 · Umtboni65d00k", 3787, 5711],
  ["Umtbonxajgjty", "地堡/密室入口 · Umtbonxajgjty", 5727, 6451],
  ["Umtboo8oft3i3", "地堡/密室入口 · Umtboo8oft3i3", 1153, 6311],
]);

const RONDO_SECRET_ROOMS = buildSecretRooms("rondo", 816_000, [
  ["S601", "地堡/密室入口 · S601", 1480, 1367],
  ["S602", "地堡/密室入口 · S602", 3030, 5173],
  ["S603", "地堡/密室入口 · S603", 3400, 7043],
  ["S604", "地堡/密室入口 · S604", 1435, 3264],
  ["S605", "地堡/密室入口 · S605", 1470, 4826],
  ["S606", "地堡/密室入口 · S606", 1285, 6510],
  ["S607", "地堡/密室入口 · S607", 4970, 7419],
  ["S608", "地堡/密室入口 · S608", 5615, 6109],
  ["S609", "地堡/密室入口 · S609", 4690, 4426],
  ["S610", "地堡/密室入口 · S610", 7070, 2766],
  ["S611", "地堡/密室入口 · S611", 5065, 2068],
  ["S612", "地堡/密室入口 · S612", 5825, 919],
  ["S613", "地堡/密室入口 · S613", 3050, 948],
  ["S614", "地堡/密室入口 · S614", 3815, 2674],
  ["S615", "地堡/密室入口 · S615", 6660, 4299],
]);

const PARAMO_SECRET_ROOMS = buildSecretRooms("paramo", 306_000, [
  ["S901", "地堡/密室入口 · S901", 1050, 5207],
  ["S902", "地堡/密室入口 · S902", 2265, 2941],
  ["S903", "地堡/密室入口 · S903", 3255, 2593],
  ["S904", "地堡/密室入口 · S904", 3550, 5173],
  ["S905", "地堡/密室入口 · S905", 4240, 6586],
  ["S906", "地堡/密室入口 · S906", 5115, 4023],
  ["S907", "地堡/密室入口 · S907", 6700, 4704],
  ["S908", "地堡/密室入口 · S908", 4950, 4939],
]);

const POIS_BY_MAP: Record<string, readonly MapPoi[]> = {
  erangel: ERANGEL_POIS,
  miramar: MIRAMAR_SECRET_ROOMS,
  vikendi: VIKENDI_SECRET_ROOMS,
  taego: TAEGO_SECRET_ROOMS,
  deston: DESTON_SECRET_ROOMS,
  rondo: RONDO_SECRET_ROOMS,
  paramo: PARAMO_SECRET_ROOMS,
};

export function listPoisByMapId(mapId: string): readonly MapPoi[] {
  return POIS_BY_MAP[mapId.toLowerCase()] ?? [];
}

export function poiKindLabel(kind: MapPoiKind): string {
  return KIND_LABELS[kind];
}

export function listPoiKindsPresent(pois: readonly MapPoi[]): MapPoiKind[] {
  const order: MapPoiKind[] = [
    "hotspot",
    "building",
    "compound",
    "secret_room",
    "vehicle_zone",
  ];
  const present = new Set(pois.map((p) => p.kind));
  return order.filter((k) => present.has(k));
}

export function hasMapPois(mapId: string): boolean {
  return listPoisByMapId(mapId).length > 0;
}

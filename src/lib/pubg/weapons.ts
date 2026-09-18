export type WeaponCategory =
  | "ar"
  | "smg"
  | "dmr"
  | "sniper"
  | "lmg"
  | "shotgun"
  | "handgun"
  | "melee"
  | "other";

export type PubgWeaponInfo = {
  id: string;
  name: string;
  englishName: string;
  telemetryIds: readonly string[];
  itemAssetId: string;
  category: WeaponCategory;
  image: string;
  assetFile: string;
  assetSubdir: "Main" | "Handgun" | "Melee";
  summary?: string;
};

const CATEGORY_LABELS: Record<WeaponCategory, string> = {
  ar: "突击步枪",
  smg: "冲锋枪",
  dmr: "精确射手步枪",
  sniper: "狙击步枪",
  lmg: "轻机枪",
  shotgun: "霰弹枪",
  handgun: "手枪",
  melee: "近战",
  other: "其他",
};

const CATEGORY_ORDER: readonly WeaponCategory[] = [
  "ar",
  "smg",
  "dmr",
  "sniper",
  "lmg",
  "shotgun",
  "handgun",
  "melee",
  "other",
];

function weapon(
  partial: Omit<PubgWeaponInfo, "image" | "assetFile"> & {
    image?: string;
    assetFile?: string;
  },
): PubgWeaponInfo {
  const assetFile = partial.assetFile ?? `${partial.itemAssetId}.png`;
  return {
    ...partial,
    assetFile,
    image: partial.image ?? `/weapons/${assetFile}`,
  };
}

export const PUBG_WEAPONS: readonly PubgWeaponInfo[] = [
  weapon({
    id: "hk416",
    name: "M416",
    englishName: "M416",
    telemetryIds: ["WeapHK416_C", "WeapDuncansHK416_C"],
    itemAssetId: "Item_Weapon_HK416_C",
    category: "ar",
    assetSubdir: "Main",
    summary: "常见突击步枪，可装配较多配件。",
  }),
  weapon({
    id: "scar-l",
    name: "SCAR-L",
    englishName: "SCAR-L",
    telemetryIds: ["WeapSCAR-L_C"],
    itemAssetId: "Item_Weapon_SCAR-L_C",
    category: "ar",
    assetSubdir: "Main",
    summary: "后坐可控的突击步枪。",
  }),
  weapon({
    id: "akm",
    name: "AKM",
    englishName: "AKM",
    telemetryIds: ["WeapAK47_C", "WeapLunchmeatsAK47_C"],
    itemAssetId: "Item_Weapon_AK47_C",
    category: "ar",
    assetSubdir: "Main",
    summary: "高单发伤害的 7.62 突击步枪。",
  }),
  weapon({
    id: "beryl",
    name: "Beryl M762",
    englishName: "Beryl",
    telemetryIds: ["WeapBerylM762_C"],
    itemAssetId: "Item_Weapon_BerylM762_C",
    category: "ar",
    assetSubdir: "Main",
    summary: "射速较快的 7.62 突击步枪。",
  }),
  weapon({
    id: "groza",
    name: "Groza",
    englishName: "Groza",
    telemetryIds: ["WeapGroza_C"],
    itemAssetId: "Item_Weapon_Groza_C",
    category: "ar",
    assetSubdir: "Main",
    summary: "空投补给中的突击步枪。",
  }),
  weapon({
    id: "aug",
    name: "AUG",
    englishName: "AUG A3",
    telemetryIds: ["WeapAUG_C"],
    itemAssetId: "Item_Weapon_AUG_C",
    category: "ar",
    assetSubdir: "Main",
    summary: "空投补给中的低后坐突击步枪。",
  }),
  weapon({
    id: "qbz",
    name: "QBZ",
    englishName: "QBZ95",
    telemetryIds: ["WeapQBZ95_C"],
    itemAssetId: "Item_Weapon_QBZ95_C",
    category: "ar",
    assetSubdir: "Main",
    summary: "部分地图刷新的无托突击步枪。",
  }),
  weapon({
    id: "g36c",
    name: "G36C",
    englishName: "G36C",
    telemetryIds: ["WeapG36C_C"],
    itemAssetId: "Item_Weapon_G36C_C",
    category: "ar",
    assetSubdir: "Main",
    summary: "部分地图刷新的突击步枪。",
  }),
  weapon({
    id: "ump",
    name: "UMP",
    englishName: "UMP9",
    telemetryIds: ["WeapUMP_C"],
    itemAssetId: "Item_Weapon_UMP_C",
    category: "smg",
    assetSubdir: "Main",
    summary: "中近距离常用冲锋枪。",
  }),
  weapon({
    id: "vector",
    name: "Vector",
    englishName: "Vector",
    telemetryIds: ["WeapVector_C"],
    itemAssetId: "Item_Weapon_Vector_C",
    category: "smg",
    assetSubdir: "Main",
    summary: "高射速冲锋枪。",
  }),
  weapon({
    id: "tommy",
    name: "汤姆逊",
    englishName: "Tommy Gun",
    telemetryIds: ["WeapThompson_C"],
    itemAssetId: "Item_Weapon_Thompson_C",
    category: "smg",
    assetSubdir: "Main",
    summary: "使用 .45 ACP 的冲锋枪。",
  }),
  weapon({
    id: "mp5k",
    name: "MP5K",
    englishName: "MP5K",
    telemetryIds: ["WeapMP5K_C"],
    itemAssetId: "Item_Weapon_MP5K_C",
    category: "smg",
    assetSubdir: "Main",
    summary: "部分地图刷新的冲锋枪。",
  }),
  weapon({
    id: "p90",
    name: "P90",
    englishName: "P90",
    telemetryIds: ["WeapP90_C"],
    itemAssetId: "Item_Weapon_P90_C",
    category: "smg",
    assetSubdir: "Main",
    summary: "大弹匣冲锋枪。",
  }),
  weapon({
    id: "uzi",
    name: "Uzi",
    englishName: "Micro Uzi",
    telemetryIds: ["WeapUZI_C"],
    itemAssetId: "Item_Weapon_UZI_C",
    category: "smg",
    assetSubdir: "Main",
    summary: "近距离冲锋枪。",
  }),
  weapon({
    id: "mini14",
    name: "Mini14",
    englishName: "Mini 14",
    telemetryIds: ["WeapMini14_C"],
    itemAssetId: "Item_Weapon_Mini14_C",
    category: "dmr",
    assetSubdir: "Main",
    summary: "低后坐精确射手步枪。",
  }),
  weapon({
    id: "slr",
    name: "SLR",
    englishName: "SLR",
    telemetryIds: ["WeapFNFal_C"],
    itemAssetId: "Item_Weapon_FNFal_C",
    category: "dmr",
    assetSubdir: "Main",
    summary: "高伤害精确射手步枪。",
  }),
  weapon({
    id: "sks",
    name: "SKS",
    englishName: "SKS",
    telemetryIds: ["WeapSKS_C"],
    itemAssetId: "Item_Weapon_SKS_C",
    category: "dmr",
    assetSubdir: "Main",
    summary: "可装配较多配件的精确射手步枪。",
  }),
  weapon({
    id: "vss",
    name: "VSS",
    englishName: "VSS",
    telemetryIds: ["WeapVSS_C"],
    itemAssetId: "Item_Weapon_VSS_C",
    category: "dmr",
    assetSubdir: "Main",
    summary: "自带消音与倍镜的精确射手步枪。",
  }),
  weapon({
    id: "mk14",
    name: "Mk14",
    englishName: "Mk14 EBR",
    telemetryIds: ["WeapMk14_C"],
    itemAssetId: "Item_Weapon_Mk14_C",
    category: "dmr",
    assetSubdir: "Main",
    summary: "空投补给中的精确射手步枪。",
  }),
  weapon({
    id: "qbu",
    name: "QBU",
    englishName: "QBU88",
    telemetryIds: ["WeapQBU88_C", "WeapMadsQBU88_C"],
    itemAssetId: "Item_Weapon_QBU88_C",
    category: "dmr",
    assetSubdir: "Main",
    summary: "部分地图刷新的精确射手步枪。",
  }),
  weapon({
    id: "awm",
    name: "AWM",
    englishName: "AWM",
    telemetryIds: ["WeapAWM_C"],
    itemAssetId: "Item_Weapon_AWM_C",
    category: "sniper",
    assetSubdir: "Main",
    summary: "空投补给中的栓动狙击步枪。",
  }),
  weapon({
    id: "m24",
    name: "M24",
    englishName: "M24",
    telemetryIds: ["WeapM24_C"],
    itemAssetId: "Item_Weapon_M24_C",
    category: "sniper",
    assetSubdir: "Main",
    summary: "常见栓动狙击步枪。",
  }),
  weapon({
    id: "kar98k",
    name: "Kar98k",
    englishName: "Kar98k",
    telemetryIds: ["WeapKar98k_C", "WeapJuliesKar98k_C"],
    itemAssetId: "Item_Weapon_Kar98k_C",
    category: "sniper",
    assetSubdir: "Main",
    summary: "经典栓动狙击步枪。",
  }),
  weapon({
    id: "mosin",
    name: "莫辛纳甘",
    englishName: "Mosin-Nagant",
    telemetryIds: ["WeapMosinNagant_C"],
    itemAssetId: "Item_Weapon_Mosin_C",
    category: "sniper",
    assetSubdir: "Main",
    summary: "栓动狙击步枪。",
  }),
  weapon({
    id: "m249",
    name: "M249",
    englishName: "M249",
    telemetryIds: ["WeapM249_C"],
    itemAssetId: "Item_Weapon_M249_C",
    category: "lmg",
    assetSubdir: "Main",
    summary: "大弹匣轻机枪，常见于空投。",
  }),
  weapon({
    id: "dp28",
    name: "DP-28",
    englishName: "DP-28",
    telemetryIds: ["WeapDP28_C"],
    itemAssetId: "Item_Weapon_DP28_C",
    category: "lmg",
    assetSubdir: "Main",
    summary: "弹盘供弹的轻机枪。",
  }),
  weapon({
    id: "s12k",
    name: "S12K",
    englishName: "S12K",
    telemetryIds: ["WeapSaiga12_C"],
    itemAssetId: "Item_Weapon_Saiga12_C",
    category: "shotgun",
    assetSubdir: "Main",
    summary: "半自动霰弹枪。",
  }),
  weapon({
    id: "s1897",
    name: "S1897",
    englishName: "S1897",
    telemetryIds: ["WeapWinchester_C"],
    itemAssetId: "Item_Weapon_Winchester_C",
    category: "shotgun",
    assetSubdir: "Main",
    summary: "泵动霰弹枪。",
  }),
  weapon({
    id: "s686",
    name: "S686",
    englishName: "S686",
    telemetryIds: ["WeapBerreta686_C"],
    itemAssetId: "Item_Weapon_Berreta686_C",
    category: "shotgun",
    assetSubdir: "Main",
    summary: "双管霰弹枪。",
  }),
  weapon({
    id: "p1911",
    name: "P1911",
    englishName: "P1911",
    telemetryIds: ["WeapM1911_C"],
    itemAssetId: "Item_Weapon_M1911_C",
    category: "handgun",
    assetSubdir: "Handgun",
    summary: "使用 .45 ACP 的半自动手枪。",
  }),
  weapon({
    id: "p92",
    name: "P92",
    englishName: "P92",
    telemetryIds: ["WeapM9_C"],
    itemAssetId: "Item_Weapon_M9_C",
    category: "handgun",
    assetSubdir: "Handgun",
    summary: "使用 9mm 的半自动手枪。",
  }),
  weapon({
    id: "r1895",
    name: "R1895",
    englishName: "R1895",
    telemetryIds: ["WeapNagantM1895_C"],
    itemAssetId: "Item_Weapon_NagantM1895_C",
    category: "handgun",
    assetSubdir: "Handgun",
    summary: "使用 7.62mm 的转轮手枪。",
  }),
  weapon({
    id: "pan",
    name: "平底锅",
    englishName: "Pan",
    telemetryIds: ["WeapPan_C", "WeapPanProjectile_C"],
    itemAssetId: "Item_Weapon_Pan_C",
    category: "melee",
    assetSubdir: "Melee",
    summary: "近战武器，亦可格挡部分投射物。",
  }),
];

const BY_ID = new Map(PUBG_WEAPONS.map((w) => [w.id, w]));

const TELEMETRY_LABELS: Record<string, string> = Object.fromEntries(
  PUBG_WEAPONS.flatMap((w) => w.telemetryIds.map((tid) => [tid, w.name])),
);

export function listWeapons(): readonly PubgWeaponInfo[] {
  return PUBG_WEAPONS;
}

export function getWeaponById(id: string): PubgWeaponInfo | null {
  return BY_ID.get(id.toLowerCase()) ?? null;
}

export function listWeaponCategories(): readonly WeaponCategory[] {
  return CATEGORY_ORDER.filter((cat) =>
    PUBG_WEAPONS.some((w) => w.category === cat),
  );
}

export function weaponCategoryLabel(category: WeaponCategory): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function isWeaponCategory(value: string): value is WeaponCategory {
  return value in CATEGORY_LABELS;
}

export function listWeaponsByCategory(
  category: WeaponCategory | null,
): readonly PubgWeaponInfo[] {
  if (!category) return PUBG_WEAPONS;
  return PUBG_WEAPONS.filter((w) => w.category === category);
}

export function weaponLabelFromTelemetryId(telemetryId: string): string {
  if (!telemetryId) return "未知";
  return TELEMETRY_LABELS[telemetryId] ?? telemetryId.replace(/_C$/, "");
}

export function weaponAssetGithubUrl(weapon: PubgWeaponInfo): string {
  return `https://github.com/pubg/api-assets/blob/master/Assets/Item/Weapon/${weapon.assetSubdir}/${weapon.assetFile}`;
}

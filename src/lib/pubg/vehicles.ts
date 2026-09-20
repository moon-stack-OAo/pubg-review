/**
 * 载具字典：id → 中文名 + 船/车/空分类。
 * 英文名对齐 pubg/api-assets dictionaries/telemetry/vehicle/vehicleId.json；
 * 未收录 id 走启发式短名。
 */

export type VehicleKind = "land" | "water" | "air" | "other";

export type PubgVehicleInfo = {
  id: string;
  name: string;
  kind: VehicleKind;
};

/** 常见 vehicleId → 中文展示名（不含皮肤变体时可回退前缀匹配） */
const VEHICLE_LABELS: Record<string, string> = {
  AirBoat_V2_C: "汽艇",
  AquaRail_A_01_C: "水上摩托",
  AquaRail_A_02_C: "水上摩托",
  AquaRail_A_03_C: "水上摩托",
  AquaRail_C: "水上摩托",
  BP_ATV_C: "全地形车",
  BP_BRDM_C: "BRDM-2",
  BP_Bicycle_C: "山地车",
  BP_Blanc_C: "轿跑 SUV",
  BP_CoupeRB_C: "Coupe RB",
  BP_Dirtbike_C: "越野摩托",
  BP_Food_Truck_C: "餐车",
  BP_KillTruck_C: "杀戮卡车",
  BP_LootTruck_C: "物资卡车",
  BP_M_Rony_A_01_C: "罗尼皮卡",
  BP_M_Rony_A_02_C: "罗尼皮卡",
  BP_M_Rony_A_03_C: "罗尼皮卡",
  BP_Mirado_A_02_C: "米拉多",
  BP_Mirado_A_03_C: "米拉多",
  BP_Mirado_A_03_Esports_C: "米拉多",
  BP_Mirado_Open_03_C: "米拉多（敞篷）",
  BP_Mirado_Open_04_C: "米拉多（敞篷）",
  BP_Mirado_Open_05_C: "米拉多（敞篷）",
  BP_Motorbike_04_C: "摩托车",
  BP_Motorbike_04_Desert_C: "摩托车",
  BP_Motorbike_04_SideCar_C: "边三轮",
  BP_Motorbike_04_SideCar_Desert_C: "边三轮",
  BP_Motorbike_Solitario_C: "摩托车",
  BP_Motorglider_C: "动力滑翔机",
  BP_Motorglider_Green_C: "动力滑翔机",
  BP_Niva_01_C: "日瓦",
  BP_Niva_02_C: "日瓦",
  BP_Niva_03_C: "日瓦",
  BP_Niva_04_C: "日瓦",
  BP_Niva_05_C: "日瓦",
  BP_Niva_06_C: "日瓦",
  BP_Niva_07_C: "日瓦",
  BP_Niva_Esports_C: "日瓦",
  BP_PickupTruck_A_01_C: "皮卡（封闭）",
  BP_PickupTruck_A_02_C: "皮卡（封闭）",
  BP_PickupTruck_A_03_C: "皮卡（封闭）",
  BP_PickupTruck_A_04_C: "皮卡（封闭）",
  BP_PickupTruck_A_05_C: "皮卡（封闭）",
  BP_PickupTruck_A_esports_C: "皮卡（封闭）",
  BP_PickupTruck_B_01_C: "皮卡（敞篷）",
  BP_PickupTruck_B_02_C: "皮卡（敞篷）",
  BP_PickupTruck_B_03_C: "皮卡（敞篷）",
  BP_PickupTruck_B_04_C: "皮卡（敞篷）",
  BP_PickupTruck_B_05_C: "皮卡（敞篷）",
  BP_Pillar_Car_C: "安保车",
  BP_PonyCoupe_C: "小马轿跑",
  BP_Porter_C: "波特",
  BP_Scooter_01_A_C: "踏板车",
  BP_Scooter_02_A_C: "踏板车",
  BP_Scooter_03_A_C: "踏板车",
  BP_Scooter_04_A_C: "踏板车",
  BP_Snowbike_01_C: "雪地摩托",
  BP_Snowbike_02_C: "雪地摩托",
  BP_Snowmobile_01_C: "雪地车",
  BP_Snowmobile_02_C: "雪地车",
  BP_Snowmobile_03_C: "雪地车",
  BP_TukTukTuk_A_01_C: "嘟嘟车",
  BP_TukTukTuk_A_02_C: "嘟嘟车",
  BP_TukTukTuk_A_03_C: "嘟嘟车",
  BP_Van_A_01_C: "面包车",
  BP_Van_A_02_C: "面包车",
  BP_Van_A_03_C: "面包车",
  Boat_PG117_C: "PG-117",
  Buggy_A_01_C: "沙地车",
  Buggy_A_02_C: "沙地车",
  Buggy_A_03_C: "沙地车",
  Buggy_A_04_C: "沙地车",
  Buggy_A_05_C: "沙地车",
  Buggy_A_06_C: "沙地车",
  Dacia_A_01_v2_C: "达契亚",
  Dacia_A_01_v2_snow_C: "达契亚",
  Dacia_A_02_v2_C: "达契亚",
  Dacia_A_03_v2_C: "达契亚",
  Dacia_A_03_v2_Esports_C: "达契亚",
  Dacia_A_04_v2_C: "达契亚",
  PG117_A_01_C: "PG-117",
  Uaz_A_01_C: "UAZ（敞篷）",
  Uaz_Armored_C: "UAZ（装甲）",
  Uaz_B_01_C: "UAZ（软顶）",
  Uaz_B_01_esports_C: "UAZ（软顶）",
  Uaz_C_01_C: "UAZ（硬顶）",
  BP_EmergencyPickupVehicle_C: "紧急呼救机",
  RedeployAircraft_DihorOtok_C: "直升机",
  RedeployAircraft_Tiger_C: "直升机",
  TransportAircraft_Chimera_C: "运输机",
  TransportAircraft_Tiger_C: "运输机",
};

/** 非玩家驾驶载具 / 噪音，解析与回放跳过 */
const SKIP_PATTERNS = [
  "parachute",
  "dummytransport",
  "warmode",
  "mortarpawn",
  "emergencyaircraft",
  "circle_train",
  "line_train",
];

export function shouldSkipVehicleId(vehicleId: string): boolean {
  const lower = vehicleId.toLowerCase();
  return SKIP_PATTERNS.some((p) => lower.includes(p));
}

function shortId(vehicleId: string): string {
  return vehicleId.replace(/_C$/i, "").replace(/^BP_/i, "").slice(0, 24);
}

function inferKind(vehicleId: string): VehicleKind {
  const id = vehicleId.toLowerCase();
  if (
    id.includes("airboat") ||
    id.includes("aquarail") ||
    id.includes("boat") ||
    id.includes("pg117") ||
    id.includes("brdm")
  ) {
    return "water";
  }
  if (
    id.includes("glider") ||
    id.includes("aircraft") ||
    id.includes("helicopter") ||
    id.includes("emergencypickup") ||
    id.includes("parachute")
  ) {
    return "air";
  }
  if (
    id.includes("mortar") ||
    id.includes("train") ||
    id.includes("dummy")
  ) {
    return "other";
  }
  return "land";
}

export function resolveVehicle(vehicleId: string): PubgVehicleInfo {
  const id = vehicleId || "Unknown";
  const name = VEHICLE_LABELS[id] ?? shortId(id);
  return { id, name, kind: inferKind(id) };
}

export function vehicleKindLabel(kind: VehicleKind): string {
  switch (kind) {
    case "water":
      return "船";
    case "air":
      return "空中";
    case "land":
      return "车";
    default:
      return "载具";
  }
}

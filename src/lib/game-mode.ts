export type GameModeKind = "solo" | "duo" | "squad" | "other";
export type PerspectiveKind = "fpp" | "tpp" | "unknown";
export type MatchTypeKind =
  | "normal"
  | "casual"
  | "competitive"
  | "custom"
  | "special"
  | "unknown";

export type ParsedGameMode = {
  raw: string;
  mode: GameModeKind;
  perspective: PerspectiveKind;
  modeLabel: string;
  perspectiveLabel: string | null;
};

export type ParsedMatchType = {
  raw: string;
  kind: MatchTypeKind;
  label: string | null;
};

const MODE_LABEL: Record<Exclude<GameModeKind, "other">, string> = {
  solo: "单排",
  duo: "双排",
  squad: "四排",
};

/**
 * 解析 PUBG gameMode 字符串为模式 + 视角。
 * 兼容：solo / solo-fpp / duo / duo-fpp / squad / squad-fpp（大小写不敏感）。
 * 含 fpp → FPP；标准模式无后缀时按 TPP 展示。
 */
export function parseGameMode(gameMode: string): ParsedGameMode {
  const raw = (gameMode ?? "").trim();
  const lower = raw.toLowerCase();

  let mode: GameModeKind = "other";
  if (lower === "solo" || lower.startsWith("solo-") || lower.startsWith("solo_")) {
    mode = "solo";
  } else if (
    lower === "duo" ||
    lower.startsWith("duo-") ||
    lower.startsWith("duo_")
  ) {
    mode = "duo";
  } else if (
    lower === "squad" ||
    lower.startsWith("squad-") ||
    lower.startsWith("squad_")
  ) {
    mode = "squad";
  } else if (/\bsolo\b/.test(lower)) {
    mode = "solo";
  } else if (/\bduo\b/.test(lower)) {
    mode = "duo";
  } else if (/\bsquad\b/.test(lower)) {
    mode = "squad";
  }

  let perspective: PerspectiveKind = "unknown";
  if (lower.includes("fpp")) {
    perspective = "fpp";
  } else if (lower.includes("tpp")) {
    perspective = "tpp";
  } else if (mode !== "other") {
    perspective = "tpp";
  }

  const modeLabel =
    mode === "other" ? raw || "-" : MODE_LABEL[mode];
  const perspectiveLabel =
    perspective === "unknown" ? null : perspective.toUpperCase();

  return { raw, mode, perspective, modeLabel, perspectiveLabel };
}

export function gameModeLabel(gameMode: string): string {
  const parsed = parseGameMode(gameMode);
  return [parsed.modeLabel, parsed.perspectiveLabel].filter(Boolean).join(" ");
}

export function parseMatchType(
  matchType?: string | null,
  isCustomMatch = false,
): ParsedMatchType {
  const raw = (matchType ?? "").trim();
  const lower = raw.toLowerCase();

  if (isCustomMatch || lower === "custom") {
    return { raw, kind: "custom", label: "自定义模式" };
  }
  if (lower === "official") {
    return { raw, kind: "normal", label: "普通模式" };
  }
  if (lower === "airoyale") {
    return { raw, kind: "casual", label: "休闲模式" };
  }
  if (lower === "competitive") {
    return { raw, kind: "competitive", label: "竞技模式" };
  }
  if (lower === "seasonal") {
    return { raw, kind: "special", label: "赛季模式" };
  }
  if (lower === "tutorial") {
    return { raw, kind: "special", label: "教学模式" };
  }
  if (lower === "training") {
    return { raw, kind: "special", label: "训练模式" };
  }
  return { raw, kind: "unknown", label: raw || null };
}

export function matchTypeLabel(
  matchType?: string | null,
  isCustomMatch = false,
): string | null {
  return parseMatchType(matchType, isCustomMatch).label;
}

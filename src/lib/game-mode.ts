export type GameModeKind = "solo" | "duo" | "squad" | "other";
export type PerspectiveKind = "fpp" | "tpp" | "unknown";

export type ParsedGameMode = {
  raw: string;
  mode: GameModeKind;
  perspective: PerspectiveKind;
  modeLabel: string;
  perspectiveLabel: string | null;
};

const MODE_LABEL: Record<Exclude<GameModeKind, "other">, string> = {
  solo: "Solo",
  duo: "Duo",
  squad: "Squad",
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

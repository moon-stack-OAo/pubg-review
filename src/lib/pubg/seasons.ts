import type {PubgSeasonMeta} from "./types";

function seasonToken(id: string): string {
  return id.split(".").at(-1) || id;
}

function numberedSeason(id: string): { family: "pc" | "console"; number: number } | null {
  const token = seasonToken(id);
  const pc = /^pc-2018-(\d+)$/.exec(token);
  const consoleSeason = /^console-(\d+)$/.exec(token);
  if (pc) return { family: "pc", number: Number(pc[1]) };
  if (consoleSeason) return { family: "console", number: Number(consoleSeason[1]) };
  return null;
}

export function seasonMatchesPlatform(id: string, platform: string): boolean {
  const token = seasonToken(id);
  if (/^pc-/.test(token)) return platform === "steam" || platform === "kakao";
  if (/^console-/.test(token)) return platform === "xbox" || platform === "psn";
  if (/^xbox-/.test(token)) return platform === "xbox";
  if (/^playstation-/.test(token)) return platform === "psn";
  return true;
}

export function isTestSeason(id: string): boolean {
  return numberedSeason(id)?.number === 0 ||
    /(?:^|-)(?:pre\d*|alpha\d*|beta\d*|test\d*)(?:-|$)/i.test(seasonToken(id));
}

export function getSeasonLabel(id: string): string {
  const season = numberedSeason(id);
  if (isTestSeason(id)) return `测试赛季（${seasonToken(id)}）`;
  const legacyConsole = /^(xbox|playstation)-(\d+)$/.exec(seasonToken(id));
  if (legacyConsole) {
    const platform = legacyConsole[1] === "xbox" ? "Xbox" : "PlayStation";
    return `${platform} 早期赛季 ${Number(legacyConsole[2])}`;
  }
  const legacyMonth = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(seasonToken(id));
  if (legacyMonth) return `${legacyMonth[1]}年${Number(legacyMonth[2])}月（早期赛季）`;
  return season ? `第${season.number}赛季` : seasonToken(id);
}

export function getRecentSeasons(seasons: PubgSeasonMeta[]): PubgSeasonMeta[] {
  return seasons.filter((season) => season.isCurrent || (
    numberedSeason(season.id) !== null && !isTestSeason(season.id)
  )).slice(0, 6);
}

export function normalizeSeasons(
  seasons: PubgSeasonMeta[],
  platform: string,
): PubgSeasonMeta[] {
  return seasons
    .filter((season) => seasonMatchesPlatform(season.id, platform))
    .map((season) => ({
      ...season,
      label: getSeasonLabel(season.id) !== seasonToken(season.id)
        ? getSeasonLabel(season.id)
        : season.label || getSeasonLabel(season.id),
    }))
    .sort((first, second) => {
      const current = Number(second.isCurrent) - Number(first.isCurrent);
      if (current) return current;
      const testing = Number(isTestSeason(first.id)) - Number(isTestSeason(second.id));
      if (testing) return testing;
      const firstNumber = numberedSeason(first.id)?.number;
      const secondNumber = numberedSeason(second.id)?.number;
      if (firstNumber != null && secondNumber != null) return secondNumber - firstNumber;
      if (firstNumber != null) return -1;
      if (secondNumber != null) return 1;
      return 0;
    });
}

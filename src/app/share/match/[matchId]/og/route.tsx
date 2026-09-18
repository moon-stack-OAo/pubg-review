import {ImageResponse} from "next/og";
import {buildMatchReport} from "@/lib/analysis/report-service";
import {gameModeLabel, matchTypeLabel} from "@/lib/game-mode";
import {mapLabel} from "@/lib/pubg/maps";
import {getCachedMatch} from "@/lib/pubg/service";
import {isPubgPlatform} from "@/lib/pubg/types";

export const runtime = "nodejs";

type RouteProps = {
  params: Promise<{ matchId: string }>;
};

async function loadChineseFont(): Promise<ArrayBuffer | null> {
  const urls = [
    "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/chinese-simplified-400-normal.ttf",
    "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5.2.5/files/noto-sans-sc-chinese-simplified-400-normal.woff",
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { next: { revalidate: 86400 } });
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 1000) return buf;
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function GET(request: Request, { params }: RouteProps) {
  const { matchId } = await params;
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform") || "steam";
  const accountId = searchParams.get("accountId") || "";

  if (!isPubgPlatform(platform)) {
    return new Response("invalid platform", { status: 400 });
  }

  let mapText = "PUBG";
  let rankText = "-";
  let killsText = "-";
  let primaryText = "";
  let primaryCode = "";
  let nameText = "";
  let modeText = "";

  try {
    const { value: match } = await getCachedMatch(platform, matchId);
    mapText = mapLabel(match.mapName);
    const typeLabel = matchTypeLabel(match.matchType, match.isCustomMatch);
    modeText = `${gameModeLabel(match.gameMode)}${typeLabel ? ` · ${typeLabel}` : ""}`;

    if (accountId) {
      const focus = match.rosters
        .flatMap((r) => r.participants)
        .find((p) => p.accountId === accountId);
      if (focus) {
        nameText = focus.name;
        rankText =
          focus.winPlace == null ? "-" : `#${focus.winPlace}`;
        killsText = String(focus.kills);
        try {
          const { report } = await buildMatchReport(
            platform,
            matchId,
            accountId,
          );
          primaryText = report.primaryTag.label;
          primaryCode = report.primaryTag.code;
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    return new Response("match not found", { status: 404 });
  }

  const fontData = await loadChineseFont();
  const hasCjk = Boolean(fontData);
  const causeDisplay = hasCjk
    ? primaryText || primaryCode
    : primaryCode || primaryText || "";
  const rankLabel = hasCjk ? "排名" : "Rank";
  const killsLabel = hasCjk ? "击杀" : "Kills";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "linear-gradient(145deg, #09090b 0%, #18181b 55%, #1c1917 100%)",
          color: "#fafafa",
          padding: "56px 64px",
          fontFamily: hasCjk
            ? "Noto Sans SC"
            : "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: "#a1a1aa",
              letterSpacing: 4,
            }}
          >
            PUBG REVIEW
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: 700,
              color: "#fbbf24",
            }}
          >
            {mapText}
          </div>
          <div style={{ display: "flex", fontSize: 28, color: "#d4d4d8" }}>
            {modeText}
            {nameText ? ` · ${nameText}` : ""}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 48,
            alignItems: "flex-end",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", fontSize: 22, color: "#71717a" }}>
              {rankLabel}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 72,
                fontWeight: 700,
                color: "#fafafa",
              }}
            >
              {rankText}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", fontSize: 22, color: "#71717a" }}>
              {killsLabel}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 72,
                fontWeight: 700,
                color: "#fafafa",
              }}
            >
              {killsText}
            </div>
          </div>
          {causeDisplay ? (
            <div
              style={{
                display: "flex",
                marginLeft: "auto",
                padding: "14px 28px",
                borderRadius: 999,
                border: "1px solid rgba(244,63,94,0.45)",
                background: "rgba(244,63,94,0.16)",
                color: "#fecdd3",
                fontSize: 32,
              }}
            >
              {causeDisplay}
            </div>
          ) : null}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: fontData
        ? [
            {
              name: "Noto Sans SC",
              data: fontData,
              style: "normal" as const,
              weight: 400,
            },
          ]
        : undefined,
    },
  );
}

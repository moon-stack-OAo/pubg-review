import {promises as fs} from "fs";
import path from "path";
import {safeSegment} from "@/lib/persist/fs-json";
import type {ParsedTelemetry, TelemetryAssetMeta} from "@/lib/telemetry/types";

const ROOT = path.resolve(path.join(process.cwd(), ".data", "telemetry"));

function matchDir(matchId: string): string {
  const segment = safeSegment(matchId);
  if (!segment || segment === "." || segment === "..") {
    throw new Error("非法 matchId");
  }
  const dir = path.resolve(ROOT, segment);
  const rootPrefix = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (dir !== ROOT && !dir.startsWith(rootPrefix)) {
    throw new Error("非法 matchId：路径越界");
  }
  return dir;
}

export function metaPath(matchId: string): string {
  return path.join(matchDir(matchId), "meta.json");
}

export function rawPath(matchId: string): string {
  return path.join(matchDir(matchId), "raw.json");
}

export function eventsPath(matchId: string): string {
  return path.join(matchDir(matchId), "events.json");
}

async function ensureDir(matchId: string): Promise<void> {
  await fs.mkdir(matchDir(matchId), { recursive: true });
}

export async function readMeta(
  matchId: string,
): Promise<TelemetryAssetMeta | null> {
  try {
    const text = await fs.readFile(metaPath(matchId), "utf8");
    return JSON.parse(text) as TelemetryAssetMeta;
  } catch {
    return null;
  }
}

export async function writeMeta(meta: TelemetryAssetMeta): Promise<void> {
  await ensureDir(meta.matchId);
  await fs.writeFile(metaPath(meta.matchId), JSON.stringify(meta, null, 2), "utf8");
}

export async function writeRawJson(
  matchId: string,
  data: unknown,
): Promise<string> {
  await ensureDir(matchId);
  const file = rawPath(matchId);
  const text = typeof data === "string" ? data : JSON.stringify(data);
  await fs.writeFile(file, text, "utf8");
  return file;
}

export async function writeParsedEvents(
  matchId: string,
  parsed: ParsedTelemetry,
): Promise<string> {
  await ensureDir(matchId);
  const file = eventsPath(matchId);
  await fs.writeFile(file, JSON.stringify(parsed), "utf8");
  return file;
}

export async function readParsedEvents(
  matchId: string,
): Promise<ParsedTelemetry | null> {
  try {
    const text = await fs.readFile(eventsPath(matchId), "utf8");
    return JSON.parse(text) as ParsedTelemetry;
  } catch {
    return null;
  }
}

export async function rawExists(matchId: string): Promise<boolean> {
  try {
    await fs.access(rawPath(matchId));
    return true;
  } catch {
    return false;
  }
}

export async function readRawJson(matchId: string): Promise<unknown | null> {
  try {
    const text = await fs.readFile(rawPath(matchId), "utf8");
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

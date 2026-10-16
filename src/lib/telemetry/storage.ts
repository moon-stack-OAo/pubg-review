import {promises as fs} from "fs";
import path from "path";
import {randomUUID} from "node:crypto";
import {safeSegment} from "@/lib/persist/fs-json";
import type {ParsedTelemetry, TelemetryAssetMeta} from "@/lib/telemetry/types";
import {runTelemetryTask} from "@/lib/telemetry/task-queue";

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
  const file = rawPath(matchId);
  const text = typeof data === "string" ? data : JSON.stringify(data);
  await writeRawFile(matchId, (temporary) => fs.writeFile(temporary, text, "utf8"));
  return file;
}

/** 下载与校验均完成后才替换 raw，异常时保留原文件并移除临时文件。 */
export async function writeRawFile<T>(
  matchId: string,
  write: (temporary: string) => Promise<T>,
): Promise<T> {
  await ensureDir(matchId);
  const file = rawPath(matchId);
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const result = await write(temporary);
    await fs.rename(temporary, file);
    return result;
  } finally {
    await fs.rm(temporary, {force: true});
  }
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
  return runTelemetryTask(`events:${matchId}`, () => readParsedEventsInTask(matchId));
}

/** 仅供已取得遥测队列执行权的服务内部使用，避免嵌套排队。 */
export async function readParsedEventsInTask(
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
  return runTelemetryTask(`raw:${matchId}`, async () => {
    try {
      const text = await fs.readFile(rawPath(matchId), "utf8");
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  });
}

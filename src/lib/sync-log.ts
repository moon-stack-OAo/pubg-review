import {promises as fs} from "fs";
import path from "path";

export type ApiSyncLogEntry = {
  ts: string;
  path: string;
  status: number;
  durationMs: number;
  platform?: string;
  cacheHit?: boolean;
  error?: string;
};

const LOG_DIR = path.join(process.cwd(), ".data", "logs");
const LOG_FILE = path.join(LOG_DIR, "api-sync.jsonl");

async function ensureDir(): Promise<void> {
  await fs.mkdir(LOG_DIR, { recursive: true });
}

/** 追加一行 JSONL；失败静默（不影响主流程） */
export async function appendApiSyncLog(
  entry: Omit<ApiSyncLogEntry, "ts"> & { ts?: string },
): Promise<void> {
  try {
    await ensureDir();
    const row: ApiSyncLogEntry = {
      ts: entry.ts ?? new Date().toISOString(),
      path: entry.path,
      status: entry.status,
      durationMs: entry.durationMs,
      ...(entry.platform ? { platform: entry.platform } : {}),
      ...(entry.cacheHit != null ? { cacheHit: entry.cacheHit } : {}),
      ...(entry.error ? { error: entry.error.slice(0, 200) } : {}),
    };
    await fs.appendFile(LOG_FILE, `${JSON.stringify(row)}\n`, "utf8");
  } catch {
    // 日志失败忽略
  }
}

/**
 * 读取最近 limit 条（从文件尾部扫描）；不含任何密钥。
 */
export async function readApiSyncLogs(limit = 50): Promise<ApiSyncLogEntry[]> {
  const n = Math.min(Math.max(limit, 1), 500);
  try {
    const text = await fs.readFile(LOG_FILE, "utf8");
    const lines = text.split("\n").filter((l) => l.trim());
    const sliced = lines.slice(-n);
    const out: ApiSyncLogEntry[] = [];
    for (const line of sliced) {
      try {
        const parsed = JSON.parse(line) as ApiSyncLogEntry;
        if (parsed && typeof parsed.path === "string") out.push(parsed);
      } catch {
        // skip bad line
      }
    }
    return out.reverse();
  } catch {
    return [];
  }
}

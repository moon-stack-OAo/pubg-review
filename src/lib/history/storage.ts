import {promises as fs} from "fs";
import path from "path";
import type {PubgPlatform} from "@/lib/pubg/types";
import type {HistoryMatchRecord, NameHistoryFile, PlayerHistoryFile,} from "@/lib/history/types";

const ROOT = path.join(process.cwd(), ".data", "history");
const NAMES_ROOT = path.join(process.cwd(), ".data", "name-history");

/** 按 accountId 串行化写，避免 read-modify-write 丢更新 */
const historyWriteChains = new Map<string, Promise<unknown>>();
const nameWriteChains = new Map<string, Promise<unknown>>();

function withAccountWriteLock<T>(
  chains: Map<string, Promise<unknown>>,
  accountId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = chains.get(accountId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  chains.set(
    accountId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

function safeId(accountId: string): string {
  return accountId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function historyPath(accountId: string): string {
  return path.join(ROOT, `${safeId(accountId)}.json`);
}

function nameHistoryPath(accountId: string): string {
  return path.join(NAMES_ROOT, `${safeId(accountId)}.json`);
}

async function ensureParent(file: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
}

export async function readPlayerHistory(
  accountId: string,
): Promise<PlayerHistoryFile | null> {
  try {
    const text = await fs.readFile(historyPath(accountId), "utf8");
    const parsed = JSON.parse(text) as PlayerHistoryFile;
    if (!parsed || !Array.isArray(parsed.matches)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writePlayerHistory(
  file: PlayerHistoryFile,
): Promise<void> {
  const p = historyPath(file.accountId);
  await ensureParent(p);
  await fs.writeFile(p, JSON.stringify(file, null, 2), "utf8");
}

/**
 * 按 matchId upsert；按 playedAt 降序；可选截断上限。
 * 同一 accountId 进程内串行，避免并发丢更新。
 */
export async function upsertHistoryMatches(
  accountId: string,
  platform: PubgPlatform,
  records: HistoryMatchRecord[],
  options?: { maxMatches?: number },
): Promise<PlayerHistoryFile> {
  return withAccountWriteLock(historyWriteChains, accountId, async () => {
    const maxMatches = options?.maxMatches ?? 200;
    const existing = await readPlayerHistory(accountId);
    const map = new Map<string, HistoryMatchRecord>();
    for (const m of existing?.matches ?? []) {
      map.set(m.matchId, m);
    }
    for (const r of records) {
      const prev = map.get(r.matchId);
      map.set(
        r.matchId,
        prev ? { ...prev, ...r, savedAt: r.savedAt || prev.savedAt } : r,
      );
    }
    const matches = Array.from(map.values()).sort(
      (a, b) => +new Date(b.playedAt) - +new Date(a.playedAt),
    );
    const file: PlayerHistoryFile = {
      accountId,
      platform,
      updatedAt: new Date().toISOString(),
      matches: matches.slice(0, maxMatches),
    };
    await writePlayerHistory(file);
    return file;
  });
}

export async function readNameHistory(
  accountId: string,
): Promise<NameHistoryFile | null> {
  try {
    const text = await fs.readFile(nameHistoryPath(accountId), "utf8");
    const parsed = JSON.parse(text) as NameHistoryFile;
    if (!parsed || !Array.isArray(parsed.names)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 记录曾见过的昵称；返回是否发生改名（相对上次最新名） */
export async function recordPlayerName(
  accountId: string,
  platform: PubgPlatform,
  name: string,
): Promise<{ renamed: boolean; previousName: string | null; file: NameHistoryFile }> {
  return withAccountWriteLock(nameWriteChains, accountId, async () => {
    const trimmed = name.trim();
    const existing = await readNameHistory(accountId);
    const names = [...(existing?.names ?? [])];
    const latest = names[0]?.name ?? null;
    const renamed = Boolean(latest && latest !== trimmed);
    const already = names.some((n) => n.name === trimmed);
    if (!already) {
      names.unshift({ name: trimmed, seenAt: new Date().toISOString() });
    } else if (latest !== trimmed) {
      // 旧名再现：移到最前
      const rest = names.filter((n) => n.name !== trimmed);
      names.length = 0;
      names.push(
        { name: trimmed, seenAt: new Date().toISOString() },
        ...rest,
      );
    }
    const file: NameHistoryFile = {
      accountId,
      platform,
      updatedAt: new Date().toISOString(),
      names: names.slice(0, 20),
    };
    const p = nameHistoryPath(accountId);
    await ensureParent(p);
    await fs.writeFile(p, JSON.stringify(file, null, 2), "utf8");
    return {
      renamed,
      previousName: renamed ? latest : null,
      file,
    };
  });
}

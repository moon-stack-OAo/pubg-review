import {promises as fs} from "fs";
import path from "path";

const DATA_ROOT = path.join(process.cwd(), ".data");

export function dataPath(...segments: string[]): string {
  return path.join(DATA_ROOT, ...segments);
}

/** 文件名安全：仅保留常见安全字符 */
export function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function ensureParent(file: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
}

export async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    const text = await fs.readFile(file, "utf8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFile(
  file: string,
  data: unknown,
  pretty = true,
): Promise<void> {
  await ensureParent(file);
  const body = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  await fs.writeFile(file, body, "utf8");
}

export async function deleteJsonFile(file: string): Promise<boolean> {
  try {
    await fs.unlink(file);
    return true;
  } catch {
    return false;
  }
}

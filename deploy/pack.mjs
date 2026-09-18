/**
 * 将 Next.js standalone 产物整理为可拷贝的运行目录（并可选打 tar.gz）。
 *
 * 用法（项目根）：
 *   node deploy/pack.mjs
 *   node deploy/pack.mjs --archive
 *
 * 前置：npm run build（需 next.config output: "standalone"）
 */
import { existsSync } from "node:fs";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneSrc = path.join(root, ".next", "standalone");
const staticSrc = path.join(root, ".next", "static");
const publicSrc = path.join(root, "public");
const outDir = path.join(root, "dist", "pubg-review");
const archivePath = path.join(root, "dist", "pubg-review-standalone.tar.gz");
const wantArchive = process.argv.includes("--archive");

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!existsSync(path.join(standaloneSrc, "server.js"))) {
  fail("未找到 .next/standalone/server.js，请先执行 npm run build（并确认 output: \"standalone\"）");
}
if (!existsSync(staticSrc)) {
  fail("未找到 .next/static，请先执行 npm run build");
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await cp(standaloneSrc, outDir, { recursive: true });
await mkdir(path.join(outDir, ".next"), { recursive: true });
await cp(staticSrc, path.join(outDir, ".next", "static"), { recursive: true });
if (existsSync(publicSrc)) {
  await cp(publicSrc, path.join(outDir, "public"), { recursive: true });
}
await mkdir(path.join(outDir, ".data"), { recursive: true });
await writeFile(
  path.join(outDir, ".env.example"),
  [
    "PUBG_API_KEY=your_api_key_here",
    "# PUBG_API_KEYS=key1,key2,key3",
    "RATE_LIMIT_RPM=30",
    "TRUST_PROXY=true",
    "MCP_ENABLED=false",
    "# MCP_TOKEN=",
    "",
  ].join("\n"),
  "utf8",
);

console.log(`已生成运行目录: ${outDir}`);
console.log("启动示例: cd dist/pubg-review && set HOSTNAME=0.0.0.0&& set PORT=3000&& node server.js");

if (wantArchive) {
  await rm(archivePath, { force: true });
  const tar = spawnSync(
    "tar",
    ["-czf", archivePath, "-C", path.join(root, "dist"), "pubg-review"],
    { stdio: "inherit", shell: process.platform === "win32" },
  );
  if (tar.status !== 0) {
    fail("打包 tar.gz 失败（需系统可用 tar；Windows 10+ 一般自带）");
  }
  console.log(`已生成压缩包: ${archivePath}`);
}

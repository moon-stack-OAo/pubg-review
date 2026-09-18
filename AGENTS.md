# PUBG Review — Agent 约定

本仓库是 **PUBG 对局复盘与个人战绩分析台**（自托管、单实例 Next.js）。改代码前先读本文件与 `README.md`；专题缺口见 `docs/07-功能缺口.md`、`docs/06-缺口补充-AI与地图.md`。

## 技术栈

- Next.js **16.3**（App Router）· React 19 · TypeScript · Tailwind 4 · Zod 4
- 无独立数据库：持久化在项目根 **`.data/`**
- 浏览器只访问本站 BFF（`/api/v1/*`），**禁止**前端直连 PUBG 官方 API / telemetry CDN

> Next.js 16 与训练数据可能不一致：写路由、配置、部署相关代码前，先查本机 `node_modules/next/dist/docs/`（见文末强制块）。

## 硬约束（违反即视为错误实现）

1. **单实例**：进程内缓存、限流、冷却均非共享；禁止 PM2 `cluster` / 多副本水平扩展。
2. **`.data/` 语义**：match / report / history / telemetry / squad / logs 落盘；重启丢内存态，磁盘可恢复。路径基于 `process.cwd()`，部署时 cwd 必须固定。
3. **密钥仅服务端**：`PUBG_API_KEY` / `PUBG_API_KEYS` / `MCP_TOKEN` 绝不进前端、不进 Git、不写进 Release 包。
4. **官方限额**：默认约 ~10 RPM；多 Key 轮询可缓解，但调高 `RATE_LIMIT_RPM` **不会**提高官方额度。禁止定时全量扫库 Job。
5. **MCP 默认关**：`MCP_ENABLED` 未开时 `/mcp` 应为 404；开启必须 Bearer。
6. **合规文案**：`banType` 只表示官方账号封禁，**不是开挂判定**；分析文案客观、无侮辱。

## 目录速查

| 路径                                     | 用途                             |
|----------------------------------------|--------------------------------|
| `src/lib/pubg/`                        | 官方 API 客户端与聚合服务（含多 Key）        |
| `src/lib/analysis/`                    | 复盘规则引擎（无遥测 / 遥测增强）             |
| `src/lib/telemetry/`                   | 下载、解析、落盘                       |
| `src/lib/history/`、`squad/`、`persist/` | 历史库、车队、通用 JSON 落盘              |
| `src/proxy.ts`                         | BFF 网关限流                       |
| `src/lib/mcp/`                         | Remote MCP Tools               |
| `deploy/`                              | PM2、Nginx、pack、Release 更新脚本与说明 |
| `docs/`                                | PRD / API / 待办 / 缺口（本地规划为主）    |

## 环境变量（摘要）

| 变量                                           | 说明                                       |
|----------------------------------------------|------------------------------------------|
| `PUBG_API_KEY`                               | 单个 Key                                   |
| `PUBG_API_KEYS`                              | 多 Key（逗号或 JSON 数组）；与上者合并去重；轮询，遇 429 换下一个 |
| `RATE_LIMIT_RPM` / `RATE_LIMIT_MUTATION_RPM` | BFF 限流                                   |
| `TRUST_PROXY`                                | 反代后信任 `X-Forwarded-For`（默认 false）        |
| `MCP_ENABLED` / `MCP_TOKEN`                  | Remote MCP                               |

完整说明见 `.env.example`、`README.md`。

## 开发与部署

```bash
npm run dev          # 0.0.0.0:3000
npm run build        # 产出含 .next/standalone（output: "standalone"）
npm run pack         # → dist/pubg-review/
npm run pack:archive # 另打 tar.gz
```

- **本机试跑**可用 `pack`；**Linux 生产包**用 `v*` tag 触发的 GitHub Release（勿把 Windows 产物丢上 VPS）。
- 服务器更新：`deploy/update-from-release.sh.example`（保留 `.data` / `.env.production`）。
- 细节：`deploy/README.md`（源码部署 / standalone / Tag 发版）。

## Git 与版本

- 提交信息用**中文**，风格贴近 Conventional Commits（如 `feat(pubg): …`）。
- **未经明确授权**不得：`git add` / `commit` / `push` / `reset` / `rebase` / 改历史 / 删分支；用户要求再做。
- 未 PUSH、未打 TAG 前的改动视为同一版本；**不要提前改 `package.json` 版本号**；发版靠 annotated `v*` tag。
- 勿伪造「已公网 Demo / 已提额」；提额材料见 `docs/05-API提额申请材料.md`。

## 改动前自检

1. 是否额外打满官方 RPM？重 parse / 同步是否串行或有冷却？
2. 前端是否仍只打 BFF？有无泄露 CDN URL / Key？
3. 无 telemetry / 弱样本 / 无 AI Key 时是否降级而非假数据？
4. 单实例与 `.data` 是否被破坏（多进程、换 cwd、清空未备份数据）？
5. 文案是否客观、有署名需求时是否保留（地图 api-assets 等）？

## 明确暂缓（不要主动开工）

完整 OAuth/多租户、MySQL 替换 `.data`、Redis 多实例、非 api-assets 贴图、逐房间密室、移动端专项、四平台同等验收、用 AI 判定开挂。详见 `docs/07-功能缺口.md` §4。

## 回复与代码风格（对本仓库协作）

- 与用户沟通默认**简体中文**；代码标识符保持英文。
- 少写注释；若写注释优先中文。不要为「演示」牺牲生产可用性。
- 改现有文件时跟随周边风格与抽象层级。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

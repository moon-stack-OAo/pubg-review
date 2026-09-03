# PUBG API Rate Limit Increase — Application Materials

> 用途：在 developer.pubg.com → My Apps → **I NEED A HIGHER LIMIT** 时粘贴/改写。  
> 状态：材料已备；**正式提交等公网 Demo 可访问后再做**（勿伪造已提额）。  
> 默认限额仍按约 **10 RPM** 设计；`/matches` 与 telemetry 下载通常**不计** API Key RPM。

---

## 1. What awesomeness / 产品说明

### English (paste)

**PUBG Review** is a personal match review & stats analysis tool (opt-in only).

- Players search themselves by platform + IGN.
- We show season KPIs, recent matches, per-match scoreboard, and an explainable **match report** (primary weakness tag + suggestions).
- Optional **telemetry-enhanced** timeline & 2D replay (server-side download/parse only; browser never hits official telemetry CDN).
- Local history beyond the official ~14-day recent list (device/server `.data` files), weapons/maps tabs, compare (2 players), CSV export, share card.

**Not** a full-server crawler, not a fake “official API”, not a player-count estimator.

### 中文

**PUBG 复盘分析台（PUBG Review）**：个人向、**仅 opt-in** 的对局复盘与战绩分析工具。

- 按平台 + 昵称主动搜索自己；
- 赛季 KPI、近期对局、积分板、可解释的**单场复盘报告**（主因标签 + 建议）；
- 可选遥测增强：事件轴 / 2D 回放（服务端下载解析，浏览器不直拉官方超大 JSON）；
- 本地历史库、武器/地图、双人对比、CSV、分享卡。

**不做**全服爬取、**不做**山寨官方 API、**不估算**全服玩家总数。

---

## 2. How we use the API key / 如何使用 API Key

### English

- API key is **server-side only** (`PUBG_API_KEY` env). Never shipped to the browser or committed to git.
- All client traffic goes through our **BFF** (`/api/v1/*`). Upstream calls use official JSON:API endpoints (`/players`, `/players/.../seasons/...`, `/matches/...`, seasons list).
- Telemetry: URL taken from match `included` assets → downloaded **once** on the server → stored under `.data/telemetry/{matchId}/` → browser only consumes our slim `events` API.

### 中文

- Key **仅服务端**环境变量；不进前端、不进仓库。
- 浏览器只调本站 BFF；上游走官方 JSON:API。
- 遥测：从 match included 取 CDN URL → **服务端一次性**下载解析落盘 → 前端只拿精简事件流。

---

## 3. Caching strategy / 缓存策略

### English

| Layer | What | TTL / retention |
|-------|------|-----------------|
| In-memory | player-by-name, season overview, seasons list, match detail, match report | 30m / 10m / 6h / 24h / 7d |
| Disk `.data/` | matches, reports, season snapshots, history, telemetry, sync logs | restart-safe; match immutable long-cache; report overwrite on rebuild |
| Cooldowns | manual refresh; history sync | 60s / 90s per account |
| BFF rate limit | per-IP sliding window on `/api/v1/*` | `RATE_LIMIT_RPM` default 30 |

- **Match objects are immutable**: cache aggressively; same `matchId` does not re-hit official match API when memory or `.data/matches/{matchId}.json` hits.
- **Reports**: memory first → `.data/reports/{matchId}/{accountId}.json` → generate; `rebuild` clears both and overwrites disk.
- **Season**: short TTL in memory; cold start may hydrate from `.data/seasons/{platform}/{accountId}/{seasonId}.json` if still fresh.
- Serial `getCachedMatch` when filling recent lists to avoid connection bursts (matches usually don’t count toward RPM, but we stay conservative).

### 中文

| 层级 | 内容 | TTL / 保留 |
|------|------|------------|
| 进程内存 | 昵称映射、赛季概览、赛季列表、对局、报告 | 30m / 10m / 6h / 24h / 7d |
| 磁盘 `.data/` | matches / reports / seasons / history / telemetry / logs | 重启可恢复；match 长缓存；rebuild 覆盖报告 |
| 冷却 | 手动刷新；同步近况 | 每账号 60s / 90s |
| BFF 限流 | `/api/v1/*` 按 IP 滑动窗口 | 默认 30 RPM（`RATE_LIMIT_RPM`） |

- 对局不可变 → 内存或 `.data/matches/` 命中则不重复打官方 match。
- 报告：内存 → 磁盘 → 生成；rebuild 清双层并覆盖。
- 赛季短 TTL；冷启动可读盘快照（仍在 TTL 内则当命中）。
- 近期对局串行拉 match，避免瞬时打满。

---

## 4. Expected request pattern / 预期请求模式

### English (aligned with official docs)

Official guidance: rate-limited calls per lookup are roughly proportional to **active users**, typically:

1. `GET /players?filter[playerNames]=...` (or by accountId)
2. `GET /players/{accountId}/seasons/{seasonId}` if season stats needed  

**`/matches` and telemetry downloads do not count against the API key RPM** (per PUBG rate-limits docs).

**Our per opt-in user session (cold cache, typical):**

| Step | Official calls (RPM-counted?) | Notes |
|------|-------------------------------|-------|
| Search / open player | 1× players + 1× season | counted |
| Recent N matches (default ~5) | N× matches | **not** counted toward RPM |
| Match report | 0 extra if match cached | report is local compute |
| Telemetry parse (opt-in tab) | 1× telemetry download | **not** counted |
| Manual refresh | 1× players + 1× season | counted; **60s cooldown** |
| History sync | players (cached) + serial matches | matches not counted; **90s cooldown** |

**Steady state:** repeated views of the same player within TTL hit memory/disk → **0** upstream RPM-counted calls.

We do **not** poll all players, do **not** crawl leaderboards, do **not** estimate total player population.

**Requested limit (placeholder):** e.g. **30–60 RPM** once a public demo is live and we have rough concurrent-user analytics; until then we stay on default **10 RPM**.

### 中文

与官方说明一致：计入 RPM 的请求与**主动使用的用户数**成正比；典型每次查询约：

1. 查玩家（按名或 accountId）  
2. 查赛季统计（如需要）  

**`/matches` 与 telemetry 下载通常不计 API Key RPM。**

**单次 opt-in 冷缓存大致消耗：**

| 步骤 | 官方调用（是否计 RPM） | 说明 |
|------|------------------------|------|
| 搜索/打开玩家 | 1× players + 1× season | 计 |
| 近期 N 场（默认约 5） | N× matches | **不计** |
| 复盘报告 | match 已缓存则 0 | 本地计算 |
| 遥测解析（用户打开 Tab） | 1× telemetry 下载 | **不计** |
| 手动刷新 | 1× players + 1× season | 计；**60s 冷却** |
| 同步近况 | 串行 matches | matches 不计；**90s 冷却** |

缓存命中稳态 → **0** 次计入 RPM 的上游调用。  
不做全服轮询/排行榜爬取/玩家总数估算。  
提额目标占位：**公网 Demo + 并发数据就绪后**申请约 **30–60 RPM**；此前按默认 **10 RPM**。

---

## 5. Demo access / Demo 访问方式

### English

- **Local (current):** `http://127.0.0.1:3000` — run `npm run dev` with `PUBG_API_KEY` in `.env.local`.
- **Public demo (placeholder):** `https://YOUR-DEMO-HOST.example` — **do not invent a fake public URL**. Replace only after real deploy (see steps below); include any password / invite if gated.
- Smoke: home search → player overview → open a match → report / scoreboard; optional timeline/replay after telemetry parse.

### 中文

- **本地（当前）：** `http://127.0.0.1:3000`（`.env.local` 配置 Key 后 `npm run dev`）。
- **公网 Demo（占位）：** `https://YOUR-DEMO-HOST.example` — **勿伪造公网地址**；仅在真实部署后替换（见下）；若有访问门槛请写清。
- 冒烟路径：首页搜索 → 玩家概览 → 对局详情报告/积分板；可选遥测回放。

### Demo 占位替换步骤（部署后）

1. 按 [`deploy/README.md`](../deploy/README.md) 单实例上线（Nginx + HTTPS），确认防火墙未对公网开放 `3000`。
2. 将本文档与「短粘贴块」中的 `https://YOUR-DEMO-HOST.example` / `public URL TBD` 换成真实 HTTPS 地址；有密码/邀请码则一并写明。
3. **冒烟路径（公网）：** 打开首页 → 搜索已知昵称 → 玩家概览 → 打开一场对局 → 报告 / 积分板；可选触发 telemetry 后再看事件轴/回放。
4. 确认页脚「数据来自 PUBG 官方 API」、未在页面/材料中泄露 `PUBG_API_KEY`。
5. 再勾选下方「须人工」中的 Demo 相关项；**仓库无法代替你在 developer.pubg.com 提交**。

---

## 6. Compliance / 合规

### English

- Opt-in queries only; no full-shard crawl.
- No estimation of total players / population metrics that violate ToS.
- API key never exposed client-side; no redistributing raw official payloads as a public “proxy API”.
- Footer attributes data source: PUBG official API.
- BFF IP rate limit remains even after any approved key RPM increase.

### 中文

- 仅用户主动查询；不全量爬取 shard。
- 不估算全服玩家数等可能违反 ToS 的指标。
- Key 不暴露前端；不把官方接口包装成对外「山寨 API」。
- 页脚标注数据来自 PUBG 官方 API。
- 即便提额获批，仍保留 BFF IP 限流与本地缓存，不把提额当唯一兜底。

---

## 7. Short paste block / 短粘贴块（英文）

```text
App: PUBG Review — personal opt-in match review & season stats (Next.js BFF).

API use: server-side key only; browser → our /api/v1 → official JSON:API.
Per cold lookup: ~1× /players + ~1× /players/.../seasons/... (RPM-counted).
Matches + telemetry: downloaded via BFF, usually NOT counted toward key RPM; match details cached in memory + .data/matches; reports in .data/reports; telemetry under .data/telemetry.

Caching: player 30m, season 10m, match 24h (+ disk), report 7d (+ disk). Refresh cooldown 60s; history sync 90s. BFF RATE_LIMIT_RPM (default 30) per IP.

Compliance: opt-in only; no full-server crawl; no player-population estimation; key never client-side.

Demo: local http://127.0.0.1:3000 ; public URL TBD after deploy.
Request: raise key RPM from 10 to ~30–60 once demo is public and we can share concurrency notes.
```

---

## 8. 提交前自检

### 仓库内可勾（材料/实现就绪即可）

- [x] 提额中英材料已写（产品 / Key 用法 / 缓存 / 请求模式 / 合规 / Demo 占位）
- [x] BFF 网关限流已落地（`RATE_LIMIT_RPM` + proxy）
- [x] 缓存 / 冷却 / opt-in 描述与当前代码设计一致（上线后若有偏差再改材料）
- [x] 材料与示例中无真实 API Key（仅占位）

### 须人工（本仓库无法代勾）

- [ ] 公网 Demo URL 已按 §5 步骤替换占位符，可匿名或带说明访问（**勿填假 URL**）
- [ ] 公网冒烟路径已走通（搜索 → 概览 → 对局报告/积分板）
- [ ] 登录 developer.pubg.com → My Apps → **I NEED A HIGHER LIMIT** 正式提交（材料已备，等 Demo 可访问后再做）
- [ ] 运维承诺：获批后仍保留网关限流与本地缓存，不把提额当唯一兜底

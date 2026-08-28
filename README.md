# PUBG Review

PUBG 对局复盘与个人战绩分析台（开发中）。

技术栈：Next.js + TypeScript + Tailwind  
产品文档：`docs/`

## 快速开始

### 1. 配置 API Key

```bash
cp .env.example .env.local
```

编辑 `.env.local`：

```env
PUBG_API_KEY=你的密钥
# 可选：BFF 每 IP 每分钟上限（默认 30）
RATE_LIMIT_RPM=30
```

> Key 只放服务端环境变量，不要提交 Git，不要写进前端代码。

### 2. 安装与启动

```bash
npm install
# 不会自动打开浏览器
npm run dev
```

打开 http://127.0.0.1:3000

## 生产部署（Linux + PM2）

裸机单实例部署说明见 [`deploy/README.md`](deploy/README.md)（含 `ecosystem.config.cjs`、Nginx 示例、备份与安全注意）。  
要点：Node 20+、**单进程**、持久化 `.data/`、Nginx 反代 HTTPS，MCP 地址为 `https://域名/mcp`。

## 当前可用页面

| 路径                                                                   | 说明                                                                  |
|----------------------------------------------------------------------|---------------------------------------------------------------------|
| `/`                                                                  | 搜索首页（最近搜索本地缓存）                                                      |
| `/player/{platform}/{name}?seasonId=&gameMode=&tag=&tab=&vs=&mates=` | 概览（封禁状态 + 近况现状卡）/ 分析 / 武器 / 地图 / 对比 / 车队（`tab=squad&mates=`）        |
| `/match/{matchId}?platform=&accountId=&name=&tab=`                   | `tab=report\|scoreboard\|timeline\|replay`；积分板可导出 CSV；页头/报告卡可复制分享链接 |
| `/share/match/{matchId}?platform=&accountId=`                        | 只读分享卡（地图/模式/时间/排名/击杀/伤害/主因标签/摘要）；无 accountId 时仅基础对局信息               |
| `/favorites`                                                         | 本机收藏玩家（localStorage）                                                |

玩家页 Tab：`overview`（默认）· `analysis` · `weapons` · `maps` · `compare`（`vs=` 另一昵称）· `squad`（`mates=` 最多 3 人）

### 封禁状态说明

玩家页展示 PUBG 官方 `banType`：`Innocent`（正常）/ `TemporaryBan` / `PermanentBan`。  
**仅表示账号封禁状态，不是「是否开挂」判定**，也不替代 BattlEye / Steam VAC。

## Remote MCP

开发服务启动后，AI 客户端可通过 Streamable HTTP 连接（无需 OAuth）：

```
http://<本机局域网IP>:3000/mcp
```

默认关闭（`/mcp` 返回 404）。开启：`MCP_ENABLED=true`，并配置 `MCP_TOKEN`（必填）。  
请求头需带 `Authorization: Bearer <MCP_TOKEN>`；缺 Token / 错误 → `401`，未配置 `MCP_TOKEN` → `503`。

示例配置：

```json
{
  "pubg-review": {
    "type": "remote",
    "url": "http://192.168.x.x:3000/mcp",
    "oauth": false,
    "headers": {
      "Authorization": "Bearer {env:PUBG_REVIEW_MCP_TOKEN}"
    }
  }
}
```

| Tool | 说明 |
|------|------|
| `search_player` | 搜索玩家（platform + name） |
| `get_player_dashboard` | 玩家战绩概览 |
| `get_player_form` | 近况 formStatus + 异常 anomalies |
| `get_player_analysis` | 近 N 场报告聚合（雷达/弱点/建议） |
| `get_match` | 对局详情 |
| `get_match_report` | 对局复盘报告 |
| `compare_players` | 两人赛季 KPI 对比 |
| `get_squad_stats` | 车队同场统计 |
| `suggest_squad_mates` | 常一起 Top3 队友建议 |
| `get_player_weapons` | 武器/战斗聚合（本地历史） |
| `get_player_maps` | 地图聚合（本地历史） |
| `list_seasons` | 赛季列表 |
| `list_player_history` | 本地历史库列表 |

> Tools 直接复用服务层，不经 `/api/v1` HTTP 自调用。仅局域网同网段可直连；公网需隧道或部署。

## API

| 路径                                                                                      | 说明                                                |
|-----------------------------------------------------------------------------------------|---------------------------------------------------|
| `GET /api/v1/smoke`                                                                     | 连通性冒烟                                             |
| `GET /api/v1/players/search`                                                            | 搜索玩家（含官方 `banType`）                               |
| `GET /api/v1/players/dashboard`                                                         | 玩家页聚合（含 `weaknessTags`、`trend`、历史落盘）              |
| `GET /api/v1/players/analysis?platform=&name=&range=20m`                                | 近 N 场报告聚合                                         |
| `GET /api/v1/players/form?platform=&name=&gameMode=squad&seasonId=&limit=20`            | 近况 formStatus + 异常 anomalies（串行缓存优先）              |
| `GET /api/v1/players/compare?platform=&nameA=&nameB=&gameMode=`                         | 两人赛季 KPI 对比                                       |
| `GET /api/v1/players/{accountId}/overview`                                              | 赛季概览                                              |
| `POST /api/v1/players/{accountId}/refresh?platform=&name=`                              | 手动刷新（60s 冷却，业务码 40901）                            |
| `GET /api/v1/players/{accountId}/history`                                               | 本地历史库列表                                           |
| `POST /api/v1/players/{accountId}/history/sync?platform=&name=`                         | 同步近况入库（90s 冷却）                                    |
| `GET /api/v1/players/{accountId}/weapons`                                               | 武器/战斗聚合                                           |
| `GET /api/v1/players/{accountId}/maps`                                                  | 地图聚合                                              |
| `GET /api/v1/meta/seasons?platform=`                                                    | 赛季列表                                              |
| `GET /api/v1/meta/sync-logs?limit=50`                                                   | 开发用：上游调用日志（生产 403）                                |
| `GET /api/v1/matches/{matchId}`                                                         | 对局详情（含 `telemetryStatus`，不暴露 CDN URL）             |
| `GET /api/v1/matches/{matchId}/report?platform=&accountId=`                             | 复盘报告（telemetry ready 则 `1.1.0-telemetry` 增强，否则降级） |
| `POST /api/v1/matches/{matchId}/report/rebuild?platform=&accountId=`                    | 调试重算（清缓存后优先增强）                                    |
| `POST /api/v1/matches/{matchId}/telemetry/parse?platform=`                              | 下载+解析遥测（幂等）                                       |
| `GET /api/v1/matches/{matchId}/telemetry/events?platform=&accountId=&types=&sampleHz=`  | 精简事件流（可自动 parse）                                  |
| `GET /api/v1/squad/stats?platform=&name=&mates=A,B,C&limit=20&gameMode=squad&refresh=1` | 车队同场统计（齐全场聚合；`mateIds=`；`refresh=1` 绕过缓存）         |
| `GET /api/v1/squad/suggest-mates?platform=&name=&scan=12`                               | 近 N 场常一起 Top3 队友建议                                |

## `.data/` 目录结构（已 gitignore）

```text
.data/
  matches/{matchId}.json          # 对局详情落盘（getCachedMatch 成功后）
  reports/{matchId}/{accountId}.json  # 复盘报告（build 写入；rebuild 覆盖）
  seasons/{platform}/{accountId}/{seasonId}.json  # 赛季概览快照（短 TTL + 冷启动）
  squad/{hash}.json               # 车队同场统计（platform+成员 accountId 排序 hash；TTL ~20min）
  history/{accountId}.json        # 本地历史库摘要
  name-history/{accountId}.json   # 曾见昵称
  telemetry/{matchId}/            # meta.json / raw.json / events.json
  logs/api-sync.jsonl             # 上游调用简易日志（无 Key）
```

读取优先级（match / report）：**内存 → 磁盘 → 官方/生成**。重启 `next dev` 后内存清空，磁盘仍可恢复。  
车队统计：磁盘 fresh 命中则直接返回；miss / `refresh=1` 时串行扫 match（磁盘优先）。

## 本地历史库（M4）

- 路径：见上表 `history/`、`name-history/`
- **写入时机**：打开玩家概览（dashboard）时 upsert 本次拉取的 recent matches；或点「同步近况」
- **历史库 UI**：官方 14 天列表外、本地已存的对局单独展示（去重）
- **同步近况**：90s 冷却，串行 `getCachedMatch`，避免打满 10 RPM（非定时 Job）
- **改名**：按 accountId 记录曾见昵称；与上次不同则页面提示

### 武器 / 地图 / 对比 / 车队 / 导出

- **武器 Tab**：优先用本地历史 + 已解析 telemetry 的 `weaponId`；否则展示伤害/击杀/爆头等 participant 聚合，并说明完整武器需 telemetry
- **地图 Tab**：按地图聚合场次、平均排名、KD≈、场均伤、吃鸡率；支持 `gameMode` 过滤
- **对比 Tab**：当前玩家 + `vs` 昵称，赛季 KPI 表格 + 条形（最多 2 人）
- **车队 Tab**：`?tab=squad&mates=A,B,C&limit=20&gameMode=squad`；筛四人齐全同场后聚合人均 KPI / 伤占比 / 明细；样本卡下方展示客观 insights；可「识别常一起的人」；结果缓存 `.data/squad/`（`refresh=1` 强制重算）
- **导出 CSV**：对局详情 → 积分板 Tab；车队 Tab → 齐全对局明细（含人均汇总 section）

## Telemetry（M3）

- 服务端从 match included 取 telemetry URL → 下载到 `.data/telemetry/{matchId}/`
- 解析为精简 `events.json`（轨迹 ~1Hz、击杀/倒地/救援/空投/圈、**枪线 gunlines**）
- 回放图层可开「枪线」（短时淡出；无数据时开关禁用）
- **浏览器只调 BFF**，禁止直拉官方超大 JSON
- 详见 `docs/04-Telemetry解析说明.md`

### 验证示例

```bash
# 触发解析
curl -X POST "http://127.0.0.1:3000/api/v1/matches/{matchId}/telemetry/parse?platform=steam"

# 取精简事件
curl "http://127.0.0.1:3000/api/v1/matches/{matchId}/telemetry/events?platform=steam&types=kill,knock"

# 同步近况
curl -X POST "http://127.0.0.1:3000/api/v1/players/{accountId}/history/sync?platform=steam&name=Nick"

# 车队同场统计（可加 &refresh=1 绕过缓存）
curl "http://127.0.0.1:3000/api/v1/squad/stats?platform=steam&name=Nick&mates=A,B,C&limit=20&gameMode=squad"

# 浏览器：玩家页 Tab「武器」「地图」「对比」「车队」；对局页「积分板」/ 车队「齐全对局」导出 CSV
```

## 缓存（内存 + `.data` 落盘）

| 数据                      | 内存 TTL | 磁盘                                         |
|-------------------------|--------|--------------------------------------------|
| 玩家名 → 资料                | 30 min | —                                          |
| 赛季统计                    | 10 min | `.data/seasons/...`（同 TTL 视为 fresh）        |
| 赛季列表                    | 6 h    | —                                          |
| 对局详情                    | 24 h   | `.data/matches/{matchId}.json`（不可变长缓存）     |
| 复盘报告（key 含 ruleVersion） | 7 d    | `.data/reports/{matchId}/{accountId}.json` |
| 遥测精简 / 历史库              | —      | `.data/telemetry` / `.data/history`        |
| 车队同场统计                  | —      | `.data/squad/{hash}.json`（TTL ~20 min）     |

刷新接口会失效该玩家的 name/season 缓存后重拉；同一 match 走内存或磁盘不重复打官方。

## 分析与收藏

- **弱点标签**：dashboard / 玩家概览聚合近场 `primaryTag` 频次；点击带 `?tag=code` 过滤列表。
- **近 14 天趋势**：dashboard `trend` 按日聚合 KD / 场均伤害 / 平均排名（官方 recent + 本地历史，不额外打官方）；概览页可切换指标。
- **分析 Tab**：`?tab=analysis`，雷达粗分 + 问题与建议。
- **近况 form**：`GET /api/v1/players/form` — 赛季 KPI vs 近 N 场 → `normal|soft|poor`；连续负向主因 / 低伤离群异常（客观表述，无侮辱措辞）。玩家概览顶部「近况现状」卡同进程调用 `getPlayerFormAnalysis`（失败降级，不拖垮整页）。
- **收藏**：浏览器 `localStorage`，键 `pubg-review:favorites`。
- **遥测增强报告**：MVP 仅展示状态文案；规则重算后续开放。

## 网关限流与同步日志

- **BFF 限流**：`src/proxy.ts` 对 `/api/v1/*` 按 IP 滑动窗口限流；环境变量 `RATE_LIMIT_RPM`（默认 30）；超限 `429` + 业务码 `42902` + `meta.retryAfterSec`。
- **api_sync_log**：上游 `pubgFetch` 写入 `.data/logs/api-sync.jsonl`（时间、path、status、耗时、platform；不含 Key）；开发可 `GET /api/v1/meta/sync-logs?limit=50`。

## 注意

- 官方默认限额约 **10 RPM**（`/matches` 与 telemetry 下载通常不计限流）；BFF 另有 IP 限流保护
- 昵称大小写需与游戏内一致
- 对局 / 遥测约保留 **14 天**（本地历史库可保留已同步摘要）
- 页脚标注：数据来自 PUBG 官方 API

## 上线前 Rate Limit 检查清单（尚未提额）

> 勿伪造「已提额」。默认仍按 ~10 RPM 设计。  
> 完整中英材料：[`docs/05-API提额申请材料.md`](docs/05-API提额申请材料.md)

- [x] 网关限流已落地（`RATE_LIMIT_RPM` + proxy）
- [x] 提额材料已写（产品 / 缓存 / 请求模式 / 合规 / Demo 占位）
- [ ] Demo 可公网访问（替换材料中的 URL 占位）
- [ ] 在 developer.pubg.com 正式提交「I NEED A HIGHER LIMIT」（材料已备，上线后提交）
- [ ] 上线后仍保留网关限流与本地/Redis 缓存，不依赖提额兜底

## 里程碑

- **M1**：可用查询站 — 搜索 / 概览 / 对局列表 / 积分板 / 缓存 / 刷新冷却 / 赛季下拉
- **M2**：无遥测复盘报告；弱点标签；分析 Tab；本机收藏
- **M3**：Telemetry 解析 + 事件轴 + 2D 回放 MVP
- **M4（务实版）**：本地历史库、同步近况、武器/地图/对比、CSV、改名提示
- **车队同场统计**：`tab=squad`、insights、CSV、`.data/squad` 缓存
- **落盘**：match / report / season / squad → `.data/`（替代 DB 表）；提额材料已备
- Redis；正式提额提交（后续）

# PUBG Review

PUBG 对局复盘与个人战绩分析台（自托管、单实例）。

**技术栈**：Next.js 16.3 · React 19 · TypeScript · Tailwind 4 · Zod 4  
**持久化**：项目根目录 `.data/`（无独立数据库）  
**数据来源**：PUBG 官方 API（浏览器只访问本站 BFF，不直连官方）

## 快速开始

### 1. 配置环境变量

```bash
cp .env.example .env.local
```

| 变量                        | 必填         | 说明                                                                        |
|---------------------------|------------|---------------------------------------------------------------------------|
| `PUBG_API_KEY`            | 是*         | [developer.pubg.com](https://developer.pubg.com/) 申请；仅服务端；与下方多 Key 二选一或合并 |
| `PUBG_API_KEYS`           | 否          | 多个 Key（逗号分隔或 JSON 数组）；轮询，遇 429 换下一个                                       |
| `RATE_LIMIT_RPM`          | 否          | BFF 每 IP 读限流，默认 `30`                                                      |
| `RATE_LIMIT_MUTATION_RPM` | 否          | 写/强制刷新更严限流，默认约为读限流的 1/3                                                   |
| `TRUST_PROXY`             | 否          | 是否信任 `X-Forwarded-For`，默认 `false`                                         |
| `MCP_ENABLED`             | 否          | Remote MCP 开关，默认关闭                                                        |
| `MCP_TOKEN`               | 开启 MCP 时必填 | Bearer Token                                                              |
| `AI_ANALYSIS_ENABLED`     | 否          | 可选 LLM 解读开关，默认关闭；无 Key 时行为与现网一致                                           |
| `AI_API_KEY`              | 开启 AI 时建议填 | 模型网关 Key（仅服务端）；OpenAI-compatible                                          |
| `AI_BASE_URL`             | 否          | 网关根路径，默认 `https://api.openai.com/v1`                                      |
| `AI_MODEL`                | 否          | 模型名，默认 `gpt-4o-mini`                                                      |
| `AI_RATE_LIMIT_RPM`       | 否          | 进程内 AI 外呼 RPM，默认 `6`（与官方 PUBG 限额无关）                                       |

> 真实 Key / Token 不要提交 Git，也不要写进前端代码。

### 2. 安装与启动

```bash
npm install
npm run dev    # 0.0.0.0:3000，不会自动开浏览器
```

打开 http://127.0.0.1:3000

```bash
npm run build && npm start   # 生产模式
npm run lint
```

## 功能概览

| 能力         | 说明                                                           |
|------------|--------------------------------------------------------------|
| 搜索 / 玩家概览  | 多平台昵称搜索；赛季 KPI、近况卡、弱点标签、14 天趋势、封禁状态、战队资料与可选 AI 赛季评价          |
| 对局复盘       | 报告（无遥测可降级 / 有遥测可增强）、可选 AI 人话解读（默认关）、积分板 CSV、事件轴、2D 回放（`?t=`） |
| 武器 / 地图    | 本地历史聚合；完整武器明细依赖已 parse 的 telemetry                           |
| 对比 / 车队    | 两人 KPI + 近况并排；四人齐全同场统计与常一起队友建议                               |
| 本地历史库      | dashboard /「同步近况」落盘；官方约 14 天列表外可保留摘要                         |
| 收藏         | 浏览器 `localStorage`；支持单人 / 全部串行同步                             |
| 分享         | `/share/match/...` 只读卡 + 动态 OG                               |
| Remote MCP | 17 个 Tools，含友伤明细与统计；复用服务层，默认关闭，Bearer 鉴权                    |

**封禁说明**：页面上的 `banType`（`Innocent` / `TemporaryBan` / `PermanentBan`）只表示官方账号封禁状态，**不是开挂判定**，也不替代 BattlEye / Steam VAC。

## 页面路由

| 路径                          | 要点                                                                                                                            |
|-----------------------------|-------------------------------------------------------------------------------------------------------------------------------|
| `/`                         | 搜索首页；最近搜索本地缓存                                                                                                                 |
| `/player/{platform}/{name}` | `tab=overview\|analysis\|weapons\|maps\|compare\|squad`；常用 query：`seasonId`、`gameMode`、`tag`、`vs`、`mates`、`map`、`sort`、`page` |
| `/match/{matchId}`          | `tab=report\|scoreboard\|timeline\|replay\|weapons`；回放可用 `t=` 秒定位                                                             |
| `/share/match/{matchId}`    | 只读分享；无 `accountId` 时仅基础对局信息                                                                                                   |
| `/favorites`                | 本机收藏；可串行同步近况入库                                                                                                                |
| `/maps`                     | 地图中心暂停开放，显示暂停说明；官方底图仍用于对局回放                                                                                                   |
| `/maps/{mapId}`             | 地图资料页暂停开放，显示暂停说明                                                                                                              |

平台：`steam` / `kakao` / `xbox` / `psn`。昵称大小写须与游戏内一致。

## 生产部署

见 [`deploy/README.md`](deploy/README.md)（源码构建 / **standalone 打包**、PM2、Nginx、备份与 SLA）。

要点：

- Node 20+，**必须单进程**（禁止 PM2 cluster / 多实例）
- 持久化依赖 `.data/`；进程内缓存与限流，重启会丢内存态
- 推荐：`npm run build && npm run pack` → 拷贝 `dist/pubg-review` 到服务器跑 `node server.js`
- 自动更新：打 `v*` tag → GitHub Release 产物 → 服务器 `update-from-release.sh`（见 `deploy/README.md` §C）
- Nginx 反代 HTTPS；MCP 地址为 `https://域名/mcp`

## Remote MCP

默认关闭（`/mcp` → 404）。开启：

```env
MCP_ENABLED=true
MCP_TOKEN=换成足够长的随机串
```

客户端请求头：`Authorization: Bearer <MCP_TOKEN>`  
缺 Token / 错误 → `401`；未配置 `MCP_TOKEN` → `503`。

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

| Tool                   | 说明                         |
|------------------------|----------------------------|
| `search_player`        | 搜索玩家                       |
| `get_player_dashboard` | 战绩概览                       |
| `get_player_form`      | 近况 formStatus + anomalies  |
| `get_player_analysis`  | 近 N 场报告聚合                  |
| `get_match`            | 对局详情（含 mapLabel 中文）        |
| `get_match_report`     | 复盘报告（附 mapName / mapLabel） |
| `compare_players`      | 两人赛季 KPI 对比                |
| `get_squad_stats`      | 车队同场统计                     |
| `suggest_squad_mates`  | 常一起 Top3 队友                |
| `get_player_weapons`   | 武器 / 战斗聚合                  |
| `get_player_maps`      | 地图聚合（含 mapLabel）           |
| `list_seasons`         | 赛季列表                       |
| `list_player_history`  | 本地历史库列表                    |
| `parse_telemetry`      | 幂等解析对局遥测                   |
| `get_telemetry_events` | 精简事件流（可 autoParse）         |
| `get_match_friendly_fire` | 友伤伤害、击倒、击杀与终结明细及聚合 |
| `sync_player_history`  | 同步近况到本地历史库（有冷却）            |

Tools 直接调用服务层，不经 `/api/v1` HTTP 自调用。局域网可直连；公网需隧道或正式部署，并建议防火墙限 IP。

### 友伤查询

调用 `get_match_friendly_fire`，传入 `platform` 与 `matchId`；可选 `accountId` 聚焦玩家，
`direction=both|dealt|received` 分别表示双方、造成、承受（默认 `both`，后两者须提供玩家）。例如：

```json
{
  "platform": "steam",
  "matchId": "替换为真实对局 ID",
  "accountId": "account.替换为真实玩家账号",
  "direction": "both",
  "autoParse": true,
  "limit": 100,
  "offset": 0
}
```

- 返回 `summary`、玩家 `players[].dealt/received`、攻击者→受害者 `pairs` 与按时间排列的 `events`；明细含时间、武器、伤害来源、生命伤害及判定依据。
- `damage` 为护甲减免后的正数生命伤害；`damageEvents` 是事件数，持续伤害可能产生多条，不等同于攻击次数。友伤不受回放枪线抽样影响，包含官方可归属的载具等伤害。
- `knocks` 表示队友击倒；`kills` 使用官方 `teamKillers_AccountId` 或同队击杀者归属；`finishes` 单列队友终结行为，不能与击杀数相加作为死亡人数。全局击杀按死亡事件去重，多人归属时玩家或配对击杀之和可能更大。
- `limit`（1–500，默认 100）和 `offset` 仅分页明细，聚合始终基于完整筛选结果。没有友伤时 `hasFriendlyFire=false`；遥测不可用时为 `null`，且 `summary=null`。
- `autoParse` 默认 `true`，按需下载或升级旧缓存，优先复用本地 `raw.json`，无需重新查询已过期的官方对局；`false` 仅读盘，旧格式返回 `outdated`。请按场串行调用，勿批量扫库。
- 排除自伤、机器人、赛前与无法确认同队关系的事件；只记录事实，不判断是否故意。队伍身份使用事件快照，官方明确给出的队友击杀账号可作为补充依据。

离线回归检查：`npm run check:friendly-fire`（临时目录隔离，不调用官方 API）。

## HTTP API（BFF）

统一响应：`{ code, message, data, meta? }`，成功 `code === 0`。

| 方法         | 路径                                           | 说明                                    |
|------------|----------------------------------------------|---------------------------------------|
| GET        | `/api/v1/smoke`                              | 连通性冒烟                                 |
| GET        | `/api/v1/players/search`                     | 搜索（含 `banType`）                       |
| GET        | `/api/v1/clans/{clanId}`                     | 官方战队资料（需 `platform`，含缓存）              |
| GET / POST | `/api/v1/players/season-review`              | 可选 AI 赛季评价；GET 读缓存，POST 手动生成          |
| GET        | `/api/v1/players/dashboard`                  | 玩家页聚合（弱点、趋势、历史落盘）                     |
| GET        | `/api/v1/players/analysis`                   | 近 N 场报告聚合                             |
| GET        | `/api/v1/players/form`                       | 近况 form + 异常                          |
| GET        | `/api/v1/players/compare`                    | 两人 KPI 对比                             |
| GET        | `/api/v1/players/{accountId}/overview`       | 赛季概览                                  |
| POST       | `/api/v1/players/{accountId}/refresh`        | 手动刷新（约 60s 冷却，`40901`）                |
| GET        | `/api/v1/players/{accountId}/history`        | 本地历史列表                                |
| POST       | `/api/v1/players/{accountId}/history/sync`   | 同步近况（约 90s 冷却）                        |
| GET        | `/api/v1/players/{accountId}/weapons`        | 武器聚合                                  |
| GET        | `/api/v1/players/{accountId}/maps`           | 地图聚合                                  |
| GET        | `/api/v1/meta/seasons`                       | 赛季列表                                  |
| GET        | `/api/v1/meta/sync-logs`                     | 上游调用日志（开发用；生产 403）                    |
| GET        | `/api/v1/matches/{matchId}`                  | 对局详情（含 `telemetryStatus`，不暴露 CDN URL） |
| GET        | `/api/v1/matches/{matchId}/report`           | 复盘报告                                  |
| POST       | `/api/v1/matches/{matchId}/report/rebuild`   | 调试重算                                  |
| POST       | `/api/v1/matches/{matchId}/telemetry/parse`  | 下载并解析遥测（幂等）                           |
| GET        | `/api/v1/matches/{matchId}/telemetry/events` | 精简事件流                                 |
| GET        | `/api/v1/squad/stats`                        | 车队同场统计（`refresh=1` 绕过缓存）              |
| GET        | `/api/v1/squad/suggest-mates`                | 常一起队友建议                               |

常见业务码：`40401`/`40402` 玩家/对局不存在，`40901` 刷新冷却，`42901` 上游限流，`42902` 网关限流。

### 验证示例

```bash
curl -X POST "http://127.0.0.1:3000/api/v1/matches/{matchId}/telemetry/parse?platform=steam"
curl "http://127.0.0.1:3000/api/v1/matches/{matchId}/telemetry/events?platform=steam&types=kill,knock"
curl -X POST "http://127.0.0.1:3000/api/v1/players/{accountId}/history/sync?platform=steam&name=Nick"
curl "http://127.0.0.1:3000/api/v1/squad/stats?platform=steam&name=Nick&mates=A,B,C&limit=20&gameMode=squad"
```

## 数据与缓存

### `.data/`（已 gitignore）

```text
.data/
  matches/{matchId}.json
  reports/{matchId}/{accountId}.json
  seasons/{platform}/{accountId}/{seasonId}.json
  squad/{hash}.json
  history/{accountId}.json
  name-history/{accountId}.json
  telemetry/{matchId}/          # meta.json / raw.json / events.json
  logs/api-sync.jsonl           # 上游调用日志（不含 Key）
```

读取优先级（match / report）：**内存 → 磁盘 → 官方 / 生成**。

| 数据                      | 内存 TTL | 磁盘                            |
|-------------------------|--------|-------------------------------|
| 玩家名 → 资料                | 30 min | —                             |
| 赛季统计                    | 10 min | `.data/seasons/...`           |
| 赛季列表                    | 6 h    | —                             |
| 对局详情                    | 24 h   | 不可变长缓存                        |
| 复盘报告（key 含 ruleVersion） | 7 d    | `.data/reports/...`           |
| 遥测 / 历史库                | —      | `.data/telemetry` / `history` |
| 车队同场统计                  | —      | `.data/squad/...`（约 20 min）   |

对局内存缓存同时限制为最多 64 场、估算占用不超过 16 MiB，按最近使用情况淘汰；淘汰后仍可从磁盘恢复。过期缓存每 60 秒清理一次。容量预算只针对对局缓存，并非整个进程的内存上限。

### 本地历史与分析要点

- **写入**：打开玩家概览时 upsert recent；或收藏/玩家页「同步近况」（串行、冷却，非定时 Job）
- **改名**：按 `accountId` 记曾见昵称并提示
- **武器**：优先 telemetry `weaponId`；否则用 participant 聚合并标明需 parse
- **地图**：场次 / 平均排名 / KD≈（近似）/ 场均伤 / 吃鸡率；可点进按 `map=` 过滤
- **报告**：telemetry ready → `1.1.0-telemetry`；否则 `1.0.0-no-telemetry`；样本不足时分析 Tab 降级，不装雷达可信
- **近况 form**：赛季 KPI vs 近 N 场 → `normal|soft|poor`；客观 anomalies，无侮辱措辞

### Telemetry

服务端从 match included 取 URL → 落盘 → 解析为精简 `events.json`（轨迹约 1Hz、击杀/倒地/救援/空投/圈、枪线）。  
浏览器只调 BFF，禁止直拉官方超大 JSON。回放可开枪线图层；事件轴可跳转 `?tab=replay&t=`。

遥测下载以流式方式写入临时文件，按事件解析，成功后替换原文；下载按解压后字节数限制为 80 MiB。单实例内重型遥测任务串行执行，最多等待 8 个任务，队列满时返回限流提示；同一账号同步执行中会拒绝重复触发。已生成报告命中缓存时，不再读取完整遥测。解析结果和回放响应仍会占用内存，实际峰值取决于事件与轨迹数量。

内存相关离线回归：`npm run check:cache-memory`、`npm run check:telemetry-memory`；使用临时目录和模拟响应，不调用官方 API，也不改动真实 `.data/`。

## 限流与合规

- 官方默认约 **10 RPM**（`/matches` 与 telemetry 下载通常不计）；设计按未提额运行
- BFF：`src/proxy.ts` 按 IP 滑动窗口；写操作 / `force` / `refresh=1` 更严
- 上游调用写入 `.data/logs/api-sync.jsonl`（无 Key）
- 对局 / 遥测官方约保留 **14 天**；本地历史可保留已同步摘要
- 页脚标注数据来自 PUBG 官方 API

### 提额检查清单（尚未提额）

完整材料与**上线前勾选清单**见本地 `docs/05-API提额申请材料.md` §8。**勿伪造已提额 / 已公网 Demo**。

- [x] 网关限流（`RATE_LIMIT_RPM` + proxy）
- [x] 提额材料（产品 / 缓存 / 请求模式 / 合规 / Demo 占位）
- [x] **G-01** Demo 可公网访问：`https://pubg.livancen.top`
- [ ] **G-02** 你本人在 developer.pubg.com 提交「I NEED A HIGHER LIMIT」（G-01 已可访问，现可提交）
- [ ] 上线后仍保留网关限流与本地缓存（进程内；Redis 暂缓）

## 里程碑与边界

已落地（务实版）：M1 查询站 → M2 无遥测报告 / 弱点 / 收藏 → M3 遥测 + 事件轴 + 2D 回放 → M4 历史库 / 武器地图对比 / CSV → 车队同场统计 → `.data` 落盘与部署材料。

**明确暂缓**：完整 OAuth / 多租户、MySQL 替换 `.data`、Redis 多实例、非 api-assets 贴图来源、逐房间密室、四平台同等验收（优先保证 steam）。移动端主路径响应式已落地（非独立 App 壳）。

下一专题（可选 AI、载具图层、POI 等；官方 api-assets 底图已落地）规划见本地 `docs/06-缺口补充-AI与地图.md`（`docs/` 默认 gitignore）。

变更记录见 [`CHANGELOG.md`](CHANGELOG.md)。

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

| 能力         | 说明                                           |
|------------|----------------------------------------------|
| 搜索 / 玩家概览  | 多平台昵称搜索；赛季 KPI、近况卡、弱点标签、14 天趋势、封禁状态          |
| 对局复盘       | 报告（无遥测可降级 / 有遥测可增强）、积分板 CSV、事件轴、2D 回放（`?t=`） |
| 武器 / 地图    | 本地历史聚合；完整武器明细依赖已 parse 的 telemetry           |
| 对比 / 车队    | 两人 KPI + 近况并排；四人齐全同场统计与常一起队友建议               |
| 本地历史库      | dashboard /「同步近况」落盘；官方约 14 天列表外可保留摘要         |
| 收藏         | 浏览器 `localStorage`；支持单人 / 全部串行同步             |
| 分享         | `/share/match/...` 只读卡 + 动态 OG               |
| Remote MCP | 13 个 Tools，复用服务层；默认关闭，Bearer 鉴权              |

**封禁说明**：页面上的 `banType`（`Innocent` / `TemporaryBan` / `PermanentBan`）只表示官方账号封禁状态，**不是开挂判定**，也不替代 BattlEye / Steam VAC。

## 页面路由

| 路径                          | 要点                                                                                                                            |
|-----------------------------|-------------------------------------------------------------------------------------------------------------------------------|
| `/`                         | 搜索首页；最近搜索本地缓存                                                                                                                 |
| `/player/{platform}/{name}` | `tab=overview\|analysis\|weapons\|maps\|compare\|squad`；常用 query：`seasonId`、`gameMode`、`tag`、`vs`、`mates`、`map`、`sort`、`page` |
| `/match/{matchId}`          | `tab=report\|scoreboard\|timeline\|replay\|weapons`；回放可用 `t=` 秒定位                                                             |
| `/share/match/{matchId}`    | 只读分享；无 `accountId` 时仅基础对局信息                                                                                                   |
| `/favorites`                | 本机收藏；可串行同步近况入库                                                                                                                |

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

| Tool                   | 说明                        |
|------------------------|---------------------------|
| `search_player`        | 搜索玩家                      |
| `get_player_dashboard` | 战绩概览                      |
| `get_player_form`      | 近况 formStatus + anomalies |
| `get_player_analysis`  | 近 N 场报告聚合                 |
| `get_match`            | 对局详情                      |
| `get_match_report`     | 复盘报告                      |
| `compare_players`      | 两人赛季 KPI 对比               |
| `get_squad_stats`      | 车队同场统计                    |
| `suggest_squad_mates`  | 常一起 Top3 队友               |
| `get_player_weapons`   | 武器 / 战斗聚合                 |
| `get_player_maps`      | 地图聚合                      |
| `list_seasons`         | 赛季列表                      |
| `list_player_history`  | 本地历史库列表                   |

Tools 直接调用服务层，不经 `/api/v1` HTTP 自调用。局域网可直连；公网需隧道或正式部署，并建议防火墙限 IP。

## HTTP API（BFF）

统一响应：`{ code, message, data, meta? }`，成功 `code === 0`。

| 方法   | 路径                                           | 说明                                    |
|------|----------------------------------------------|---------------------------------------|
| GET  | `/api/v1/smoke`                              | 连通性冒烟                                 |
| GET  | `/api/v1/players/search`                     | 搜索（含 `banType`）                       |
| GET  | `/api/v1/players/dashboard`                  | 玩家页聚合（弱点、趋势、历史落盘）                     |
| GET  | `/api/v1/players/analysis`                   | 近 N 场报告聚合                             |
| GET  | `/api/v1/players/form`                       | 近况 form + 异常                          |
| GET  | `/api/v1/players/compare`                    | 两人 KPI 对比                             |
| GET  | `/api/v1/players/{accountId}/overview`       | 赛季概览                                  |
| POST | `/api/v1/players/{accountId}/refresh`        | 手动刷新（约 60s 冷却，`40901`）                |
| GET  | `/api/v1/players/{accountId}/history`        | 本地历史列表                                |
| POST | `/api/v1/players/{accountId}/history/sync`   | 同步近况（约 90s 冷却）                        |
| GET  | `/api/v1/players/{accountId}/weapons`        | 武器聚合                                  |
| GET  | `/api/v1/players/{accountId}/maps`           | 地图聚合                                  |
| GET  | `/api/v1/meta/seasons`                       | 赛季列表                                  |
| GET  | `/api/v1/meta/sync-logs`                     | 上游调用日志（开发用；生产 403）                    |
| GET  | `/api/v1/matches/{matchId}`                  | 对局详情（含 `telemetryStatus`，不暴露 CDN URL） |
| GET  | `/api/v1/matches/{matchId}/report`           | 复盘报告                                  |
| POST | `/api/v1/matches/{matchId}/report/rebuild`   | 调试重算                                  |
| POST | `/api/v1/matches/{matchId}/telemetry/parse`  | 下载并解析遥测（幂等）                           |
| GET  | `/api/v1/matches/{matchId}/telemetry/events` | 精简事件流                                 |
| GET  | `/api/v1/squad/stats`                        | 车队同场统计（`refresh=1` 绕过缓存）              |
| GET  | `/api/v1/squad/suggest-mates`                | 常一起队友建议                               |

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

## 限流与合规

- 官方默认约 **10 RPM**（`/matches` 与 telemetry 下载通常不计）；设计按未提额运行
- BFF：`src/proxy.ts` 按 IP 滑动窗口；写操作 / `force` / `refresh=1` 更严
- 上游调用写入 `.data/logs/api-sync.jsonl`（无 Key）
- 对局 / 遥测官方约保留 **14 天**；本地历史可保留已同步摘要
- 页脚标注数据来自 PUBG 官方 API

### 提额检查清单（尚未提额）

完整材料见本地 `docs/05-API提额申请材料.md`（若存在）。**勿伪造已提额 / 已公网 Demo**；正式提交须人工登录 developer.pubg.com。

- [x] 网关限流（`RATE_LIMIT_RPM` + proxy）
- [x] 提额材料（产品 / 缓存 / 请求模式 / 合规 / Demo 占位）
- [ ] Demo 可公网访问（替换材料中的 URL 占位后再勾）
- [ ] 在 developer.pubg.com 提交「I NEED A HIGHER LIMIT」
- [ ] 上线后仍保留网关限流与本地缓存（进程内；Redis 暂缓）

## 里程碑与边界

已落地（务实版）：M1 查询站 → M2 无遥测报告 / 弱点 / 收藏 → M3 遥测 + 事件轴 + 2D 回放 → M4 历史库 / 武器地图对比 / CSV → 车队同场统计 → `.data` 落盘与部署材料。

**明确暂缓**：完整 OAuth / 多租户、MySQL 替换 `.data`、Redis 多实例、非 api-assets 贴图来源、逐房间密室、移动端专项、四平台同等验收（优先保证 steam）。

下一专题（AI 可选增强 / 官方地图底图 / 载具图层）规划见本地 `docs/06-缺口补充-AI与地图.md`（`docs/` 默认 gitignore）。

变更记录见 [`CHANGELOG.md`](CHANGELOG.md)。

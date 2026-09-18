# PUBG 复盘分析台 — 后端 API、表结构与复盘规则设计

> 版本：v0.1  
> 配合文档：`01-PRD-页面线框.md`  
> 技术栈：不定；本文只定契约、模型与规则，实现可用任意语言

---

## 1. 设计目标与约束

### 1.1 目标

- 对前端提供稳定、聚合后的 BFF API（隐藏 PUBG 原始 JSON-API 细节）
- 突破「每次直打官方」：缓存 + 持久化 + 异步遥测解析
- 支撑复盘报告：规则可配置、结果可解释、可重算

### 1.2 官方 API 硬约束

| 约束                             | 设计对策                     |
|--------------------------------|--------------------------|
| Match / Telemetry 约 **14 天**保留 | 查询/收藏即入库；telemetry 落对象存储 |
| Rate Limit                     | 网关限流、Redis 缓存、队列退避、用户级冷却 |
| API Key 保密                     | 仅服务端持有；前端只调自家 BFF        |
| Opt-in                         | 仅处理用户主动搜索/收藏的玩家          |
| Shard / Platform               | 统一内部枚举，对外暴露 `platform`   |

### 1.3 推荐调用链

```
Client
  → BFF (Auth / RateLimit / Validate)
    → Application Services
      → Cache (Redis)
      → DB
      → PUBG Official API (miss 时)
      → Queue (telemetry / report / sync)
```

---

## 2. 统一响应约定

### 2.1 成功

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "meta": {
    "cached": true,
    "syncedAt": "2026-08-27T10:00:00Z"
  }
}
```

### 2.2 失败

```json
{
  "code": 40401,
  "message": "玩家不存在",
  "data": null,
  "meta": {
    "retryAfterSec": null
  }
}
```

### 2.3 错误码（建议）

| code  | 含义             |
|-------|----------------|
| 0     | 成功             |
| 40001 | 参数错误（平台/昵称）    |
| 40401 | 玩家不存在          |
| 40402 | 对局不存在或已过期且未入库  |
| 42901 | 官方或本地限流        |
| 40901 | 刷新冷却中          |
| 50001 | 上游 PUBG API 异常 |
| 50002 | 遥测解析失败         |
| 50003 | 报告生成失败         |

---

## 3. 对外 BFF API

基础前缀：`/api/v1`

---

### 3.1 搜索玩家

`GET /players/search`

| Query    | 类型     | 必填 | 说明                   |
|----------|--------|----|----------------------|
| platform | string | 是  | steam/kakao/xbox/psn |
| name     | string | 是  | 游戏昵称                 |

**Response `data`**

```json
{
  "accountId": "account.xxxxx",
  "name": "PlayerName",
  "platform": "steam",
  "shard": "steam"
}
```

**上游**：`GET https://api.pubg.com/shards/{shard}/players?filter[playerNames]=...`

**缓存**：`player:name:{platform}:{lowerName}` → 24h（accountId 映射较稳；改名另表）

---

### 3.2 玩家概览

`GET /players/{accountId}/overview`

| Query    | 类型      | 必填 | 说明                     |
|----------|---------|----|------------------------|
| seasonId | string  | 否  | 默认当前赛季；`lifetime` 表示生涯 |
| gameMode | string  | 否  | 不传则返回各模式摘要 + 默认模式明细    |
| ranked   | boolean | 否  | true 时拉排位统计（若赛季支持）     |

**Response `data`（示意）**

```json
{
  "player": {
    "accountId": "account.xxx",
    "name": "PlayerName",
    "platform": "steam"
  },
  "season": {
    "seasonId": "division.bro.official.pc-2026-xx",
    "isCurrent": true
  },
  "selectedGameMode": "squad",
  "stats": {
    "tier": "Diamond",
    "subTier": "4",
    "rankPoints": 4230,
    "kd": 1.82,
    "winRate": 0.08,
    "top10Rate": 0.21,
    "avgDamage": 420.5,
    "avgSurvivalTimeSec": 980,
    "roundsPlayed": 128,
    "kills": 310,
    "wins": 10,
    "damageDealt": 53824
  },
  "modeSummaries": [
    { "gameMode": "squad", "roundsPlayed": 80, "kd": 1.9 },
    { "gameMode": "squad-fpp", "roundsPlayed": 20, "kd": 1.4 }
  ],
  "weaknessTags": [
    { "code": "mid_third_party", "label": "中期第三人", "count": 7 },
    { "code": "hot_drop", "label": "落点过热", "count": 5 }
  ],
  "trend": {
    "granularity": "day",
    "points": [
      { "date": "2026-08-20", "kd": 1.5, "avgDamage": 380, "avgRank": 28.2 }
    ]
  },
  "recentMatches": [
    {
      "matchId": "xxx",
      "playedAt": "2026-08-26T13:03:00Z",
      "mapName": "Baltic_Main",
      "mapLabel": "Erangel",
      "gameMode": "squad",
      "rank": 12,
      "kills": 3,
      "damage": 420,
      "survivalTimeSec": 1102,
      "primaryTag": { "code": "mid_third_party", "label": "中期第三人" }
    }
  ],
  "syncedAt": "2026-08-27T10:00:00Z"
}
```

**聚合逻辑**

1. 读缓存 overview
2. miss → 拉 season/ranked/lifetime + player matches 列表
3. 异步补齐缺失 match 详情
4. weaknessTags / trend 来自本地 `match_report` + `match_participant` 聚合

---

### 3.3 手动刷新玩家

`POST /players/{accountId}/refresh`

- 冷却：建议 60～120 秒（按账号）
- 成功：触发同步任务，返回 `syncedAt` 与 `cooldownSec`
- 失败 `40901`：返回剩余冷却秒数

---

### 3.4 对局列表

`GET /players/{accountId}/matches`

| Query           | 说明                                       |
|-----------------|------------------------------------------|
| page / pageSize | 分页，pageSize 默认 20，最大 50                  |
| mapName         | 可选                                       |
| gameMode        | 可选                                       |
| result          | `win` / `top10` / `other`                |
| tag             | 弱点标签 code                                |
| sort            | `playedAt` / `damage` / `kills` / `rank` |
| order           | `asc` / `desc`                           |

**Response**

```json
{
  "items": [ { "...": "同 recentMatches 结构，可含更多字段" } ],
  "page": 1,
  "pageSize": 20,
  "total": 32
}
```

**数据来源优先级**：本地 DB（含历史同步）→ 不足时补官方近 14 天列表。

---

### 3.5 对局详情

`GET /matches/{matchId}`

| Query     | 说明          |
|-----------|-------------|
| accountId | 可选，用于高亮视角玩家 |

**Response `data`**

```json
{
  "match": {
    "matchId": "xxx",
    "shard": "steam",
    "mapName": "Baltic_Main",
    "mapLabel": "Erangel",
    "gameMode": "squad",
    "playedAt": "2026-08-26T13:03:00Z",
    "durationSec": 1930,
    "isCustomMatch": false
  },
  "focusAccountId": "account.xxx",
  "rosters": [
    {
      "rosterId": "r1",
      "teamRank": 4,
      "participants": [
        {
          "accountId": "account.xxx",
          "name": "PlayerName",
          "rank": 12,
          "kills": 3,
          "assists": 1,
          "damageDealt": 420,
          "survivalTimeSec": 1102,
          "dbnos": 1,
          "revives": 0,
          "heals": 4,
          "boosts": 3,
          "rideDistance": 1200,
          "walkDistance": 2000,
          "timeSurvived": 1102,
          "winPlace": 12
        }
      ]
    }
  ],
  "telemetryStatus": "ready",
  "reportStatus": "ready"
}
```

`telemetryStatus`：`none` | `pending` | `ready` | `failed` | `expired`  
`reportStatus`：`pending` | `ready` | `failed`

---

### 3.6 对局复盘报告

`GET /matches/{matchId}/report?accountId=...`

**Response**

```json
{
  "matchId": "xxx",
  "accountId": "account.xxx",
  "primaryTag": {
    "code": "mid_third_party",
    "label": "中期被第三人",
    "confidence": "high"
  },
  "tags": [
    { "code": "mid_third_party", "label": "中期被第三人", "confidence": "high" },
    { "code": "late_rotate", "label": "收边偏晚", "confidence": "medium" }
  ],
  "summaryLines": [
    "存活至 Top15，约 12 分处侧翼交火阵亡",
    "本场伤害 420，约 70% 来自中距离步枪",
    "死亡点距蓝圈边缘约 80m，收边偏晚"
  ],
  "suggestions": [
    "中期减少无掩体刚枪，优先找掩体再输出",
    "提前 1 个阶段向边路转移"
  ],
  "metrics": {
    "rank": 12,
    "kills": 3,
    "assists": 1,
    "damage": 420,
    "survivalTimeSec": 1102,
    "phaseAtDeath": 3,
    "enemiesNearbyAtDeath": 3,
    "distanceToSafeZoneEdgeM": 80,
    "teammateDistanceM": 120
  },
  "ruleVersion": "1.0.0",
  "generatedAt": "2026-08-26T13:10:00Z"
}
```

支持 `POST /matches/{matchId}/report/rebuild?accountId=...` 管理端/调试重算。

---

### 3.7 遥测事件流（回放用精简数据）

`GET /matches/{matchId}/telemetry/events`

| Query     | 说明                                                 |
|-----------|----------------------------------------------------|
| types     | 逗号分隔：`position,kill,knock,revive,carePackage,zone` |
| accountId | 可选，优先返回相关实体                                        |
| sampleHz  | 轨迹采样，默认 1（每秒 1 点），可选 0.5                           |

**Response（示意）**

```json
{
  "matchId": "xxx",
  "durationSec": 1930,
  "mapName": "Baltic_Main",
  "status": "ready",
  "players": [
    { "accountId": "account.xxx", "name": "PlayerName", "teamId": 4 }
  ],
  "zones": [
    { "t": 0, "radius": 600000, "x": 0, "y": 0, "type": "safe" }
  ],
  "positions": [
    { "t": 120, "accountId": "account.xxx", "x": 1000, "y": 2000, "z": 0 }
  ],
  "events": [
    {
      "t": 273,
      "type": "kill",
      "attackerId": "account.xxx",
      "victimId": "account.yyy",
      "weaponId": "WeapHK416_C",
      "damageReason": "HeadShot"
    }
  ]
}
```

**禁止**把原始 telemetry JSON 直接暴露给浏览器。

---

### 3.8 触发遥测解析

`POST /matches/{matchId}/telemetry/parse`

- 幂等：已 `ready` 直接返回
- 入队解析，返回 `pending`

---

### 3.9 玩家分析聚合

`GET /players/{accountId}/analysis`

| Query    | 说明                    |
|----------|-----------------------|
| range    | `14d` / `20m`（近 20 场） |
| gameMode | 可选                    |

**Response**

```json
{
  "range": "20m",
  "radar": {
    "survival": 62,
    "aim": 71,
    "landing": 48,
    "endgame": 55,
    "teamplay": 60
  },
  "topIssues": [
    { "code": "mid_third_party", "label": "中期第三人", "count": 7, "matchIds": ["..."] }
  ],
  "suggestions": [
    "中期优先贴边转点，避免平原无掩体刚枪"
  ]
}
```

---

### 3.10 收藏

```
GET    /favorites
POST   /favorites/{accountId}
DELETE /favorites/{accountId}
POST   /favorites/refresh   // 批量刷新（强冷却）
```

未登录可用设备 ID / 本地收藏；登录后服务端持久化。

---

### 3.11 赛季列表（辅助）

`GET /meta/seasons?platform=steam`

用于赛季切换下拉。

---

## 4. 对内任务与服务职责

| 服务               | 职责                   |
|------------------|----------------------|
| PlayerService    | 搜索、资料、赛季统计拉取与缓存      |
| MatchService     | 对局列表/详情、入库、去重        |
| TelemetryService | 下载、压缩存储、解析为事件模型      |
| AnalysisService  | 单场报告、玩家级聚合诊断         |
| SyncJob          | 收藏玩家定时增量同步           |
| PubgClient       | 官方 API 封装、重试、限流、gzip |

### 4.1 同步时序（搜索命中后）

```
search player
  → upsert player
  → get season/lifetime stats → cache
  → get recent match ids (≤32 / 14d)
  → enqueue fetch match details (missing only)
  → for each match with focus account:
        enqueue build report (match stats only, P0)
        optionally enqueue telemetry parse (P1)
```

### 4.2 缓存策略

| Key                                           | TTL           | 说明            |
|-----------------------------------------------|---------------|---------------|
| `player:name:{platform}:{name}`               | 24h           | 名 → accountId |
| `player:overview:{accountId}:{season}:{mode}` | 5～15min       | 概览            |
| `match:{matchId}`                             | 7～30d 或永久     | 对局几乎不变        |
| `report:{matchId}:{accountId}`                | 永久（规则版本变更可失效） |               |
| `telemetry:events:{matchId}`                  | 永久（存储侧）       | Redis 可只放热点   |

刷新接口强制 bypass 短 TTL 缓存。

---

## 5. 数据库表结构

> 以 MySQL 8 为例；PostgreSQL 同理。JSON 字段可用 `JSON` 类型。

### 5.1 ER 关系（逻辑）

```
player 1──* player_name_history
player 1──* match_participant *──1 match
match 1──0..1 telemetry_asset
match 1──* match_report（按 accountId）
user_account 1──* user_favorite *──1 player
```

---

### 5.2 `player`

| 字段                      | 类型             | 说明               |
|-------------------------|----------------|------------------|
| id                      | BIGINT PK      | 自增               |
| account_id              | VARCHAR(64) UK | PUBG account.xxx |
| platform                | VARCHAR(16)    | steam/kakao/...  |
| shard                   | VARCHAR(32)    | 请求用 shard        |
| name                    | VARCHAR(64)    | 当前昵称             |
| name_lower              | VARCHAR(64)    | 检索辅助             |
| last_synced_at          | DATETIME       | 上次成功同步           |
| created_at / updated_at | DATETIME       |                  |

索引：`uk_account_id`；`idx_platform_name_lower`

---

### 5.3 `player_name_history`

| 字段          | 类型          | 说明      |
|-------------|-------------|---------|
| id          | BIGINT PK   |         |
| account_id  | VARCHAR(64) |         |
| name        | VARCHAR(64) |         |
| observed_at | DATETIME    | 首次观察到该名 |

索引：`idx_account_id`；`idx_name`

---

### 5.4 `season_stats_snapshot`

用于概览加速与历史对比（可选但推荐）。

| 字段         | 类型           | 说明      |
|------------|--------------|---------|
| id         | BIGINT PK    |         |
| account_id | VARCHAR(64)  |         |
| season_id  | VARCHAR(128) |         |
| game_mode  | VARCHAR(32)  |         |
| ranked     | TINYINT      | 0/1     |
| stats_json | JSON         | 标准化后的统计 |
| raw_hash   | CHAR(40)     | 变更检测    |
| fetched_at | DATETIME     |         |

UK：`(account_id, season_id, game_mode, ranked)`

---

### 5.5 `match`

| 字段           | 类型             | 说明         |
|--------------|----------------|------------|
| id           | BIGINT PK      |            |
| match_id     | VARCHAR(64) UK | 官方 ID      |
| shard        | VARCHAR(32)    |            |
| map_name     | VARCHAR(64)    | 原始 mapName |
| game_mode    | VARCHAR(32)    |            |
| played_at    | DATETIME       |            |
| duration_sec | INT            |            |
| is_custom    | TINYINT        |            |
| player_count | INT            |            |
| raw_json_ref | VARCHAR(256)   | 对象存储路径或空   |
| created_at   | DATETIME       |            |

索引：`idx_played_at`；`idx_map_mode`

---

### 5.6 `match_participant`

| 字段                            | 类型            | 说明       |
|-------------------------------|---------------|----------|
| id                            | BIGINT PK     |          |
| match_id                      | VARCHAR(64)   |          |
| account_id                    | VARCHAR(64)   | 可能为空（稀有） |
| name                          | VARCHAR(64)   |          |
| roster_id                     | VARCHAR(64)   |          |
| team_id                       | INT           | 可选       |
| team_rank                     | INT           |          |
| win_place                     | INT           | 个人/队伍排名  |
| kills                         | INT           |          |
| assists                       | INT           |          |
| damage_dealt                  | DECIMAL(10,2) |          |
| dbnos                         | INT           |          |
| revives                       | INT           |          |
| heals / boosts                | INT           |          |
| survival_time_sec             | INT           |          |
| ride_distance / walk_distance | DECIMAL(12,2) |          |
| longest_kill                  | DECIMAL(10,2) |          |
| headshot_kills                | INT           |          |
| weapons_json                  | JSON          | 若详情可解析   |
| stats_json                    | JSON          | 其余字段兜底   |

UK：`(match_id, account_id)`（account 空时用 name 降级策略需谨慎）  
索引：`idx_account_played` → 需联表 match.played_at，或冗余 `played_at`

**推荐冗余**：`played_at`、`map_name`、`game_mode` 到参与者表，优化列表查询。

---

### 5.7 `telemetry_asset`

| 字段                 | 类型             | 说明                           |
|--------------------|----------------|------------------------------|
| id                 | BIGINT PK      |                              |
| match_id           | VARCHAR(64) UK |                              |
| status             | VARCHAR(16)    | pending/ready/failed/expired |
| source_url         | VARCHAR(512)   | 官方 telemetry URL（可空）         |
| storage_url        | VARCHAR(512)   | 自有对象存储                       |
| events_url         | VARCHAR(512)   | 精简事件文件路径                     |
| error_message      | VARCHAR(512)   |                              |
| parsed_at          | DATETIME       |                              |
| rule_or_parser_ver | VARCHAR(32)    | 解析器版本                        |

---

### 5.8 `match_report`

| 字段               | 类型          | 说明              |
|------------------|-------------|-----------------|
| id               | BIGINT PK   |                 |
| match_id         | VARCHAR(64) |                 |
| account_id       | VARCHAR(64) |                 |
| primary_tag      | VARCHAR(64) |                 |
| tags_json        | JSON        |                 |
| summary_json     | JSON        | string[]        |
| suggestions_json | JSON        | string[]        |
| metrics_json     | JSON        |                 |
| confidence       | VARCHAR(16) | high/medium/low |
| rule_version     | VARCHAR(32) |                 |
| generated_at     | DATETIME    |                 |

UK：`(match_id, account_id, rule_version)` 或仅 `(match_id, account_id)` + 版本字段覆盖更新。

---

### 5.9 `user_account` / `user_favorite`

`user_account`：按你们账号体系即可（可先 device_id）。

`user_favorite`

| 字段           | 类型          |
|--------------|-------------|
| id           | BIGINT PK   |
| user_id      | BIGINT      |
| account_id   | VARCHAR(64) |
| created_at   | DATETIME    |
| last_sync_at | DATETIME    |

UK：`(user_id, account_id)`

---

### 5.10 `api_sync_log`（可选）

记录上游调用、耗时、状态码，便于排查限流。

---

## 6. 与官方端点映射

| 我方能力 | 官方端点                                              |
|------|---------------------------------------------------|
| 搜索   | `/shards/{shard}/players?filter[playerNames]=`    |
| 赛季统计 | `/shards/{shard}/players/{id}/seasons/{seasonId}` |
| 排位统计 | `.../seasons/{seasonId}/ranked`                   |
| 生涯   | `.../seasons/lifetime`                            |
| 对局详情 | `/shards/{shard}/matches/{matchId}`               |
| 遥测   | match included 中的 telemetry URL（资产下载）             |
| 赛季列表 | `/shards/{shard}/seasons`                         |
| 武器精通 | Mastery 端点（P2）                                    |

平台 shard 示例：PC Steam → `steam`；Kakao → `kakao`；主机按文档用 `xbox` / `psn` / `console`。

---

## 7. 复盘规则引擎（初版 v1.0.0）

### 7.1 设计原则

- **先规则后模型**：结果必须可解释
- **单场报告**用 match +（可选）telemetry
- **无 telemetry** 时仍可出降级报告（仅 participant 统计）
- 每条标签带 `confidence`
- `rule_version` 变更可批量重算

### 7.2 输入特征

#### A. 仅 Match 统计（P0 必有）

| 特征                          | 来源          |
|-----------------------------|-------------|
| winPlace / teamRank         | participant |
| kills, assists, damageDealt | participant |
| survivalTimeSec             | participant |
| dbnos, revives              | participant |
| walk/ride distance          | participant |
| longestKill, headshotKills  | participant |
| mapName, gameMode, duration | match       |

派生：

- `damagePerKill`、`kdProxy`（kills / max(1, deaths近似)）
- `earlyDeath`：survivalTimeSec < duration * 0.25 或 winPlace > 50
- `highDamageLowKill`：伤害高但击杀低
- `carryScore`：damage 与队伍伤害占比（需同 roster）

#### B. Telemetry 增强（P1）

| 特征                      | 说明                  |
|-------------------------|---------------------|
| phaseAtDeath            | 死亡时所在安全区阶段          |
| distanceToSafeZoneEdgeM | 死亡点到蓝圈边距离           |
| enemiesNearbyAtDeath    | 死亡前 N 秒半径内敌人数       |
| attackerCountInWindow   | 致死窗口内攻击者数           |
| landLocationCluster     | 落点是否热门区（需地图 POI 配置） 
| throwablesUsedEndgame   | 决赛圈投掷使用次数           |
| weaponDamageShare       | 武器伤害占比              |
| teammateDistanceAtDeath | 阵亡时与最近队友距离          |

---

### 7.3 标签字典

| code             | 中文标签    | 典型含义           |
|------------------|---------|----------------|
| hot_drop         | 落点过热    | 开局过早混战死亡       |
| early_exit       | 前期出局    | 前 25% 时长死亡且排名差 |
| mid_third_party  | 中期第三人   | 中期多敌人交火死亡      |
| mid_overfight    | 中期硬刚    | 中期伤害高但仍翻车      |
| late_rotate      | 收边偏晚    | 死亡点贴圈外/追圈      |
| endgame_nades    | 决赛圈投掷不足 | 决赛阶段零投掷且近战死亡   |
| aim_inconsistent | 枪感不稳    | 伤害尚可但击杀转化低     |
| low_damage       | 输出不足    | 存活久但伤害很低       |
| isolated_death   | 脱离队伍    | 阵亡时队友过远        |
| vehicle_risk     | 载具相关阵亡  | （遥测）载具中被打掉     |
| good_game        | 优质对局    | 吃鸡或高排高伤（正向）    |

---

### 7.4 判定规则（伪代码级）

```text
# 时间阶段（按存活时长占比近似；有遥测则用 zone phase）
phase = early  if t < 0.25*duration
      = mid    if t < 0.70*duration
      = late   else

# 1) 落点过热 / 前期出局
IF phase==early AND winPlace >= 40 AND kills <= 1:
  IF telemetry.landInHotPOI OR (walkDistance < 200 AND survivalTime < 180):
    tag hot_drop confidence=high
  ELSE:
    tag early_exit confidence=medium

# 2) 中期第三人
IF phase==mid AND telemetry.enemiesNearbyAtDeath >= 3
   AND telemetry.attackerCountInWindow >= 2:
  tag mid_third_party confidence=high
ELSE IF phase==mid AND damageDealt >= 300 AND winPlace > 10
   AND kills <= 2 AND NO telemetry:
  tag mid_overfight confidence=low   # 降级猜测

# 3) 收边偏晚
IF telemetry.distanceToSafeZoneEdgeM != null:
  IF distanceToSafeZoneEdgeM < 0 OR (outside blue) OR (edge < 100 AND moving_inward_late):
    tag late_rotate confidence=high
ELSE IF phase==late AND rideDistance low AND winPlace between 8..25:
  tag late_rotate confidence=low

# 4) 决赛圈投掷不足
IF phase==late AND winPlace <= 10 AND telemetry.throwablesUsedEndgame == 0
   AND death_by_close_range:
  tag endgame_nades confidence=medium

# 5) 输出问题
IF survivalTimeSec >= 0.5*duration AND damageDealt < 150:
  tag low_damage confidence=high
IF damageDealt >= 400 AND kills <= 1:
  tag aim_inconsistent confidence=medium

# 6) 脱离队伍
IF telemetry.teammateDistanceAtDeath >= 150 AND gameMode in duo/squad:
  tag isolated_death confidence=medium

# 7) 正向
IF winPlace == 1 OR (winPlace <= 3 AND damageDealt >= 500):
  tag good_game confidence=high
```

**主因选择**

1. 优先 high confidence 负向标签
2. 同级按业务权重：`hot_drop > mid_third_party > late_rotate > endgame_nades > aim_inconsistent > low_damage`
3. 若只有 `good_game`，主因可为正向

---

### 7.5 文案模板

```text
summary:
- "存活至 Top{winPlace}，约 {mm:ss} 处{deathContext}阵亡"
- "本场伤害 {damage}，{weaponShareText}"
- "死亡点距蓝圈边缘约 {edge}m，{rotateComment}"

suggestions map:
  hot_drop        → "改跳次热点或绕点，前 3 分钟以拾取为主少求打"
  mid_third_party → "中期交火先听枪位，避免平原无掩体延战"
  late_rotate     → "提前 1 个阶段向边路转移，减少追圈"
  endgame_nades   → "决赛圈至少保留 2 颗投掷物再找身位"
  low_damage      → "增加有效交战，避免无效绕图"
  isolated_death  → "转点与队友保持可视距离，少独自探点"
  aim_inconsistent→ "优先保证枪枪有效伤害，减少远距离无效消耗"
```

死亡上下文 `deathContext`：有遥测用「侧翼交火 / 被多人集火 / 圈外倒地」等；无则省略。

---

### 7.6 玩家级雷达评分（分析 Tab）

对近 N 场标签与指标做归一（0～100）：

| 维度       | 粗算                                      |
|----------|-----------------------------------------|
| survival | 平均排名、Top10 率、存活时长                       |
| aim      | 场均伤害、击杀、爆头率（有则）                         |
| landing  | `hot_drop` 频次越低分越高                      |
| endgame  | 进入后期比例 + `endgame_nades/late_rotate` 负向 |
| teamplay | 救援、助攻、`isolated_death` 负向               |

---

### 7.7 无遥测降级策略

| 能力          | 降级                                                         |
|-------------|------------------------------------------------------------|
| 主因标签        | 仅 early_exit / low_damage / aim_inconsistent / good_game 等 |
| summary     | 去掉圈距、附近敌人数                                                 |
| suggestions | 使用通用建议模板                                                   |
| confidence  | 多为 low/medium                                              |
| UI          | 报告标注「基于基础战绩的初判；加载回放后可增强」                                   |

Match 入库后 **立即** 出 P0 报告；telemetry ready 后 **重算** 覆盖为增强版（同 rule_version 下升级 confidence）。

---

## 8. 限流与安全

### 8.1 网关

- IP / 用户维度 QPS
- 搜索接口更严（防刷官方配额）
- `refresh` 账号级冷却

### 8.2 PubgClient

- 全局 token bucket
- 429 / 5xx 指数退避
- Accept: `application/vnd.api+json`，启用 gzip

### 8.3 安全

- API Key 仅环境变量/密钥管理
- 不把官方原始错误细节全量透出
- 对象存储 telemetry 私有读，BFF 鉴权后签名 URL 或流式转发

---

## 9. 任务队列建议

| Topic           | Payload            | 并发建议        |
|-----------------|--------------------|-------------|
| match.fetch     | matchId, shard     | 中           |
| telemetry.parse | matchId            | 低（CPU/IO 重） |
| report.build    | matchId, accountId | 中           |
| player.sync     | accountId          | 按收藏量        |

失败重试 3～5 次；telemetry 失败标记 `failed`，允许手动重试。

---

## 10. 里程碑与接口交付对照

| 里程碑 | API                                              | 表                                                       |
|-----|--------------------------------------------------|---------------------------------------------------------|
| M1  | search, overview, matches, match detail, refresh | player, match, match_participant, season_stats_snapshot |
| M2  | report, analysis, favorites                      | match_report, user_favorite                             |
| M3  | telemetry parse/events                           | telemetry_asset + 对象存储                                  |
| M4  | 武器/地图聚合、对比、分享                                    | 聚合查询或物化表                                                |

---

## 11. 开发自检清单

- [ ] 前端永不持有 PUBG API Key
- [ ] 同一 matchId 不重复打官方详情
- [ ] 报告必有 rule_version
- [ ] 14 天过期有明确错误码与文案
- [ ] telemetry 精简事件与原始文件分离
- [ ] 收藏同步不会打满 Rate Limit（打散调度）
- [ ] 改名后 accountId 仍能追踪（name_history）

---

## 12. 附录：地图名展示映射（摘录）

| mapName（示例）     | 展示名     |
|-----------------|---------|
| Baltic_Main     | Erangel |
| Desert_Main     | Miramar |
| Savage_Main     | Sanhok  |
| DihorOtok_Main  | Vikendi |
| Summerland_Main | Karakin |
| Tiger_Main      | Taego   |
| Kiki_Main       | Deston  |
| Chimera_Main    | Paramo  |
| Neon_Main       | Rondo   |

具体以当前赛季官方返回值为准，建议做成可配置字典。

---

## 13. 附录：本地目录约定（建议）

```
docs/
  00-待办清单.md               ← 进度与执行顺序
  01-PRD-页面线框.md          ← 已交付
  02-API与表结构设计.md        ← 本文
  （后续可增）
  03-复盘规则测试用例.md
  04-Telemetry解析说明.md
```

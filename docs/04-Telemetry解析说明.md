# PUBG 复盘分析台 — Telemetry 解析说明

> 版本：对应 `parserVersion = 1.1.0`（含枪线）  
> 更新日期：2026-08-28  
> 代码：`pubg-review/src/lib/telemetry/`

---

## 1. 目标与约束

- **浏览器绝不直拉**官方 `telemetry-cdn.pubg.com` 原始大 JSON。
- 服务端下载 → 本地落盘（模拟对象存储）→ 解析为精简事件 → 仅通过 BFF 返回精简结构。
- 开发阶段存储根目录：`.data/telemetry/{matchId}/`（已加入 `.gitignore`）。

---

## 2. 官方链路

1. `GET /shards/{platform}/matches/{matchId}`（需 API Key）
2. `data.relationships.assets` → `included` 中 `type=asset`、`name=telemetry`
3. `attributes.URL` → CDN 直链（**通常不计 rate limit，下载可不带 Bearer**）
4. 响应为 **JSON 数组**，元素为事件对象，含 `_T`（类型）、`_D`（ISO 时间）

约 **14 天**后 match / telemetry 可能 404，状态记为 `expired`。

---

## 3. 本地存储布局

```text
.data/telemetry/{matchId}/
  meta.json      # 状态机 + sourceUrl + 错误信息
  raw.json       # 官方原始事件数组（私有，不对外）
  events.json    # 精简解析结果（ParsedTelemetry）
```

### `meta.status`

| 状态 | 含义 |
|------|------|
| `none` | 无资产或尚未解析 |
| `pending` | 下载/解析进行中 |
| `ready` | `events.json` 可用 |
| `failed` | 解析或下载失败（可重试） |
| `expired` | 官方 404 / 过期 |

---

## 4. 事件映射（官方 `_T` → 精简）

| 官方事件 | 精简 type | 说明 |
|----------|-----------|------|
| `LogPlayerKillV2` / `LogPlayerKill` | `kill` | killer/finisher → attackerId；victim；武器取 damageCauserName；并写入枪线 |
| `LogPlayerMakeGroggy` | `knock` | 倒地；并写入枪线 |
| `LogPlayerTakeDamage` | → `gunlines[]` | 仅 `Damage_Gun` / 近战 / 爆炸 / 燃烧瓶；攻击者→受害者位置 |
| `LogPlayerRevive` | `revive` | reviver / victim |
| `LogCarePackageLand` / `Spawn` | `carePackage` | 空投坐标 |
| `LogGameStatePeriodic` | → `zones[]` | safetyZone / poisonGasWarning |
| `LogPlayerPosition` | → `positions[]` | 按玩家采样 |
| `LogMatchStart` / `LogPlayerCreate` | → `players[]` | 名单与 teamId |

未映射的大量拾取/`LogPlayerAttack`（仅开火无落点）等事件在 MVP 中丢弃，以控制体积。

### 枪线 `gunlines[]`

- 端点：攻击者 `location` → 受害者 `location`（厘米坐标）
- `kind`：`kill` | `knock` | `damage`
- **限流**：`kill`/`knock` 全保留；`damage` 每秒最多 `GUNLINE_DAMAGE_PER_SEC`（默认 8）条
- 过滤：自伤、AI、两端重合、非战斗伤害（蓝圈/坠落等）
- 回放：图层「枪线」；播放时仅绘制当前时刻前约 2.5s 内线段并淡出；无数据时开关禁用
- 旧版 `events.json`（无 `gunlines` 或 `parserVersion` 落后）在再次 parse / 自动加载时会用本地 `raw.json` 重解析

### 时间 `t`（秒）

1. 优先 `elapsedTime`（Position / GameState）
2. 否则 `_D` 相对 `LogMatchStart._D`

---

## 5. 采样策略

| 数据 | 默认 | 说明 |
|------|------|------|
| positions | **1 Hz** | 按 `accountId + floor(t)` 去重；`sampleHz` 可再降采样 |
| zones | ~每 5 秒 | 同 type 分桶，避免 GameState 过密 |
| events | 全量关键事件 | kill/knock/revive/carePackage |
| gunlines | kill/knock 全量 + damage 限流 | 见上节 |

焦点 `accountId` 查询时：队友轨迹全保留，其余玩家约每 5 秒一点；枪线仅保留与该玩家相关的线段。

---

## 6. 精简结构（`events.json` / GET events）

```json
{
  "matchId": "...",
  "mapName": "Baltic_Main",
  "durationSec": 1800,
  "parserVersion": "1.1.0",
  "players": [{ "accountId": "...", "name": "...", "teamId": 4 }],
  "positions": [{ "t": 120, "accountId": "...", "x": 0, "y": 0, "z": 0 }],
  "events": [{ "t": 273, "type": "kill", "attackerId": "...", "victimId": "..." }],
  "zones": [{ "t": 0, "type": "safe", "x": 0, "y": 0, "radius": 600000 }],
  "gunlines": [{ "t": 273, "x1": 0, "y1": 0, "x2": 1, "y2": 1, "attackerId": "...", "victimId": "...", "kind": "kill" }]
}
```

坐标单位：**厘米**；地图边长见 `maps.ts` 的 `mapSizeCm`（Erangel 等 816000）。

---

## 7. BFF API

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/matches/{matchId}/telemetry/parse?platform=` | 幂等触发；已 ready 直接返回 |
| `GET` | `/api/v1/matches/{matchId}/telemetry/events?platform=&accountId=&types=&sampleHz=` | 精简流；默认未 ready 时自动 parse |

`types`：`kill,knock,revive,carePackage,zone`（逗号分隔）。

对局详情 `GET /matches/{matchId}` 增加 `telemetryStatus` / `hasTelemetryAsset`，**不返回**官方 CDN URL。

---

## 8. 假设与降级

| 假设 | 降级 |
|------|------|
| 遥测为 JSON **数组**（非 NDJSON） | 非数组 → `failed`，中文错误 |
| 常规对局有 asset | 无 URL → `none` |
| CDN 404 | `expired` |
| AI / `None` accountId | 跳过进 players |
| 未知地图尺寸 | 默认 816000 cm 归一 |
| 报告增强 | telemetry ready 时自动重算为 `1.1.0-telemetry`；否则降级初判 `1.0.0-no-telemetry` |

---

## 9. 验证步骤（真实对局）

```bash
# 1. 启动
cd pubg-review && npm run dev

# 2. 搜索玩家 → 打开一场对局详情

# 3. 触发解析（也可打开「事件轴/回放」Tab 自动触发）
curl -X POST "http://127.0.0.1:3000/api/v1/matches/{matchId}/telemetry/parse?platform=steam"

# 4. 取精简事件（勿直连 telemetry-cdn）
curl "http://127.0.0.1:3000/api/v1/matches/{matchId}/telemetry/events?platform=steam&types=kill,knock"

# 5. 浏览器：对局页 ?tab=timeline / ?tab=replay
```

成功后本地可见 `.data/telemetry/{matchId}/events.json`。

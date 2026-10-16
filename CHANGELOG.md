# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

未 PUSH / 未打 TAG 前的改动统一记在 `[Unreleased]`，不提前修改 `package.json` 版本号。

## [Unreleased]

### Added

- MCP 友伤工具 `get_match_friendly_fire`：不抽样的伤害明细、击倒、官方击杀归属与终结行为；支持玩家方向筛选、配对/玩家聚合和明细分页
- 缓存与遥测内存离线回归：覆盖容量淘汰、同步互斥、遥测任务队列、流式解析、超限清理和小堆解析验证

### Changed

- `parserVersion` → **1.3.0**（含载具与友伤）；旧 `events.json` 自动升级，优先使用本地 raw 离线解析，不依赖已过期的官方对局

### Fixed

- 遥测下载改为流式写入临时文件、逐事件解析，避免整份原文与完整事件对象同时驻留；下载和校验成功后再替换原文件
- 重型遥测任务全局串行、同场复用，最多等待 8 个任务；超限或失败时清理临时文件并继续处理后续任务
- 对局内存缓存限制为最多 64 场、估算预算 16 MiB，使用 LRU 淘汰并每 60 秒清理过期引用，保留磁盘恢复能力
- 复盘报告命中缓存时跳过完整遥测读取；遥测缺失或损坏时仍可降级生成基础报告
- 同一账号同步执行中拒绝重复触发，任务结束后释放保护；清理对局、历史、昵称与报告写锁的残留引用

## [0.1.1] - 2026-10-16

### Added

- 战队资料：玩家搜索与 MCP 返回 `clanId`，新增战队详情 BFF、缓存与玩家页战队卡片
- 可选 AI 赛季评价：按赛季与模式读取缓存、手动生成或重新生成，复用 AI 脱敏、限流与落盘能力
- 回放队伍列表：展示存活、倒地与淘汰状态，点选任意玩家跟随，并支持 8 倍速播放
- 对局返回链接保留玩家页的赛季、模式、筛选、排序、分页与 Tab 上下文
- 遥测载具解析与回放图层（B1–B3）：`LogVehicleRide/Leave/Destroy` → `vehicles[]`；船/车中文名（`vehicles.ts`）；回放开关「载具」
- 移动端专项方案 A：`viewport` / safe-area、触控目标、玩家/对局 Tab 横滑、积分板小屏卡片化；回放单指拖拽 / 双指捏合 / 滚轮缩放与重置视角（不含底部 Tab 壳）
- 地图中心：`/maps` 目录与 `/maps/[mapId]` 详情；侧栏「地图」入口；`public/maps/*` 底图资源
- 全局侧栏导航壳（`AppShell`）：桌面固定侧栏、小屏抽屉菜单

### Changed

- 赛季选择按平台过滤、中文命名并排序，默认展示近期赛季，可展开历史赛季
- 14 天趋势按上海日历日聚合，保留缺失日期并断开折线，补充坐标刻度、近似 KD 说明与无障碍数据表
- 玩家概览优先展示赛季指标与近况，折叠弱点趋势、AI 评价、战队和缓存详情，优化表格横向滚动
- 搜索平台选择改为原生单选框，完善键盘焦点与高对比度显示
- 独立地图中心与资料页暂停开放，移除导航入口，保留对局回放底图
- ESLint 忽略 `dist/` 打包产物，避免本地打包后重复检查生成代码
- `parserVersion` → **1.2.0**（含载具）；旧 `events.json` 无 `vehicles` 时自动用 raw 重 parse
- 地图名、对局模式等展示文案中文化（UI / 分享 / 回放等统一走标签映射）
- 收藏页「同步近况」结果提示改为单独一行，不再挤在操作按钮列
- 移除未再引用的 `SyncHistoryButton` / `RefreshButton`（已由 `PlayerHeadActions` 承接）
- 文档：移动端专项自暂缓改为方案 A 已完成（`docs/07`、半成品清单、PRD 验收勾选）

## [0.1.0] - 2026-09-18

### Added

- Standalone 打包部署：`output: "standalone"`、`npm run pack` / `pack:archive`、`deploy/pack.mjs`
- Tag 发版：`.github/workflows/release.yml`（`v*` → GitHub Release 上传 standalone tar + sha256）
- CI：`.github/workflows/ci.yml`（main 上 lint + build + pack 冒烟）
- 服务器热更新脚本示例：`deploy/update-from-release.sh.example`（拉 Release、保留 `.data`、PM2 重启）
- 规划文档：`docs/06-缺口补充-AI与地图.md`（可选 LLM、api-assets 底图、载具/船/POI 缺口与迭代）
- 功能缺口总览：`docs/07-功能缺口.md`
- 多 API Key：`PUBG_API_KEYS`（逗号或 JSON 数组）轮询，遇 429 切换
- Remote MCP Tools 扩展至 13 个（直接复用服务层）：
    - `get_player_form` — 近况 formStatus + 异常 anomalies
    - `get_player_analysis` — 近 N 场报告聚合（雷达 / 弱点 / 建议）
    - `get_squad_stats` — 车队同场统计
    - `suggest_squad_mates` — 常一起 Top3 队友建议
    - `get_player_weapons` — 武器 / 战斗聚合（本地历史）
    - `get_player_maps` — 地图聚合（本地历史）
    - `list_seasons` — 赛季列表
    - `list_player_history` — 本地历史库列表
- Linux 裸 Node + PM2 部署材料：`deploy/README.md`、`deploy/ecosystem.config.cjs`、`deploy/nginx.conf.example`
- 环境变量 `MCP_ENABLED`：控制 `/mcp` 开关（`true` / `1` / `on` / `yes` 开启）
- Remote MCP Bearer 鉴权：环境变量 `MCP_TOKEN`；请求头 `Authorization: Bearer <token>`
- 收藏页单人 / 「同步全部」串行写入本地历史库（尊重每人 90s 冷却，可取消）
- 对局事件轴点击跳转 `?tab=replay&t=`；回放按 URL 秒级定位；跟随 + kill/knock 高亮
- 武器 Tab 遥测解析进度（parsedCount/sampleSize）与引导 CTA
- 「同步近况」可选顺带 parse 最近 3 场遥测（默认关）
- 地图 Tab 点击按 `map=` 过滤概览对局；对局页 `tab=weapons` 本场武器表
- 玩家页对局列表：排序（时间/排名/击杀/伤害）+ 分页 + URL `sort`/`page`
- 对比 Tab：近况/弱点并排；收藏/最近搜索快捷填 `vs=`
- 分享页动态 OG 图：`/share/match/{id}/og`；分享卡对齐增强/降级态（ruleVersion/置信度/建议）
- deploy 备份脚本示例与单机 SLA 说明

### Changed

- Remote MCP **默认关闭**；未显式开启时 `/mcp` 返回 404
- `npm start` 固定监听 `0.0.0.0:3000`
- README 重写：按「快速开始 / 功能 / 路由 / 部署 / MCP / API / 数据与缓存 / 限流」重组，去掉半成品 backlog 口吻
- 分析 Tab：样本 &lt; 5 场隐藏假雷达，展示「样本不足」
- docs/04：对齐遥测增强报告 `1.1.0-telemetry` 真实行为（不再写「后续开放」）
- Redis 全面接入标注暂缓；提额材料补齐人工提交勾选说明（不伪造已公网/已提额）

### Security

- 开启 MCP 后强制校验 Bearer Token（未配置 `MCP_TOKEN` → `503`，错误 / 缺失 → `401`）
- 公网部署仍建议配合防火墙限 IP；勿将 Token 写入仓库

[Unreleased]: https://github.com/moon-stack-OAo/pubg-review/compare/v0.1.1...HEAD

[0.1.1]: https://github.com/moon-stack-OAo/pubg-review/releases/tag/v0.1.1

[0.1.0]: https://github.com/moon-stack-OAo/pubg-review/releases/tag/v0.1.0

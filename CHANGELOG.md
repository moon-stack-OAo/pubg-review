# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

未 PUSH / 未打 TAG 前的改动统一记在 `[Unreleased]`，不提前修改 `package.json` 版本号。

## [Unreleased]

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

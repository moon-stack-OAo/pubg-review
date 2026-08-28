# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

未 PUSH / 未打 TAG 前的改动统一记在 `[Unreleased]`，不提前修改 `package.json` 版本号。

## [Unreleased]

### Added

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

### Changed

- Remote MCP **默认关闭**；未显式开启时 `/mcp` 返回 404
- `npm start` 固定监听 `0.0.0.0:3000`
- README：补充生产部署入口、MCP 开关 / Token 说明与完整 Tool 表

### Security

- 开启 MCP 后强制校验 Bearer Token（未配置 `MCP_TOKEN` → `503`，错误 / 缺失 → `401`）
- 公网部署仍建议配合防火墙限 IP；勿将 Token 写入仓库

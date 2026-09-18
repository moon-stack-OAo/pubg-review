# Linux 裸 Node + PM2 部署

适用于 Ubuntu/Debian 等 VPS。本项目依赖进程内缓存与 `.data/` 落盘，**必须单实例**，不要开 PM2 cluster。

两种交付方式：

| 方式 | 适用 | 服务器是否需要完整源码 / `npm ci` |
|------|------|-----------------------------------|
| **A. Standalone 打包（推荐）** | 本机构建后拷贝产物 | **否**，只需 Node 20+ 跑 `server.js` |
| **B. 源码构建** | 服务器上 git pull 再 build | 是 |

---

## A. Standalone 打包部署（推荐）

### A.1 本机打包

```bash
npm ci
npm run build
npm run pack              # 输出 dist/pubg-review/
# 或同时打压缩包：
npm run pack:archive      # 另生成 dist/pubg-review-standalone.tar.gz
```

产物目录需含：`server.js`、`.next/static`、`public/`、`.data/`（空目录占位）。**不要**把本机真实 Key 打进包。

### A.2 上传到服务器

```bash
# 示例：rsync 目录
rsync -avz --delete dist/pubg-review/ user@host:/opt/pubg-review/

# 或上传 tar 后解压
scp dist/pubg-review-standalone.tar.gz user@host:/tmp/
ssh user@host 'sudo mkdir -p /opt && sudo tar -C /opt -xzf /tmp/pubg-review-standalone.tar.gz && sudo chown -R "$USER":"$USER" /opt/pubg-review'
```

### A.3 环境变量与启动

```bash
cd /opt/pubg-review
cat > .env.production <<'EOF'
PUBG_API_KEY=你的密钥
# PUBG_API_KEYS=key1,key2,key3
RATE_LIMIT_RPM=30
TRUST_PROXY=true
# MCP_ENABLED=true
# MCP_TOKEN=请换成足够长的随机串
EOF

mkdir -p .data
export HOSTNAME=0.0.0.0 PORT=3000
# 直接跑：
node server.js

# 或 PM2（单实例）：
HOSTNAME=0.0.0.0 PORT=3000 PUBG_API_KEY=你的密钥 pm2 start server.js --name pubg-review
# 若带上仓库里的配置文件：
# pm2 start /path/to/deploy/ecosystem.standalone.config.cjs --update-env
pm2 save
pm2 startup
```

更新：本机重新 `build` + `pack`，再 rsync；服务器上需用新目录重新 `pm2 start`（见 §C 回滚说明）。  
**注意**：rsync `--delete` 会删目标多余文件；请把 `.data/` 排除在同步删除之外，或先备份：

```bash
rsync -avz --delete --exclude '.data' --exclude '.env.production' dist/pubg-review/ user@host:/opt/pubg-review/
```

---

## C. Tag → GitHub Release 自动更新（推荐生产）

流程：**本地/CI 打 `v*` tag → Actions 构建 standalone 并上传 Release → 服务器脚本拉包替换**。

### C.1 发版（维护者）

```bash
# 1. main 已合入且工作区干净；CHANGELOG [Unreleased] 已整理（可选）
# 2. 按约定打 annotated tag（示例，勿随意改已发布 tag）
git tag -a v0.2.0 -m "v0.2.0"
git push origin v0.2.0
```

Actions：`.github/workflows/release.yml`（**ubuntu-latest**，产物面向 Linux 服务器）会：

1. `npm ci` → `npm run build` → `npm run pack:archive`
2. 上传资产：
   - `pubg-review-v0.2.0-standalone.tar.gz`
   - `pubg-review-v0.2.0-standalone.sha256`
3. 创建 GitHub Release（同名 tag）

> Windows 本机 `npm run pack` 仅适合本机试跑；**不要**把 Windows 产物丢到 Linux VPS。生产包一律用 tag 触发的 Release。

日常校验：`.github/workflows/ci.yml`（push/PR `main`）跑 lint + build + pack 冒烟，**不发版**。

### C.2 服务器安装更新脚本（一次性）

```bash
sudo mkdir -p /opt/pubg-review-scripts
# 从仓库拷贝示例并改名
sudo cp deploy/update-from-release.sh.example /opt/pubg-review-scripts/update-from-release.sh
sudo chmod +x /opt/pubg-review-scripts/update-from-release.sh
```

私有仓库需可读 Release 的 Token（勿写入脚本正文）：

```bash
# 例如写入仅 root/部署用户可读的环境文件，再 source
export GH_TOKEN=github_pat_xxx
export REPO=moon-stack-OAo/pubg-review   # 可改
export APP_DIR=/opt/pubg-review
```

依赖：`curl`、`tar`、`sha256sum`、`python3`（解析 Release JSON）、`pm2`（可选）。

### C.3 执行更新

```bash
# 最新 Release
sudo -E /opt/pubg-review-scripts/update-from-release.sh

# 指定版本
sudo -E /opt/pubg-review-scripts/update-from-release.sh v0.2.0
```

脚本会：下载并校验 sha256 → 解压到临时目录 → **保留 `.data/` 与 `.env.production`** → 原子切换目录 → `pm2 delete` 后用新 cwd `pm2 start server.js` → 本机冒烟。

上一版保留在 `/opt/pubg-review.prev`，冒烟失败可按脚本提示回滚。

### C.4 可选：webhook / cron

- 简单：发版后 SSH 执行一次更新脚本  
- 或 cron 每小时拉 `latest`（注意非预期自动升版风险）  
- 勿把 `GH_TOKEN` / `PUBG_API_KEY` 提交进仓库

---

## B. 源码构建部署

## 1. 机器准备

```bash
# Node 20+
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo npm i -g pm2
```

建议目录：`/opt/pubg-review`（属主为部署用户）。

## 2. 拉代码与构建

```bash
sudo mkdir -p /opt/pubg-review
sudo chown "$USER":"$USER" /opt/pubg-review
cd /opt/pubg-review
git clone <你的仓库URL> .
npm ci
mkdir -p .data
```

环境变量（任选其一）：

```bash
# A. 项目根目录 .env.production（勿提交 Git）
cat > .env.production <<'EOF'
PUBG_API_KEY=你的密钥
# 多个 Key（可选）：逗号分隔，轮询；遇 429 自动换下一个
# PUBG_API_KEYS=key1,key2,key3
RATE_LIMIT_RPM=30
# Remote MCP 默认关闭；需要时开启并配置 Token：
# MCP_ENABLED=true
# MCP_TOKEN=请换成足够长的随机串
EOF

# B. 或写入 shell / systemd / pm2 环境
export PUBG_API_KEY=你的密钥
export RATE_LIMIT_RPM=30
# export MCP_ENABLED=true
# export MCP_TOKEN=请换成足够长的随机串
```

构建：

```bash
npm run build
```

## 3. 用 PM2 启动

```bash
cd /opt/pubg-review
# 若用 export 注入密钥：
PUBG_API_KEY=你的密钥 RATE_LIMIT_RPM=30 pm2 start deploy/ecosystem.config.cjs --update-env

pm2 status
pm2 logs pubg-review --lines 100
pm2 save
pm2 startup   # 按提示执行生成的 systemd 命令
```

本机冒烟：

```bash
curl -sS "http://127.0.0.1:3000/" -o /dev/null -w "%{http_code}\n"
```

MCP：

```text
https://你的域名/mcp
```

OpenCode 示例（需 Bearer）：

```json
{
  "pubg-review": {
    "type": "remote",
    "url": "https://你的域名/mcp",
    "oauth": false,
    "headers": {
      "Authorization": "Bearer {env:PUBG_REVIEW_MCP_TOKEN}"
    }
  }
}
```

## 4. Nginx + HTTPS

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/pubg-review
sudo nano /etc/nginx/sites-available/pubg-review   # 改 server_name / 证书路径
sudo ln -sf /etc/nginx/sites-available/pubg-review /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Let's Encrypt（示例）
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d review.example.com
```

## 5. 日常更新

```bash
cd /opt/pubg-review
git pull
npm ci
npm run build
pm2 reload pubg-review --update-env
```

## 6. 备份 `.data/`

持久态（对局、报告、历史、telemetry、日志等）落在项目根 `.data/`。进程内缓存与冷却**不**在备份范围内。

### 6.1 脚本示例

可复制可执行风格示例：[`backup-data.sh.example`](./backup-data.sh.example)（改 `APP_DIR` / `BACKUP_DIR` / `KEEP_DAYS` 后使用）。

一行等价示例：

```bash
mkdir -p /var/backups/pubg-review
tar -C /opt/pubg-review -czf "/var/backups/pubg-review/pubg-data-$(date +%F).tgz" .data
# 保留最近 7 天
find /var/backups/pubg-review -maxdepth 1 -type f -name 'pubg-data-*.tgz' -mtime +7 -delete
```

### 6.2 cron

```cron
# 每天 03:15 备份（日志自管）
15 3 * * * /opt/pubg-review/scripts/backup-data.sh >> /var/log/pubg-data-backup.log 2>&1
```

### 6.3 恢复思路

```bash
# 建议先停或 reload 前确认无写入冲突；解压回应用 cwd
cd /opt/pubg-review
# 可选：mv .data .data.bak.$(date +%F)
tar -C /opt/pubg-review -xzf /var/backups/pubg-review/pubg-data-YYYY-MM-DD.tgz
pm2 reload pubg-review --update-env
```

解压后应出现 `/opt/pubg-review/.data/`；内存缓存仍为空，冷读走磁盘即可。

## 7. 磁盘占用与巡检

```bash
# 总览
du -sh /opt/pubg-review/.data
# 分目录（telemetry / history 最易膨胀）
du -sh /opt/pubg-review/.data/* 2>/dev/null | sort -h
```

| 路径                               | 说明                   |
|----------------------------------|----------------------|
| `.data/telemetry/`               | 原始 + 精简事件，单场可很大      |
| `.data/history/`、`name-history/` | 随同步账号增长              |
| `.data/matches/`、`reports/`      | 随查询累积；match 偏长缓存     |
| `.data/logs/api-sync.jsonl`      | 上游调用日志，需定期截断或随备份策略清理 |

建议：每周看一次 `du`；磁盘 >70% 时优先清理过旧 telemetry / 截断 jsonl，**不要**在未备份时直接 `rm -rf .data`。

## 8. SLA / 已知限制

| 项       | 现状                                                          |
|---------|-------------------------------------------------------------|
| 部署形态    | **单实例** fork（PM2 `instances: 1`）；**禁止** `cluster` / 多进程水平扩展 |
| Redis   | **无**；限流、冷却、内存缓存均在进程内                                       |
| 限流 / 冷却 | BFF `RATE_LIMIT_RPM`（默认 30）+ 刷新/同步冷却；重启后窗口与冷却重置             |
| 持久态     | 依赖 `.data/`；重启丢内存缓存，磁盘可恢复                                   |
| 官方限额    | 默认约 **~10 RPM**（Key）；调高本站 `RATE_LIMIT_RPM` **不会**提高官方额度     |
| 可用性预期   | 自托管尽力而为；无多机故障转移、无共享限流                                       |

与提额关系：材料见 `docs/05-API提额申请材料.md`；**未公网 Demo、未在 developer.pubg.com 人工提交前，不得视为已提额**。即便日后获批，仍应保留网关限流与本地缓存。

## 安全注意

- `/mcp` 默认关闭；开启后必须配置 `MCP_TOKEN`，客户端带 `Authorization: Bearer …`
- Token 只防未授权调用，仍建议防火墙限 IP；切勿把 `PUBG_API_KEY` / `MCP_TOKEN` 提交进仓库
- 防火墙只开放 80/443，**不要**把 3000 对公网开放
- 官方 API 约 10 RPM；调高 `RATE_LIMIT_RPM` 不会提高官方限额

## 排障

| 现象         | 排查                                              |
|------------|-------------------------------------------------|
| 启动报未配置 Key | 检查 `.env.production` 或 PM2 环境是否含 `PUBG_API_KEY` |
| 重启后历史/报告丢失 | 确认跑在固定 `cwd`，且 `.data/` 可写、未被清空                 |
| MCP 超时     | Nginx `/mcp` 是否关闭 buffering、超时是否加长              |
| 429 频繁     | 降并发；确认未多实例；检查官方 RPM                             |

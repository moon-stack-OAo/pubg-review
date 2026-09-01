# Linux 裸 Node + PM2 部署

适用于 Ubuntu/Debian 等 VPS。本项目依赖进程内缓存与 `.data/` 落盘，**必须单实例**，不要开 PM2 cluster。

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

| 路径 | 说明 |
|------|------|
| `.data/telemetry/` | 原始 + 精简事件，单场可很大 |
| `.data/history/`、`name-history/` | 随同步账号增长 |
| `.data/matches/`、`reports/` | 随查询累积；match 偏长缓存 |
| `.data/logs/api-sync.jsonl` | 上游调用日志，需定期截断或随备份策略清理 |

建议：每周看一次 `du`；磁盘 >70% 时优先清理过旧 telemetry / 截断 jsonl，**不要**在未备份时直接 `rm -rf .data`。

## 8. SLA / 已知限制

| 项 | 现状 |
|----|------|
| 部署形态 | **单实例** fork（PM2 `instances: 1`）；**禁止** `cluster` / 多进程水平扩展 |
| Redis | **无**；限流、冷却、内存缓存均在进程内 |
| 限流 / 冷却 | BFF `RATE_LIMIT_RPM`（默认 30）+ 刷新/同步冷却；重启后窗口与冷却重置 |
| 持久态 | 依赖 `.data/`；重启丢内存缓存，磁盘可恢复 |
| 官方限额 | 默认约 **~10 RPM**（Key）；调高本站 `RATE_LIMIT_RPM` **不会**提高官方额度 |
| 可用性预期 | 自托管尽力而为；无多机故障转移、无共享限流 |

与提额关系：材料见 `docs/05-API提额申请材料.md`；**未公网 Demo、未在 developer.pubg.com 人工提交前，不得视为已提额**。即便日后获批，仍应保留网关限流与本地缓存。

## 安全注意

- `/mcp` 默认关闭；开启后必须配置 `MCP_TOKEN`，客户端带 `Authorization: Bearer …`
- Token 只防未授权调用，仍建议防火墙限 IP；切勿把 `PUBG_API_KEY` / `MCP_TOKEN` 提交进仓库
- 防火墙只开放 80/443，**不要**把 3000 对公网开放
- 官方 API 约 10 RPM；调高 `RATE_LIMIT_RPM` 不会提高官方限额

## 排障

| 现象 | 排查 |
|------|------|
| 启动报未配置 Key | 检查 `.env.production` 或 PM2 环境是否含 `PUBG_API_KEY` |
| 重启后历史/报告丢失 | 确认跑在固定 `cwd`，且 `.data/` 可写、未被清空 |
| MCP 超时 | Nginx `/mcp` 是否关闭 buffering、超时是否加长 |
| 429 频繁 | 降并发；确认未多实例；检查官方 RPM |

/**
 * PM2 进程配置（Linux 裸 Node 部署）
 *
 * 用法（在项目根目录）：
 *   pm2 start deploy/ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup
 *
 * 注意：必须单实例 fork。内存缓存、限流窗口、`.data/` 落盘均非多进程共享。
 */
module.exports = {
  apps: [
    {
      name: "pubg-review",
      cwd: __dirname + "/..",
      script: "node_modules/next/dist/bin/next",
      args: "start --hostname 0.0.0.0 --port 3000",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      min_uptime: "10s",
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        // 生产密钥请用系统环境变量或 `pm2 start --update-env`，勿写入本文件后提交仓库
        // PUBG_API_KEY: "",
        // RATE_LIMIT_RPM: "30",
        // MCP_ENABLED: "true",
        // MCP_TOKEN: "",
      },
    },
  ],
};

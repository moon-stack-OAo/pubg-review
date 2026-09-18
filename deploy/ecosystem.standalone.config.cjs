/**
 * PM2 配置：Next.js standalone 产物（dist/pubg-review 或解压后的目录）
 *
 * 用法：
 *   cd /opt/pubg-review
 *   pm2 start deploy/ecosystem.standalone.config.cjs --update-env
 *
 * 若部署目录没有本仓库的 deploy/，可把本文件拷到运行目录旁，或直接：
 *   HOSTNAME=0.0.0.0 PORT=3000 pm2 start server.js --name pubg-review
 *
 * 必须单实例 fork；`.data/` 须与 server.js 同 cwd。
 */
module.exports = {
  apps: [
    {
      name: "pubg-review",
      cwd: process.env.PUBG_REVIEW_HOME || process.cwd(),
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      min_uptime: "10s",
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        HOSTNAME: "0.0.0.0",
        PORT: "3000",
      },
    },
  ],
};

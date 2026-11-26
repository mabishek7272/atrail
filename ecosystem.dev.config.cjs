module.exports = {
  apps: [
    {
      name: "atrail-dev-api",
      script: "bash",
      args: "-c 'npx tsx watch src/index.ts'",
      cwd: "/home/ubuntu/atrail-dev/apps/api",
      instances: 1,
      autorestart: true,
      watch: false, // tsx's own --watch handles reload; PM2 watch would double-restart
      max_memory_restart: "512M",
      restart_delay: 3000,
      max_restarts: 20,
      min_uptime: "10s",
      env: {
        NODE_ENV: "development",
      },
      error_file: "/home/ubuntu/.pm2/logs/atrail-dev-api-error.log",
      out_file: "/home/ubuntu/.pm2/logs/atrail-dev-api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
    {
      name: "atrail-dev-web",
      script: "bash",
      args: "-c 'npx next dev -p 3102'",
      cwd: "/home/ubuntu/atrail-dev/apps/web",
      instances: 1,
      autorestart: true,
      watch: false, // next dev has its own fast refresh
      max_memory_restart: "512M",
      restart_delay: 3000,
      max_restarts: 20,
      min_uptime: "10s",
      env: {
        NODE_ENV: "development",
      },
      error_file: "/home/ubuntu/.pm2/logs/atrail-dev-web-error.log",
      out_file: "/home/ubuntu/.pm2/logs/atrail-dev-web-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};

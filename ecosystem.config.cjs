module.exports = {
  apps: [
    {
      name: "matury-backend",
      cwd: "/var/www/matury-online.pl/backend",
      script: "dist/index.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOST: "0.0.0.0",
        ENABLE_CORS: "false", // nginx handles CORS
      },
      // Restart policy
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,
      // Logs
      error_file: "/var/www/matury-online.pl/logs/backend-error.log",
      out_file: "/var/www/matury-online.pl/logs/backend-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      // Memory guard
      max_memory_restart: "512M",
      // Watch (off in prod)
      watch: false,
    },
    {
      name: "matury-frontend",
      cwd: "/var/www/matury-online.pl/frontend",
      script: "dist/server/entry.mjs",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: "4321",
      },
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,
      error_file: "/var/www/matury-online.pl/logs/frontend-error.log",
      out_file: "/var/www/matury-online.pl/logs/frontend-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_memory_restart: "512M",
      watch: false,
    },
  ],
};

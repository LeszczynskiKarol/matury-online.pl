module.exports = {
  apps: [
    {
      name: 'matury-online',
      script: 'dist/app.js',
      instances: 2,
      exec_mode: 'cluster',
      node_args: '--experimental-specifier-resolution=node',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      max_memory_restart: '512M',
      error_file: '/home/ubuntu/logs/matury-online-error.log',
      out_file: '/home/ubuntu/logs/matury-online-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};

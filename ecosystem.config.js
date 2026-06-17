module.exports = {
  apps: [
    {
      name: 'skillswap-backend',
      script: 'src/app.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      }
    }
  ]
};

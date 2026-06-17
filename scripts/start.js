const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const maxAttempts = Number(process.env.STARTUP_DB_ATTEMPTS || 5);
const retryDelayMs = Number(process.env.STARTUP_DB_RETRY_MS || 5000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env
  });

  return result.status === 0;
};

const syncDatabase = async () => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(`[STARTUP] Prisma sync attempt ${attempt}/${maxAttempts}`);

    const generated = run('npx', ['prisma', 'generate']);
    const synced = generated && run('npx', ['prisma', 'db', 'push']);

    if (synced) {
      console.log('[STARTUP] Prisma client and database schema are ready');
      return;
    }

    if (attempt < maxAttempts) {
      console.warn(`[STARTUP] Prisma sync failed. Retrying in ${retryDelayMs}ms...`);
      await sleep(retryDelayMs);
    }
  }

  console.error('[STARTUP] Prisma sync failed after all attempts. Refusing to start API.');
  process.exit(1);
};

(async () => {
  await syncDatabase();
  require('../src/app');
})();

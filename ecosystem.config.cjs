'use strict';

const path = require('path');

/** Корень репозитория (рядом с этим файлом). */
const rootDir = __dirname;

/**
 * Запуск из корня репо: `pm2 start ecosystem.config.cjs`
 *
 * Перед стартом: backend — yarn build; frontend — VITE_API_URL=/api yarn build.
 * Preview проксирует /api на backend (frontend/vite.config.ts — preview.proxy).
 */

module.exports = {
  apps: [
    {
      name: 'lk-daily-api',
      cwd: path.join(rootDir, 'backend'),
      script: 'dist/index.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'lk-daily-web',
      cwd: path.join(rootDir, 'frontend'),
      script: 'node_modules/vite/bin/vite.js',
      args: 'preview --host 0.0.0.0 --port 4173',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};

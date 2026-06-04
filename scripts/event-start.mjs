#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { resetEventProcesses } from './event-reset.mjs';

const shouldReset = process.argv.includes('--reset');
const proxyPort = Number(process.env.EVENT_PROXY_PORT ?? 8787);
const webPort = Number(process.env.EVENT_WEB_PORT ?? 3000);
const serverPort = Number(process.env.EVENT_SERVER_PORT ?? 3001);
const adminUser = process.env.ADMIN_USER ?? 'admin';
const adminPassword = process.env.ADMIN_PASSWORD ?? randomBytes(9).toString('base64url');
const children = [];
let shuttingDown = false;
let publicUrl = '';

if (shouldReset) {
  await resetEventProcesses();
}

const cloudflaredCheck = spawnSync('cloudflared', ['--version'], { encoding: 'utf8' });
if (cloudflaredCheck.error || cloudflaredCheck.status !== 0) {
  console.error('[event-start] cloudflared が見つかりません。先に `brew install cloudflared` を実行してください。');
  process.exit(1);
}

console.log('[event-start] starting local event stack');
console.log(`[event-start] admin user: ${adminUser}`);
console.log(`[event-start] admin password: ${adminPassword}`);

spawnManaged('server', 'pnpm', ['--filter', '@husen/server', 'dev'], {
  HOST: '0.0.0.0',
  PORT: String(serverPort),
  NODE_ENV: 'development',
  CORS_ORIGIN: process.env.EVENT_CORS_ORIGIN ?? '',
});

spawnManaged('web', 'pnpm', [
  '--filter',
  '@husen/web',
  'exec',
  'next',
  'dev',
  '-H',
  '0.0.0.0',
  '-p',
  String(webPort),
], {
  PORT: String(webPort),
  NEXT_PUBLIC_SERVER_URL: 'same-origin',
  ADMIN_USER: adminUser,
  ADMIN_PASSWORD: adminPassword,
});

spawnManaged('proxy', 'node', ['scripts/event-proxy.mjs'], {
  EVENT_PROXY_PORT: String(proxyPort),
  EVENT_WEB_PORT: String(webPort),
  EVENT_SERVER_PORT: String(serverPort),
});

spawnManaged('cloudflared', 'cloudflared', [
  'tunnel',
  '--url',
  `http://localhost:${proxyPort}`,
]);

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.stdin.resume();

function spawnManaged(label, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  children.push(child);
  prefixOutput(label, child.stdout);
  prefixOutput(label, child.stderr);

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`[event-start] ${label} exited (${signal ?? code})`);
    shutdown(code === 0 ? 0 : 1);
  });

  return child;
}

function prefixOutput(label, stream) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      maybePrintPublicUrl(line);
      console.log(`[${label}] ${line}`);
    }
  });
}

function maybePrintPublicUrl(line) {
  if (publicUrl) return;
  const match = line.match(/https:\/\/[-a-z0-9]+\.trycloudflare\.com/i);
  if (!match) return;
  publicUrl = match[0];
  console.log('');
  console.log(`[event-start] public URL: ${publicUrl}`);
  console.log(`[event-start] admin: ${publicUrl}/admin`);
  console.log('[event-start] create a room from the admin screen; the QR will use this public URL.');
  console.log('');
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 500);
}

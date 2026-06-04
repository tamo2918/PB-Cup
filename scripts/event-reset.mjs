#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ports = [
  Number(process.env.EVENT_WEB_PORT ?? 3000),
  Number(process.env.EVENT_SERVER_PORT ?? 3001),
  Number(process.env.EVENT_PROXY_PORT ?? 8787),
];

function execFileP(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { encoding: 'utf8' }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout, stderr });
    });
  });
}

async function pidsListeningOn(port) {
  const result = await execFileP('lsof', [`-tiTCP:${port}`, '-sTCP:LISTEN']);
  return result.stdout
    .split('\n')
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

async function pidsMatching(pattern) {
  const result = await execFileP('ps', ['ax', '-o', 'pid=', '-o', 'command=']);
  const matcher = new RegExp(pattern);
  return result.stdout
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      const match = trimmed.match(/^(\d+)\s+(.+)$/);
      if (!match) return undefined;
      const pid = Number(match[1]);
      const command = match[2] ?? '';
      return Number.isInteger(pid) && pid > 0 && pid !== process.pid && matcher.test(command)
        ? pid
        : undefined;
    })
    .filter((pid) => pid !== undefined);
}

async function parentPidFor(pid) {
  const result = await execFileP('ps', ['-o', 'ppid=', '-p', String(pid)]);
  const ppid = Number(result.stdout.trim());
  return Number.isInteger(ppid) && ppid > 0 ? ppid : undefined;
}

async function commandFor(pid) {
  const result = await execFileP('ps', ['-o', 'command=', '-p', String(pid)]);
  return result.stdout.trim();
}

function shouldStopParent(command) {
  return /(^|[/\s])(pnpm|tsx|next)(\s|$)/.test(command) || command.includes('event-start.mjs');
}

function killPid(pid, signal) {
  try {
    process.kill(pid, signal);
    return String(pid);
  } catch {
    return undefined;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function resetEventProcesses() {
  const killed = new Set();
  const targets = new Set();

  for (const port of ports) {
    for (const pid of await pidsListeningOn(port)) {
      targets.add(pid);
      const parentPid = await parentPidFor(pid);
      if (parentPid && parentPid > 1 && parentPid !== process.pid) {
        const parentCommand = await commandFor(parentPid);
        if (shouldStopParent(parentCommand)) targets.add(parentPid);
      }
    }
  }

  const proxyPort = Number(process.env.EVENT_PROXY_PORT ?? 8787);
  const tunnelPattern = `cloudflared.*tunnel.*--url.*localhost:${proxyPort}`;
  for (const pid of await pidsMatching(tunnelPattern)) {
    targets.add(pid);
  }

  for (const pid of targets) {
    const label = killPid(pid, 'SIGTERM');
    if (label) killed.add(label);
  }

  await wait(700);

  for (const port of ports) {
    for (const pid of await pidsListeningOn(port)) {
      const label = killPid(pid, 'SIGKILL');
      if (label) killed.add(label);
    }
  }

  if (killed.size === 0) {
    console.log('[event-reset] no event processes found');
    return;
  }

  console.log(`[event-reset] stopped ${[...killed].join(', ')}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await resetEventProcesses();
}

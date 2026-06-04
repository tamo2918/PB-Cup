'use client';

import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@husen/shared';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let cached: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (cached) return cached;
  const configuredUrl = process.env.NEXT_PUBLIC_SERVER_URL;
  const url =
    configuredUrl === 'same-origin'
      ? undefined
      : configuredUrl ??
        (typeof window !== 'undefined'
          ? `${window.location.protocol}//${window.location.hostname}:3001`
          : 'http://localhost:3001');

  cached = io(url, {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
  }) as AppSocket;

  return cached;
}

export function disposeSocket() {
  if (cached) {
    cached.removeAllListeners();
    cached.disconnect();
    cached = null;
  }
}

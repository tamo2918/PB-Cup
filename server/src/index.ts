import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@husen/shared';
import { registerHandlers } from './handlers.js';
import { cleanupStaleRooms, listRoomIds } from './rooms.js';

const HOST = process.env.HOST ?? '0.0.0.0';
const PORT = Number(process.env.PORT ?? 3001);
const configuredCorsOrigins = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowAnyOriginInDev =
  configuredCorsOrigins.length === 0 && process.env.NODE_ENV !== 'production';

function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true;
  if (allowAnyOriginInDev) return true;
  return configuredCorsOrigins.includes(origin);
}

const corsOrigin: cors.CorsOptions['origin'] = (origin, callback) => {
  callback(null, isAllowedOrigin(origin));
};

const app = express();
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, rooms: listRoomIds().length, ts: Date.now() });
});

const server = http.createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
  },
});

io.on('connection', (socket) => {
  registerHandlers(io, socket);
});

setInterval(() => {
  const removed = cleanupStaleRooms();
  if (removed > 0) console.log(`[cleanup] removed ${removed} stale rooms`);
}, 10 * 60 * 1000);

server.listen(PORT, HOST, () => {
  console.log(`✨ husen server listening on ${HOST}:${PORT}`);
  console.log(
    `   CORS origins: ${
      allowAnyOriginInDev ? 'any origin (development default)' : configuredCorsOrigins.join(', ')
    }`
  );
});

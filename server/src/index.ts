import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@husen/shared';
import { registerHandlers } from './handlers.js';
import { cleanupStaleRooms, listRoomIds } from './rooms.js';

const PORT = Number(process.env.PORT ?? 3001);
const CORS_ORIGIN = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim());

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, rooms: listRoomIds().length, ts: Date.now() });
});

const server = http.createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: { origin: CORS_ORIGIN, credentials: true },
});

io.on('connection', (socket) => {
  registerHandlers(io, socket);
});

setInterval(() => {
  const removed = cleanupStaleRooms();
  if (removed > 0) console.log(`[cleanup] removed ${removed} stale rooms`);
}, 10 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`✨ husen server listening on :${PORT}`);
  console.log(`   CORS origins: ${CORS_ORIGIN.join(', ')}`);
});

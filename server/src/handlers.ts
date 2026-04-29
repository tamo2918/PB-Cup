import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  QuestionPayload,
  ServerToClientEvents,
} from '@husen/shared';
import {
  createRoom,
  endGame,
  getRanking,
  getRoom,
  getSnapshot,
  joinTeam,
  markRevealResult,
  markOffline,
  nextQuestion,
  revealAnswer,
  scheduleRevealResult,
  startGame,
  submitAnswer,
  touchRoom,
  type InternalRoom,
} from './rooms.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

function emitRoomUpdate(io: IO, room: InternalRoom) {
  io.to(room.roomId).emit('room:updated', getSnapshot(room));
}

function broadcastQuestion(io: IO, room: InternalRoom) {
  const q = room.questions[room.questionIndex];
  if (!q) return;
  const payload: QuestionPayload = {
    questionIndex: room.questionIndex,
    questionText: q.text,
    totalQuestions: room.questions.length,
  };
  io.to(room.roomId).emit('game:question', payload);
}

function requireAdmin(
  socket: IOSocket,
  payload: { roomId: string; adminToken: string }
): InternalRoom | null {
  const room = getRoom(payload.roomId);
  if (!room) {
    socket.emit('error:message', { code: 'NOT_FOUND', message: 'ルームが見つかりません' });
    return null;
  }
  if (room.adminToken !== payload.adminToken) {
    socket.emit('error:message', { code: 'FORBIDDEN', message: '管理者権限がありません' });
    return null;
  }
  return room;
}

export function registerHandlers(io: IO, socket: IOSocket) {
  // ─── admin: create room ────────────────────────────────────────────────
  socket.on('admin:create_room', (payload, cb) => {
    try {
      const questions = Array.isArray(payload.questions) ? payload.questions : [];
      if (questions.length === 0) {
        cb?.({ ok: false, error: '問題を1つ以上登録してください' });
        return;
      }
      for (const q of questions) {
        if (typeof q.text !== 'string' || !q.text.trim()) {
          cb?.({ ok: false, error: '問題文が空の項目があります' });
          return;
        }
        const c = Number(q.correctAnswer);
        if (!Number.isFinite(c) || c < 0 || c > 100) {
          cb?.({ ok: false, error: '正解は 0〜100 の整数で入力してください' });
          return;
        }
      }
      const room = createRoom({
        questions,
        startBalloons: payload.startBalloons,
        allowedTeams: payload.allowedTeams,
      });
      socket.join(room.roomId);
      room.adminSocketIds.add(socket.id);
      cb?.({ ok: true, roomId: room.roomId, adminToken: room.adminToken });
      socket.emit('admin:room_created', { roomId: room.roomId, adminToken: room.adminToken });
      emitRoomUpdate(io, room);
    } catch (err) {
      console.error('[admin:create_room] error', err);
      cb?.({ ok: false, error: '内部エラー' });
    }
  });

  // ─── admin: rejoin existing room (e.g. after refresh) ─────────────────
  socket.on('admin:join', (payload, cb) => {
    const room = requireAdmin(socket, payload);
    if (!room) {
      cb?.({ ok: false, error: '権限がないかルームが存在しません' });
      return;
    }
    socket.join(room.roomId);
    room.adminSocketIds.add(socket.id);
    touchRoom(room);
    cb?.({ ok: true });
    socket.emit('room:updated', getSnapshot(room));
  });

  // ─── admin: start game ────────────────────────────────────────────────
  socket.on('admin:start_game', (payload) => {
    const room = requireAdmin(socket, payload);
    if (!room) return;
    const r = startGame(room);
    if (!r.ok) {
      socket.emit('error:message', { code: 'START_FAIL', message: r.error ?? '開始失敗' });
      return;
    }
    touchRoom(room);
    emitRoomUpdate(io, room);
    broadcastQuestion(io, room);
  });

  // ─── admin: reveal ────────────────────────────────────────────────────
  socket.on('admin:reveal', (payload) => {
    const room = requireAdmin(socket, payload);
    if (!room) return;
    const r = revealAnswer(room);
    if (!r.ok || !r.payload) {
      socket.emit('error:message', { code: 'REVEAL_FAIL', message: r.error ?? '発表失敗' });
      return;
    }
    touchRoom(room);
    io.to(room.roomId).emit('game:reveal', r.payload);
    // After clients consume the reveal animation, server still emits a snapshot
    // so that latecomers / reconnectors can recover state.
    emitRoomUpdate(io, room);
    scheduleRevealResult(room, () => {
      touchRoom(room);
      emitRoomUpdate(io, room);
    });
  });

  // ─── admin: next question ─────────────────────────────────────────────
  socket.on('admin:next_question', (payload) => {
    const room = requireAdmin(socket, payload);
    if (!room) return;
    const r = nextQuestion(room);
    if (!r.ok) {
      socket.emit('error:message', { code: 'NEXT_FAIL', message: r.error ?? '次へ失敗' });
      return;
    }
    touchRoom(room);
    if (r.finished) {
      emitRoomUpdate(io, room);
      io.to(room.roomId).emit('game:end', { ranking: getRanking(room) });
    } else {
      emitRoomUpdate(io, room);
      broadcastQuestion(io, room);
    }
  });

  // ─── admin: end game ──────────────────────────────────────────────────
  socket.on('admin:end_game', (payload) => {
    const room = requireAdmin(socket, payload);
    if (!room) return;
    endGame(room);
    touchRoom(room);
    emitRoomUpdate(io, room);
    io.to(room.roomId).emit('game:end', { ranking: getRanking(room) });
  });

  // ─── team: join ───────────────────────────────────────────────────────
  socket.on('team:join', (payload, cb) => {
    const room = getRoom(payload.roomId);
    if (!room) {
      cb?.({ ok: false, error: 'ルームが見つかりません' });
      return;
    }
    const r = joinTeam(room, payload.teamName, socket.id);
    if (!r.ok) {
      cb?.({ ok: false, error: r.error });
      return;
    }
    socket.join(room.roomId);
    socket.data.role = 'team';
    socket.data.teamName = r.team.name;
    socket.data.roomId = room.roomId;
    touchRoom(room);
    cb?.({ ok: true });
    socket.emit('team:joined', { teamName: r.team.name, roomId: room.roomId });
    emitRoomUpdate(io, room);
    // If a question is currently active, send the current question to the
    // (re)joining team so they can answer right away.
    if (room.phase === 'answering' || room.phase === 'waiting') {
      const q = room.questions[room.questionIndex];
      if (q) {
        socket.emit('game:question', {
          questionIndex: room.questionIndex,
          questionText: q.text,
          totalQuestions: room.questions.length,
        });
      }
    }
  });

  // ─── answer: submit ───────────────────────────────────────────────────
  socket.on('answer:submit', (payload, cb) => {
    const room = getRoom(payload.roomId);
    if (!room) {
      cb?.({ ok: false, error: 'ルームが見つかりません' });
      return;
    }
    // Verify socket matches team
    const team = room.teams.get(payload.teamName.trim().toLowerCase());
    if (!team || team.socketId !== socket.id) {
      cb?.({ ok: false, error: 'チームの認証に失敗しました' });
      return;
    }
    const r = submitAnswer(room, payload.teamName, payload.answer);
    if (!r.ok) {
      cb?.({ ok: false, error: r.error });
      return;
    }
    touchRoom(room);
    cb?.({ ok: true });
    emitRoomUpdate(io, room);
    if (r.allAnswered) {
      io.to(room.roomId).emit('game:waiting');
    }
  });

  // ─── display: join (for big-screen view) ──────────────────────────────
  socket.on('display:join', (payload, cb) => {
    const room = getRoom(payload.roomId);
    if (!room) {
      cb?.({ ok: false, error: 'ルームが見つかりません' });
      return;
    }
    socket.join(room.roomId);
    socket.data.role = 'display';
    socket.data.roomId = room.roomId;
    room.displaySocketIds.add(socket.id);
    cb?.({ ok: true });
    socket.emit('room:updated', getSnapshot(room));
    if (room.phase === 'answering' || room.phase === 'waiting') {
      const q = room.questions[room.questionIndex];
      if (q) {
        socket.emit('game:question', {
          questionIndex: room.questionIndex,
          questionText: q.text,
          totalQuestions: room.questions.length,
        });
      }
    }
    if (room.phase === 'revealing' && room.lastReveal) {
      socket.emit('game:reveal', room.lastReveal);
    }
    if (room.phase === 'finished') {
      socket.emit('game:end', { ranking: getRanking(room) });
    }
  });

  socket.on('display:reveal_complete', (payload) => {
    const room = getRoom(payload.roomId);
    if (!room) return;
    if (socket.data.role !== 'display' || socket.data.roomId !== room.roomId) return;
    if (room.questionIndex !== payload.questionIndex) return;
    if (!markRevealResult(room)) return;
    touchRoom(room);
    emitRoomUpdate(io, room);
  });

  // ─── disconnect ───────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const roomId = socket.data?.roomId as string | undefined;
    if (!roomId) return;
    const room = getRoom(roomId);
    if (!room) return;
    room.adminSocketIds.delete(socket.id);
    room.displaySocketIds.delete(socket.id);
    const team = markOffline(room, socket.id);
    if (team) emitRoomUpdate(io, room);
  });
}

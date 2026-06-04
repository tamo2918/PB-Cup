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
  updateAllowedTeams,
  type InternalRoom,
} from './rooms.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseAdminPayload(payload: unknown): { roomId: string; adminToken: string } | null {
  if (!isRecord(payload)) return null;
  const { roomId, adminToken } = payload;
  if (typeof roomId !== 'string' || typeof adminToken !== 'string') return null;
  return { roomId, adminToken };
}

function parseTeamJoinPayload(
  payload: unknown
): { roomId: string; teamName: string; resumeToken?: string } | null {
  if (!isRecord(payload)) return null;
  const { roomId, teamName, resumeToken } = payload;
  if (typeof roomId !== 'string' || typeof teamName !== 'string') return null;
  if (resumeToken !== undefined && typeof resumeToken !== 'string') return null;
  return { roomId, teamName, resumeToken };
}

function parseAnswerPayload(
  payload: unknown
): { roomId: string; teamName: string; answer: number } | null {
  if (!isRecord(payload)) return null;
  const { roomId, teamName, answer } = payload;
  if (typeof roomId !== 'string' || typeof teamName !== 'string') return null;
  const numericAnswer = Number(answer);
  if (!Number.isFinite(numericAnswer)) return null;
  return { roomId, teamName, answer: numericAnswer };
}

function parseDisplayPayload(payload: unknown): { roomId: string } | null {
  if (!isRecord(payload) || typeof payload.roomId !== 'string') return null;
  return { roomId: payload.roomId };
}

function parseAdminTeamsPayload(
  payload: unknown
): { roomId: string; adminToken: string; allowedTeams: string[] } | null {
  const admin = parseAdminPayload(payload);
  if (!admin || !isRecord(payload) || !Array.isArray(payload.allowedTeams)) return null;
  const allowedTeams = payload.allowedTeams.filter((team): team is string => typeof team === 'string');
  return { ...admin, allowedTeams };
}

function parseRevealCompletePayload(
  payload: unknown
): { roomId: string; questionIndex: number } | null {
  if (!isRecord(payload) || typeof payload.roomId !== 'string') return null;
  const questionIndex = Number(payload.questionIndex);
  if (!Number.isInteger(questionIndex)) return null;
  return { roomId: payload.roomId, questionIndex };
}

function emitRoomUpdate(io: IO, room: InternalRoom) {
  io.to(room.roomId).emit('room:updated', getSnapshot(room));
}

function broadcastQuestion(io: IO, room: InternalRoom) {
  const payload = makeQuestionPayload(room);
  if (!payload) return;
  io.to(room.roomId).emit('game:question', payload);
}

function makeQuestionPayload(room: InternalRoom): QuestionPayload | null {
  const q = room.questions[room.questionIndex];
  if (!q) return null;
  return {
    questionIndex: room.questionIndex,
    questionText: q.text,
    imageUrl: q.imageUrl,
    totalQuestions: room.questions.length,
  };
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
      if (!isRecord(payload)) {
        cb?.({ ok: false, error: 'リクエスト形式が不正です' });
        return;
      }
      const questions = Array.isArray(payload.questions) ? payload.questions : [];
      if (questions.length === 0) {
        cb?.({ ok: false, error: '問題を1つ以上登録してください' });
        return;
      }
      const normalizedQuestions = [];
      for (const q of questions) {
        if (!isRecord(q) || typeof q.text !== 'string' || !q.text.trim()) {
          cb?.({ ok: false, error: '問題文が空の項目があります' });
          return;
        }
        const c = Number(q.correctAnswer);
        if (!Number.isFinite(c) || c < 0 || c > 100) {
          cb?.({ ok: false, error: '正解は 0〜100 の整数で入力してください' });
          return;
        }
        normalizedQuestions.push({
          text: q.text,
          correctAnswer: c,
          imageUrl: typeof q.imageUrl === 'string' ? q.imageUrl : undefined,
        });
      }
      const room = createRoom({
        questions: normalizedQuestions,
        startBalloons: Number(payload.startBalloons),
        allowedTeams: Array.isArray(payload.allowedTeams)
          ? payload.allowedTeams.filter((team): team is string => typeof team === 'string')
          : undefined,
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
    const parsed = parseAdminPayload(payload);
    if (!parsed) {
      cb?.({ ok: false, error: 'リクエスト形式が不正です' });
      return;
    }
    const room = requireAdmin(socket, parsed);
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
    const parsed = parseAdminPayload(payload);
    if (!parsed) {
      socket.emit('error:message', { code: 'BAD_REQUEST', message: 'リクエスト形式が不正です' });
      return;
    }
    const room = requireAdmin(socket, parsed);
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
    const parsed = parseAdminPayload(payload);
    if (!parsed) {
      socket.emit('error:message', { code: 'BAD_REQUEST', message: 'リクエスト形式が不正です' });
      return;
    }
    const room = requireAdmin(socket, parsed);
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
    const parsed = parseAdminPayload(payload);
    if (!parsed) {
      socket.emit('error:message', { code: 'BAD_REQUEST', message: 'リクエスト形式が不正です' });
      return;
    }
    const room = requireAdmin(socket, parsed);
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
    const parsed = parseAdminPayload(payload);
    if (!parsed) {
      socket.emit('error:message', { code: 'BAD_REQUEST', message: 'リクエスト形式が不正です' });
      return;
    }
    const room = requireAdmin(socket, parsed);
    if (!room) return;
    endGame(room);
    touchRoom(room);
    emitRoomUpdate(io, room);
    io.to(room.roomId).emit('game:end', { ranking: getRanking(room) });
  });

  // ─── admin: update joinable team names ────────────────────────────────
  socket.on('admin:update_teams', (payload, cb) => {
    const parsed = parseAdminTeamsPayload(payload);
    if (!parsed) {
      cb?.({ ok: false, error: 'リクエスト形式が不正です' });
      return;
    }
    const room = requireAdmin(socket, parsed);
    if (!room) {
      cb?.({ ok: false, error: '権限がないかルームが存在しません' });
      return;
    }
    const r = updateAllowedTeams(room, parsed.allowedTeams);
    if (!r.ok) {
      cb?.({ ok: false, error: r.error ?? '参加チーム候補を更新できませんでした' });
      return;
    }
    touchRoom(room);
    cb?.({ ok: true });
    emitRoomUpdate(io, room);
  });

  // ─── room: preview (read-only before selecting a team) ────────────────
  socket.on('room:preview', (payload, cb) => {
    const parsed = parseDisplayPayload(payload);
    if (!parsed) {
      cb?.({ ok: false, error: 'リクエスト形式が不正です' });
      return;
    }
    const room = getRoom(parsed.roomId);
    if (!room) {
      cb?.({ ok: false, error: 'ルームが見つかりません' });
      return;
    }
    socket.join(room.roomId);
    if (socket.data.role !== 'team' && socket.data.role !== 'admin' && socket.data.role !== 'display') {
      socket.data.role = 'viewer';
      socket.data.roomId = room.roomId;
    }
    touchRoom(room);
    const snapshot = getSnapshot(room);
    cb?.({ ok: true, snapshot });
    socket.emit('room:updated', snapshot);
  });

  // ─── team: join ───────────────────────────────────────────────────────
  socket.on('team:join', (payload, cb) => {
    const parsed = parseTeamJoinPayload(payload);
    if (!parsed) {
      cb?.({ ok: false, error: 'リクエスト形式が不正です' });
      return;
    }
    const room = getRoom(parsed.roomId);
    if (!room) {
      cb?.({ ok: false, error: 'ルームが見つかりません' });
      return;
    }
    const existingRoomId = socket.data.role === 'team' ? (socket.data.roomId as string | undefined) : undefined;
    const existingTeamName = socket.data.role === 'team' ? (socket.data.teamName as string | undefined) : undefined;
    if (
      existingRoomId &&
      (existingRoomId !== room.roomId || existingTeamName !== parsed.teamName.trim())
    ) {
      cb?.({ ok: false, error: 'この端末は既に別の学部で参加しています' });
      return;
    }

    const r = joinTeam(room, parsed.teamName, socket.id, parsed.resumeToken);
    if (!r.ok) {
      cb?.({ ok: false, error: r.error });
      return;
    }
    socket.join(room.roomId);
    socket.data.role = 'team';
    socket.data.teamName = r.team.name;
    socket.data.roomId = room.roomId;
    touchRoom(room);
    cb?.({ ok: true, resumeToken: r.team.sessionToken });
    socket.emit('team:joined', {
      teamName: r.team.name,
      roomId: room.roomId,
      resumeToken: r.team.sessionToken,
    });
    emitRoomUpdate(io, room);
    // If a question is currently active, send the current question to the
    // (re)joining team so they can answer right away.
    if (room.phase === 'answering' || room.phase === 'waiting') {
      const questionPayload = makeQuestionPayload(room);
      if (questionPayload) socket.emit('game:question', questionPayload);
    }
  });

  // ─── answer: submit ───────────────────────────────────────────────────
  socket.on('answer:submit', (payload, cb) => {
    const parsed = parseAnswerPayload(payload);
    if (!parsed) {
      cb?.({ ok: false, error: 'リクエスト形式が不正です' });
      return;
    }
    const room = getRoom(parsed.roomId);
    if (!room) {
      cb?.({ ok: false, error: 'ルームが見つかりません' });
      return;
    }
    // Verify socket matches team
    const team = room.teams.get(parsed.teamName.trim().toLowerCase());
    if (!team || team.socketId !== socket.id) {
      cb?.({ ok: false, error: 'チームの認証に失敗しました' });
      return;
    }
    const r = submitAnswer(room, parsed.teamName, parsed.answer);
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
    const parsed = parseDisplayPayload(payload);
    if (!parsed) {
      cb?.({ ok: false, error: 'リクエスト形式が不正です' });
      return;
    }
    const room = getRoom(parsed.roomId);
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
      const questionPayload = makeQuestionPayload(room);
      if (questionPayload) socket.emit('game:question', questionPayload);
    }
    if (room.phase === 'revealing' && room.lastReveal) {
      socket.emit('game:reveal', room.lastReveal);
    }
    if (room.phase === 'finished') {
      socket.emit('game:end', { ranking: getRanking(room) });
    }
  });

  socket.on('display:reveal_complete', (payload) => {
    const parsed = parseRevealCompletePayload(payload);
    if (!parsed) return;
    const room = getRoom(parsed.roomId);
    if (!room) return;
    if (socket.data.role !== 'display' || socket.data.roomId !== room.roomId) return;
    if (room.questionIndex !== parsed.questionIndex) return;
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

import { customAlphabet } from 'nanoid';
import type {
  AnswerResult,
  GamePhase,
  PublicTeam,
  Question,
  RankingEntry,
  RevealPayload,
  RoomSnapshot,
  Team,
} from '@husen/shared';

const ROOM_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
const ADMIN_TOKEN_ALPHABET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const newRoomId = customAlphabet(ROOM_ID_ALPHABET, 6);
const newAdminToken = customAlphabet(ADMIN_TOKEN_ALPHABET, 32);
const REVEAL_RESULT_FALLBACK_MS = 4200;
const TEAM_COLOR_PALETTE = [
  '#E84A4A',
  '#F39A3F',
  '#F7D247',
  '#5BC07C',
  '#3FA6E8',
  '#A66CD0',
  '#F08FB7',
  '#76D6C4',
  '#FF7B7B',
  '#7CB6F7',
];

export interface InternalRoom {
  roomId: string;
  adminToken: string;
  phase: GamePhase;
  teams: Map<string, Team>; // key: lower-case team name
  questions: Question[];
  questionIndex: number;
  startBalloons: number;
  allowedTeams: string[]; // optional whitelist of team names
  createdAt: Date;
  lastActivityAt: Date;
  adminSocketIds: Set<string>;
  displaySocketIds: Set<string>;
  lastReveal?: RevealPayload;
  revealReadyTimer?: ReturnType<typeof setTimeout>;
}

const rooms = new Map<string, InternalRoom>();

// ─── helpers ────────────────────────────────────────────────────────────────

const teamKey = (name: string) => name.trim().toLowerCase();

function teamColorCandidate(attempt: number): string {
  if (attempt < TEAM_COLOR_PALETTE.length) {
    return TEAM_COLOR_PALETTE[attempt]!;
  }

  const generatedIndex = attempt - TEAM_COLOR_PALETTE.length;
  const hue = (18 + generatedIndex * 137.508) % 360;
  const saturation = 72 - (generatedIndex % 3) * 6;
  const lightness = 50 + (Math.floor(generatedIndex / 3) % 4) * 6;
  return `hsl(${hue.toFixed(2)}deg ${saturation}% ${lightness}%)`;
}

function nextTeamColor(room: InternalRoom): string {
  const used = new Set([...room.teams.values()].map((team) => team.color));
  let attempt = 0;
  while (true) {
    const candidate = teamColorCandidate(attempt);
    if (!used.has(candidate)) return candidate;
    attempt += 1;
  }
}

export function createRoom(input: {
  questions: Question[];
  startBalloons: number;
  allowedTeams?: string[];
}): InternalRoom {
  // collide-resistant ID generation; retry if dupe
  let roomId = newRoomId();
  while (rooms.has(roomId)) roomId = newRoomId();

  const room: InternalRoom = {
    roomId,
    adminToken: newAdminToken(),
    phase: 'lobby',
    teams: new Map(),
    questions: input.questions.map((q) => ({
      text: String(q.text ?? '').trim(),
      correctAnswer: clampPercent(Number(q.correctAnswer)),
    })),
    questionIndex: 0,
    startBalloons: clampInt(input.startBalloons, 10, 500, 100),
    allowedTeams: (input.allowedTeams ?? []).map((s) => s.trim()).filter(Boolean),
    createdAt: new Date(),
    lastActivityAt: new Date(),
    adminSocketIds: new Set(),
    displaySocketIds: new Set(),
  };
  rooms.set(roomId, room);
  return room;
}

export function getRoom(roomId: string): InternalRoom | undefined {
  return rooms.get(roomId);
}

export function deleteRoom(roomId: string) {
  rooms.delete(roomId);
}

export function touchRoom(room: InternalRoom) {
  room.lastActivityAt = new Date();
}

export function joinTeam(
  room: InternalRoom,
  teamName: string,
  socketId: string
): { ok: true; team: Team } | { ok: false; error: string } {
  const trimmed = teamName.trim();
  if (!trimmed) return { ok: false, error: 'チーム名を入力してください' };
  if (trimmed.length > 24) return { ok: false, error: 'チーム名が長すぎます (24文字以内)' };

  if (room.allowedTeams.length > 0) {
    const found = room.allowedTeams.find((t) => t.toLowerCase() === trimmed.toLowerCase());
    if (!found) return { ok: false, error: 'このチーム名は許可されていません' };
  }

  const key = teamKey(trimmed);
  const existing = room.teams.get(key);

  if (existing) {
    // Allow reconnect if offline OR same socketId; otherwise, treat as duplicate.
    if (existing.online && existing.socketId !== socketId) {
      return { ok: false, error: 'このチーム名は既に参加済みです' };
    }
    if (!existing.color) {
      existing.color = nextTeamColor(room);
    }
    existing.socketId = socketId;
    existing.online = true;
    return { ok: true, team: existing };
  }

  if (room.phase !== 'lobby') {
    return { ok: false, error: 'ゲームが既に開始されているため新規参加できません' };
  }

  const team: Team = {
    name: trimmed,
    color: nextTeamColor(room),
    balloons: room.startBalloons,
    eliminated: false,
    hasAnswered: false,
    socketId,
    online: true,
  };
  room.teams.set(key, team);
  return { ok: true, team };
}

export function markOffline(room: InternalRoom, socketId: string): Team | undefined {
  for (const team of room.teams.values()) {
    if (team.socketId === socketId) {
      team.online = false;
      return team;
    }
  }
  return undefined;
}

export function startGame(room: InternalRoom): { ok: boolean; error?: string } {
  if (room.phase !== 'lobby') return { ok: false, error: 'ロビー以外からは開始できません' };
  if (room.teams.size < 2) return { ok: false, error: '2チーム以上が必要です' };
  if (room.questions.length === 0) return { ok: false, error: '問題が登録されていません' };
  clearRevealReadyTimer(room);
  room.questionIndex = 0;
  room.phase = 'answering';
  room.lastReveal = undefined;
  resetRoundAnswers(room);
  return { ok: true };
}

export function submitAnswer(
  room: InternalRoom,
  teamName: string,
  answer: number
): { ok: boolean; error?: string; allAnswered?: boolean } {
  if (room.phase !== 'answering') {
    return { ok: false, error: '現在は回答受付中ではありません' };
  }
  const team = room.teams.get(teamKey(teamName));
  if (!team) return { ok: false, error: 'チームが見つかりません' };
  if (team.eliminated) return { ok: false, error: 'チームは脱落済みです' };
  if (team.hasAnswered) return { ok: false, error: '既に回答済みです' };

  const value = clampPercent(answer);
  team.currentAnswer = value;
  team.hasAnswered = true;

  const activeTeams = [...room.teams.values()].filter((t) => !t.eliminated);
  const allAnswered = activeTeams.every((t) => t.hasAnswered);
  if (allAnswered) {
    room.phase = 'waiting';
  }
  return { ok: true, allAnswered };
}

export function revealAnswer(room: InternalRoom): {
  ok: boolean;
  error?: string;
  payload?: RevealPayload;
} {
  if (room.phase !== 'waiting' && room.phase !== 'answering') {
    return { ok: false, error: '正解発表できるフェーズではありません' };
  }
  const question = room.questions[room.questionIndex];
  if (!question) return { ok: false, error: '問題が見つかりません' };

  const correct = question.correctAnswer;
  const results: AnswerResult[] = [];

  for (const team of room.teams.values()) {
    if (team.eliminated) continue;
    if (!team.hasAnswered || team.currentAnswer === undefined) {
      // Treat missing answer as worst-case (max diff = 100)
      const diff = 100;
      const before = team.balloons;
      const after = Math.max(0, before - diff);
      team.balloons = after;
      const eliminated = after <= 0;
      if (eliminated) team.eliminated = true;
      results.push({
        teamName: team.name,
        answer: -1,
        diff,
        perfect: false,
        bonus: 0,
        popped: before - after,
        balloonsBefore: before,
        balloonsAfter: after,
        eliminated,
      });
      continue;
    }

    const ans = team.currentAnswer;
    const diff = Math.abs(ans - correct);
    const perfect = diff === 0;
    const bonus = perfect ? 10 : 0;
    const popped = diff;
    const before = team.balloons;
    const afterRaw = before - popped + bonus;
    const after = Math.max(0, afterRaw);
    team.balloons = after;
    const eliminated = !perfect && after <= 0;
    if (eliminated) team.eliminated = true;

    results.push({
      teamName: team.name,
      answer: ans,
      diff,
      perfect,
      bonus,
      popped,
      balloonsBefore: before,
      balloonsAfter: after,
      eliminated,
    });
  }

  clearRevealReadyTimer(room);
  room.phase = 'revealing';
  const payload: RevealPayload = {
    questionIndex: room.questionIndex,
    correctAnswer: correct,
    results,
  };
  room.lastReveal = payload;
  return { ok: true, payload };
}

export function scheduleRevealResult(
  room: InternalRoom,
  onReady: () => void,
  delayMs = REVEAL_RESULT_FALLBACK_MS
) {
  clearRevealReadyTimer(room);
  room.revealReadyTimer = setTimeout(() => {
    room.revealReadyTimer = undefined;
    if (room.phase !== 'revealing') return;
    room.phase = 'result';
    onReady();
  }, delayMs);
}

export function markRevealResult(room: InternalRoom): boolean {
  if (room.phase !== 'revealing') return false;
  clearRevealReadyTimer(room);
  room.phase = 'result';
  return true;
}

export function nextQuestion(room: InternalRoom): { ok: boolean; error?: string; finished?: boolean } {
  if (room.phase !== 'revealing' && room.phase !== 'result') {
    return { ok: false, error: '結果表示中ではありません' };
  }

  clearRevealReadyTimer(room);

  // Skip to finished if no active teams remain
  const activeCount = [...room.teams.values()].filter((t) => !t.eliminated).length;
  if (activeCount <= 1 || room.questionIndex >= room.questions.length - 1) {
    room.phase = 'finished';
    return { ok: true, finished: true };
  }

  room.questionIndex += 1;
  room.phase = 'answering';
  room.lastReveal = undefined;
  resetRoundAnswers(room);
  return { ok: true, finished: false };
}

export function endGame(room: InternalRoom): { ok: boolean } {
  clearRevealReadyTimer(room);
  room.phase = 'finished';
  return { ok: true };
}

export function getRanking(room: InternalRoom): RankingEntry[] {
  const sorted = [...room.teams.values()].sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    return b.balloons - a.balloons;
  });
  return sorted.map((t, idx) => ({
    rank: idx + 1,
    teamName: t.name,
    balloons: t.balloons,
    eliminated: t.eliminated,
  }));
}

export function getSnapshot(room: InternalRoom, opts?: { includeAnswers?: boolean }): RoomSnapshot {
  const includeAnswers = opts?.includeAnswers ?? false;
  const teams: PublicTeam[] = [...room.teams.values()].map((t) => {
    if (!t.color) {
      t.color = nextTeamColor(room);
    }
    return {
      name: t.name,
      color: t.color,
      balloons: t.balloons,
      eliminated: t.eliminated,
      hasAnswered: t.hasAnswered,
      online: t.online,
      currentAnswer: includeAnswers ? t.currentAnswer : undefined,
    };
  });

  const currentQuestion =
    room.phase === 'lobby' || room.questionIndex >= room.questions.length
      ? undefined
      : { text: room.questions[room.questionIndex]!.text };

  const snap: RoomSnapshot = {
    roomId: room.roomId,
    phase: room.phase,
    teams,
    questionIndex: room.questionIndex,
    totalQuestions: room.questions.length,
    startBalloons: room.startBalloons,
    currentQuestion,
  };

  if ((room.phase === 'revealing' || room.phase === 'result') && room.lastReveal) {
    snap.reveal = room.lastReveal;
  }
  if (room.phase === 'finished') {
    snap.ranking = getRanking(room);
  }
  return snap;
}

export function listRoomIds(): string[] {
  return [...rooms.keys()];
}

// Scheduled cleanup: remove rooms inactive for > 2h
export function cleanupStaleRooms(maxAgeMs = 2 * 60 * 60 * 1000): number {
  const now = Date.now();
  let removed = 0;
  for (const [id, room] of rooms) {
    if (now - room.lastActivityAt.getTime() > maxAgeMs) {
      rooms.delete(id);
      removed += 1;
    }
  }
  return removed;
}

// ─── private utilities ──────────────────────────────────────────────────────

function resetRoundAnswers(room: InternalRoom) {
  for (const team of room.teams.values()) {
    team.currentAnswer = undefined;
    team.hasAnswered = false;
  }
}

function clearRevealReadyTimer(room: InternalRoom) {
  if (!room.revealReadyTimer) return;
  clearTimeout(room.revealReadyTimer);
  room.revealReadyTimer = undefined;
}

function clampPercent(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function clampInt(v: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}

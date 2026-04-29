// ─────────────────────────────────────────────────────────────────────────────
// Shared types between server and web
// ─────────────────────────────────────────────────────────────────────────────

export type GamePhase =
  | 'lobby'
  | 'answering'
  | 'waiting'
  | 'revealing'
  | 'result'
  | 'finished';

export interface Team {
  name: string;
  balloons: number;
  eliminated: boolean;
  currentAnswer?: number;
  hasAnswered: boolean;
  socketId: string;
  online: boolean;
}

export interface Question {
  text: string;
  correctAnswer: number;
}

export interface PublicTeam {
  name: string;
  balloons: number;
  eliminated: boolean;
  hasAnswered: boolean;
  online: boolean;
  // currentAnswer is only revealed after the reveal phase
  currentAnswer?: number;
}

export interface RoomSnapshot {
  roomId: string;
  phase: GamePhase;
  teams: PublicTeam[];
  questionIndex: number;
  totalQuestions: number;
  startBalloons: number;
  currentQuestion?: { text: string };
  // Filled when in `revealing` / `result` / `finished`
  reveal?: RevealPayload;
  ranking?: RankingEntry[];
}

export interface QuestionPayload {
  questionIndex: number;
  questionText: string;
  totalQuestions: number;
}

export interface AnswerResult {
  teamName: string;
  answer: number;
  diff: number;
  perfect: boolean;
  bonus: number;       // balloons added (perfect bonus)
  popped: number;      // balloons popped
  balloonsBefore: number;
  balloonsAfter: number;
  eliminated: boolean;
}

export interface RevealPayload {
  questionIndex: number;
  correctAnswer: number;
  results: AnswerResult[];
}

export interface RankingEntry {
  rank: number;
  teamName: string;
  balloons: number;
  eliminated: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Socket events
// ─────────────────────────────────────────────────────────────────────────────

export interface ServerToClientEvents {
  'room:updated': (snapshot: RoomSnapshot) => void;
  'game:question': (payload: QuestionPayload) => void;
  'game:reveal': (payload: RevealPayload) => void;
  'game:end': (payload: { ranking: RankingEntry[] }) => void;
  'game:waiting': () => void;
  'error:message': (payload: { code: string; message: string }) => void;
  'admin:room_created': (payload: { roomId: string; adminToken: string }) => void;
  'team:joined': (payload: { teamName: string; roomId: string }) => void;
}

export interface ClientToServerEvents {
  'admin:create_room': (
    payload: { questions: Question[]; startBalloons: number; allowedTeams?: string[] },
    cb?: (res: { ok: true; roomId: string; adminToken: string } | { ok: false; error: string }) => void
  ) => void;
  'admin:join': (
    payload: { roomId: string; adminToken: string },
    cb?: (res: { ok: boolean; error?: string }) => void
  ) => void;
  'admin:start_game': (payload: { roomId: string; adminToken: string }) => void;
  'admin:next_question': (payload: { roomId: string; adminToken: string }) => void;
  'admin:reveal': (payload: { roomId: string; adminToken: string }) => void;
  'admin:end_game': (payload: { roomId: string; adminToken: string }) => void;

  'team:join': (
    payload: { roomId: string; teamName: string },
    cb?: (res: { ok: boolean; error?: string }) => void
  ) => void;
  'answer:submit': (
    payload: { roomId: string; teamName: string; answer: number },
    cb?: (res: { ok: boolean; error?: string }) => void
  ) => void;

  'display:join': (
    payload: { roomId: string },
    cb?: (res: { ok: boolean; error?: string }) => void
  ) => void;
}

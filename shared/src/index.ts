// ─────────────────────────────────────────────────────────────────────────────
// Shared types between server and web
// ─────────────────────────────────────────────────────────────────────────────

export type GamePhase =
  | 'lobby'
  | 'reading'
  | 'answering'
  | 'waiting'
  | 'revealing'
  | 'result'
  | 'finished';

export interface Team {
  name: string;
  color: string;
  balloons: number;
  eliminated: boolean;
  currentAnswer?: number;
  hasAnswered: boolean;
  socketId: string;
  sessionToken: string;
  online: boolean;
}

export interface Question {
  text: string;
  correctAnswer: number;
  imageUrl?: string;
}

export interface PublicTeam {
  name: string;
  color: string;
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
  allowedTeams: string[];
  questionIndex: number;
  totalQuestions: number;
  startBalloons: number;
  questionStartedAt?: number;
  answerDeadline?: number;
  finalizingAnswers?: boolean;
  currentQuestion?: { text: string; imageUrl?: string };
  // Filled when in `revealing` / `result` / `finished`
  reveal?: RevealPayload;
  ranking?: RankingEntry[];
}

export interface QuestionPayload {
  questionIndex: number;
  questionText: string;
  imageUrl?: string;
  totalQuestions: number;
  questionStartedAt?: number;
  answerDeadline?: number;
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

export const TEAM_NAME_MAX_LENGTH = 32;
export const QUESTION_TIME_LIMIT_MS = 10_000;

// 近畿大学の中央執行委員会・自治会などの参加候補。
export const KINDAI_STUDENT_COUNCIL_TEAMS = [
  '中央執行委員会 役員(委員長/副委員長/部局長 等)',
  '中央執行委員会 厚生部員(部局員)',
  '中央執行委員会 庶務部員(部局員)',
  '中央執行委員会 学術文化部員(部局員)',
  '中央執行委員会 会計部員(部局員)',
  '中央執行委員会 事務局員(部局員)',
  '中央執行委員会 広報部員(部局員)',
  '合同調査委員会',
  '文化会総務',
  '法学部学生自治会',
  '経済学部自治会',
  '経営学部自治会',
  '理工学部学生自治会',
  '建築学部自治会',
  '薬学部自治会',
  '文芸学部学生自治会',
  '総合社会学部自治会',
  '国際学部自治会',
  '情報学部自治会',
  '短期大学部自治会',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Socket events
// ─────────────────────────────────────────────────────────────────────────────

export interface ServerToClientEvents {
  'room:updated': (snapshot: RoomSnapshot) => void;
  'game:question': (payload: QuestionPayload) => void;
  'game:reveal': (payload: RevealPayload) => void;
  'game:end': (payload: { ranking: RankingEntry[] }) => void;
  'game:waiting': () => void;
  'answer:finalize_requested': (payload: { questionIndex: number }) => void;
  'error:message': (payload: { code: string; message: string }) => void;
  'admin:room_created': (payload: { roomId: string; adminToken: string }) => void;
  'team:joined': (payload: { teamName: string; roomId: string; resumeToken: string }) => void;
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
  'admin:start_answering': (payload: { roomId: string; adminToken: string }) => void;
  'admin:next_question': (payload: { roomId: string; adminToken: string }) => void;
  'admin:reveal': (payload: { roomId: string; adminToken: string }) => void;
  'admin:end_game': (payload: { roomId: string; adminToken: string }) => void;
  'admin:update_teams': (
    payload: { roomId: string; adminToken: string; allowedTeams: string[] },
    cb?: (res: { ok: boolean; error?: string }) => void
  ) => void;

  'room:preview': (
    payload: { roomId: string },
    cb?: (res: { ok: boolean; error?: string; snapshot?: RoomSnapshot }) => void
  ) => void;
  'team:join': (
    payload: { roomId: string; teamName: string; resumeToken?: string },
    cb?: (res: { ok: boolean; error?: string; resumeToken?: string }) => void
  ) => void;
  'answer:submit': (
    payload: { roomId: string; teamName: string; answer: number },
    cb?: (res: { ok: boolean; error?: string }) => void
  ) => void;
  'answer:update': (
    payload: { roomId: string; teamName: string; answer: number | null },
    cb?: (res: { ok: boolean; error?: string }) => void
  ) => void;
  'answer:finalize': (
    payload: {
      roomId: string;
      teamName: string;
      questionIndex: number;
      answer: number | null;
    },
    cb?: (res: { ok: boolean; error?: string }) => void
  ) => void;

  'display:join': (
    payload: { roomId: string },
    cb?: (res: { ok: boolean; error?: string }) => void
  ) => void;
  'display:reveal_complete': (
    payload: { roomId: string; questionIndex: number }
  ) => void;
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import type { QuestionPayload, RevealPayload, RoomSnapshot } from '@husen/shared';
import { useSocket } from '@/hooks/useSocket';
import { NumberPad } from '@/components/NumberPad';
import { unlockAudio } from '@/lib/sounds';
import { motion, AnimatePresence } from 'framer-motion';

export default function JoinRoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = (params?.roomId ?? '').toUpperCase();
  const { socket, connected } = useSocket();

  const [teamName, setTeamName] = useState('');
  const [joinedTeam, setJoinedTeam] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [question, setQuestion] = useState<QuestionPayload | null>(null);
  const [reveal, setReveal] = useState<RevealPayload | null>(null);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  // Restore previous join after refresh
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(`husen.join.${roomId}`);
    if (stored) setTeamName(stored);
  }, [roomId]);

  useEffect(() => {
    if (!socket || !connected) return;
    if (joinedTeam) {
      // Re-join after a reconnect
      socket.emit('team:join', { roomId, teamName: joinedTeam }, (res) => {
        if (!res?.ok) {
          setError(res?.error ?? '再接続失敗');
          setJoinedTeam(null);
        }
      });
    }
  }, [socket, connected, joinedTeam, roomId]);

  useEffect(() => {
    if (!socket) return;
    const onRoom = (snap: RoomSnapshot) => {
      setSnapshot(snap);
      // Reset round-local state when phase changes back to answering for a new question
      if (snap.phase === 'answering') {
        setReveal(null);
        const me = snap.teams.find((t) => t.name === joinedTeam);
        if (!me?.hasAnswered) setAnswer('');
      }
    };
    const onQuestion = (q: QuestionPayload) => {
      setQuestion(q);
      setReveal(null);
      setAnswer('');
    };
    const onReveal = (r: RevealPayload) => setReveal(r);
    const onErr = (p: { code: string; message: string }) => setError(p.message);
    socket.on('room:updated', onRoom);
    socket.on('game:question', onQuestion);
    socket.on('game:reveal', onReveal);
    socket.on('error:message', onErr);
    return () => {
      socket.off('room:updated', onRoom);
      socket.off('game:question', onQuestion);
      socket.off('game:reveal', onReveal);
      socket.off('error:message', onErr);
    };
  }, [socket, joinedTeam]);

  const me = useMemo(
    () => snapshot?.teams.find((t) => t.name === joinedTeam),
    [snapshot, joinedTeam]
  );
  const myResult = useMemo(
    () => reveal?.results.find((r) => r.teamName === joinedTeam),
    [reveal, joinedTeam]
  );

  const allowedTeams = useMemo(() => {
    // We don't have allowedTeams in snapshot. Fall back to recently-seen team names.
    return snapshot?.teams.map((t) => t.name) ?? [];
  }, [snapshot]);

  const submit = () => {
    if (!socket || !joinedTeam) return;
    const value = Number(answer);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setError('0〜100の整数で入力してください');
      setShake(true);
      window.setTimeout(() => setShake(false), 400);
      return;
    }
    setSubmitting(true);
    setError(null);
    socket.emit(
      'answer:submit',
      { roomId, teamName: joinedTeam, answer: value },
      (res) => {
        setSubmitting(false);
        if (!res?.ok) setError(res?.error ?? '送信に失敗しました');
      }
    );
  };

  const join = (name: string) => {
    if (!socket) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    void unlockAudio();
    setError(null);
    socket.emit('team:join', { roomId, teamName: trimmed }, (res) => {
      if (!res?.ok) {
        setError(res?.error ?? '参加できませんでした');
        return;
      }
      setJoinedTeam(trimmed);
      window.localStorage.setItem(`husen.join.${roomId}`, trimmed);
    });
  };

  // ─── pre-join screen ──────────────────────────────────────────────────
  if (!joinedTeam) {
    return (
      <main className="display-bg min-h-screen p-4 flex flex-col items-center justify-center">
        <div className="bg-white/95 rounded-3xl shadow-2xl p-6 w-full max-w-sm text-center">
          <h1 className="text-2xl font-black text-sky-deep mb-1">学部を選んでください</h1>
          <p className="text-xs text-gray-500 mb-4">ルームID: <strong>{roomId}</strong></p>

          {error && (
            <div className="bg-red-50 border-2 border-red-300 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">
              {error}
            </div>
          )}

          <input
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="学部名を入力（例: 工学部）"
            maxLength={24}
            className="w-full border-2 border-sky-deep rounded-xl px-3 py-3 mb-3 text-center text-lg font-bold"
          />

          <button
            onClick={() => join(teamName)}
            disabled={!connected || !teamName.trim()}
            className="w-full bg-gauge-accent disabled:bg-gray-300 hover:bg-red-700 text-white text-xl font-black py-4 rounded-xl"
          >
            このチームで参加
          </button>

          {allowedTeams.length > 0 && (
            <>
              <p className="text-xs text-gray-400 mt-4">参加済みのチーム</p>
              <div className="flex flex-wrap gap-1 justify-center mt-1">
                {allowedTeams.map((t) => (
                  <span
                    key={t}
                    className="text-xs px-2 py-0.5 bg-sky-100 text-sky-deep rounded-full"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </>
          )}

          <p className="text-xs text-gray-400 mt-4">
            {connected ? '🟢 接続中' : '🟡 接続待ち'}
          </p>
        </div>
      </main>
    );
  }

  // ─── post-join screen ─────────────────────────────────────────────────
  const phase = snapshot?.phase;
  const eliminated = me?.eliminated;
  const hasAnswered = me?.hasAnswered;

  return (
    <main className="display-bg min-h-screen p-3 pb-6 flex flex-col">
      <header className="bg-white/95 rounded-2xl shadow px-4 py-2 flex items-center justify-between mb-3">
        <div>
          <span className="text-xs text-gray-500">参加中</span>
          <div className="font-black text-sky-deep">{joinedTeam}</div>
        </div>
        <div className="text-right">
          <span className="text-xs text-gray-500">残り</span>
          <div className="font-black text-gauge-accent">🎈 {me?.balloons ?? 0}</div>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 border-2 border-red-300 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">
          {error}
        </div>
      )}

      {phase === 'lobby' && (
        <Card>
          <h2 className="text-xl font-black text-sky-deep mb-2">🎈 開始を待っています</h2>
          <p className="text-gray-600 dot-pulse">管理者がゲームを開始するまで少々お待ちください</p>
          <div className="mt-4 text-xs text-gray-400">
            参加チーム: {snapshot?.teams.length ?? 0}
          </div>
        </Card>
      )}

      {(phase === 'answering' || phase === 'waiting') && question && !reveal && (
        <>
          <Card>
            <div className="text-xs text-gray-500 mb-1">
              問題 {question.questionIndex + 1} / {question.totalQuestions}
            </div>
            <div className="text-lg font-bold text-sky-deep">{question.questionText}</div>
          </Card>

          <Card className="text-center">
            <div className="text-xs text-gray-500 mb-1">あなたの回答</div>
            <motion.div
              animate={shake ? { x: [-8, 8, -6, 6, 0] } : { x: 0 }}
              className="input-display text-6xl font-black tabular-nums py-3 mb-3"
            >
              {answer === '' ? '–' : answer}
              <span className="text-3xl ml-1">%</span>
            </motion.div>
          </Card>

          {eliminated ? (
            <Card>
              <div className="text-center py-6 text-gauge-accent font-black">
                💥 残念！既に脱落しています
              </div>
            </Card>
          ) : hasAnswered ? (
            <Card>
              <div className="text-center py-6">
                <div className="text-2xl font-black text-emerald-600 mb-1">✅ 送信済み</div>
                <p className="text-gray-500 text-sm">
                  スクリーンを見て正解を待ちましょう！
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  回答済み:{' '}
                  {snapshot?.teams.filter((t) => t.hasAnswered && !t.eliminated).length ?? 0} /{' '}
                  {snapshot?.teams.filter((t) => !t.eliminated).length ?? 0}
                </p>
              </div>
            </Card>
          ) : (
            <NumberPad
              value={answer}
              onChange={setAnswer}
              onSubmit={submit}
              disabled={false}
              submitting={submitting}
            />
          )}
        </>
      )}

      <AnimatePresence>
        {reveal && (
          <Card>
            <div className="text-xs text-gray-500 mb-1">正解</div>
            <div className="text-5xl font-black text-gauge-accent text-center mb-3">
              {reveal.correctAnswer}%
            </div>
            {myResult && (
              <ResultBox
                yourAnswer={myResult.answer}
                diff={myResult.diff}
                perfect={myResult.perfect}
                bonus={myResult.bonus}
                popped={myResult.popped}
                before={myResult.balloonsBefore}
                after={myResult.balloonsAfter}
                eliminated={myResult.eliminated}
              />
            )}
            <p className="text-xs text-gray-400 text-center mt-3">
              次の問題まで管理者の合図をお待ちください
            </p>
          </Card>
        )}
      </AnimatePresence>

      {phase === 'finished' && (
        <Card>
          <h2 className="text-xl font-black text-sky-deep mb-3 text-center">🏁 ゲーム終了</h2>
          <ol className="space-y-1">
            {(snapshot?.ranking ?? []).map((r) => (
              <li
                key={r.teamName}
                className={`px-3 py-2 rounded-lg flex justify-between ${
                  r.teamName === joinedTeam ? 'bg-yellow-100 ring-2 ring-yellow-400' : 'bg-white'
                }`}
              >
                <span>
                  <strong>{r.rank}位</strong> {r.teamName}
                </span>
                <span className="font-bold">🎈 {r.balloons}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </main>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white/95 rounded-2xl shadow px-4 py-4 mb-3 ${className ?? ''}`}>
      {children}
    </div>
  );
}

function ResultBox({
  yourAnswer,
  diff,
  perfect,
  bonus,
  popped,
  before,
  after,
  eliminated,
}: {
  yourAnswer: number;
  diff: number;
  perfect: boolean;
  bonus: number;
  popped: number;
  before: number;
  after: number;
  eliminated: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl p-3 text-center ${
        perfect
          ? 'bg-yellow-100'
          : eliminated
          ? 'bg-red-100'
          : 'bg-gray-50'
      }`}
    >
      <div className="text-sm text-gray-500">
        あなたの回答 <strong>{yourAnswer < 0 ? '–' : `${yourAnswer}%`}</strong> / 誤差 {diff}
      </div>
      {perfect ? (
        <div className="text-xl font-black text-yellow-600 my-1">🎉 ぴったり！+{bonus} ボーナス</div>
      ) : eliminated ? (
        <div className="text-xl font-black text-gauge-accent my-1">💥 ゲームオーバー</div>
      ) : (
        <div className="text-xl font-black text-gauge-accent my-1">-{popped} 風船</div>
      )}
      <div className="text-xs text-gray-500">
        🎈 {before} → {after}
      </div>
    </motion.div>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { KINDAI_STUDENT_COUNCIL_TEAMS } from '@husen/shared';
import type { QuestionPayload, RevealPayload, RoomSnapshot } from '@husen/shared';
import { useSocket } from '@/hooks/useSocket';
import { NumberPad } from '@/components/NumberPad';
import { RemainingBalloon } from '@/components/RemainingBalloon';
import { unlockAudio } from '@/lib/sounds';
import { motion, AnimatePresence } from 'framer-motion';

const joinedTeamStorageKey = (roomId: string) => `husen.join.${roomId}`;
const resumeTokenStorageKey = (roomId: string, teamName: string) =>
  `husen.joinToken.${roomId}.${encodeURIComponent(teamName)}`;

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
  const [pendingReveal, setPendingReveal] = useState<RevealPayload | null>(null);
  const pendingRevealRef = useRef<RevealPayload | null>(null);
  const activeQuestionIndexRef = useRef<number | null>(null);
  const submitInFlightRef = useRef(false);

  // Restore previous join after refresh
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(joinedTeamStorageKey(roomId));
    if (stored && KINDAI_STUDENT_COUNCIL_TEAMS.includes(stored as typeof KINDAI_STUDENT_COUNCIL_TEAMS[number])) {
      setTeamName(stored);
    }
  }, [roomId]);

  useEffect(() => {
    if (!socket || !connected) return;
    if (joinedTeam) {
      // Re-join after a reconnect
      const resumeToken = window.localStorage.getItem(resumeTokenStorageKey(roomId, joinedTeam));
      socket.emit('team:join', { roomId, teamName: joinedTeam, resumeToken: resumeToken ?? undefined }, (res) => {
        if (!res?.ok) {
          setError(res?.error ?? '再接続失敗');
          setJoinedTeam(null);
          submitInFlightRef.current = false;
          setSubmitting(false);
          return;
        }
        if (res.resumeToken) {
          window.localStorage.setItem(resumeTokenStorageKey(roomId, joinedTeam), res.resumeToken);
        }
      });
    }
  }, [socket, connected, joinedTeam, roomId]);

  useEffect(() => {
    if (!socket) return;
    const onRoom = (snap: RoomSnapshot) => {
      setSnapshot(snap);
      if (snap.phase === 'answering' || snap.phase === 'waiting') {
        const snapshotQuestion = snap.currentQuestion;
        if (snapshotQuestion) {
          setQuestion((currentQuestion) => {
            if (
              currentQuestion?.questionIndex === snap.questionIndex &&
              currentQuestion.questionText === snapshotQuestion.text &&
              currentQuestion.totalQuestions === snap.totalQuestions
            ) {
              return currentQuestion;
            }
            return {
              questionIndex: snap.questionIndex,
              questionText: snapshotQuestion.text,
              totalQuestions: snap.totalQuestions,
            };
          });
        }

        // `room:updated` is emitted for every team's submit/join/disconnect.
        // Only clear this device's draft when the actual question changes.
        if (activeQuestionIndexRef.current !== snap.questionIndex) {
          activeQuestionIndexRef.current = snap.questionIndex;
          pendingRevealRef.current = null;
          setPendingReveal(null);
          setReveal(null);
          setAnswer('');
        }
      } else if (snap.phase === 'revealing') {
        const nextPendingReveal = snap.reveal ?? pendingRevealRef.current;
        pendingRevealRef.current = nextPendingReveal;
        if (nextPendingReveal) {
          setPendingReveal(nextPendingReveal);
        }
      } else if (snap.phase === 'result' || snap.phase === 'finished') {
        const resolvedReveal = snap.reveal ?? pendingRevealRef.current;
        if (resolvedReveal) {
          setPendingReveal(null);
          setReveal(resolvedReveal);
        }
      }
    };
    const onQuestion = (q: QuestionPayload) => {
      const questionChanged = activeQuestionIndexRef.current !== q.questionIndex;
      activeQuestionIndexRef.current = q.questionIndex;
      setQuestion(q);
      pendingRevealRef.current = null;
      setPendingReveal(null);
      setReveal(null);
      if (questionChanged) setAnswer('');
    };
    const onReveal = (r: RevealPayload) => {
      pendingRevealRef.current = r;
      setPendingReveal(r);
    };
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
  const pendingMyResult = useMemo(
    () => pendingReveal?.results.find((r) => r.teamName === joinedTeam),
    [pendingReveal, joinedTeam]
  );

  const joinedTeams = useMemo(
    () => new Set(snapshot?.teams.map((t) => t.name) ?? []),
    [snapshot]
  );

  const submit = () => {
    if (!socket || !joinedTeam) return;
    if (submitInFlightRef.current) return;
    const value = Number(answer);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setError('0〜100の整数で入力してください');
      setShake(true);
      window.setTimeout(() => setShake(false), 400);
      return;
    }
    submitInFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    const timeout = window.setTimeout(() => {
      submitInFlightRef.current = false;
      setSubmitting(false);
      setError('送信確認が取れませんでした。接続を確認してもう一度押してください');
    }, 6000);
    socket.emit(
      'answer:submit',
      { roomId, teamName: joinedTeam, answer: value },
      (res) => {
        window.clearTimeout(timeout);
        submitInFlightRef.current = false;
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
    const resumeToken = window.localStorage.getItem(resumeTokenStorageKey(roomId, trimmed));
    socket.emit('team:join', { roomId, teamName: trimmed, resumeToken: resumeToken ?? undefined }, (res) => {
      if (!res?.ok) {
        setError(res?.error ?? '参加できませんでした');
        return;
      }
      setJoinedTeam(trimmed);
      window.localStorage.setItem(joinedTeamStorageKey(roomId), trimmed);
      if (res.resumeToken) {
        window.localStorage.setItem(resumeTokenStorageKey(roomId, trimmed), res.resumeToken);
      }
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

          <div className="grid grid-cols-2 gap-2 mb-4">
            {KINDAI_STUDENT_COUNCIL_TEAMS.map((team) => {
              const selected = teamName === team;
              const alreadyJoined = joinedTeams.has(team);

              return (
                <button
                  key={team}
                  type="button"
                  onClick={() => setTeamName(team)}
                  className={`rounded-xl border-2 px-2 py-3 text-sm font-black transition ${
                    selected
                      ? 'border-gauge-accent bg-red-50 text-gauge-accent shadow'
                      : 'border-sky-deep/20 bg-white text-sky-deep hover:border-sky-deep hover:bg-sky-50'
                  }`}
                >
                  <span className="block">{team}</span>
                  {alreadyJoined && (
                    <span className="mt-1 block text-[10px] font-bold text-gray-400">参加済み</span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => join(teamName)}
            disabled={!connected || !teamName.trim()}
            className="w-full bg-gauge-accent disabled:bg-gray-300 hover:bg-red-700 text-white text-xl font-black py-4 rounded-xl"
          >
            {teamName ? `${teamName}で参加` : '学部を選択してください'}
          </button>

          {joinedTeams.size > 0 && (
            <>
              <p className="text-xs text-gray-400 mt-4">参加済みのチーム</p>
              <div className="flex flex-wrap gap-1 justify-center mt-1">
                {[...joinedTeams].map((t) => (
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
  const predictionValue =
    myResult !== undefined
      ? myResult.answer >= 0
        ? myResult.answer
        : null
      : answer === ''
        ? null
        : Number(answer);
  const remainingBalloonValue =
    myResult !== undefined
      ? myResult.balloonsAfter
      : pendingMyResult !== undefined
        ? pendingMyResult.balloonsBefore
        : me?.balloons ?? 0;

  return (
    <main className="display-bg min-h-screen p-3 pb-6 flex flex-col">
      <header className="bg-white/95 rounded-2xl shadow p-3 mb-3">
        <div
          className="rounded-xl px-3 py-2 text-white"
          style={{ backgroundColor: me?.color ?? '#E84A4A' }}
        >
          <span className="text-xs font-bold opacity-80">参加中</span>
          <div className="font-black text-xl leading-tight">{joinedTeam}</div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <RemainingBalloon
            value={remainingBalloonValue}
            ariaMax={snapshot?.startBalloons ?? 100}
            color={me?.color ?? '#E84A4A'}
            size="compact"
          />
          <RemainingBalloon
            value={Number.isFinite(predictionValue) ? predictionValue : null}
            color={me?.color ?? '#E84A4A'}
            kind="prediction"
            size="compact"
          />
        </div>
        {myResult && (
          <div
            className={`mt-3 rounded-xl px-3 py-2 text-center font-black shadow-inner ${
              myResult.diff === 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-50 text-gauge-accent'
            }`}
          >
            <span className="text-xs mr-1">誤差</span>
            <span
              className="text-3xl text-white align-middle"
              style={{
                WebkitTextStroke: '4px black',
                paintOrder: 'stroke fill',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {myResult.diff}
            </span>
            <span className="text-sm ml-1">{myResult.diff === 0 ? 'ぴったり' : 'ポイント'}</span>
          </div>
        )}
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

      {phase === 'revealing' && !reveal && (
        <Card>
          <div className="text-center py-6">
            <div className="text-2xl font-black text-gauge-accent mb-1">📺 正解発表中</div>
            <p className="text-gray-500 text-sm">スクリーンの演出が終わると、この端末にも結果が表示されます</p>
          </div>
        </Card>
      )}

      <AnimatePresence>
        {reveal && (
          <Card className="text-center">
            <div className="text-6xl font-black text-gauge-accent tabular-nums">
              {reveal.correctAnswer}%
            </div>
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

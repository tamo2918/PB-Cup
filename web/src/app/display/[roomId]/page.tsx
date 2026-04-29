'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import type {
  AnswerResult,
  PublicTeam,
  QuestionPayload,
  RankingEntry,
  RevealPayload,
  RoomSnapshot,
} from '@husen/shared';
import { useSocket } from '@/hooks/useSocket';
import { TeamCard } from '@/components/TeamCard';
import { GaugeBar } from '@/components/GaugeBar';
import { Confetti } from '@/components/Confetti';
import { QRCard } from '@/components/QRCard';
import { playGameOver, playPerfect, playPop, unlockAudio } from '@/lib/sounds';

interface PoppingState {
  [teamName: string]: number[];
}

export default function DisplayPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = (params?.roomId ?? '').toUpperCase();
  const { socket, connected } = useSocket();

  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [question, setQuestion] = useState<QuestionPayload | null>(null);
  const [reveal, setReveal] = useState<RevealPayload | null>(null);
  const [ranking, setRanking] = useState<RankingEntry[] | null>(null);
  const [popping, setPopping] = useState<PoppingState>({});
  const [perfectTeams, setPerfectTeams] = useState<Set<string>>(new Set());
  const [gameOverTeams, setGameOverTeams] = useState<Set<string>>(new Set());
  const [confetti, setConfetti] = useState(false);
  const [revealKey, setRevealKey] = useState(0);

  // Track displayed balloon counts (lags behind authoritative count for pop animations)
  const [displayBalloons, setDisplayBalloons] = useState<Record<string, number>>({});

  // Once the bar settles, we trigger pop animations.
  const [popAfterBar, setPopAfterBar] = useState(false);

  // Track previous reveal so we don't replay on snapshots.
  const lastRevealKey = useRef<string>('');

  // Connect / display:join
  useEffect(() => {
    if (!socket || !connected) return;
    socket.emit('display:join', { roomId }, (res) => {
      if (!res?.ok) {
        console.warn('display:join failed', res?.error);
      }
    });
    void unlockAudio();
  }, [socket, connected, roomId]);

  useEffect(() => {
    if (!socket) return;
    const onRoom = (snap: RoomSnapshot) => {
      setSnapshot(snap);
      // Sync display balloons when entering answering phase or initial connect
      setDisplayBalloons((prev) => {
        const out = { ...prev };
        for (const t of snap.teams) {
          if (out[t.name] === undefined) out[t.name] = t.balloons;
        }
        return out;
      });
      if (snap.phase === 'answering') {
        setReveal(null);
        setPopping({});
        setPerfectTeams(new Set());
        setGameOverTeams(new Set());
        setConfetti(false);
        setPopAfterBar(false);
        // align display balloons to authoritative
        const fresh: Record<string, number> = {};
        for (const t of snap.teams) fresh[t.name] = t.balloons;
        setDisplayBalloons(fresh);
      }
      if (snap.phase === 'finished') {
        setRanking(snap.ranking ?? []);
      }
    };
    const onQuestion = (q: QuestionPayload) => {
      setQuestion(q);
      setReveal(null);
      setPopping({});
      setPerfectTeams(new Set());
      setGameOverTeams(new Set());
      setConfetti(false);
      setPopAfterBar(false);
    };
    const onReveal = (r: RevealPayload) => {
      const key = `${r.questionIndex}-${r.correctAnswer}-${r.results.length}`;
      if (lastRevealKey.current === key) return; // dedupe
      lastRevealKey.current = key;
      setReveal(r);
      setRevealKey((k) => k + 1);
      setPopAfterBar(false);
    };
    const onEnd = (p: { ranking: RankingEntry[] }) => setRanking(p.ranking);
    socket.on('room:updated', onRoom);
    socket.on('game:question', onQuestion);
    socket.on('game:reveal', onReveal);
    socket.on('game:end', onEnd);
    return () => {
      socket.off('room:updated', onRoom);
      socket.off('game:question', onQuestion);
      socket.off('game:reveal', onReveal);
      socket.off('game:end', onEnd);
    };
  }, [socket]);

  // After the gauge "thump" lands, run pop animations team-by-team.
  // We deliberately depend on (reveal, popAfterBar) only — re-running this
  // effect mid-animation (because `displayBalloons` ticks down) would
  // restart every team's pop sequence.
  useEffect(() => {
    if (!reveal || !popAfterBar) return;
    let cancelled = false;

    const runForTeam = async (res: AnswerResult, baseDelay: number) => {
      // Use the authoritative pre-pop count from the server payload.
      const initialVisible = res.balloonsBefore;
      const toPop = res.popped;
      const indexes = Array.from({ length: toPop }, (_, i) => initialVisible - 1 - i).filter(
        (i) => i >= 0
      );

      const stagger = Math.max(20, 80 - res.popped * 1.5);

      await wait(baseDelay);
      if (cancelled) return;

      for (let i = 0; i < indexes.length; i++) {
        if (cancelled) return;
        const idx = indexes[i]!;
        setPopping((p) => ({
          ...p,
          [res.teamName]: [...(p[res.teamName] ?? []), idx],
        }));
        playPop();
        await wait(stagger);
        setDisplayBalloons((b) => ({
          ...b,
          [res.teamName]: Math.max(0, (b[res.teamName] ?? initialVisible) - 1),
        }));
        setPopping((p) => ({
          ...p,
          [res.teamName]: (p[res.teamName] ?? []).filter((x) => x !== idx),
        }));
      }

      if (res.bonus > 0) {
        await wait(200);
        for (let i = 0; i < res.bonus; i++) {
          if (cancelled) return;
          setDisplayBalloons((b) => ({
            ...b,
            [res.teamName]: (b[res.teamName] ?? 0) + 1,
          }));
          await wait(40);
        }
        setPerfectTeams((s) => new Set(s).add(res.teamName));
        playPerfect();
      }

      if (res.eliminated) {
        await wait(200);
        if (cancelled) return;
        setGameOverTeams((s) => new Set(s).add(res.teamName));
        playGameOver();
      }
    };

    reveal.results.forEach((res, i) => {
      void runForTeam(res, i * 100);
    });

    let confettiTimeout: number | undefined;
    if (reveal.results.some((r) => r.perfect)) {
      confettiTimeout = window.setTimeout(() => {
        setConfetti(true);
        window.setTimeout(() => setConfetti(false), 3500);
      }, 800);
    }
    return () => {
      cancelled = true;
      if (confettiTimeout) window.clearTimeout(confettiTimeout);
    };
  }, [reveal, popAfterBar]);

  const phase = snapshot?.phase;
  const teams = snapshot?.teams ?? [];

  const teamAnswers = useMemo(
    () => {
      const colorsByTeam = new Map((snapshot?.teams ?? []).map((team) => [team.name, team.color]));
      return (
        reveal?.results
          .filter((r) => r.answer >= 0)
          .map((r) => ({
            teamName: r.teamName,
            answer: r.answer,
            color: colorsByTeam.get(r.teamName) ?? '#E84A4A',
          })) ?? []
      );
    },
    [reveal, snapshot?.teams]
  );

  const handleRevealLanded = useCallback(() => {
    if (socket && reveal) {
      socket.emit('display:reveal_complete', {
        roomId,
        questionIndex: reveal.questionIndex,
      });
    }
    setPopAfterBar(true);
  }, [socket, reveal, roomId]);

  // Display balloon count helper (post-pop animation)
  const balloonsFor = (t: PublicTeam) => displayBalloons[t.name] ?? t.balloons;

  const joinUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/join/${roomId}` : '';

  return (
    <main className="display-bg min-h-screen overflow-hidden relative" onClick={() => unlockAudio()}>
      <Confetti active={confetti} />

      {/* Top bar */}
      <header className="absolute top-3 right-3 flex items-center gap-2 z-20">
        <span className="text-xs px-2 py-1 rounded bg-white/40 text-sky-deep font-bold">
          ROOM {roomId}
        </span>
        <span
          className={`text-xs px-2 py-1 rounded ${
            connected ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'
          }`}
        >
          {connected ? '🟢' : '🟡'}
        </span>
      </header>

      {/* Decorative balloons floating up at edges */}
      <DecorativeBalloons />

      <div className="relative z-10 p-6 md:p-10 min-h-screen flex flex-col">
        {/* Lobby */}
        {phase === 'lobby' && (
          <LobbyView
            roomId={roomId}
            joinUrl={joinUrl}
            teams={teams}
            startBalloons={snapshot?.startBalloons ?? 100}
          />
        )}

        {/* Active gameplay */}
        {(phase === 'answering' ||
          phase === 'waiting' ||
          phase === 'revealing' ||
          phase === 'result') && (
          <GameplayView
            snapshot={snapshot!}
            question={
              question ??
              (snapshot?.currentQuestion
                ? {
                    questionIndex: snapshot.questionIndex,
                    questionText: snapshot.currentQuestion.text,
                    totalQuestions: snapshot.totalQuestions,
                  }
                : null)
            }
            reveal={reveal}
            popping={popping}
            perfectTeams={perfectTeams}
            gameOverTeams={gameOverTeams}
            balloonsFor={balloonsFor}
            teamAnswers={teamAnswers}
            revealKey={revealKey}
            onRevealLanded={handleRevealLanded}
          />
        )}

        {/* Finished */}
        {phase === 'finished' && (
          <FinishedView ranking={ranking ?? snapshot?.ranking ?? []} />
        )}
      </div>
    </main>
  );
}

// ─── Subviews ─────────────────────────────────────────────────────────────

function LobbyView({
  roomId,
  joinUrl,
  teams,
  startBalloons,
}: {
  roomId: string;
  joinUrl: string;
  teams: PublicTeam[];
  startBalloons: number;
}) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-8">
      <h1 className="text-5xl md:text-7xl font-black text-sky-deep drop-shadow-[0_4px_0_#FFFFFFA0]">
        🎈 パーセントバルーン
      </h1>
      <p className="text-xl text-sky-deep/80">スマホで参加 → 大画面で観戦</p>

      <div className="flex flex-col md:flex-row gap-8 items-center">
        <QRCard url={joinUrl} label="QRで参加" size={280} />
        <div className="bg-white/95 rounded-2xl shadow-2xl px-8 py-6 text-center">
          <div className="text-sm text-gray-500">ルームID</div>
          <div className="text-7xl font-black tracking-widest text-gauge-accent my-2">
            {roomId}
          </div>
          <div className="text-sm text-gray-500">初期風船 🎈 {startBalloons}</div>
        </div>
      </div>

      <div className="w-full max-w-5xl">
        <h2 className="text-2xl font-black text-sky-deep mb-3 text-center dot-pulse">
          参加チーム ({teams.length})
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {teams.map((t) => (
            <motion.div
              layout
              key={t.name}
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white/95 rounded-xl px-4 py-3 shadow flex flex-col items-center"
            >
              <span className="text-2xl">🎈</span>
              <strong className="text-sky-deep">{t.name}</strong>
              <span className="text-xs text-gray-500">
                {t.online ? '🟢 接続中' : '⚪ オフライン'}
              </span>
            </motion.div>
          ))}
          {teams.length === 0 && (
            <div className="col-span-full text-center text-sky-deep/70 py-6">
              参加者をお待ちしています…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GameplayView({
  snapshot,
  question,
  reveal,
  popping,
  perfectTeams,
  gameOverTeams,
  balloonsFor,
  teamAnswers,
  revealKey,
  onRevealLanded,
}: {
  snapshot: RoomSnapshot;
  question: QuestionPayload | null;
  reveal: RevealPayload | null;
  popping: PoppingState;
  perfectTeams: Set<string>;
  gameOverTeams: Set<string>;
  balloonsFor: (t: PublicTeam) => number;
  teamAnswers: { teamName: string; answer: number; color: string }[];
  revealKey: number;
  onRevealLanded: () => void;
}) {
  const teams = snapshot.teams;
  const phase = snapshot.phase;
  const isReveal = phase === 'revealing' || phase === 'result' || !!reveal;

  return (
    <div className="flex flex-col gap-6 flex-1">
      {/* Top: question or correct value */}
      <AnimatePresence mode="wait">
        {!isReveal && question && (
          <motion.div
            key="question"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
          >
            <QuestionPanel
              index={question.questionIndex}
              total={question.totalQuestions}
              text={question.questionText}
            />
          </motion.div>
        )}
        {isReveal && reveal && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="bg-gauge-dark/80 rounded-3xl shadow-2xl p-6 md:p-10"
          >
            <div className="text-center mb-2 text-yellow-300 font-black text-2xl">
              答えは…
            </div>
            <GaugeBar
              correctAnswer={reveal.correctAnswer}
              teamAnswers={teamAnswers}
              playKey={revealKey}
              onCorrectShown={onRevealLanded}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Team grid */}
      <div className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {teams.map((t) => {
          const result = reveal?.results.find((r) => r.teamName === t.name);
          const showAnswer = isReveal && !!result;
          const visible = balloonsFor(t);
          return (
            <TeamCard
              key={t.name}
              team={{
                ...t,
                // Display lagging balloon count for animation
                balloons: visible,
                currentAnswer: showAnswer ? result?.answer : undefined,
              }}
              startBalloons={snapshot.startBalloons}
              showAnswer={showAnswer}
              poppingIndexes={popping[t.name] ?? []}
              highlight={t.hasAnswered && phase === 'waiting'}
              perfect={perfectTeams.has(t.name)}
              gameOver={gameOverTeams.has(t.name)}
              badgeText={
                phase === 'answering'
                  ? t.hasAnswered
                    ? '回答済み'
                    : undefined
                  : undefined
              }
            />
          );
        })}
      </div>

      {/* Bottom hint */}
      {phase === 'waiting' && !reveal && (
        <div className="text-center text-yellow-300 font-black text-2xl drop-shadow">
          🎉 全員回答完了！正解発表をお待ちください
        </div>
      )}
    </div>
  );
}

function QuestionPanel({ index, total, text }: { index: number; total: number; text: string }) {
  return (
    <div>
      <div className="flex gap-2 mb-3 justify-center">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black border-4 ${
              i < index
                ? 'bg-gray-300 border-gray-400 text-gray-500'
                : i === index
                ? 'bg-gauge-accent border-yellow-300 text-white shadow-lg scale-110'
                : 'bg-white border-sky-deep text-sky-deep'
            }`}
          >
            {i + 1}
          </div>
        ))}
      </div>
      <div className="question-box px-12 py-10 mx-auto max-w-5xl">
        <p className="text-3xl md:text-5xl font-black text-sky-deep leading-relaxed text-center">
          {text}
        </p>
      </div>
    </div>
  );
}

function FinishedView({ ranking }: { ranking: RankingEntry[] }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-8">
      <motion.h1
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 10 }}
        className="text-7xl md:text-9xl font-black text-gauge-accent drop-shadow-[0_4px_0_#FFFFFFA0]"
      >
        🏆 結果発表
      </motion.h1>
      <div className="bg-white/95 rounded-3xl shadow-2xl p-8 max-w-3xl w-full">
        <ol className="space-y-3">
          {ranking.map((r, i) => (
            <motion.li
              key={r.teamName}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.15 }}
              className={`flex items-center justify-between rounded-2xl px-5 py-4 ${
                r.rank === 1
                  ? 'bg-yellow-100 ring-4 ring-yellow-400'
                  : r.rank === 2
                  ? 'bg-gray-100 ring-2 ring-gray-300'
                  : r.rank === 3
                  ? 'bg-orange-100 ring-2 ring-orange-300'
                  : 'bg-sky-50'
              }`}
            >
              <div className="flex items-center gap-4">
                <span className="text-4xl md:text-5xl font-black w-16 text-center">
                  {r.rank === 1 ? '👑' : r.rank}
                </span>
                <span className="text-2xl md:text-3xl font-black text-sky-deep">
                  {r.teamName}
                </span>
              </div>
              <span className="text-xl md:text-2xl font-black text-gauge-accent">
                🎈 {r.balloons}
                {r.eliminated && (
                  <span className="ml-2 text-xs text-gray-400">(脱落)</span>
                )}
              </span>
            </motion.li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function DecorativeBalloons() {
  const items = [
    { left: '5%', delay: 0 },
    { left: '14%', delay: 1.4 },
    { left: '88%', delay: 0.6 },
    { left: '94%', delay: 2.2 },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {items.map((it, i) => (
        <div
          key={i}
          className="absolute -bottom-20 text-5xl animate-floaty"
          style={{ left: it.left, animationDelay: `${it.delay}s` }}
        >
          🎈
        </div>
      ))}
    </div>
  );
}

function wait(ms: number) {
  return new Promise<void>((r) => window.setTimeout(r, ms));
}

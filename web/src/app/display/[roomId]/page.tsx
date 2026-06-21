'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import type {
  QuestionPayload,
  RankingEntry,
  RevealPayload,
  RoomSnapshot,
} from '@husen/shared';
import { useSocket } from '@/hooks/useSocket';
import { TeamCard } from '@/components/TeamCard';
import { GaugeBar } from '@/components/GaugeBar';
import { QuestionCountdown } from '@/components/QuestionCountdown';
import { Confetti } from '@/components/Confetti';
import { QRCard } from '@/components/QRCard';
import { BalloonBurstShow } from '@/components/BalloonBurstShow';
import { playGameOver, playPerfect, unlockAudio } from '@/lib/sounds';

const ANSWER_HOLD_BEFORE_BURST_MS = 2200;

export default function DisplayPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = (params?.roomId ?? '').toUpperCase();
  const { socket, connected } = useSocket();

  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [question, setQuestion] = useState<QuestionPayload | null>(null);
  const [reveal, setReveal] = useState<RevealPayload | null>(null);
  const [ranking, setRanking] = useState<RankingEntry[] | null>(null);
  const [burstActive, setBurstActive] = useState(false);
  const [burstPlayKey, setBurstPlayKey] = useState(0);
  const [confetti, setConfetti] = useState(false);
  const [revealKey, setRevealKey] = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const burstDelayTimerRef = useRef<number | undefined>(undefined);

  // Track previous reveal so we don't replay on snapshots.
  const lastRevealKey = useRef<string>('');
  const handledRevealLandedKey = useRef<string>('');

  const clearBurstDelayTimer = useCallback(() => {
    if (burstDelayTimerRef.current === undefined) return;
    window.clearTimeout(burstDelayTimerRef.current);
    burstDelayTimerRef.current = undefined;
  }, []);

  const stopBurst = useCallback(() => {
    clearBurstDelayTimer();
    setBurstActive(false);
  }, [clearBurstDelayTimer]);

  const handleUnlockAudio = useCallback(() => {
    void unlockAudio().then((ready) => {
      if (ready) setAudioReady(true);
    });
  }, []);

  // Connect / display:join
  useEffect(() => {
    if (!socket || !connected) return;
    socket.emit('display:join', { roomId }, (res) => {
      if (!res?.ok) {
        console.warn('display:join failed', res?.error);
      }
    });
    handleUnlockAudio();
  }, [socket, connected, roomId, handleUnlockAudio]);

  useEffect(() => {
    if (!socket) return;
    const onRoom = (snap: RoomSnapshot) => {
      setSnapshot(snap);
      if (snap.phase === 'reading' || snap.phase === 'answering') {
        setReveal(null);
        stopBurst();
        setConfetti(false);
        handledRevealLandedKey.current = '';
      }
      if (snap.phase === 'result' && snap.reveal) {
        setReveal((current) => current ?? snap.reveal ?? null);
      }
      if (snap.phase === 'finished') {
        stopBurst();
        setRanking(snap.ranking ?? []);
      }
    };
    const onQuestion = (q: QuestionPayload) => {
      setQuestion(q);
      setReveal(null);
      stopBurst();
      setConfetti(false);
      handledRevealLandedKey.current = '';
    };
    const onReveal = (r: RevealPayload) => {
      const key = `${r.questionIndex}-${r.correctAnswer}-${r.results.length}`;
      if (lastRevealKey.current === key) return; // dedupe
      lastRevealKey.current = key;
      handledRevealLandedKey.current = '';
      setReveal(r);
      stopBurst();
      setRevealKey((k) => k + 1);
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
  }, [socket, stopBurst]);

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
    if (!reveal) return;

    const revealLandedKey = `${reveal.questionIndex}-${reveal.correctAnswer}-${reveal.results.length}`;
    if (handledRevealLandedKey.current === revealLandedKey) return;
    handledRevealLandedKey.current = revealLandedKey;

    clearBurstDelayTimer();
    if (reveal.results.length > 0) {
      burstDelayTimerRef.current = window.setTimeout(() => {
        burstDelayTimerRef.current = undefined;
        setBurstActive(true);
        setBurstPlayKey((key) => key + 1);
      }, ANSWER_HOLD_BEFORE_BURST_MS);
    }

    if (socket) {
      socket.emit('display:reveal_complete', {
        roomId,
        questionIndex: reveal.questionIndex,
      });
    }
  }, [clearBurstDelayTimer, socket, reveal, roomId]);

  const handleBurstComplete = useCallback(() => {
    setBurstActive(false);
    if (!reveal) return;

    if (reveal.results.some((result) => result.perfect)) {
      setConfetti(true);
      window.setTimeout(() => setConfetti(false), 3500);
      playPerfect();
    }
    if (reveal.results.some((result) => result.eliminated)) {
      playGameOver();
    }
  }, [reveal]);

  const joinUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/join/${roomId}` : '';

  return (
    <main className="display-bg min-h-screen overflow-hidden relative" onClick={handleUnlockAudio}>
      <Confetti active={confetti} />
      {!audioReady && phase !== 'lobby' && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleUnlockAudio();
          }}
          className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-2xl border-4 border-white bg-sky-deep/95 px-7 py-4 text-center text-white shadow-2xl backdrop-blur"
        >
          <span className="block text-2xl font-black">音声を有効化</span>
          <span className="mt-1 block text-sm font-bold text-white/85">
            管理者画面で操作する前に、ディスプレイ側で一度押してください
          </span>
        </button>
      )}
      <BalloonBurstShow
        active={burstActive}
        playKey={burstPlayKey}
        results={reveal?.results ?? []}
        teams={teams}
        startBalloons={snapshot?.startBalloons ?? 100}
        onComplete={handleBurstComplete}
      />
      {/* Top bar */}
      {phase !== 'lobby' && (
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
      )}

      {/* Decorative balloons floating up at edges */}
      {phase !== 'lobby' && <DecorativeBalloons />}

      <div className="relative z-10 p-6 md:p-10 min-h-screen flex flex-col">
        {/* Lobby */}
        {phase === 'lobby' && <LobbyView joinUrl={joinUrl} />}

        {/* Active gameplay */}
        {(phase === 'reading' ||
          phase === 'answering' ||
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
                    imageUrl: snapshot.currentQuestion.imageUrl,
                    totalQuestions: snapshot.totalQuestions,
                    questionStartedAt: snapshot.questionStartedAt,
                    answerDeadline: snapshot.answerDeadline,
                  }
                : null)
            }
            reveal={reveal}
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

function LobbyView({ joinUrl }: { joinUrl: string }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <QRCard url={joinUrl} label="参加用QRコード" size={480} showDetails={false} />
    </div>
  );
}

function GameplayView({
  snapshot,
  question,
  reveal,
  teamAnswers,
  revealKey,
  onRevealLanded,
}: {
  snapshot: RoomSnapshot;
  question: QuestionPayload | null;
  reveal: RevealPayload | null;
  teamAnswers: { teamName: string; answer: number; color: string }[];
  revealKey: number;
  onRevealLanded: () => void;
}) {
  const teams = snapshot.teams;
  const phase = snapshot.phase;
  const isReveal = phase === 'revealing' || phase === 'result' || !!reveal;
  const activeTeams = teams.filter((team) => !team.eliminated);
  const allAnswered = activeTeams.length > 0 && activeTeams.every((team) => team.hasAnswered);

  return (
    <div className="flex flex-col gap-6 flex-1">
      {/* Top: keep the question visible even while revealing the answer */}
      <AnimatePresence mode="wait">
        {question && (
          <motion.div
            key={`question-${question.questionIndex}-${isReveal ? 'compact' : 'full'}`}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
          >
            <QuestionPanel
              index={question.questionIndex}
              total={question.totalQuestions}
              text={question.questionText}
              imageUrl={question.imageUrl}
              answerDeadline={question.answerDeadline}
              answerPending={phase === 'reading'}
              answerClosed={phase === 'waiting'}
              compact={isReveal}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
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

      {/* Team status is useful while answering, but stays hidden during the answer reveal. */}
      {!isReveal && (
        <div className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 items-start">
          {teams.map((t) => (
            <TeamCard
              key={t.name}
              team={t}
              startBalloons={snapshot.startBalloons}
              highlight={t.hasAnswered && phase === 'waiting'}
              badgeText={
                phase === 'answering'
                  ? t.hasAnswered
                    ? '回答済み'
                    : undefined
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Bottom hint */}
      {phase === 'waiting' && !reveal && (
        <div className="text-center text-yellow-300 font-black text-2xl drop-shadow">
          {allAnswered
            ? '🎉 全員回答完了！正解発表をお待ちください'
            : '⏱ 回答時間終了！正解発表をお待ちください'}
        </div>
      )}
    </div>
  );
}

function QuestionPanel({
  index,
  total,
  text,
  imageUrl,
  answerDeadline,
  answerPending,
  answerClosed,
  compact = false,
}: {
  index: number;
  total: number;
  text: string;
  imageUrl?: string;
  answerDeadline?: number;
  answerPending?: boolean;
  answerClosed?: boolean;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="question-box mx-auto w-full max-w-6xl px-6 py-4">
        <div className="flex items-center gap-5">
          <div className="shrink-0 rounded-2xl bg-gauge-accent px-4 py-2 text-xl font-black text-white shadow">
            問題 {index + 1} / {total}
          </div>
          {imageUrl && (
            <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-xl border-4 border-white bg-sky-deep shadow">
              <QuestionImage src={imageUrl} />
            </div>
          )}
          <p
            className="min-w-0 flex-1 text-2xl font-black leading-snug text-sky-deep md:text-4xl"
            style={{
              textShadow: '2px 2px 0 rgba(255,255,255,0.85)',
            }}
          >
            {text}
          </p>
        </div>
      </div>
    );
  }

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
      {imageUrl ? (
        <div className="question-box mx-auto max-w-6xl overflow-hidden p-0">
          <div className="relative min-h-[330px] bg-sky-deep md:min-h-[430px]">
            <QuestionImage src={imageUrl} />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0057B8] via-[#006CD1]/95 to-[#006CD1]/70 px-8 py-7 md:px-12 md:py-9">
              <p
                className="text-3xl font-black leading-tight text-white md:text-5xl"
                style={{
                  textShadow:
                    '4px 4px 0 #0A2247, -2px -2px 0 #0A2247, 2px -2px 0 #0A2247, -2px 2px 0 #0A2247',
                }}
              >
                {text}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="question-box px-12 py-10 mx-auto max-w-5xl">
          <p className="text-3xl md:text-5xl font-black text-sky-deep leading-relaxed text-center">
            {text}
          </p>
        </div>
      )}
      <div className="mt-4">
        <QuestionCountdown
          deadline={answerDeadline}
          pending={answerPending}
          closed={answerClosed}
        />
      </div>
    </div>
  );
}

function QuestionImage({ src }: { src: string }) {
  // Admin-provided image URLs may be local public paths or arbitrary remote URLs.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />;
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

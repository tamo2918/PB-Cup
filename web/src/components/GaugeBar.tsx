'use client';

import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ANSWER_REVEAL_BGM_DURATION_MS, playAnswerRevealBgm } from '@/lib/sounds';

interface TeamAnswerMarker {
  teamName: string;
  answer: number;
  color: string;
}

interface GaugeBarProps {
  correctAnswer: number;
  teamAnswers?: TeamAnswerMarker[];
  /** Increment to trigger a replay of the animation */
  playKey: number;
  /** Called when the correct number is shown */
  onCorrectShown?: () => void;
}

// Animation tuning — one smooth suspense sweep across the BGM, then a quick final lock.
const BAR_START_AFTER_AUDIO_MS = 220;
const ANSWER_REVEAL_EARLY_MS = 260;
const SUSPENSE_SWEEP_DURATION_S = Math.max(
  1,
  (ANSWER_REVEAL_BGM_DURATION_MS - BAR_START_AFTER_AUDIO_MS - ANSWER_REVEAL_EARLY_MS) / 1000
);
const FINAL_LOCK_DURATION_S = 0.55;

export function GaugeBar({
  correctAnswer,
  teamAnswers = [],
  playKey,
  onCorrectShown,
}: GaugeBarProps) {
  const target = Math.max(0, Math.min(100, correctAnswer));
  const [showCorrect, setShowCorrect] = useState(false);
  const [suspenseActive, setSuspenseActive] = useState(false);
  const [currentLabel, setCurrentLabel] = useState(0);
  const playbackRunRef = useRef(0);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const onCorrectShownRef = useRef(onCorrectShown);
  const suspenseSequence = useMemo(() => makeSuspenseSequence(target), [target]);
  const barAnimate = useMemo(() => {
    if (showCorrect) return { width: `${target}%` };
    if (suspenseActive) return { width: suspenseSequence.widths };
    return { width: '0%' };
  }, [showCorrect, suspenseActive, suspenseSequence.widths, target]);
  const barTransition = useMemo(() => {
    if (showCorrect) {
      return {
        duration: FINAL_LOCK_DURATION_S,
        ease: [0.16, 1, 0.3, 1],
      };
    }

    if (suspenseActive) {
      return {
        duration: SUSPENSE_SWEEP_DURATION_S,
        times: suspenseSequence.times,
        ease: [0.18, 0.86, 0.2, 1],
      };
    }

    return { duration: 0 };
  }, [showCorrect, suspenseActive, suspenseSequence.times]);

  useEffect(() => {
    onCorrectShownRef.current = onCorrectShown;
  }, [onCorrectShown]);

  useEffect(() => {
    const runId = playbackRunRef.current + 1;
    playbackRunRef.current = runId;
    let active = true;

    setShowCorrect(false);
    setSuspenseActive(false);
    setCurrentLabel(0);
    const bgmPlayback = playAnswerRevealBgm();

    const updateLabel = (latest: number) => {
      if (active && playbackRunRef.current === runId) setCurrentLabel(Math.round(latest));
    };

    const run = async () => {
      const startReason = await bgmPlayback.started;
      if (!active || playbackRunRef.current !== runId || startReason === 'stopped') return;

      await wait(BAR_START_AFTER_AUDIO_MS);
      if (!active || playbackRunRef.current !== runId) return;
      setSuspenseActive(true);

      const revealReason = await Promise.race([
        bgmPlayback.done,
        wait(ANSWER_REVEAL_BGM_DURATION_MS - BAR_START_AFTER_AUDIO_MS - ANSWER_REVEAL_EARLY_MS).then(
          () => 'early' as const
        ),
      ]);
      if (!active || playbackRunRef.current !== runId || revealReason === 'stopped') return;

      // Switching off the suspense sweep lets the same bar snap to the true answer.
      setSuspenseActive(false);
      setShowCorrect(true);
      onCorrectShownRef.current?.();
    };

    void run();

    // Live percent label sampled from the moving DOM node
    const interval = window.setInterval(() => {
      const el = fillRef.current;
      if (!el) return;
      const parent = el.parentElement;
      if (!parent) return;
      const width = parseFloat(getComputedStyle(el).width);
      const parentWidth = parent.clientWidth;
      if (parentWidth > 0) updateLabel(Math.max(0, Math.min(100, (width / parentWidth) * 100)));
    }, 33);

    return () => {
      active = false;
      bgmPlayback.stop();
      window.clearInterval(interval);
    };
  }, [playKey, target]);

  return (
    <div className="w-full">
      {/* Bar — slightly thicker, with room for tall markers above */}
      <div className="relative w-full h-32 rounded-2xl overflow-visible">
        {/* Track */}
        <div className="absolute inset-0 rounded-2xl gauge-track shadow-inner" />

        {/* Gold "filled portion" — this is the moving reveal animation itself */}
        <motion.div
          ref={fillRef}
          data-gauge-fill
          className="absolute inset-y-0 left-0 rounded-l-2xl gauge-fill"
          style={{ width: '0%' }}
          animate={barAnimate}
          transition={barTransition}
        />

        {/* Scale labels every 25% */}
        {[0, 25, 50, 75, 100].map((p) => (
          <div
            key={p}
            className="absolute -bottom-7 -translate-x-1/2 text-white/70 text-sm font-bold"
            style={{ left: `${p}%` }}
          >
            {p}
          </div>
        ))}

        {/* Team answer markers — visible from the start, staggered fade-in */}
        {teamAnswers.map((t, i) => {
          const answerPosition = Math.max(0, Math.min(100, t.answer));
          const labelTransform =
            answerPosition >= 96
              ? 'translateX(calc(-50% - 0.5rem))'
              : answerPosition <= 4
                ? 'translateX(calc(50% + 0.5rem))'
                : undefined;

          return (
            <motion.div
              key={t.teamName + t.answer}
              className="absolute -top-14 z-10 w-0"
              style={{ left: `${answerPosition}%` }}
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.08, duration: 0.4 }}
            >
              <div className="flex flex-col items-center">
                <span
                  className="px-2 py-0.5 rounded text-[11px] font-black text-white shadow-md whitespace-nowrap"
                  style={{ backgroundColor: t.color, transform: labelTransform }}
                >
                  {t.teamName} {t.answer}%
                </span>
                <div
                  className="w-0 h-0 border-l-[7px] border-r-[7px] border-t-[10px] border-l-transparent border-r-transparent"
                  style={{ borderTopColor: t.color }}
                />
                <div
                  className="w-[2px] h-[180px]"
                  style={{ backgroundColor: t.color, opacity: 0.85 }}
                />
              </div>
            </motion.div>
          );
        })}

        {/* Final red answer line — only appears once the fill bar settles */}
        {showCorrect && (
          <div
            className="absolute -top-3 z-20"
            style={{ left: `${correctAnswer}%`, transform: 'translateX(-50%)' }}
          >
            <div className="flex flex-col items-center">
              <motion.div
                initial={{
                  scale: 1,
                  filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.4))',
                }}
                animate={{
                  scale: [1, 1.5, 1.15],
                  filter: 'drop-shadow(0 0 14px rgba(224,20,60,0.95))',
                }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="w-0 h-0 border-l-[16px] border-r-[16px] border-t-[22px] border-l-transparent border-r-transparent"
                style={{ borderTopColor: '#E0143C' }}
              />
              <motion.div
                initial={{
                  width: 3,
                  backgroundColor: '#F2C846',
                  boxShadow: '0 0 8px rgba(242,200,70,0.55)',
                }}
                animate={{
                  width: 6,
                  backgroundColor: '#E0143C',
                  boxShadow: '0 0 18px rgba(224,20,60,1), 0 0 36px rgba(224,20,60,0.55)',
                }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
                className="h-[170px] rounded-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* Big percent label below the bar */}
      <div className="mt-12 flex items-end justify-between">
        <div className="text-white/70 text-sm">正解</div>
        <motion.div
          key={`label-${playKey}-${showCorrect ? 'final' : 'live'}`}
          initial={showCorrect ? { scale: 0.5, opacity: 0 } : { scale: 1, opacity: 0.85 }}
          animate={
            showCorrect
              ? { scale: [0.5, 1.5, 1.0], opacity: 1, color: '#E0143C' }
              : { scale: 1, opacity: 0.85, color: '#ffffff' }
          }
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="text-7xl md:text-8xl font-black drop-shadow-lg"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {showCorrect ? correctAnswer : currentLabel}
          <span className="text-3xl md:text-5xl ml-1">%</span>
        </motion.div>
      </div>
    </div>
  );
}

function makeSuspenseSequence(target: number): { widths: string[]; times: number[] } {
  const finalGap = target < 30 ? 13 : target < 70 ? 10 : 6;
  const preAnswer = target >= 98 ? 100 : clamp(target + finalGap, target + 4, 98);

  return {
    widths: ['0%', '100%', `${preAnswer}%`],
    times: [0, 0.42, 1],
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

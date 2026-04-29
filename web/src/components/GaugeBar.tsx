'use client';

import { motion, useAnimation } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { colorForName } from '@/lib/colors';
import { playReveal } from '@/lib/sounds';

interface TeamAnswerMarker {
  teamName: string;
  answer: number;
}

interface GaugeBarProps {
  correctAnswer: number;
  teamAnswers?: TeamAnswerMarker[];
  /** Increment to trigger a replay of the animation */
  playKey: number;
  /** Called when the correct number "thump" lands */
  onCorrectShown?: () => void;
}

// Animation tuning — slower, more suspenseful sweep.
const SLIDE_DURATION_S = 2.6;
const SPRING_STIFFNESS = 45;
const SPRING_DAMPING = 9;
const SPRING_MASS = 1.6;

export function GaugeBar({
  correctAnswer,
  teamAnswers = [],
  playKey,
  onCorrectShown,
}: GaugeBarProps) {
  const controls = useAnimation();
  const [showCorrect, setShowCorrect] = useState(false);
  const [currentLabel, setCurrentLabel] = useState(0);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    setShowCorrect(false);
    setCurrentLabel(0);

    const target = Math.max(0, Math.min(100, correctAnswer));
    const overshoot = Math.min(98, Math.max(target + 25, target * 1.8));

    const updateLabel = (latest: number) => {
      if (!cancelled.current) setCurrentLabel(Math.round(latest));
    };

    const run = async () => {
      // Phase A: slow slide to overshoot — builds suspense
      await controls.start({
        left: `${overshoot}%`,
        transition: { duration: SLIDE_DURATION_S, ease: [0.25, 0.46, 0.45, 0.94] },
      });
      if (cancelled.current) return;

      // Phase B: gentle spring back, slower oscillation
      await controls.start({
        left: `${target}%`,
        transition: {
          type: 'spring',
          stiffness: SPRING_STIFFNESS,
          damping: SPRING_DAMPING,
          mass: SPRING_MASS,
          restDelta: 0.05,
        },
      });
      if (cancelled.current) return;

      // Phase C: lock in the red answer line + big number + sound
      playReveal();
      setShowCorrect(true);
      onCorrectShown?.();
    };

    void run();

    // Live percent label sampled from the moving DOM node
    const interval = window.setInterval(() => {
      const el = document.querySelector<HTMLElement>('[data-gauge-pointer]');
      if (!el) return;
      const parent = el.parentElement;
      if (!parent) return;
      const left = parseFloat(getComputedStyle(el).left);
      const width = parent.clientWidth;
      if (width > 0) updateLabel(Math.max(0, Math.min(100, (left / width) * 100)));
    }, 33);

    return () => {
      cancelled.current = true;
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey]);

  return (
    <div className="w-full">
      {/* Bar — slightly thicker, with room for tall markers above */}
      <div className="relative w-full h-32 rounded-2xl overflow-visible">
        {/* Track */}
        <div className="absolute inset-0 rounded-2xl gauge-track shadow-inner" />

        {/* Gold "filled portion" — only fills after the answer is locked in */}
        <motion.div
          className="absolute inset-y-0 left-0 rounded-l-2xl gauge-fill"
          initial={{ width: '0%' }}
          animate={{ width: showCorrect ? `${correctAnswer}%` : '0%' }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
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
          const color = colorForName(t.teamName);
          return (
            <motion.div
              key={t.teamName + t.answer}
              className="absolute -top-14 z-10"
              style={{ left: `${Math.max(0, Math.min(100, t.answer))}%`, transform: 'translateX(-50%)' }}
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.08, duration: 0.4 }}
            >
              <div className="flex flex-col items-center">
                <span
                  className="px-2 py-0.5 rounded text-[11px] font-black text-white shadow-md whitespace-nowrap"
                  style={{ backgroundColor: color }}
                >
                  {t.teamName} {t.answer}%
                </span>
                <div
                  className="w-0 h-0 border-l-[7px] border-r-[7px] border-t-[10px] border-l-transparent border-r-transparent"
                  style={{ borderTopColor: color }}
                />
                <div className="w-[2px] h-[180px]" style={{ backgroundColor: color, opacity: 0.85 }} />
              </div>
            </motion.div>
          );
        })}

        {/* Sliding pointer — gold during animation, transforms to glowing red on lock */}
        <motion.div
          data-gauge-pointer
          className="absolute -top-3 z-20"
          style={{ left: '0%', transform: 'translateX(-50%)' }}
          animate={controls}
          initial={{ left: '0%' }}
        >
          <div className="flex flex-col items-center">
            <motion.div
              animate={{
                scale: showCorrect ? [1, 1.5, 1.15] : 1,
                filter: showCorrect
                  ? 'drop-shadow(0 0 14px rgba(224,20,60,0.95))'
                  : 'drop-shadow(0 4px 4px rgba(0,0,0,0.4))',
              }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="w-0 h-0 border-l-[16px] border-r-[16px] border-t-[22px] border-l-transparent border-r-transparent"
              style={{ borderTopColor: showCorrect ? '#E0143C' : '#F2C846' }}
            />
            <motion.div
              animate={{
                width: showCorrect ? 6 : 3,
                backgroundColor: showCorrect ? '#E0143C' : '#F2C846',
                boxShadow: showCorrect
                  ? '0 0 18px rgba(224,20,60,1), 0 0 36px rgba(224,20,60,0.55)'
                  : '0 0 8px rgba(242,200,70,0.55)',
              }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="h-[170px] rounded-sm"
            />
          </div>
        </motion.div>
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

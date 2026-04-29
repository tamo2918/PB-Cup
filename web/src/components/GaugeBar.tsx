'use client';

import { motion, useAnimation } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { playReveal } from '@/lib/sounds';

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
  const fillControls = useAnimation();
  const [showCorrect, setShowCorrect] = useState(false);
  const [currentLabel, setCurrentLabel] = useState(0);
  const cancelled = useRef(false);
  const onCorrectShownRef = useRef(onCorrectShown);

  useEffect(() => {
    onCorrectShownRef.current = onCorrectShown;
  }, [onCorrectShown]);

  useEffect(() => {
    cancelled.current = false;
    setShowCorrect(false);
    setCurrentLabel(0);
    fillControls.set({ width: '0%' });

    const target = Math.max(0, Math.min(100, correctAnswer));
    const overshoot = Math.min(98, Math.max(target + 25, target * 1.8));

    const updateLabel = (latest: number) => {
      if (!cancelled.current) setCurrentLabel(Math.round(latest));
    };

    const run = async () => {
      // Phase A: push the existing fill bar past the answer — builds suspense
      await fillControls.start({
        width: `${overshoot}%`,
        transition: { duration: SLIDE_DURATION_S, ease: [0.25, 0.46, 0.45, 0.94] },
      });
      if (cancelled.current) return;

      // Phase B: gentle spring back to the true answer
      await fillControls.start({
        width: `${target}%`,
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
      onCorrectShownRef.current?.();
    };

    void run();

    // Live percent label sampled from the moving DOM node
    const interval = window.setInterval(() => {
      const el = document.querySelector<HTMLElement>('[data-gauge-fill]');
      if (!el) return;
      const parent = el.parentElement;
      if (!parent) return;
      const width = parseFloat(getComputedStyle(el).width);
      const parentWidth = parent.clientWidth;
      if (parentWidth > 0) updateLabel(Math.max(0, Math.min(100, (width / parentWidth) * 100)));
    }, 33);

    return () => {
      cancelled.current = true;
      window.clearInterval(interval);
    };
  }, [correctAnswer, fillControls, playKey]);

  return (
    <div className="w-full">
      {/* Bar — slightly thicker, with room for tall markers above */}
      <div className="relative w-full h-32 rounded-2xl overflow-visible">
        {/* Track */}
        <div className="absolute inset-0 rounded-2xl gauge-track shadow-inner" />

        {/* Gold "filled portion" — this is the moving reveal animation itself */}
        <motion.div
          data-gauge-fill
          className="absolute inset-y-0 left-0 rounded-l-2xl gauge-fill"
          initial={{ width: '0%' }}
          animate={fillControls}
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
                  style={{ backgroundColor: t.color }}
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

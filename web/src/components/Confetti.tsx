'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';

interface ConfettiProps {
  count?: number;
  active: boolean;
  colors?: string[];
}

const DEFAULT_COLORS = ['#F2C846', '#E0143C', '#3FA6E8', '#5BC07C', '#A66CD0', '#F39A3F'];

export function Confetti({ count = 80, active, colors = DEFAULT_COLORS }: ConfettiProps) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: -10 - Math.random() * 30,
        rotate: Math.random() * 360,
        size: 6 + Math.random() * 10,
        color: colors[i % colors.length]!,
        delay: Math.random() * 0.4,
        dur: 1.5 + Math.random() * 1.0,
      })),
    [count, colors]
  );

  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          initial={{ x: `${p.x}vw`, y: `${p.y}vh`, rotate: 0, opacity: 1 }}
          animate={{ y: '110vh', rotate: p.rotate + 720, opacity: [1, 1, 0] }}
          transition={{ duration: p.dur, delay: p.delay, ease: 'easeIn' }}
          style={{
            width: p.size,
            height: p.size * 1.4,
            background: p.color,
            borderRadius: 2,
            position: 'absolute',
          }}
        />
      ))}
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import { Balloon } from './Balloon';
import { balloonColorsForGrid } from '@/lib/colors';

interface BalloonGridProps {
  total: number;          // total slots (e.g. startBalloons)
  remaining: number;      // currently visible
  poppingIndexes?: number[]; // indexes that are currently popping (animate)
  seed: string;           // team name → deterministic color order
  size?: number;
  cols?: number;
}

export function BalloonGrid({
  total,
  remaining,
  poppingIndexes = [],
  seed,
  size = 18,
  cols = 10,
}: BalloonGridProps) {
  const colors = useMemo(() => balloonColorsForGrid(seed, total), [seed, total]);

  return (
    <div
      className="grid gap-[2px]"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {colors.map((c, idx) => {
        const visible = idx < remaining + poppingIndexes.length;
        const popping = poppingIndexes.includes(idx);
        if (!visible) return <div key={idx} style={{ width: size, height: size * 1.25 }} />;
        return (
          <Balloon
            key={idx}
            color={c}
            popped={popping}
            delay={popping ? Math.random() * 0.4 : 0}
            size={size}
          />
        );
      })}
    </div>
  );
}

'use client';

import { motion, type Transition } from 'framer-motion';

export interface BalloonProps {
  color: string;
  popped?: boolean;
  delay?: number;
  size?: number;
}

const popTransition: Transition = { duration: 0.32, ease: [0.4, 0.0, 0.7, 1] };

export function Balloon({ color, popped = false, delay = 0, size = 28 }: BalloonProps) {
  return (
    <motion.svg
      width={size}
      height={size * 1.25}
      viewBox="0 0 40 50"
      initial={false}
      animate={
        popped
          ? { scale: [1, 1.4, 0], opacity: [1, 1, 0], rotate: [0, -8, 0] }
          : { scale: 1, opacity: 1, rotate: 0 }
      }
      transition={popped ? { ...popTransition, delay } : { duration: 0.2 }}
      style={{ display: 'block' }}
    >
      <defs>
        <radialGradient id={`g-${color}`} cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="white" stopOpacity="0.65" />
          <stop offset="60%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="1" />
        </radialGradient>
      </defs>
      {/* string */}
      <path
        d="M20 36 Q22 42 19 48"
        stroke="rgba(0,0,0,0.4)"
        strokeWidth="1"
        fill="none"
      />
      {/* balloon body */}
      <ellipse cx="20" cy="20" rx="14" ry="17" fill={`url(#g-${color})`} />
      {/* knot */}
      <path d="M17 36 L23 36 L20 39 Z" fill={color} opacity="0.9" />
      {/* highlight */}
      <ellipse cx="14" cy="13" rx="3" ry="4.5" fill="white" opacity="0.5" />
    </motion.svg>
  );
}

'use client';

import { motion } from 'framer-motion';
import type { PublicTeam } from '@husen/shared';
import { BalloonGrid } from './BalloonGrid';

interface TeamCardProps {
  team: PublicTeam;
  startBalloons: number;
  highlight?: boolean;     // e.g. all-answered or being revealed
  showAnswer?: boolean;
  poppingIndexes?: number[];
  badgeText?: string;
  perfect?: boolean;
  gameOver?: boolean;
}

export function TeamCard({
  team,
  startBalloons,
  highlight = false,
  showAnswer = false,
  poppingIndexes = [],
  badgeText,
  perfect = false,
  gameOver = false,
}: TeamCardProps) {
  return (
    <motion.div
      layout
      animate={
        gameOver
          ? { x: [0, -6, 6, -4, 4, 0] }
          : perfect
          ? { y: [0, -8, 0], scale: [1, 1.05, 1] }
          : undefined
      }
      transition={{ duration: 0.6 }}
      className={`relative rounded-2xl p-3 bg-white/95 shadow-lg overflow-hidden ${
        highlight ? 'ring-4 ring-yellow-300' : ''
      } ${team.eliminated ? 'opacity-60 grayscale' : ''}`}
    >
      {/* Team name banner */}
      <div
        className="rounded-xl px-3 py-2 mb-2 flex items-center justify-between"
        style={{ backgroundColor: team.color, color: 'white' }}
      >
        <span className="font-black text-lg truncate">{team.name}</span>
        <span className="font-bold text-sm bg-white/25 rounded-full px-2 py-0.5">
          🎈 {team.balloons}
        </span>
      </div>

      {/* Balloon grid */}
      <div className="bg-sky-100 rounded-xl p-2">
        <BalloonGrid
          total={startBalloons}
          remaining={team.balloons}
          poppingIndexes={poppingIndexes}
          seed={team.name}
          size={14}
          cols={10}
        />
      </div>

      {/* Status / answer overlay */}
      <div className="mt-2 flex items-center justify-between text-xs">
        {showAnswer && team.currentAnswer !== undefined && team.currentAnswer >= 0 ? (
          <span className="font-bold text-sky-deep">回答 {team.currentAnswer}%</span>
        ) : team.hasAnswered ? (
          <span className="text-emerald-600 font-bold">✅ 回答済み</span>
        ) : (
          <span className="text-gray-400">未回答</span>
        )}
        {!team.online && <span className="text-amber-600">⚠ オフライン</span>}
      </div>

      {/* Badges */}
      {badgeText && (
        <div className="absolute top-1 right-1 bg-yellow-300 text-gauge-accent text-xs font-black px-2 py-1 rounded-full shadow">
          {badgeText}
        </div>
      )}
      {perfect && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <span className="text-4xl font-black text-yellow-400 drop-shadow-[0_2px_0_#E0143C]">
            PERFECT!!
          </span>
        </motion.div>
      )}
      {gameOver && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex items-center justify-center bg-red-500/30 pointer-events-none"
        >
          <span className="text-3xl font-black text-white drop-shadow-[0_2px_0_#000]">GAME OVER</span>
        </motion.div>
      )}
    </motion.div>
  );
}

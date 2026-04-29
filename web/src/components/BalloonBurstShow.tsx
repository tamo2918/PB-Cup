'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AnswerResult, PublicTeam } from '@husen/shared';
import { balloonColorsForGrid } from '@/lib/colors';
import { playPop } from '@/lib/sounds';

interface BalloonBurstShowProps {
  active: boolean;
  playKey: number;
  results: AnswerResult[];
  teams: PublicTeam[];
  startBalloons: number;
  onPop?: (teamName: string, remaining: number) => void;
  onComplete: () => void;
}

interface BalloonLayoutItem {
  index: number;
  x: number;
  y: number;
  scale: number;
  rotate: number;
  color: string;
  stringColor: string;
  zIndex: number;
  gradientId: string;
  anchorX: number;
  floatDelay: number;
  floatY: number;
  sway: number;
}

const INTRO_MS = 850;
const OUTRO_MS = 900;
const NO_POP_HOLD_MS = 1300;
const MIN_POP_STEP_MS = 42;
const MAX_POP_STEP_MS = 120;

export function BalloonBurstShow({
  active,
  playKey,
  results,
  teams,
  startBalloons,
  onPop,
  onComplete,
}: BalloonBurstShowProps) {
  const [teamIndex, setTeamIndex] = useState(0);
  const [poppedCount, setPoppedCount] = useState(0);
  const [poppingIndex, setPoppingIndex] = useState<number | null>(null);
  const [wingsOpen, setWingsOpen] = useState(true);

  const teamByName = useMemo(
    () => new Map(teams.map((team) => [team.name, team])),
    [teams]
  );
  const orderedResults = useMemo(
    () => results.filter((result) => teamByName.has(result.teamName)),
    [results, teamByName]
  );
  const current = orderedResults[teamIndex] ?? null;
  const currentTeamName = current?.teamName ?? '';
  const currentBeforeCount = current?.balloonsBefore ?? 0;
  const currentTeam = current ? teamByName.get(current.teamName) ?? null : null;
  const beforeCount = current?.balloonsBefore ?? startBalloons;
  const visiblePopCount = current ? Math.min(current.popped, current.balloonsBefore) : 0;
  const remainingCount = current ? Math.max(0, beforeCount - poppedCount) : 0;
  const popStepMs =
    visiblePopCount > 0
      ? Math.max(MIN_POP_STEP_MS, Math.min(MAX_POP_STEP_MS, Math.round(3000 / visiblePopCount)))
      : MAX_POP_STEP_MS;
  const layout = useMemo(
    () => makeBalloonLayout(beforeCount, current?.teamName ?? 'team'),
    [beforeCount, current?.teamName]
  );
  const birdTarget = poppingIndex === null ? null : layout.find((item) => item.index === poppingIndex);
  const birdLeft = birdTarget ? clamp(birdTarget.x + (birdTarget.x < 50 ? 5 : -5), 17, 83) : 54;
  const birdTop = birdTarget ? clamp(birdTarget.y + 5, 22, 62) : 39;

  useEffect(() => {
    if (!active) return;
    setTeamIndex(0);
    setPoppedCount(0);
    setPoppingIndex(null);
  }, [active, playKey]);

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => setWingsOpen((open) => !open), 120);
    return () => window.clearInterval(interval);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    if (!currentTeamName) {
      const timeout = window.setTimeout(onComplete, 400);
      return () => window.clearTimeout(timeout);
    }

    let cancelled = false;
    const timers: number[] = [];
    const clearPopMark = () => {
      if (!cancelled) setPoppingIndex(null);
    };

    setPoppedCount(0);
    setPoppingIndex(null);
    onPop?.(currentTeamName, currentBeforeCount);

    for (let i = 0; i < visiblePopCount; i++) {
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return;
          const nextPopped = i + 1;
          const nextRemaining = Math.max(0, currentBeforeCount - nextPopped);
          const nextPoppingIndex = Math.max(0, currentBeforeCount - nextPopped);
          setPoppingIndex(nextPoppingIndex);
          setPoppedCount(nextPopped);
          onPop?.(currentTeamName, nextRemaining);
          playPop();
          timers.push(window.setTimeout(clearPopMark, 260));
        }, INTRO_MS + i * popStepMs)
      );
    }

    const totalMs =
      INTRO_MS +
      visiblePopCount * popStepMs +
      OUTRO_MS +
      (visiblePopCount === 0 ? NO_POP_HOLD_MS : 0);
    timers.push(
      window.setTimeout(() => {
        if (cancelled) return;
        if (teamIndex >= orderedResults.length - 1) {
          onComplete();
        } else {
          setTeamIndex((index) => index + 1);
        }
      }, totalMs)
    );

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [
    active,
    currentBeforeCount,
    currentTeamName,
    onComplete,
    onPop,
    orderedResults.length,
    popStepMs,
    teamIndex,
    visiblePopCount,
  ]);

  return (
    <AnimatePresence>
      {active && current && currentTeam && (
        <motion.div
          className="fixed inset-0 z-50 overflow-hidden bg-sky-500 text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <SkyBackdrop variant={teamIndex % BALLOON_BACKGROUNDS.length} />
          <motion.div
            key={`${current.teamName}-${playKey}`}
            className="relative h-full w-full overflow-hidden"
            initial={{ scale: 1.03, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.98, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <StageHeader
              teamName={current.teamName}
              teamColor={currentTeam.color}
              answer={current.answer}
              diff={current.diff}
              perfect={current.perfect}
              index={teamIndex + 1}
              total={orderedResults.length}
            />
            <BalloonField
              items={layout}
              remaining={remainingCount}
              poppingIndex={poppingIndex}
            />
            <motion.div
              className="absolute z-[235] w-[250px] md:w-[330px]"
              initial={{ left: '54%', top: '39%', x: '-50%', y: '-44%', scale: 0.82, opacity: 0 }}
              animate={{
                left: `${birdLeft}%`,
                top: `${birdTop}%`,
                x: '-50%',
                y: ['-44%', '-54%', '-40%', '-50%'],
                scale: [0.98, 1.06, 1],
                opacity: 1,
                rotate: [-3, 4, -2],
              }}
              transition={{
                left: { duration: 0.2, ease: 'easeOut' },
                top: { duration: 0.2, ease: 'easeOut' },
                y: { duration: 0.55, repeat: Infinity, ease: 'easeInOut' },
                scale: { duration: 0.55, repeat: Infinity, ease: 'easeInOut' },
                rotate: { duration: 0.7, repeat: Infinity, ease: 'easeInOut' },
                opacity: { duration: 0.2 },
              }}
            >
              <PigeonSprite wingsOpen={wingsOpen} />
            </motion.div>
            <RemainingCounter
              remaining={remainingCount}
              before={current.balloonsBefore}
              popped={visiblePopCount}
            />
            <WickerBasket />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StageHeader({
  teamName,
  teamColor,
  answer,
  diff,
  perfect,
  index,
  total,
}: {
  teamName: string;
  teamColor: string;
  answer: number;
  diff: number;
  perfect: boolean;
  index: number;
  total: number;
}) {
  return (
    <div className="absolute left-8 right-8 top-6 z-[240] flex items-start justify-between gap-5">
      <div
        className="rounded-3xl border-4 border-white px-8 py-4 shadow-2xl"
        style={{ backgroundColor: teamColor }}
      >
        <div className="text-lg font-black opacity-90">第 {index} / {total} チーム</div>
        <div
          className="text-5xl font-black leading-none md:text-7xl"
          style={{
            WebkitTextStroke: '3px black',
            paintOrder: 'stroke fill',
          }}
        >
          {teamName}
        </div>
      </div>
      <div className="rounded-3xl border-4 border-white bg-black/55 px-7 py-4 text-right shadow-2xl backdrop-blur">
        <div className="text-xl font-black text-yellow-300">予想 {answer < 0 ? '未回答' : `${answer}%`}</div>
        <div className="mt-1 text-3xl font-black">
          誤差{' '}
          <span
            className="text-5xl text-white"
            style={{ WebkitTextStroke: '4px black', paintOrder: 'stroke fill' }}
          >
            {diff}
          </span>{' '}
          {perfect ? 'ぴったり' : 'ポイント'}
        </div>
      </div>
    </div>
  );
}

function BalloonField({
  items,
  remaining,
  poppingIndex,
}: {
  items: BalloonLayoutItem[];
  remaining: number;
  poppingIndex: number | null;
}) {
  return (
    <div className="absolute inset-0 z-20">
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
        {items.map((item) => {
          const popping = poppingIndex === item.index;
          const visible = item.index < remaining || popping;
          if (!visible) return null;
          return (
            <line
              key={`string-${item.index}`}
              x1={`${item.anchorX}%`}
              y1="91%"
              x2={`${item.x}%`}
              y2={`${item.y + 10}%`}
              stroke={item.stringColor}
              strokeWidth="2.6"
              strokeLinecap="round"
              opacity="0.78"
            />
          );
        })}
      </svg>
      {items.map((item) => {
        const popping = poppingIndex === item.index;
        const visible = item.index < remaining || popping;
        if (!visible) return null;

        return (
          <div key={item.index}>
            <motion.div
              className="absolute"
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                width: `${118 * item.scale}px`,
                zIndex: item.zIndex,
              }}
              initial={false}
              animate={
                popping
                  ? { scale: [1, 1.45, 0], opacity: [1, 1, 0], rotate: [item.rotate, item.rotate - 18, item.rotate + 8] }
                  : {
                      scale: [1, 1.03, 1],
                      y: [0, -item.floatY, 0],
                      opacity: 1,
                      rotate: [item.rotate, item.rotate + item.sway, item.rotate],
                    }
              }
              transition={
                popping
                  ? { duration: 0.28, ease: [0.4, 0, 0.7, 1] }
                  : { duration: 2.5 + item.floatDelay, repeat: Infinity, ease: 'easeInOut' }
              }
            >
              <StageBalloon item={item} />
              {popping && <PopFlash />}
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

function StageBalloon({ item }: { item: BalloonLayoutItem }) {
  const lightColor = mixHexColor(item.color, '#ffffff', 0.5);
  const darkColor = mixHexColor(item.color, '#000000', 0.22);

  return (
    <svg viewBox="0 0 92 122" className="block w-full overflow-visible" aria-hidden="true">
      <defs>
        <radialGradient id={item.gradientId} cx="36%" cy="22%" r="74%">
          <stop offset="0%" stopColor="white" stopOpacity="0.98" />
          <stop offset="20%" stopColor={lightColor} />
          <stop offset="62%" stopColor={item.color} />
          <stop offset="100%" stopColor={darkColor} />
        </radialGradient>
      </defs>
      <path
        d="M46 5C19 5 3 26 3 56c0 34 19 57 43 57s43-23 43-57C89 26 73 5 46 5Z"
        fill={`url(#${item.gradientId})`}
        stroke="black"
        strokeWidth="3.8"
        strokeLinejoin="round"
      />
      <path
        d="M46 110 36 121l10-5 10 5-10-11Z"
        fill={darkColor}
        stroke="black"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M23 17c-11 7-16 20-14 34 9-11 22-19 38-22-7-10-15-15-24-12Z"
        fill="white"
        opacity="0.55"
      />
    </svg>
  );
}

function PigeonSprite({ wingsOpen }: { wingsOpen: boolean }) {
  return (
    <svg viewBox="0 0 260 220" className="block w-full overflow-visible" aria-hidden="true">
      <g stroke="black" strokeLinecap="round" strokeLinejoin="round">
        {wingsOpen ? (
          <>
            <path
              d="M114 82C76 26 34 14 8 43c33 10 68 42 94 82Z"
              fill="#F7FBFF"
              strokeWidth="5"
            />
            <path
              d="M146 82c38-56 80-68 106-39-33 10-68 42-94 82Z"
              fill="#F7FBFF"
              strokeWidth="5"
            />
            <path d="M37 43c31 20 53 48 69 78" fill="none" stroke="#C6CEDA" strokeWidth="3" />
            <path d="M223 43c-31 20-53 48-69 78" fill="none" stroke="#C6CEDA" strokeWidth="3" />
            <path d="M68 55c21 20 36 41 47 66" fill="none" stroke="#D9DEE7" strokeWidth="3" />
            <path d="M192 55c-21 20-36 41-47 66" fill="none" stroke="#D9DEE7" strokeWidth="3" />
          </>
        ) : (
          <>
            <path
              d="M110 91C73 76 36 84 13 113c39 6 72-2 102-24Z"
              fill="#F7FBFF"
              strokeWidth="5"
            />
            <path
              d="M150 91c37-15 74-7 97 22-39 6-72-2-102-24Z"
              fill="#F7FBFF"
              strokeWidth="5"
            />
            <path d="M45 102c25 0 48-5 70-18" fill="none" stroke="#C6CEDA" strokeWidth="3" />
            <path d="M215 102c-25 0-48-5-70-18" fill="none" stroke="#C6CEDA" strokeWidth="3" />
          </>
        )}
        <path
          d="M107 145 75 197l44-24Z"
          fill="#E5EAF1"
          strokeWidth="5"
        />
        <path
          d="M153 145 185 197l-44-24Z"
          fill="#E5EAF1"
          strokeWidth="5"
        />
        <path
          d="M101 80c-18 28-20 72-2 99 15 22 47 22 62 0 18-27 16-71-2-99-14-22-44-22-58 0Z"
          fill="#FFFFFF"
          strokeWidth="5"
        />
        <path
          d="M108 58c-3-24 9-40 22-40s25 16 22 40c-4 23-40 23-44 0Z"
          fill="#FFFFFF"
          strokeWidth="5"
        />
        <path d="M121 59 130 78l9-19Z" fill="#F7A336" strokeWidth="4" />
        <circle cx="119" cy="45" r="4.2" fill="black" stroke="none" />
        <circle cx="141" cy="45" r="4.2" fill="black" stroke="none" />
        <circle cx="120.4" cy="43.8" r="1.2" fill="white" stroke="none" />
        <circle cx="142.4" cy="43.8" r="1.2" fill="white" stroke="none" />
        <path d="M112 129c13 9 23 9 36 0" fill="none" stroke="#C6CEDA" strokeWidth="3" />
        <path d="M113 183 101 207M147 183l12 24" fill="none" stroke="#D79A41" strokeWidth="5" />
        <path d="M96 208 110 204M164 208l-14-4" fill="none" stroke="#D79A41" strokeWidth="5" />
      </g>
    </svg>
  );
}

function PopFlash() {
  return (
    <motion.div
      className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-yellow-300/70"
      initial={{ scale: 0.2, opacity: 0.95 }}
      animate={{ scale: 1.25, opacity: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    />
  );
}

function RemainingCounter({
  remaining,
  before,
  popped,
}: {
  remaining: number;
  before: number;
  popped: number;
}) {
  return (
    <div className="absolute bottom-12 right-8 z-[245] h-[270px] w-[250px] md:h-[315px] md:w-[292px]">
      <svg viewBox="0 0 260 300" className="absolute inset-0 h-full w-full drop-shadow-2xl" aria-hidden="true">
        <defs>
          <radialGradient id="remaining-counter-balloon" cx="35%" cy="22%" r="78%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="17%" stopColor="#FFB2E3" />
            <stop offset="58%" stopColor="#EC3F9B" />
            <stop offset="100%" stopColor="#BD1071" />
          </radialGradient>
        </defs>
        <path
          d="M130 14C59 14 14 65 14 139c0 82 51 139 116 139s116-57 116-139C246 65 201 14 130 14Z"
          fill="url(#remaining-counter-balloon)"
          stroke="black"
          strokeWidth="6"
          strokeLinejoin="round"
        />
        <path
          d="M130 268 108 296l22-13 22 13-22-28Z"
          fill="#BD1071"
          stroke="black"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <path
          d="M76 38c-25 13-39 39-36 71 20-27 47-45 88-52-14-18-31-25-52-19Z"
          fill="white"
          opacity="0.45"
        />
      </svg>
      <div
        className="absolute inset-x-0 top-[22%] text-center text-4xl font-black leading-none text-white md:text-5xl"
        style={{ WebkitTextStroke: '2px black', paintOrder: 'stroke fill' }}
      >
        残り
      </div>
      <div
        className="absolute inset-x-0 top-[39%] text-center text-8xl font-black leading-none text-white md:text-9xl"
        style={{ WebkitTextStroke: '7px black', paintOrder: 'stroke fill', fontVariantNumeric: 'tabular-nums' }}
      >
        {remaining}
      </div>
      <div className="absolute inset-x-7 bottom-[12%] rounded-full border-2 border-black bg-white px-3 py-1 text-center text-sm font-black text-black md:text-base">
        {before}個中 / 割れる数 {popped}個
      </div>
    </div>
  );
}

function WickerBasket() {
  return (
    <div className="absolute bottom-[-2%] left-1/2 z-[210] h-[17%] w-[74%] -translate-x-1/2 rounded-t-[2rem] border-[9px] border-black bg-[#F7C56B] shadow-2xl">
      <div
        className="absolute inset-4 rounded-t-xl border-4 border-[#8B5A1E]"
        style={{
          background:
            'repeating-linear-gradient(0deg, rgba(90,55,15,0.55) 0 5px, transparent 5px 18px), repeating-linear-gradient(90deg, #D7A849 0 12px, #8D6A26 12px 18px, #F7D778 18px 30px)',
        }}
      />
    </div>
  );
}

const BALLOON_BACKGROUNDS = [
  '/balloon-bg-sky.svg',
  '/balloon-bg-mountain.svg',
  '/balloon-bg-sunset.svg',
] as const;

function SkyBackdrop({ variant }: { variant: number }) {
  const imageUrl = BALLOON_BACKGROUNDS[variant % BALLOON_BACKGROUNDS.length]!;

  return (
    <div className="absolute inset-0 overflow-hidden bg-[linear-gradient(180deg,#0F78D8_0%,#49B9F2_52%,#B9EFFF_100%)]">
      <motion.div
        key={imageUrl}
        className="absolute inset-0 bg-cover bg-center"
        initial={{ opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.75, ease: 'easeOut' }}
        style={{ backgroundImage: `url(${imageUrl})` }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,95,185,0.18)_0%,rgba(74,185,242,0.08)_45%,rgba(180,238,255,0.22)_100%)]" />
    </div>
  );
}

function makeBalloonLayout(count: number, seed: string): BalloonLayoutItem[] {
  const safeCount = Math.max(0, Math.round(count));
  const colors = balloonColorsForGrid(seed, safeCount);
  let hash = hashSeed(seed);
  const columns = safeCount > 120 ? 11 : 9;

  return Array.from({ length: safeCount }, (_, index) => {
    hash = nextHash(hash);
    const row = Math.floor(index / columns);
    const col = index % columns;
    const jitterX = ((hash >>> 8) % 1000) / 1000;
    hash = nextHash(hash);
    const jitterY = ((hash >>> 8) % 1000) / 1000;
    hash = nextHash(hash);
    const scaleJitter = ((hash >>> 8) % 1000) / 1000;
    hash = nextHash(hash);
    const rotateJitter = ((hash >>> 8) % 1000) / 1000;
    hash = nextHash(hash);
    const anchorJitter = ((hash >>> 8) % 1000) / 1000;
    hash = nextHash(hash);
    const floatJitter = ((hash >>> 8) % 1000) / 1000;
    const stagger = row % 2 === 0 ? 0 : 3.2;
    const x = clamp(((col + 0.5) / columns) * 74 + 13 + stagger + (jitterX - 0.5) * 3.6, 11, 89);
    const distanceFromCenter = Math.abs(x - 50) / 50;
    const sideDrop = Math.pow(distanceFromCenter, 1.45) * 19;
    const hillLift = (1 - distanceFromCenter) * 6;
    const y = clamp(9 + row * 5.1 + sideDrop - hillLift + (jitterY - 0.5) * 4.4, 7, 72);
    const anchorX = clamp(50 + (x - 50) * 0.3 + (anchorJitter - 0.5) * 5, 29, 71);
    const color = colors[index]!;

    return {
      index,
      x,
      y,
      scale: 0.95 + scaleJitter * 0.42,
      rotate: (rotateJitter - 0.5) * 14,
      color,
      stringColor: mixHexColor(color, '#ffffff', 0.25),
      zIndex: 30 + row,
      gradientId: `burst-balloon-${Math.abs(hash)}-${index}`,
      anchorX,
      floatDelay: floatJitter * 1.2,
      floatY: 5 + floatJitter * 8,
      sway: (floatJitter - 0.5) * 5,
    };
  });
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextHash(hash: number): number {
  return (Math.imul(hash, 1664525) + 1013904223) >>> 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mixHexColor(color: string, target: string, targetWeight: number): string {
  const sourceRgb = parseHexColor(color);
  const targetRgb = parseHexColor(target);
  if (!sourceRgb || !targetRgb) return color;

  const sourceWeight = 1 - targetWeight;
  const mixed = sourceRgb.map((channel, index) =>
    Math.round(channel * sourceWeight + targetRgb[index]! * targetWeight)
  );
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

function parseHexColor(color: string): [number, number, number] | null {
  const hex = color.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

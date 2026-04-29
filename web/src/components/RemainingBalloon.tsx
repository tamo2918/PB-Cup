'use client';

import { useId } from 'react';
import { motion } from 'framer-motion';

interface RemainingBalloonProps {
  value: number | null;
  ariaMax?: number;
  color: string;
  kind?: 'remaining' | 'prediction';
  popping?: boolean;
  size?: 'display' | 'compact';
  className?: string;
}

export function RemainingBalloon({
  value,
  ariaMax,
  color,
  kind = 'remaining',
  popping = false,
  size = 'display',
  className = '',
}: RemainingBalloonProps) {
  const label = kind === 'prediction' ? '予想回答' : '残り風船';
  const suffix = kind === 'prediction' ? '%' : '個';
  const safeValue = value === null || !Number.isFinite(value) ? null : Math.max(0, Math.round(value));
  const gradientId = useId().replace(/:/g, '');
  const empty = kind === 'remaining' && safeValue === 0;
  const compact = size === 'compact';
  const displayValue = safeValue === null ? '—' : String(safeValue);
  const strokeWidth = compact ? '4px' : displayValue.length >= 3 ? '6px' : '7px';
  const numberSize =
    compact
      ? displayValue.length >= 3
        ? 'text-[2.75rem]'
        : 'text-[3.2rem]'
      : displayValue.length >= 3
        ? 'text-[4.35rem]'
        : 'text-[5.4rem]';
  const lightColor = mixHexColor(color, '#ffffff', 0.45);
  const darkColor = mixHexColor(color, '#000000', 0.28);
  const bodyColor = kind === 'prediction' ? '#F2C846' : color;
  const predictionLight = mixHexColor(bodyColor, '#ffffff', 0.38);
  const predictionDark = mixHexColor(bodyColor, '#000000', 0.22);
  const labelColor = kind === 'prediction' ? '#B77900' : color;

  return (
    <div
      aria-label={
        kind === 'remaining'
          ? `残り ${displayValue} 個 / ${ariaMax ?? '?'} 個`
          : `予想 ${displayValue}%`
      }
      className={`relative overflow-hidden rounded-xl border-2 border-white/80 bg-[linear-gradient(180deg,#E7F7FF_0%,#C9ECFF_100%)] shadow-inner ${compact ? 'min-h-[148px]' : 'min-h-[206px]'} ${className}`}
    >
      <div
        className="relative z-20 mx-2 mt-2 rounded-full px-2 py-1 text-center text-sm font-black text-white shadow"
        style={{
          backgroundColor: labelColor,
          WebkitTextStroke: '1px black',
          paintOrder: 'stroke fill',
          textShadow: '1px 2px 0 rgba(0,0,0,0.35)',
        }}
      >
        {label}
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(255,255,255,0.95),transparent_34%)]" />
      <motion.div
        className={`relative mx-auto ${compact ? 'h-[118px] w-[122px]' : 'h-[172px] w-[172px]'}`}
        animate={
          popping
            ? { rotate: [-2.5, 2.5, -1.5, 1.5, 0], scale: [1, 1.06, 0.97, 1] }
            : { rotate: 0, scale: empty ? 0.92 : 1 }
        }
        transition={{ duration: popping ? 0.38 : 0.45, ease: 'easeOut' }}
      >
        <div className="absolute inset-x-4 bottom-2 h-4 rounded-full bg-black/20 blur-[1px]" />
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 220 250" aria-hidden="true">
          <defs>
            <radialGradient id={`${gradientId}-body`} cx="38%" cy="22%" r="72%">
              <stop offset="0%" stopColor="white" />
              <stop offset="18%" stopColor={kind === 'prediction' ? predictionLight : lightColor} />
              <stop offset="58%" stopColor={empty ? '#94A3B8' : bodyColor} />
              <stop offset="100%" stopColor={empty ? '#64748B' : kind === 'prediction' ? predictionDark : darkColor} />
            </radialGradient>
            <linearGradient id={`${gradientId}-shine`} x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="white" stopOpacity="0.9" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M110 14C62 14 29 51 29 105c0 59 35 101 81 101s81-42 81-101c0-54-33-91-81-91Z"
            fill={`url(#${gradientId}-body)`}
            stroke="black"
            strokeWidth="7"
            strokeLinejoin="round"
            opacity={empty ? 0.78 : 1}
          />
          <path
            d="M110 201 91 236l19-12 19 12-19-35Z"
            fill={empty ? '#64748B' : kind === 'prediction' ? predictionDark : darkColor}
            stroke="black"
            strokeWidth="6"
            strokeLinejoin="round"
            opacity={empty ? 0.78 : 1}
          />
          <path
            d="M73 35c-20 13-29 36-25 61 16-20 39-33 70-38-12-18-27-27-45-23Z"
            fill={`url(#${gradientId}-shine)`}
          />
          <path d="M110 225v25" stroke="black" strokeWidth="2" strokeOpacity="0.45" />
        </svg>

        <div className="absolute inset-x-0 top-[31%] z-10 flex flex-col items-center leading-none">
          <motion.div
            key={`${kind}-${displayValue}`}
            initial={{ scale: 1.18, y: -4 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="mt-1 flex items-end justify-center font-black leading-none text-white"
            style={{
              WebkitTextStroke: `${strokeWidth} black`,
              paintOrder: 'stroke fill',
              textShadow: '3px 4px 0 rgba(0,0,0,0.2)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span className={numberSize}>
              {displayValue}
            </span>
            <span
              className={`${compact ? 'mb-1 text-[1rem]' : 'mb-2 text-[1.4rem]'} ml-1 text-white`}
              style={{
                WebkitTextStroke: compact ? '2px black' : '3px black',
                paintOrder: 'stroke fill',
              }}
            >
              {safeValue === null ? '' : suffix}
            </span>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
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

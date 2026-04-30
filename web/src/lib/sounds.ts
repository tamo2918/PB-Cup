'use client';

const ANSWER_REVEAL_BGM_URL = '/answer-reveal-bgm.m4a';
export const ANSWER_REVEAL_BGM_DURATION_MS = 12_430;
const AUTOPLAY_BLOCKED_FALLBACK_MS = ANSWER_REVEAL_BGM_DURATION_MS;

export type AnswerRevealBgmFinishReason =
  | 'started'
  | 'ended'
  | 'timeout'
  | 'error'
  | 'blocked'
  | 'stopped';

interface ManagedAudioPlayback {
  started: Promise<AnswerRevealBgmFinishReason>;
  done: Promise<AnswerRevealBgmFinishReason>;
  stop: () => void;
}

// Short effects are synthesised via Web Audio API; long reveal BGM uses an audio asset.
let ctx: AudioContext | null = null;
let answerRevealAudio: HTMLAudioElement | null = null;
let answerRevealAudioPrimed = false;
let activeAnswerRevealStop: (() => void) | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

function getAnswerRevealAudio(): HTMLAudioElement {
  if (!answerRevealAudio) {
    answerRevealAudio = new Audio(ANSWER_REVEAL_BGM_URL);
    answerRevealAudio.preload = 'auto';
  }
  return answerRevealAudio;
}

export async function primeAnswerRevealBgm(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (answerRevealAudioPrimed) return true;
  if (activeAnswerRevealStop) return answerRevealAudioPrimed;

  const audio = getAnswerRevealAudio();
  try {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    audio.volume = 0;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0.9;
    answerRevealAudioPrimed = true;
    return true;
  } catch {
    return false;
  }
}

export async function unlockAudio(): Promise<boolean> {
  const c = getCtx();
  if (c && c.state === 'suspended') {
    try {
      await c.resume();
    } catch {
      // Browser refused; will retry on next gesture.
    }
  }
  return primeAnswerRevealBgm();
}

export function playAnswerRevealBgm(): ManagedAudioPlayback {
  if (typeof window === 'undefined') {
    return {
      started: Promise.resolve('stopped'),
      done: Promise.resolve('stopped'),
      stop: () => {},
    };
  }

  activeAnswerRevealStop?.();

  const audio = getAnswerRevealAudio();
  audio.pause();
  audio.currentTime = 0;
  audio.muted = false;
  audio.volume = 0.9;

  let settled = false;
  let startSettled = false;
  let fallbackTimer: number | undefined;
  let settleStarted: (reason: AnswerRevealBgmFinishReason) => void = () => {};
  let settlePlayback: (reason: AnswerRevealBgmFinishReason) => void = () => {};

  const started = new Promise<AnswerRevealBgmFinishReason>((resolve) => {
    settleStarted = (reason: AnswerRevealBgmFinishReason) => {
      if (startSettled) return;
      startSettled = true;
      resolve(reason);
    };
  });

  const done = new Promise<AnswerRevealBgmFinishReason>((resolve) => {
    const cleanup = () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      if (fallbackTimer !== undefined) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = undefined;
      }
      if (activeAnswerRevealStop === stop) {
        activeAnswerRevealStop = null;
      }
    };

    const settle = (reason: AnswerRevealBgmFinishReason) => {
      if (settled) return;
      settled = true;
      settleStarted(reason);
      cleanup();
      resolve(reason);
    };
    settlePlayback = settle;

    function handleEnded() {
      settle('ended');
    }

    function handleError() {
      settle('error');
    }

    function stop() {
      audio.pause();
      audio.currentTime = 0;
      settle('stopped');
    }

    activeAnswerRevealStop = stop;
    audio.addEventListener('ended', handleEnded, { once: true });
    audio.addEventListener('error', handleError, { once: true });

    const playPromise = audio.play();
    if (playPromise) {
      playPromise
        .then(() => {
          if (settled) return;
          settleStarted('started');
          answerRevealAudioPrimed = true;
          fallbackTimer = window.setTimeout(() => settle('timeout'), ANSWER_REVEAL_BGM_DURATION_MS + 800);
        })
        .catch(() => {
          if (settled) return;
          settleStarted('blocked');
          // If the display has not been clicked yet, browsers can block media playback.
          fallbackTimer = window.setTimeout(() => settle('blocked'), AUTOPLAY_BLOCKED_FALLBACK_MS);
        });
    } else {
      settleStarted('started');
      fallbackTimer = window.setTimeout(() => settle('timeout'), ANSWER_REVEAL_BGM_DURATION_MS + 800);
    }
  });

  return {
    started,
    done,
    stop: () => {
      audio.pause();
      audio.currentTime = 0;
      settlePlayback('stopped');
    },
  };
}

export function playPop(): void {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(900 + Math.random() * 300, t);
  osc.frequency.exponentialRampToValueAtTime(120, t + 0.12);
  gain.gain.setValueAtTime(0.18, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.18);
}

export function playTick(): void {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, t);
  gain.gain.setValueAtTime(0.06, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.05);
}

export function playPerfect(): void {
  const c = getCtx();
  if (!c) return;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const t = c.currentTime + i * 0.1;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}

export function playGameOver(): void {
  const c = getCtx();
  if (!c) return;
  const notes = [392, 369.99, 311.13, 261.63];
  notes.forEach((freq, i) => {
    const t = c.currentTime + i * 0.18;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  });
}

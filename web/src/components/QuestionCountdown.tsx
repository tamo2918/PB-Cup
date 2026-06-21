'use client';

import { useEffect, useState } from 'react';
import { QUESTION_TIME_LIMIT_MS } from '@husen/shared';

export function useQuestionCountdown(deadline?: number) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (deadline === undefined) {
      setNow(null);
      return;
    }

    const update = () => setNow(Date.now());
    update();
    const interval = window.setInterval(update, 100);
    return () => window.clearInterval(interval);
  }, [deadline]);

  const remainingMs =
    deadline === undefined
      ? 0
      : Math.max(0, deadline - (now ?? deadline - QUESTION_TIME_LIMIT_MS));
  return {
    expired: deadline !== undefined && remainingMs <= 0,
    progress: Math.max(0, Math.min(1, remainingMs / QUESTION_TIME_LIMIT_MS)),
    remainingSeconds: Math.ceil(remainingMs / 1000),
  };
}

export function QuestionCountdown({
  deadline,
  pending = false,
  closed = false,
  compact = false,
}: {
  deadline?: number;
  pending?: boolean;
  closed?: boolean;
  compact?: boolean;
}) {
  const countdown = useQuestionCountdown(deadline);
  const finished = !pending && (closed || countdown.expired);
  const urgent = !pending && countdown.remainingSeconds <= 3;

  return (
    <div
      role="timer"
      aria-live="polite"
      data-question-countdown
      className={`mx-auto w-full overflow-hidden rounded-xl border-2 bg-white shadow ${
        compact ? 'max-w-md' : 'max-w-2xl'
      } ${pending ? 'border-sky-300' : finished ? 'border-gray-300' : urgent ? 'border-red-400' : 'border-sky-deep/30'}`}
    >
      <div className={`flex items-center justify-center gap-3 ${compact ? 'px-3 py-2' : 'px-5 py-3'}`}>
        <span className="text-sm font-black text-gray-500">回答時間</span>
        <span
          className={`font-black tabular-nums ${compact ? 'text-2xl' : 'text-4xl'} ${
            pending
              ? 'text-sky-deep'
              : finished
                ? 'text-gray-500'
                : urgent
                  ? 'text-gauge-accent'
                  : 'text-sky-deep'
          }`}
        >
          {pending ? '開始待ち' : finished ? '受付終了' : `残り ${countdown.remainingSeconds} 秒`}
        </span>
      </div>
      <div className="h-2 bg-gray-200" aria-hidden="true">
        <div
          className={`h-full transition-[width,background-color] duration-100 ${
            pending
              ? 'bg-sky-300'
              : finished
                ? 'bg-gray-400'
                : urgent
                  ? 'bg-gauge-accent'
                  : 'bg-sky-deep'
          }`}
          style={{ width: `${pending ? 100 : finished ? 0 : countdown.progress * 100}%` }}
        />
      </div>
    </div>
  );
}

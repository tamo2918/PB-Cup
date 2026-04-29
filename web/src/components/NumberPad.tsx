'use client';

import { motion } from 'framer-motion';

interface NumberPadProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  submitting?: boolean;
}

const KEYS: (string | 'DEL' | 'GO')[] = [
  '1', '2', '3', '4', '5',
  '6', '7', '8', '9', '0',
];

export function NumberPad({ value, onChange, onSubmit, disabled, submitting }: NumberPadProps) {
  const handleDigit = (d: string) => {
    if (disabled) return;
    const next = (value + d).slice(-3); // up to 3 chars to allow "100"
    if (Number(next) > 100) {
      // Don't accept anything that overflows
      return;
    }
    onChange(next.replace(/^0+(\d)/, '$1'));
  };
  const handleDel = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  return (
    <div className="grid grid-cols-5 gap-2 select-none">
      {KEYS.map((k) => (
        <PadButton
          key={k}
          onClick={() => handleDigit(k as string)}
          disabled={disabled}
          className="bg-white text-gray-900 hover:bg-gray-50"
        >
          {k}
        </PadButton>
      ))}
      <PadButton
        onClick={handleDel}
        disabled={disabled}
        className="col-span-2 bg-gray-200 text-gray-900 hover:bg-gray-300 text-2xl"
      >
        ⌫ Del
      </PadButton>
      <PadButton
        onClick={onSubmit}
        disabled={disabled || value === '' || submitting}
        className="col-span-3 bg-gauge-accent text-white hover:bg-red-700 text-3xl font-black disabled:bg-gray-400"
      >
        {submitting ? '送信中…' : 'GO'}
      </PadButton>
    </div>
  );
}

function PadButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: disabled ? 1 : 0.94 }}
      className={`rounded-2xl py-5 text-3xl font-black shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${className ?? ''}`}
    >
      {children}
    </motion.button>
  );
}

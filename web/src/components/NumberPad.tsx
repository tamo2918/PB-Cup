'use client';

import { motion } from 'framer-motion';

interface NumberPadProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

const KEYS = [
  '1', '2', '3', '4', '5',
  '6', '7', '8', '9', '0',
] as const;

export function NumberPad({ value, onChange, disabled }: NumberPadProps) {
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
        className="col-span-5 bg-gray-200 text-gray-900 hover:bg-gray-300 text-2xl"
      >
        ⌫ Del
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

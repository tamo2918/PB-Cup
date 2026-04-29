'use client';

import { motion } from 'framer-motion';

interface QuestionBoxProps {
  index: number;
  total: number;
  text: string;
  className?: string;
}

export function QuestionBox({ index, total, text, className }: QuestionBoxProps) {
  return (
    <div className={className}>
      <div className="flex gap-2 mb-3">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black border-4 ${
              i < index
                ? 'bg-gray-300 border-gray-400 text-gray-500'
                : i === index
                ? 'bg-gauge-accent border-yellow-300 text-white shadow-lg scale-110'
                : 'bg-white border-sky-deep text-sky-deep'
            }`}
          >
            {i + 1}
          </div>
        ))}
      </div>
      <motion.div
        key={index}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="question-box px-8 py-7"
      >
        <p className="text-xl md:text-3xl font-bold text-sky-deep leading-relaxed">{text}</p>
      </motion.div>
    </div>
  );
}

import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,js,jsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        // Loaded via next/font in layout.tsx
        sans: ['var(--font-noto)', 'ui-sans-serif', 'system-ui'],
      },
      colors: {
        sky: {
          gameBg: '#82C7E8',
          deep: '#0F66A8',
        },
        balloon: {
          red: '#E84A4A',
          orange: '#F39A3F',
          yellow: '#F7D247',
          green: '#5BC07C',
          blue: '#3FA6E8',
          purple: '#A66CD0',
          pink: '#F08FB7',
          white: '#FAFAFA',
          mint: '#76D6C4',
          coral: '#FF7B7B',
        },
        gauge: {
          gold: '#F2C846',
          dark: '#1F2937',
          accent: '#E0143C',
        },
      },
      boxShadow: {
        nep: '0 4px 0 0 rgba(0,0,0,0.25), 0 0 0 4px #FFD24A inset',
      },
      keyframes: {
        floaty: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        confettiPop: {
          '0%': { transform: 'scale(0.6)', opacity: '0' },
          '40%': { transform: 'scale(1.2)', opacity: '1' },
          '100%': { transform: 'scale(0)', opacity: '0' },
        },
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        flashRed: {
          '0%,100%': { backgroundColor: 'transparent' },
          '50%': { backgroundColor: 'rgba(230,30,60,0.45)' },
        },
      },
      animation: {
        floaty: 'floaty 3.5s ease-in-out infinite',
        flashRed: 'flashRed 0.5s ease-in-out 2',
      },
    },
  },
  plugins: [],
};

export default config;

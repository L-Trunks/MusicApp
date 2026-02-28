import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      keyframes: {
        spinDisc: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 16px #2563eb60' },
          '50%': { boxShadow: '0 0 32px #2563eb, 0 0 48px #2563eb60' },
        },
        eqBounce: {
          '0%, 100%': { transform: 'scaleY(0.3)' },
          '50%': { transform: 'scaleY(1)' },
        },
      },
      animation: {
        'spin-disc': 'spinDisc 8s linear infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'eq-bounce': 'eqBounce 0.55s ease-in-out infinite',
      },
      colors: {
        bg: {
          primary: '#070a0e',
          secondary: '#0b0f16',
          card: '#10161f',
          hover: '#162030',
          active: '#1c2a40',
        },
        accent: {
          primary: '#2563eb',
          secondary: '#1d4ed8',
          glow: '#60a5fa',
          neon: '#06b6d4',
        },
        text: {
          primary: '#f0f4ff',
          secondary: '#7c8db5',
          muted: '#3d4f6e',
        },
        border: {
          DEFAULT: '#1a2640',
          light: '#253550',
        },
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // HIVE palette — website colours shifted 4 shades lighter
        hive: {
          bg:         '#1c2a3e', // site #0d1420 + 4 shades
          surface:    '#243348', // slightly lighter than bg
          surfaceHi:  '#2e4060', // hover/active surface
          border:     '#364e6b', // subtle dividers
          accent:     '#7c75ed', // site #4f46e5 lightened
          accentHov:  '#9590f1', // hover state
          accentSoft: 'rgba(124,117,237,0.15)',
          blue:       '#b8d9fe', // site #93c5fd lightened
          blueDim:    '#8ab4d4', // dimmer blue for secondary text
          text:       '#dde5f0', // primary text on dark bg
          textSoft:   '#8892a4', // secondary text
          textDim:    '#5a6880', // tertiary/disabled
          success:    '#34d399',
          warning:    '#fbbf24',
          error:      '#f87171',
          badge: {
            p0:   '#7c75ed',
            p1:   '#5eead4',
            p2:   '#94a3b8',
            installed: '#34d399',
            parked:    '#fbbf24',
            candidate: '#64748b',
          },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        hive: '14px',
        'hive-lg': '18px',
      },
      boxShadow: {
        hive:    '0 10px 28px rgba(0,0,0,0.28)',
        'hive-sm': '0 4px 14px rgba(0,0,0,0.20)',
        accent:  '0 8px 22px rgba(124,117,237,0.25)',
      },
      animation: {
        'spin-slow': 'spin 2s linear infinite',
        'pulse-dot': 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in': 'fadeIn 0.18s ease-out',
        'slide-in': 'slideIn 0.22s ease-out',
        'stream-cursor': 'blink 0.9s step-end infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateX(-8px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config

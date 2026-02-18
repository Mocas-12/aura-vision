import type { Config } from 'tailwindcss'

export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        backdrop: 'rgba(0,0,0,0.6)',
      },
      backdropBlur: {
        DEFAULT: '10px',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.2)',
      },
    },
  },
  plugins: [],
} satisfies Config

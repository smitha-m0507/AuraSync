export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      colors: {
        // Theme tokens backed by the CSS variables in index.css (dark/light aware).
        bg: {
          primary: 'var(--bg-primary)',
          surface: 'var(--bg-surface)',
          elevated: 'var(--bg-elevated)'
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)'
        },
        border: 'var(--border)',
        success: 'var(--success)',
        error: 'var(--error)',
        warning: 'var(--warning)',
        aura: {
          violet: '#7C3AED',
          violetLight: '#A78BFA',
          'violet-light': 'var(--accent-violet-light)',
          cyan: '#06B6D4',
          cyanLight: '#67E8F9',
          'cyan-light': 'var(--accent-cyan-light)',
          dark: '#0F172A',
          surface: '#1E293B',
          elevated: '#273548'
        }
      },
      boxShadow: {
        aura: '0 4px 24px rgba(0, 0, 0, 0.4)',
        glow: '0 0 40px rgba(124, 58, 237, 0.28)'
      },
      animation: {
        float: 'float 7s ease-in-out infinite',
        pulseGlow: 'pulseGlow 3s ease-in-out infinite',
        shimmer: 'shimmer 1.8s linear infinite',
        spinSlow: 'spin 3s linear infinite',
        glitch: 'glitch 1.8s infinite'
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-18px)' }
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.45', transform: 'scale(1)' },
          '50%': { opacity: '0.85', transform: 'scale(1.12)' }
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' }
        },
        glitch: {
          '0%, 100%': { transform: 'translate(0)', filter: 'hue-rotate(0deg)' },
          '20%': { transform: 'translate(-2px, 2px)', filter: 'hue-rotate(80deg)' },
          '40%': { transform: 'translate(2px, -2px)', filter: 'hue-rotate(160deg)' },
          '60%': { transform: 'translate(-1px, -1px)', filter: 'hue-rotate(240deg)' },
          '80%': { transform: 'translate(1px, 2px)', filter: 'hue-rotate(320deg)' }
        }
      }
    }
  },
  plugins: []
};

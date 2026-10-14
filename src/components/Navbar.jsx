import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';

function SoundWaveIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M18 24v16M26 16v32M34 10v44M42 18v28M50 25v14" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onPointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const initials = user?.fullName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const navItems = [
    { label: 'Home', path: '/' },
    { label: 'Audio Lab', path: '/lab' },
    { label: 'Reports', path: '/reports' }
  ];

  const handleLogout = async () => {
    await logout();
    addToast('Logged out successfully', 'info');
    navigate('/login');
  };

  if (!user || ['/login', '/signup'].includes(location.pathname)) {
    return null;
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-border/70 bg-bg-primary/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/" className="group flex items-center gap-3">
          <span className="relative grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-gradient-to-br from-aura-violet to-aura-cyan text-white shadow-glow">
            <SoundWaveIcon className="h-6 w-6 animate-pulse" />
          </span>
          <span>
            <span className="block font-display text-xl font-bold tracking-tight text-text-primary">AuraSync</span>
            <span className="block text-xs font-medium text-text-secondary">Audio-to-Intelligence</span>
          </span>
        </Link>

        <div className="hidden items-center gap-1 rounded-full border border-border bg-bg-surface/60 p-1 md:flex">
          {navItems.map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`relative rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                  active ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {item.label}
                {active && (
                  <motion.span
                    layoutId="activeNav"
                    className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-gradient-to-r from-aura-violet-light to-aura-cyan-light"
                  />
                )}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-bg-surface/70 text-text-primary transition hover:scale-105"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>

          <div className="relative" ref={ref}>
            <button
              onClick={() => setOpen((current) => !current)}
              className="flex items-center gap-2 rounded-full border border-border bg-bg-surface/70 p-1.5 pr-3 text-left transition hover:scale-105"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-aura-violet to-aura-cyan font-display font-bold text-white">
                {initials || 'A'}
              </span>
              <span className="hidden text-sm font-semibold text-text-primary sm:block">{user.fullName}</span>
            </button>

            {open && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="absolute right-0 mt-3 w-72 rounded-3xl border border-border bg-bg-surface p-4 shadow-aura backdrop-blur-xl"
              >
                <p className="font-display text-lg font-bold text-text-primary">{user.fullName}</p>
                <p className="mt-1 break-all text-sm text-text-secondary">{user.email}</p>
                <div className="mt-4 rounded-2xl bg-bg-elevated p-3 text-sm text-text-secondary">
                  Purpose: <span className="font-semibold text-text-primary">{user.purpose}</span>
                </div>
                {user.isPro && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-aura-violet/20 px-3 py-1 text-xs font-bold text-aura-violet-light">
                    <span className="h-2 w-2 rounded-full bg-aura-violet" />
                    Pro Account
                  </div>
                )}
                <button
                  onClick={handleLogout}
                  className="mt-4 w-full rounded-2xl bg-gradient-to-r from-aura-violet to-aura-cyan px-4 py-3 text-sm font-bold text-white transition hover:scale-[1.02]"
                >
                  Logout
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </div>
      <div className="flex justify-center gap-1 border-t border-border px-4 py-2 md:hidden">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              location.pathname === item.path ? 'bg-gradient-to-r from-aura-violet to-aura-cyan text-white' : 'text-text-secondary'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
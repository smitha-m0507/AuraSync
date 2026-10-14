import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Waveform } from './art/Illustrations';

export default function Footer() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user || ['/login', '/signup'].includes(location.pathname)) return null;

  return (
    <footer className="relative border-t border-border bg-bg-primary">
      <Waveform bars={90} height={36} className="absolute inset-x-0 -top-[18px] h-9 w-full opacity-30" />
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-text-secondary sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-aura-violet to-aura-cyan text-white">
            <svg viewBox="0 0 64 64" className="h-5 w-5" fill="none" aria-hidden="true">
              <path d="M18 24v16M26 16v32M34 10v44M42 18v28M50 25v14" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
            </svg>
          </span>
          <span><span className="font-display font-bold text-text-primary">AuraSync</span> · Understand any recording</span>
        </div>
        <nav className="flex gap-5 font-semibold">
          <Link to="/" className="hover:text-text-primary">Home</Link>
          <Link to="/lab" className="hover:text-text-primary">Audio Lab</Link>
          <Link to="/reports" className="hover:text-text-primary">Reports</Link>
        </nav>
      </div>
    </footer>
  );
}

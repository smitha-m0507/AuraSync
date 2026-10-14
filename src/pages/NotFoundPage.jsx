import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Backdrop } from '../components/art/Layout';
import { NotFoundArt } from '../components/art/Illustrations';

export default function NotFoundPage() {
  return (
    <main className="relative isolate grid min-h-screen place-items-center overflow-x-clip bg-bg-primary px-4">
      <Backdrop blobs={['two', 'three']} />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card max-w-3xl rounded-[2rem] p-8 text-center shadow-aura sm:p-12"
      >
        <NotFoundArt className="mx-auto h-auto w-full max-w-md" />
        <h1 className="mt-6 font-display text-7xl font-bold tracking-tight text-gradient">404</h1>
        <p className="mt-3 font-display text-3xl font-bold text-text-primary">Signal not found</p>
        <p className="mx-auto mt-4 max-w-xl leading-8 text-text-secondary">
          This page doesn't exist. Head back home, or open Audio Lab to create a new flowchart or chat.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/" className="gradient-button">Back to Home</Link>
          <Link to="/lab" className="rounded-2xl border border-border bg-bg-surface px-6 py-3 font-bold text-text-primary transition hover:scale-105">Open Audio Lab</Link>
        </div>
      </motion.div>
    </main>
  );
}

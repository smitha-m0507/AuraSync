import { motion } from 'framer-motion';

export default function Modal({ title, children, actions, onClose }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-lg rounded-3xl border border-border bg-bg-surface p-6 shadow-aura"
        role="dialog"
        aria-modal="true"
      >
        <h3 className="font-display text-2xl font-bold text-text-primary">{title}</h3>
        <div className="mt-4 text-text-secondary">{children}</div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {actions}
          <button
            onClick={onClose}
            className="rounded-2xl border border-border px-5 py-3 font-bold text-text-primary transition hover:scale-105"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}

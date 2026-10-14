import { motion } from 'framer-motion';

/** Page background: drifting glow blobs over a fading dot grid. The page's <main> must be `relative isolate`. */
export function Backdrop({ blobs = ['one', 'two', 'three'] }) {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {blobs.map((blob) => <div key={blob} className={`blob blob-${blob}`} />)}
      <div className="dot-grid absolute inset-0" />
    </div>
  );
}

/** Page title block with an illustration on the right. */
export function PageHero({ eyebrow, title, highlight, description, art, children }) {
  return (
    <div className="glass-card relative mb-8 overflow-hidden rounded-[2rem] p-6 shadow-aura sm:p-10">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-aura-violet/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-aura-cyan/20 blur-3xl" />
      <div className="relative grid items-center gap-8 lg:grid-cols-[1.25fr_0.75fr]">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-aura-cyan-light">{eyebrow}</p>
          <h1 className="mt-3 font-display text-4xl font-bold leading-tight text-text-primary sm:text-5xl">
            {title} {highlight && <span className="text-gradient">{highlight}</span>}
          </h1>
          {description && <p className="mt-4 max-w-2xl leading-8 text-text-secondary">{description}</p>}
          {children}
        </motion.div>
        {art && (
          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="hidden lg:block">
            {art}
          </motion.div>
        )}
      </div>
    </div>
  );
}

export function SectionHeading({ eyebrow, title, description, tone = 'cyan' }) {
  return (
    <div className="mx-auto mb-10 max-w-3xl text-center">
      <p className={`text-sm font-bold uppercase tracking-[0.28em] ${tone === 'violet' ? 'text-aura-violet-light' : 'text-aura-cyan-light'}`}>{eyebrow}</p>
      <h2 className="mt-3 font-display text-4xl font-bold text-text-primary">{title}</h2>
      {description && <p className="mt-4 leading-8 text-text-secondary">{description}</p>}
    </div>
  );
}

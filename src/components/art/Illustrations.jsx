// Theme-consistent SVG illustrations. Surfaces and text use the theme CSS variables so every graphic
// follows dark/light mode; accents use the brand violet / cyan / emerald / amber palette.
import { useId } from 'react';

const V = '#7C3AED';
const VL = '#A78BFA';
const C = '#06B6D4';
const CL = '#67E8F9';
const G = '#10B981';
const A = '#F59E0B';
const P = '#EC4899';

const SURFACE = 'var(--bg-surface)';
const ELEVATED = 'var(--bg-elevated)';
const LINE = 'var(--border)';
const MUTED = 'var(--text-muted)';

function useUid(prefix) {
  return `${prefix}${useId().replace(/:/g, '')}`;
}

function BrandGradient({ id, from = VL, to = C }) {
  return (
    <linearGradient id={id} x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stopColor={from} />
      <stop offset="100%" stopColor={to} />
    </linearGradient>
  );
}

/** Head-and-shoulders person used across scenes. (x, y) is the head centre. */
function Person({ x, y, color, scale = 1, facing = 0 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M-15 26 C-15 12 -8 6 0 6 C8 6 15 12 15 26 Z" fill={color} opacity="0.9" />
      <circle cx="0" cy="-4" r="9" fill={color} />
      <circle cx={facing * 3} cy="-5" r="1.4" fill="#0F172A" opacity="0.55" />
    </g>
  );
}

/** Animated equaliser bars. */
export function Waveform({ bars = 28, height = 56, className = '', gap = 4, width = 5 }) {
  const id = useUid('wave');
  return (
    <svg viewBox={`0 0 ${bars * (width + gap)} ${height}`} className={className} aria-hidden="true" preserveAspectRatio="none">
      <defs><BrandGradient id={id} /></defs>
      {Array.from({ length: bars }).map((_, i) => {
        const h = height * (0.35 + 0.65 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.45)));
        return (
          <rect
            key={i}
            className="eq-bar"
            x={i * (width + gap)}
            y={(height - h) / 2}
            width={width}
            height={h}
            rx={width / 2}
            fill={`url(#${id})`}
            style={{ animationDelay: `${(i % 7) * 0.12}s`, animationDuration: `${0.9 + (i % 5) * 0.15}s` }}
          />
        );
      })}
    </svg>
  );
}

/** Hero: recording → transcript → concept tree → chat, with an evaluation badge. */
export function HeroScene({ className = '' }) {
  const g = useUid('hero');
  const glow = useUid('glow');
  return (
    <svg viewBox="0 0 560 470" className={className} role="img" aria-label="A recording becomes a transcript, a concept flowchart and a chat">
      <defs>
        <BrandGradient id={g} />
        <radialGradient id={glow} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={C} stopOpacity="0.35" />
          <stop offset="100%" stopColor={C} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="280" cy="235" r="220" fill={`url(#${glow})`} />

      {/* Microphone with sound rings */}
      <g transform="translate(92 92)">
        <circle r="34" fill="none" stroke={CL} strokeWidth="2" className="ping-ring" />
        <circle r="34" fill="none" stroke={VL} strokeWidth="2" className="ping-ring" style={{ animationDelay: '1.2s' }} />
        <circle r="34" fill={`url(#${g})`} />
        <rect x="-8" y="-18" width="16" height="24" rx="8" fill="#fff" />
        <path d="M-14 0 a14 14 0 0 0 28 0 M0 14 v8 M-8 22 h16" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>

      {/* Live waveform */}
      <g transform="translate(142 70)">
        {Array.from({ length: 30 }).map((_, i) => {
          const h = 10 + 34 * Math.abs(Math.sin(i * 1.3) * Math.cos(i * 0.4));
          return (
            <rect key={i} className="eq-bar" x={i * 11} y={22 - h / 2} width="6" height={h} rx="3" fill={i % 2 ? CL : VL}
              style={{ animationDelay: `${(i % 6) * 0.13}s` }} />
          );
        })}
      </g>

      {/* Transcript card */}
      <g transform="translate(40 150)">
        <g className="floaty">
          <rect width="236" height="176" rx="20" fill={SURFACE} stroke={LINE} />
          <circle cx="22" cy="22" r="4" fill={P} /><circle cx="36" cy="22" r="4" fill={A} /><circle cx="50" cy="22" r="4" fill={G} />
          <text x="222" y="26" textAnchor="end" fontSize="11" fontWeight="700" fill={MUTED} fontFamily="Inter, sans-serif">TRANSCRIPT</text>
          {[
            { c: CL, w: 150, y: 50, t: '00:04' },
            { c: A, w: 118, y: 82, t: '00:11' },
            { c: CL, w: 164, y: 114, t: '00:19' },
            { c: A, w: 96, y: 146, t: '00:27' }
          ].map((row, i) => (
            <g key={i} transform={`translate(18 ${row.y})`}>
              <circle cx="9" cy="9" r="9" fill={row.c} />
              <rect x="26" y="1" width="36" height="6" rx="3" fill={MUTED} opacity="0.6" />
              <rect x="26" y="12" width={row.w} height="7" rx="3.5" fill="var(--text-secondary)" opacity="0.45" />
              <text x="200" y="9" textAnchor="end" fontSize="9" fill={MUTED} fontFamily="JetBrains Mono, monospace">{row.t}</text>
            </g>
          ))}
        </g>
      </g>

      {/* Concept tree card */}
      <g transform="translate(298 128)">
        <g className="floaty" style={{ animationDelay: '-2s' }}>
          <rect width="232" height="196" rx="20" fill={SURFACE} stroke={LINE} />
          <text x="18" y="28" fontSize="11" fontWeight="700" fill={MUTED} fontFamily="Inter, sans-serif">FLOWCHART</text>
          <path d="M70 108 C92 108 92 62 112 62 M70 108 H112 M70 108 C92 108 92 154 112 154" stroke={`url(#${g})`} strokeWidth="2.5" fill="none" className="flow-dash" />
          <path d="M162 62 C176 62 176 48 188 48 M162 62 C176 62 176 76 188 76 M162 154 C176 154 176 140 188 140 M162 154 C176 154 176 168 188 168" stroke={LINE} strokeWidth="2" fill="none" />
          <rect x="16" y="94" width="56" height="28" rx="14" fill={V} />
          <rect x="112" y="50" width="52" height="24" rx="8" fill={ELEVATED} stroke={C} strokeWidth="2" />
          <rect x="112" y="96" width="52" height="24" rx="8" fill={ELEVATED} stroke={G} strokeWidth="2" />
          <rect x="112" y="142" width="52" height="24" rx="8" fill={ELEVATED} stroke={A} strokeWidth="2" />
          {[48, 76, 140, 168].map((y) => <rect key={y} x="188" y={y - 7} width="30" height="14" rx="5" fill={ELEVATED} stroke={LINE} />)}
          <rect x="26" y="105" width="36" height="6" rx="3" fill="#fff" opacity="0.85" />
        </g>
      </g>

      {/* Evaluation badge */}
      <g transform="translate(474 86)">
        <g className="floaty" style={{ animationDelay: '-4s' }}>
          <circle r="38" fill={SURFACE} stroke={LINE} />
          <circle r="28" fill="none" stroke={LINE} strokeWidth="6" />
          <circle r="28" fill="none" stroke={G} strokeWidth="6" strokeLinecap="round" strokeDasharray="167 176" transform="rotate(-90)" />
          <text y="5" textAnchor="middle" fontSize="15" fontWeight="800" fill="var(--text-primary)" fontFamily="Space Grotesk, sans-serif">95%</text>
        </g>
      </g>

      {/* Chat */}
      <g transform="translate(96 356)">
        <g className="floaty" style={{ animationDelay: '-1s' }}>
          <rect x="190" y="0" width="200" height="40" rx="20" fill={`url(#${g})`} />
          <rect x="210" y="16" width="140" height="8" rx="4" fill="#fff" opacity="0.85" />
          <rect x="0" y="52" width="232" height="48" rx="20" fill={SURFACE} stroke={LINE} />
          <circle cx="30" cy="76" r="4" fill={CL} className="blink" />
          <circle cx="44" cy="76" r="4" fill={VL} className="blink" style={{ animationDelay: '0.2s' }} />
          <circle cx="58" cy="76" r="4" fill={G} className="blink" style={{ animationDelay: '0.4s' }} />
          <rect x="76" y="72" width="130" height="8" rx="4" fill="var(--text-secondary)" opacity="0.4" />
        </g>
      </g>

      {/* Sparkles */}
      {[[38, 250, VL], [530, 250, CL], [470, 430, G], [250, 30, A]].map(([x, y, c], i) => (
        <path key={i} d={`M${x} ${y - 7} L${x + 2} ${y - 2} L${x + 7} ${y} L${x + 2} ${y + 2} L${x} ${y + 7} L${x - 2} ${y + 2} L${x - 7} ${y} L${x - 2} ${y - 2} Z`}
          fill={c} className="blink" style={{ animationDelay: `${i * 0.35}s` }} />
      ))}
    </svg>
  );
}

/** A small scene for each audio type. */
export function AudioTypeArt({ type, className = '' }) {
  const g = useUid('type');
  const common = (
    <defs><BrandGradient id={g} /></defs>
  );
  const frame = <rect width="200" height="120" rx="18" fill={ELEVATED} opacity="0.6" />;

  const scenes = {
    interview: (
      <>
        {frame}
        <rect x="30" y="92" width="140" height="6" rx="3" fill={LINE} />
        <Person x={52} y={62} color={CL} facing={1} />
        <Person x={148} y={62} color={A} facing={-1} />
        <g transform="translate(100 70)">
          <rect x="-2" y="0" width="4" height="22" fill={MUTED} />
          <rect x="-6" y="-14" width="12" height="18" rx="6" fill={`url(#${g})`} />
        </g>
        <g className="floaty">
          <rect x="22" y="12" width="44" height="26" rx="10" fill={SURFACE} stroke={CL} strokeWidth="2" />
          <text x="44" y="30" textAnchor="middle" fontSize="15" fontWeight="800" fill={CL} fontFamily="Space Grotesk, sans-serif">?</text>
        </g>
        <g className="floaty" style={{ animationDelay: '-3s' }}>
          <rect x="120" y="10" width="62" height="30" rx="10" fill={SURFACE} stroke={A} strokeWidth="2" />
          <rect x="130" y="19" width="42" height="4" rx="2" fill={A} opacity="0.8" />
          <rect x="130" y="27" width="28" height="4" rx="2" fill={A} opacity="0.5" />
        </g>
      </>
    ),
    meeting: (
      <>
        {frame}
        <ellipse cx="92" cy="68" rx="52" ry="26" fill={SURFACE} stroke={LINE} strokeWidth="2" />
        {[[92, 32, CL], [48, 44, VL], [136, 44, A], [40, 84, G], [144, 84, P], [92, 104, CL]].map(([x, y, c], i) => (
          <circle key={i} cx={x} cy={y} r="9" fill={c} />
        ))}
        <g className="floaty">
          <rect x="150" y="16" width="38" height="48" rx="6" fill={SURFACE} stroke={`url(#${g})`} strokeWidth="2" />
          {[28, 40, 52].map((y) => (
            <g key={y}>
              <path d={`M156 ${y} l3 3 l5 -6`} stroke={G} strokeWidth="2" fill="none" strokeLinecap="round" />
              <rect x="168" y={y - 2} width="14" height="4" rx="2" fill={MUTED} />
            </g>
          ))}
        </g>
        <rect x="74" y="62" width="36" height="12" rx="3" fill={`url(#${g})`} opacity="0.8" />
      </>
    ),
    discussion: (
      <>
        {frame}
        <Person x={50} y={80} color={CL} scale={0.85} />
        <Person x={100} y={84} color={VL} scale={0.85} />
        <Person x={150} y={80} color={A} scale={0.85} />
        <g className="floaty"><rect x="18" y="14" width="56" height="26" rx="10" fill={CL} opacity="0.9" /><path d="M40 40 l6 8 l2 -8" fill={CL} /></g>
        <g className="floaty" style={{ animationDelay: '-2s' }}><rect x="72" y="22" width="56" height="26" rx="10" fill={VL} opacity="0.9" /><path d="M96 48 l4 8 l4 -8" fill={VL} /></g>
        <g className="floaty" style={{ animationDelay: '-4s' }}><rect x="126" y="12" width="56" height="26" rx="10" fill={A} opacity="0.9" /><path d="M150 38 l6 8 l2 -8" fill={A} /></g>
        {[[28, 24], [82, 32], [136, 22]].map(([x, y]) => <rect key={x} x={x} y={y} width="34" height="5" rx="2.5" fill="#fff" opacity="0.85" />)}
      </>
    ),
    conversation: (
      <>
        {frame}
        <g transform="rotate(-8 50 64)">
          <rect x="28" y="26" width="44" height="76" rx="10" fill={SURFACE} stroke={CL} strokeWidth="2" />
          <rect x="36" y="40" width="28" height="10" rx="5" fill={CL} />
          <rect x="36" y="56" width="20" height="10" rx="5" fill={LINE} />
        </g>
        <g transform="rotate(8 150 64)">
          <rect x="128" y="26" width="44" height="76" rx="10" fill={SURFACE} stroke={A} strokeWidth="2" />
          <rect x="136" y="40" width="20" height="10" rx="5" fill={LINE} />
          <rect x="136" y="56" width="28" height="10" rx="5" fill={A} />
        </g>
        <path d="M76 50 C100 18 110 18 124 50" stroke={`url(#${g})`} strokeWidth="2.5" fill="none" className="flow-dash" />
        <path d="M124 78 C104 104 96 104 76 78" stroke={`url(#${g})`} strokeWidth="2.5" fill="none" className="flow-dash" />
      </>
    ),
    other: (
      <>
        {frame}
        <path d="M60 70 a40 40 0 0 1 80 0" stroke={`url(#${g})`} strokeWidth="7" fill="none" strokeLinecap="round" />
        <rect x="50" y="62" width="18" height="32" rx="8" fill={VL} />
        <rect x="132" y="62" width="18" height="32" rx="8" fill={C} />
        {Array.from({ length: 7 }).map((_, i) => {
          const h = 10 + 26 * Math.abs(Math.sin(i * 1.4));
          return <rect key={i} className="eq-bar" x={76 + i * 7} y={78 - h / 2} width="4" height={h} rx="2" fill={i % 2 ? CL : VL} style={{ animationDelay: `${i * 0.12}s` }} />;
        })}
        <g className="floaty"><path d="M168 22 v22 a6 6 0 1 1 -3 -5 v-14 l12 -3 v6 z" fill={A} /></g>
        <g className="floaty" style={{ animationDelay: '-3s' }}><path d="M24 30 v16 a5 5 0 1 1 -3 -4 v-12 z" fill={G} /></g>
      </>
    )
  };

  return (
    <svg viewBox="0 0 200 120" className={className} aria-hidden="true">
      {common}
      {scenes[type] || scenes.other}
    </svg>
  );
}

const FEATURE_PATHS = {
  transcript: 'M7 3h7l5 5v13H7zM14 3v5h5M10 12h6M10 16h6',
  speakers: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20a6 6 0 0 1 12 0M16 11a3 3 0 1 0 0-6M21 20a6 6 0 0 0-4-5.6',
  flowchart: 'M3 10h5v4H3zM14 4h7v4h-7zM14 16h7v4h-7zM8 12h3M11 6v12M11 6h3M11 18h3',
  evaluation: 'M4 16a8 8 0 1 1 16 0M12 16l4-5M8 20h8',
  chatbot: 'M4 5h16v11H9l-5 4zM9 10.5h.01M12 10.5h.01M15 10.5h.01',
  types: 'M12 3 3 8l9 5 9-5-9-5ZM3 13l9 5 9-5M3 17l9 5 9-5',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  upload: 'M12 16V4m0 0 4 4m-4-4-4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  output: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM16.5 13v7M13 16.5h7',
  explore: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM21 21l-5-5',
  education: 'M2 9l10-5 10 5-10 5-10-5ZM6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5',
  enterprise: 'M4 21V7l8-4 8 4v14M9 21v-6h6v6M8 10h.01M12 10h.01M16 10h.01',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  metrics: 'M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3ZM9 12l2 2 4-4'
};

/** Gradient tile with a line icon. */
export function FeatureIcon({ name, className = 'h-12 w-12', iconClassName = 'h-6 w-6', tone = 'brand' }) {
  const tones = {
    brand: 'from-aura-violet to-aura-cyan',
    cyan: 'from-cyan-500 to-sky-600',
    green: 'from-emerald-500 to-teal-600',
    amber: 'from-amber-500 to-orange-600',
    pink: 'from-pink-500 to-violet-600'
  };
  return (
    <span className={`grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${tones[tone] || tones.brand} text-white shadow-glow ${className}`}>
      <svg viewBox="0 0 24 24" className={iconClassName} fill="none" aria-hidden="true">
        <path d={FEATURE_PATHS[name] || FEATURE_PATHS.explore} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** Upload drop-zone art: a file with a waveform rising into a cloud. */
export function UploadArt({ className = '' }) {
  const g = useUid('up');
  return (
    <svg viewBox="0 0 220 150" className={className} aria-hidden="true">
      <defs><BrandGradient id={g} /></defs>
      <ellipse cx="110" cy="136" rx="80" ry="8" fill={C} opacity="0.12" />
      <path d="M62 92 a26 26 0 0 1 8-50 a36 36 0 0 1 68-6 a28 28 0 0 1 20 56 z" fill={SURFACE} stroke={`url(#${g})`} strokeWidth="3" />
      <g className="bob">
        <path d="M110 104 V56 M94 72 L110 56 L126 72" stroke={`url(#${g})`} strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g transform="translate(150 86)">
        <g className="floaty">
          <rect width="46" height="56" rx="8" fill={ELEVATED} stroke={LINE} />
          {[0, 1, 2, 3, 4].map((i) => {
            const h = 8 + 18 * Math.abs(Math.sin(i * 1.5 + 0.3));
            return <rect key={i} className="eq-bar" x={9 + i * 6} y={28 - h / 2} width="3.5" height={h} rx="1.75" fill={i % 2 ? CL : VL} style={{ animationDelay: `${i * 0.1}s` }} />;
          })}
          <rect x="9" y="44" width="28" height="4" rx="2" fill={MUTED} />
        </g>
      </g>
      <g transform="translate(20 92)">
        <g className="floaty" style={{ animationDelay: '-3s' }}>
          <rect width="40" height="40" rx="12" fill={ELEVATED} stroke={LINE} />
          <path d="M20 10 v14 M14 20 a6 6 0 0 0 12 0" stroke={VL} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <rect x="16.5" y="8" width="7" height="14" rx="3.5" fill={VL} />
        </g>
      </g>
    </svg>
  );
}

/** Mini flowchart art for the output choice. */
export function FlowchartArt({ className = '' }) {
  const g = useUid('fc');
  return (
    <svg viewBox="0 0 220 120" className={className} aria-hidden="true">
      <defs><BrandGradient id={g} /></defs>
      <path d="M58 60 C80 60 80 24 100 24 M58 60 H100 M58 60 C80 60 80 96 100 96" stroke={`url(#${g})`} strokeWidth="3" fill="none" className="flow-dash" />
      <path d="M146 24 C160 24 160 12 172 12 M146 24 C160 24 160 36 172 36 M146 96 C160 96 160 84 172 84 M146 96 C160 96 160 108 172 108 M146 60 H172" stroke={LINE} strokeWidth="2" fill="none" />
      <rect x="8" y="46" width="52" height="28" rx="14" fill={V} />
      <rect x="18" y="57" width="32" height="6" rx="3" fill="#fff" opacity="0.85" />
      {[[24, C], [60, G], [96, A]].map(([y, c]) => (
        <g key={y}>
          <rect x="100" y={y - 12} width="48" height="24" rx="8" fill={SURFACE} stroke={c} strokeWidth="2" />
          <rect x="110" y={y - 3} width="28" height="6" rx="3" fill={c} opacity="0.7" />
        </g>
      ))}
      {[12, 36, 60, 84, 108].map((y) => <rect key={y} x="172" y={y - 7} width="40" height="14" rx="5" fill={ELEVATED} stroke={LINE} />)}
    </svg>
  );
}

/** Mini chat art for the output choice. */
export function ChatArt({ className = '' }) {
  const g = useUid('ch');
  return (
    <svg viewBox="0 0 220 120" className={className} aria-hidden="true">
      <defs><BrandGradient id={g} /></defs>
      <g className="floaty">
        <rect x="96" y="8" width="116" height="30" rx="15" fill={`url(#${g})`} />
        <rect x="110" y="20" width="84" height="6" rx="3" fill="#fff" opacity="0.9" />
      </g>
      <g className="floaty" style={{ animationDelay: '-2s' }}>
        <rect x="8" y="46" width="150" height="46" rx="16" fill={SURFACE} stroke={LINE} />
        <rect x="22" y="58" width="110" height="6" rx="3" fill="var(--text-secondary)" opacity="0.5" />
        <rect x="22" y="72" width="70" height="6" rx="3" fill="var(--text-secondary)" opacity="0.35" />
        <rect x="98" y="70" width="42" height="10" rx="5" fill={C} opacity="0.25" />
        <text x="119" y="78" textAnchor="middle" fontSize="7" fontWeight="700" fill={CL} fontFamily="JetBrains Mono, monospace">03:15</text>
      </g>
      <g className="floaty" style={{ animationDelay: '-4s' }}>
        <rect x="8" y="98" width="60" height="18" rx="9" fill={SURFACE} stroke={LINE} />
        <circle cx="24" cy="107" r="3" fill={CL} className="blink" />
        <circle cx="38" cy="107" r="3" fill={VL} className="blink" style={{ animationDelay: '0.2s' }} />
        <circle cx="52" cy="107" r="3" fill={G} className="blink" style={{ animationDelay: '0.4s' }} />
      </g>
    </svg>
  );
}

/** Processing: an orb with an orbiting ring of nodes and a live waveform. */
export function ProcessingArt({ className = '' }) {
  const g = useUid('proc');
  const glow = useUid('procGlow');
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true">
      <defs>
        <BrandGradient id={g} />
        <radialGradient id={glow}><stop offset="0%" stopColor={VL} stopOpacity="0.5" /><stop offset="100%" stopColor={VL} stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx="100" cy="100" r="96" fill={`url(#${glow})`} />
      <circle cx="100" cy="100" r="74" fill="none" stroke={LINE} strokeDasharray="4 8" />
      <g className="spin-slow">
        <circle cx="100" cy="100" r="74" fill="none" stroke="transparent" />
        {[0, 72, 144, 216, 288].map((deg, i) => {
          const rad = (deg * Math.PI) / 180;
          return <circle key={deg} cx={100 + 74 * Math.cos(rad)} cy={100 + 74 * Math.sin(rad)} r="7" fill={[CL, VL, G, A, P][i]} />;
        })}
      </g>
      <circle cx="100" cy="100" r="46" fill={`url(#${g})`} />
      <circle cx="100" cy="100" r="46" fill="none" stroke={CL} strokeWidth="2" className="ping-ring" />
      {Array.from({ length: 7 }).map((_, i) => {
        const h = 12 + 30 * Math.abs(Math.sin(i * 1.2 + 0.4));
        return <rect key={i} className="eq-bar" x={76 + i * 7.5} y={100 - h / 2} width="4" height={h} rx="2" fill="#fff" style={{ animationDelay: `${i * 0.11}s` }} />;
      })}
    </svg>
  );
}

/** Empty history: stacked cards with a clock. */
export function EmptyHistoryArt({ className = '' }) {
  return (
    <svg viewBox="0 0 160 110" className={className} aria-hidden="true">
      <rect x="34" y="14" width="96" height="30" rx="10" fill={ELEVATED} stroke={LINE} opacity="0.6" />
      <rect x="26" y="34" width="112" height="32" rx="10" fill={ELEVATED} stroke={LINE} opacity="0.8" />
      <rect x="18" y="56" width="128" height="36" rx="12" fill={SURFACE} stroke={LINE} />
      <circle cx="38" cy="74" r="8" fill={VL} opacity="0.8" />
      <rect x="54" y="68" width="60" height="5" rx="2.5" fill={MUTED} />
      <rect x="54" y="78" width="38" height="5" rx="2.5" fill={MUTED} opacity="0.6" />
      <g transform="translate(128 26)">
        <g className="floaty">
          <circle r="16" fill={C} />
          <path d="M0 -8 V0 L6 4" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}

/** Empty reports: an open folder with documents. */
export function EmptyReportsArt({ className = '' }) {
  const g = useUid('rep');
  return (
    <svg viewBox="0 0 280 200" className={className} aria-hidden="true">
      <defs><BrandGradient id={g} /></defs>
      <ellipse cx="140" cy="184" rx="100" ry="10" fill={C} opacity="0.12" />
      <g className="floaty">
        <rect x="92" y="24" width="84" height="104" rx="10" fill={SURFACE} stroke={LINE} transform="rotate(-8 134 76)" />
        <rect x="112" y="16" width="84" height="104" rx="10" fill={SURFACE} stroke={`url(#${g})`} strokeWidth="2" />
        <path d="M124 44 C136 30 148 58 160 40 C168 30 176 44 184 38" stroke={CL} strokeWidth="3" fill="none" strokeLinecap="round" />
        {[62, 74, 86, 98].map((y, i) => <rect key={y} x="124" y={y} width={[56, 44, 60, 36][i]} height="5" rx="2.5" fill={MUTED} />)}
      </g>
      <path d="M52 96 h58 l12 14 h106 v62 a8 8 0 0 1 -8 8 H60 a8 8 0 0 1 -8 -8 z" fill={ELEVATED} stroke={LINE} />
      <path d="M52 118 h176 v54 a8 8 0 0 1 -8 8 H60 a8 8 0 0 1 -8 -8 z" fill={`url(#${g})`} opacity="0.9" />
      {[[40, 60, VL], [238, 70, CL], [220, 30, A]].map(([x, y, c], i) => (
        <path key={i} d={`M${x} ${y - 7} L${x + 2} ${y - 2} L${x + 7} ${y} L${x + 2} ${y + 2} L${x} ${y + 7} L${x - 2} ${y + 2} L${x - 7} ${y} L${x - 2} ${y - 2} Z`}
          fill={c} className="blink" style={{ animationDelay: `${i * 0.4}s` }} />
      ))}
    </svg>
  );
}

/** Sign-in / sign-up art: a device turning audio into a tree and a chat, with floating result chips. */
export function AuthArt({ variant = 'login', className = '' }) {
  const g = useUid('auth');
  const chips = variant === 'signup'
    ? [['Interview', CL, 18, 70], ['MoM', A, 350, 120], ['Discussion', G, 10, 300], ['Conversation', P, 340, 330]]
    : [['2 speakers', CL, 14, 90], ['95% valid', G, 350, 140], ['Chat ready', VL, 18, 320], ['Transcript', A, 346, 340]];
  return (
    <svg viewBox="0 0 460 440" className={className} aria-hidden="true">
      <defs>
        <BrandGradient id={g} />
        <radialGradient id={`${g}glow`}><stop offset="0%" stopColor={V} stopOpacity="0.35" /><stop offset="100%" stopColor={V} stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx="230" cy="220" r="210" fill={`url(#${g}glow)`} />
      <g transform="translate(140 30)">
        <g className="floaty">
          <rect width="180" height="370" rx="32" fill={SURFACE} stroke={`url(#${g})`} strokeWidth="3" />
          <rect x="66" y="14" width="48" height="8" rx="4" fill={LINE} />
          <g transform="translate(22 46)">
            {Array.from({ length: 17 }).map((_, i) => {
              const h = 8 + 36 * Math.abs(Math.sin(i * 1.2) * Math.cos(i * 0.5));
              return <rect key={i} className="eq-bar" x={i * 8} y={24 - h / 2} width="5" height={h} rx="2.5" fill={i % 2 ? CL : VL} style={{ animationDelay: `${(i % 5) * 0.12}s` }} />;
            })}
          </g>
          <path d="M90 104 v22" stroke={`url(#${g})`} strokeWidth="3" className="flow-dash" />
          <rect x="18" y="130" width="144" height="110" rx="16" fill={ELEVATED} />
          <path d="M52 185 C66 185 66 156 80 156 M52 185 H80 M52 185 C66 185 66 214 80 214" stroke={`url(#${g})`} strokeWidth="2.5" fill="none" />
          <rect x="26" y="174" width="30" height="22" rx="11" fill={V} />
          {[[156, C], [185, G], [214, A]].map(([y, c]) => (
            <g key={y}>
              <rect x="80" y={y - 9} width="40" height="18" rx="6" fill={SURFACE} stroke={c} strokeWidth="2" />
              <path d={`M120 ${y} H134`} stroke={LINE} strokeWidth="2" />
              <rect x="134" y={y - 6} width="20" height="12" rx="4" fill={SURFACE} stroke={LINE} />
            </g>
          ))}
          <rect x="60" y="256" width="104" height="30" rx="15" fill={`url(#${g})`} />
          <rect x="74" y="268" width="70" height="6" rx="3" fill="#fff" opacity="0.9" />
          <rect x="16" y="296" width="116" height="40" rx="15" fill={ELEVATED} />
          <rect x="30" y="309" width="80" height="5" rx="2.5" fill="var(--text-secondary)" opacity="0.5" />
          <rect x="30" y="320" width="50" height="5" rx="2.5" fill="var(--text-secondary)" opacity="0.35" />
        </g>
      </g>
      {chips.map(([label, color, x, y], i) => {
        // Size each chip from its label and keep right-hand chips inside the canvas.
        const width = label.length * 8.2 + 42;
        const left = x > 200 ? 454 - width : x;
        return (
        <g key={label} transform={`translate(${left} ${y})`}>
          <g className="floaty" style={{ animationDelay: `${-i * 1.5}s` }}>
            <rect width={width} height="34" rx="17" fill={SURFACE} stroke={color} strokeWidth="2" />
            <circle cx="17" cy="17" r="6" fill={color} />
            <text x="30" y="22" fontSize="12.5" fontWeight="700" fill="var(--text-primary)" fontFamily="Inter, sans-serif">{label}</text>
          </g>
        </g>
        );
      })}
    </svg>
  );
}

/** 404: a flat-lining waveform under a magnifying glass. */
export function NotFoundArt({ className = '' }) {
  const g = useUid('nf');
  return (
    <svg viewBox="0 0 320 200" className={className} aria-hidden="true">
      <defs><BrandGradient id={g} /></defs>
      <path d="M10 110 H70 L84 70 L98 150 L112 90 L122 110 H150" stroke={`url(#${g})`} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M170 110 H310" stroke={LINE} strokeWidth="4" strokeDasharray="2 10" strokeLinecap="round" />
      <g transform="translate(206 84)">
        <g className="floaty">
          <circle r="40" fill={SURFACE} stroke={`url(#${g})`} strokeWidth="6" />
          <path d="M28 28 L58 58" stroke={`url(#${g})`} strokeWidth="10" strokeLinecap="round" />
          <text y="14" textAnchor="middle" fontSize="40" fontWeight="800" fill={CL} fontFamily="Space Grotesk, sans-serif">?</text>
        </g>
      </g>
    </svg>
  );
}

/** Use-case art: classroom (education) and board room (enterprise). */
export function UseCaseArt({ kind, className = '' }) {
  const g = useUid('uc');
  if (kind === 'education') {
    return (
      <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
        <defs><BrandGradient id={g} /></defs>
        <rect x="20" y="12" width="200" height="80" rx="10" fill={SURFACE} stroke={LINE} />
        <path d="M60 52 C74 52 74 30 88 30 M60 52 H88 M60 52 C74 52 74 74 88 74" stroke={`url(#${g})`} strokeWidth="2.5" fill="none" className="flow-dash" />
        <rect x="34" y="44" width="28" height="16" rx="8" fill={V} />
        {[[30, C], [52, G], [74, A]].map(([y, c]) => <rect key={y} x="88" y={y - 7} width="44" height="14" rx="5" fill={ELEVATED} stroke={c} strokeWidth="1.5" />)}
        <rect x="150" y="30" width="54" height="6" rx="3" fill={MUTED} /><rect x="150" y="44" width="40" height="6" rx="3" fill={MUTED} opacity="0.6" />
        <Person x={46} y={112} color={VL} scale={0.7} />
        <Person x={96} y={116} color={CL} scale={0.7} />
        <Person x={146} y={116} color={G} scale={0.7} />
        <Person x={196} y={112} color={A} scale={0.7} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
      <defs><BrandGradient id={g} /></defs>
      <rect x="130" y="14" width="96" height="70" rx="10" fill={SURFACE} stroke={LINE} />
      {[[146, 30, 50], [146, 46, 64], [146, 62, 40]].map(([x, y, w]) => (
        <g key={y}><path d={`M${x - 6} ${y} l3 3 l5 -6`} stroke={G} strokeWidth="2" fill="none" strokeLinecap="round" /><rect x={x + 6} y={y - 3} width={w} height="5" rx="2.5" fill={MUTED} /></g>
      ))}
      <ellipse cx="70" cy="92" rx="54" ry="22" fill={SURFACE} stroke={LINE} strokeWidth="2" />
      {[[70, 58, CL], [26, 80, VL], [114, 80, A], [36, 110, G], [104, 110, P]].map(([x, y, c], i) => <circle key={i} cx={x} cy={y} r="9" fill={c} />)}
      <rect x="54" y="86" width="32" height="12" rx="3" fill={`url(#${g})`} />
      <g transform="translate(200 108)"><g className="floaty">
        <rect x="-28" y="-16" width="56" height="32" rx="16" fill={`url(#${g})`} />
        <text y="5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff" fontFamily="Space Grotesk, sans-serif">MoM</text>
      </g></g>
    </svg>
  );
}

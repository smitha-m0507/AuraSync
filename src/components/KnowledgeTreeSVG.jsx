import { forwardRef } from 'react';

// Explicit colours (not CSS variables) so the SVG also renders correctly when exported to PNG.
const BRANCH_COLORS = ['#06B6D4', '#10B981', '#F59E0B', '#EC4899', '#A78BFA', '#3B82F6', '#EF4444', '#14B8A6'];
export const SPEAKER_COLORS = ['#67E8F9', '#FCD34D', '#F9A8D4', '#86EFAC', '#C4B5FD', '#FDBA74', '#93C5FD', '#FCA5A5'];

const TYPE_BADGES = {
  metric: { symbol: '#', name: 'Metric' },
  decision: { symbol: '✓', name: 'Decision' },
  action: { symbol: '→', name: 'Action' },
  risk: { symbol: '!', name: 'Risk' },
  entity: { symbol: '◆', name: 'Entity' },
  concept: { symbol: '•', name: 'Concept' },
  theme: { symbol: '◉', name: 'Theme' }
};

export function speakerColor(speakerId, speakers = []) {
  const index = speakers.findIndex((s) => s.id === speakerId);
  return SPEAKER_COLORS[(index >= 0 ? index : 0) % SPEAKER_COLORS.length];
}

const branchColor = (node) => (node.depth === 0 ? '#A78BFA' : BRANCH_COLORS[Math.max(0, node.branchIndex) % BRANCH_COLORS.length]);

/** Left-to-right concept tree. Layout (x, y, width, height, lines) is computed by the backend. */
const KnowledgeTreeSVG = forwardRef(function KnowledgeTreeSVG({ data, zoom = 1 }, ref) {
  const nodes = data?.nodes || [];
  const edges = data?.edges || [];
  const speakers = data?.speakers || [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const width = Math.max(data?.width || 800, 400);
  const height = Math.max(data?.height || 400, 200);

  if (nodes.length === 0) {
    return <div className="grid h-full place-items-center text-text-secondary">No concept tree available.</div>;
  }

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      width={width * zoom}
      height={height * zoom}
      className="aurasync-visual"
      role="img"
      aria-label={`Concept tree: ${data?.coreConcept || ''}`}
    >
      <rect width={width} height={height} rx="24" fill="#0F172A" />

      {edges.map((edge) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) return null;
        const x1 = from.x + from.width;
        const y1 = from.y + from.height / 2;
        const x2 = to.x;
        const y2 = to.y + to.height / 2;
        const mid = (x1 + x2) / 2;
        return (
          <path
            key={`${edge.from}-${edge.to}`}
            d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke={branchColor(to)}
            strokeWidth={to.depth === 1 ? 3 : 2}
            strokeOpacity="0.75"
          />
        );
      })}

      {nodes.map((node) => {
        const color = branchColor(node);
        const isRoot = node.depth === 0;
        const isTheme = node.depth === 1;
        const badge = TYPE_BADGES[node.type];
        const textX = isRoot ? node.width / 2 : 30;
        const lineY = (i) => 20 + i * 17;
        return (
          <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
            <title>{`${node.label}${node.value ? `: ${node.value}` : ''} (${node.type})${node.speakers?.length ? ` — ${node.speakers.join(', ')}` : ''}`}</title>
            <rect
              width={node.width}
              height={node.height}
              rx={isRoot ? 18 : 12}
              fill={isRoot ? '#7C3AED' : isTheme ? '#1E293B' : '#111C31'}
              stroke={color}
              strokeWidth={isRoot ? 0 : isTheme ? 2.5 : 1.5}
            />
            {!isRoot && badge && (
              <>
                <circle cx="16" cy="18" r="9" fill={color} fillOpacity={isTheme ? 1 : 0.22} />
                <text x="16" y="22" textAnchor="middle" fontSize="11" fontWeight="800" fontFamily="Inter, sans-serif" fill={isTheme ? '#0F172A' : color}>
                  {badge.symbol}
                </text>
              </>
            )}
            {node.lines.map((line, i) => (
              <text
                key={i}
                x={textX}
                y={lineY(i) + 2}
                textAnchor={isRoot ? 'middle' : 'start'}
                fontSize={isRoot ? 15 : isTheme ? 13.5 : 12.5}
                fontWeight={isRoot || isTheme ? 700 : 500}
                fontFamily="Inter, sans-serif"
                fill="#F8FAFC"
              >
                {line}
              </text>
            ))}
            {node.speakers?.length > 0 && (
              <text x={textX} y={lineY(node.lines.length) + 4} textAnchor={isRoot ? 'middle' : 'start'} fontSize="10.5" fontWeight="700" fontFamily="Inter, sans-serif">
                {node.speakers.map((id, i) => (
                  <tspan key={id} fill={speakerColor(id, speakers)}>
                    {i > 0 ? '  ' : ''}{speakers.find((s) => s.id === id)?.label || id}
                  </tspan>
                ))}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
});

export function TreeLegend({ data }) {
  const speakers = data?.speakers || [];
  const types = [...new Set((data?.nodes || []).map((n) => n.type))].filter((t) => TYPE_BADGES[t]);
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-text-secondary">
      <span className="text-text-primary">
        {speakers.length} speaker{speakers.length === 1 ? '' : 's'}:
      </span>
      {speakers.map((s) => (
        <span key={s.id} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: speakerColor(s.id, speakers) }} />
          {s.label}{s.role ? ` (${s.role})` : ''} · {s.talkTimePercent}%
        </span>
      ))}
      <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
      {types.map((t) => (
        <span key={t} className="flex items-center gap-1">
          <span className="font-bold text-aura-cyan-light">{TYPE_BADGES[t].symbol}</span> {TYPE_BADGES[t].name}
        </span>
      ))}
    </div>
  );
}

export default KnowledgeTreeSVG;

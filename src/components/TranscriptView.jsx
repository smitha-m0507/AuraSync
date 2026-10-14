import { useMemo, useState } from 'react';
import { speakerColor } from './KnowledgeTreeSVG';

export function formatTime(seconds = 0) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Group consecutive segments by the same speaker into readable turns. */
function toTurns(segments) {
  const turns = [];
  for (const segment of segments) {
    const last = turns.at(-1);
    if (last && last.speaker === segment.speaker) {
      last.text += ` ${segment.text}`;
      last.end = segment.end;
    } else {
      turns.push({ speaker: segment.speaker, start: segment.start, end: segment.end, text: segment.text });
    }
  }
  return turns;
}

export default function TranscriptView({ segments = [], speakers = [], transcript, fileName, diarizationMethod }) {
  const [query, setQuery] = useState('');
  const labels = useMemo(() => new Map(speakers.map((s) => [s.id, s.label])), [speakers]);
  const turns = useMemo(() => toTurns(segments), [segments]);
  const needle = query.trim().toLowerCase();
  const visible = needle ? turns.filter((turn) => turn.text.toLowerCase().includes(needle)) : turns;

  const download = () => {
    const text = turns.map((turn) => `[${formatTime(turn.start)}] ${labels.get(turn.speaker) || turn.speaker}: ${turn.text}`).join('\n\n');
    const url = URL.createObjectURL(new Blob([text || transcript || ''], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(fileName || 'transcript').replace(/\.[^/.]+$/, '')}-transcript.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Reports saved before timestamped segments existed only have plain text.
  if (segments.length === 0) {
    return (
      <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap rounded-2xl bg-bg-elevated p-5 font-mono text-sm leading-7 text-text-secondary">
        {transcript || 'No transcript available.'}
      </pre>
    );
  }

  return (
    <div>
      {speakers.length > 0 && (
        <div className="mb-5 rounded-2xl border border-border bg-bg-elevated p-4">
          <p className="text-sm font-semibold text-text-primary">
            {speakers.length} speaker{speakers.length === 1 ? '' : 's'} identified
            {diarizationMethod && (
              <span className="font-normal text-text-secondary">
                {' '}· {diarizationMethod === 'acoustic' ? 'acoustic voice diarization' : 'inferred from the conversation by the language model'}
              </span>
            )}
          </p>
          <div className="mt-3 space-y-2">
            {speakers.map((speaker) => (
              <div key={speaker.id} className="flex items-center gap-3 text-sm">
                <span className="w-40 truncate font-semibold" style={{ color: speakerColor(speaker.id, speakers) }}>
                  {speaker.label}{speaker.role ? <span className="font-normal text-text-secondary"> · {speaker.role}</span> : null}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                  <div className="h-full rounded-full" style={{ width: `${speaker.talkTimePercent}%`, background: speakerColor(speaker.id, speakers) }} />
                </div>
                <span className="w-32 text-right text-xs text-text-secondary">
                  {speaker.talkTimePercent}% · {formatTime(speaker.talkTimeSeconds)} · {speaker.turns} turns
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the transcript…"
          className="input flex-1"
          aria-label="Search transcript"
        />
        <button onClick={download} className="rounded-2xl border border-border px-4 py-3 text-sm font-bold text-text-primary transition hover:scale-102">
          Download .txt
        </button>
      </div>

      <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
        {visible.map((turn, index) => (
          <div key={`${turn.start}-${index}`} className="rounded-2xl bg-bg-elevated p-4">
            <div className="mb-1 flex items-center gap-3 text-xs font-bold">
              <span style={{ color: speakerColor(turn.speaker, speakers) }}>{labels.get(turn.speaker) || turn.speaker}</span>
              <span className="font-mono text-text-muted">{formatTime(turn.start)} – {formatTime(turn.end)}</span>
            </div>
            <p className="text-sm leading-7 text-text-secondary">{turn.text}</p>
          </div>
        ))}
        {visible.length === 0 && <p className="text-center text-sm text-text-secondary">No matches for “{query}”.</p>}
      </div>
    </div>
  );
}

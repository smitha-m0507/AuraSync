import { useState } from 'react';

const METRIC_ORDER = ['structure', 'coverage', 'groundedness', 'metricFidelity', 'conciseness', 'distinctiveness', 'balance', 'speakerAttribution', 'llmJudge'];

function scoreColor(score) {
  if (score === null || score === undefined) return '#64748B';
  if (score >= 0.8) return '#10B981';
  if (score >= 0.6) return '#F59E0B';
  return '#EF4444';
}

const pct = (score) => (score === null || score === undefined ? 'N/A' : `${Math.round(score * 100)}%`);

function DetailList({ title, items }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-2">
      <span className="font-semibold text-text-primary">{title}: </span>
      <span>{items.join(', ')}</span>
    </div>
  );
}

function MetricDetails({ name, details }) {
  if (!details) return null;
  if (details.reason) return <p className="mt-2">Not applicable: {details.reason}.</p>;
  switch (name) {
    case 'structure':
      return (
        <ul className="mt-2 space-y-1">
          {details.checks?.map((check) => (
            <li key={check.name}>
              <span style={{ color: check.pass ? '#10B981' : '#EF4444' }}>{check.pass ? '✓' : '✗'}</span> {check.name} — {check.detail}
            </li>
          ))}
        </ul>
      );
    case 'coverage':
      return (
        <>
          <p className="mt-2">{details.covered?.length || 0} of {details.keyphrases} salient keyphrases represented.</p>
          <DetailList title="Covered" items={details.covered} />
          <DetailList title="Missing" items={details.missing} />
        </>
      );
    case 'groundedness':
      return (
        <>
          <p className="mt-2">{details.checked - (details.ungrounded?.length || 0)} of {details.checked} nodes grounded in the transcript.</p>
          <DetailList title="Not found in transcript" items={details.ungrounded} />
        </>
      );
    case 'metricFidelity':
      return (
        <>
          <p className="mt-2">Precision {pct(details.precision)} · recall of most-mentioned figures {pct(details.recall)}</p>
          <DetailList title="Most-mentioned figures" items={details.importantFigures} />
          <DetailList title="Missed" items={details.missed} />
          <DetailList title="Not in transcript" items={details.invented} />
          <DetailList title="Metrics without a figure" items={details.valueless} />
        </>
      );
    case 'conciseness':
      return (
        <>
          <p className="mt-2">Average {details.averageWords} words per label (limit {details.limit}).</p>
          <DetailList title="Too long" items={details.tooLong} />
        </>
      );
    case 'distinctiveness':
      return details.duplicates?.length ? <DetailList title="Near-duplicates" items={details.duplicates} /> : <p className="mt-2">No duplicated nodes.</p>;
    case 'balance':
      return details.unbalanced?.length ? <DetailList title="Unbalanced" items={details.unbalanced} /> : <p className="mt-2">All {details.internalNodes} branches are balanced.</p>;
    case 'speakerAttribution':
      return <p className="mt-2">Themes attributed: {details.themesAttributed} · major speakers represented: {details.majorSpeakersRepresented}</p>;
    case 'llmJudge':
      return (
        <>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(details.scores || {}).map(([k, v]) => (
              <span key={k} className="rounded-full border border-border px-2 py-0.5">{k}: <b className="text-text-primary">{v}/5</b></span>
            ))}
          </div>
          <DetailList title="Strengths" items={details.strengths} />
        </>
      );
    default:
      return null;
  }
}

/** Shows how the generated concept tree scored on each evaluation metric and whether it passed validation. */
export default function EvaluationPanel({ evaluation }) {
  const [open, setOpen] = useState(null);
  if (!evaluation?.metrics) return null;

  const overallColor = scoreColor(evaluation.overall);
  const refined = (evaluation.attempts || []).length > 1;

  return (
    <div className="glass-card rounded-3xl p-6 shadow-aura">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="font-display text-2xl font-bold text-text-primary">Flowchart evaluation</h3>
          <p className="mt-1 text-sm text-text-secondary">
            Scored against the transcript by automatic metrics and an independent LLM judge.
            {refined && ` Refined ${evaluation.attempts.length - 1}× using evaluation feedback; attempt ${evaluation.selectedAttempt} selected.`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="font-display text-4xl font-bold" style={{ color: overallColor }}>{pct(evaluation.overall)}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Overall score</p>
          </div>
          <span
            className="rounded-full px-4 py-2 text-sm font-bold"
            style={{ color: evaluation.valid ? '#10B981' : '#F59E0B', background: evaluation.valid ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)' }}
          >
            {evaluation.valid ? '✓ Valid' : '⚠ Needs review'}
          </span>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {evaluation.gates?.map((gate) => (
          <span key={gate.name} className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-text-secondary" title={gate.detail || ''}>
            <span style={{ color: gate.pass ? '#10B981' : '#EF4444' }}>{gate.pass ? '✓' : '✗'}</span> {gate.name}
          </span>
        ))}
      </div>

      <div className="mt-5 space-y-2">
        {METRIC_ORDER.filter((name) => evaluation.metrics[name]).map((name) => {
          const metric = evaluation.metrics[name];
          const color = scoreColor(metric.score);
          const isOpen = open === name;
          return (
            <div key={name} className="rounded-2xl border border-border bg-bg-elevated">
              <button onClick={() => setOpen(isOpen ? null : name)} className="w-full p-4 text-left" aria-expanded={isOpen}>
                <div className="flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold text-text-primary">{metric.label}</span>
                      <span className="text-xs text-text-muted">weight {Math.round(metric.weight * 100)}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
                      <div className="h-full rounded-full" style={{ width: `${(metric.score ?? 0) * 100}%`, background: color }} />
                    </div>
                  </div>
                  <span className="w-14 text-right font-display text-lg font-bold" style={{ color }}>{pct(metric.score)}</span>
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-border px-4 pb-4 pt-3 text-sm leading-6 text-text-secondary">
                  <p>{metric.description}</p>
                  <MetricDetails name={name} details={metric.details} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {evaluation.feedback?.length > 0 && (
        <details className="mt-5 text-sm text-text-secondary">
          <summary className="cursor-pointer font-semibold text-text-primary">Remaining observations ({evaluation.feedback.length})</summary>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {evaluation.feedback.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

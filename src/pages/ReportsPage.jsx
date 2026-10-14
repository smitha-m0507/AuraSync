import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp, normalizeReport } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import KnowledgeTreeSVG, { TreeLegend } from '../components/KnowledgeTreeSVG';
import EvaluationPanel from '../components/EvaluationPanel';
import ChatPanel from '../components/ChatPanel';
import TranscriptView from '../components/TranscriptView';
import { Backdrop, PageHero } from '../components/art/Layout';
import { ChatArt, EmptyReportsArt, FeatureIcon, FlowchartArt } from '../components/art/Illustrations';
import { reportsAPI } from '../services/api.js';
import { formatDate } from '../utils/validation';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'starred', label: 'Starred' },
  { id: 'flowchart', label: 'Flowcharts' },
  { id: 'chatbot', label: 'Chatbots' }
];

const isConceptTree = (data) => data?.version === 'concept-tree-1';
const typeOf = (report) => (report.outputType?.toLowerCase() === 'chatbot' ? 'chatbot' : 'flowchart');

function StarIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill={filled ? '#F59E0B' : 'none'} aria-hidden="true">
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z" stroke={filled ? '#F59E0B' : 'currentColor'} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

/** Card thumbnail: a scaled-down concept tree, or the first questions of a chat. */
function ReportPreview({ report }) {
  if (typeOf(report) === 'flowchart') {
    if (!isConceptTree(report.data)) return <FlowchartArt className="h-full w-full" />;
    const scale = Math.min(300 / (report.data.width || 800), 150 / (report.data.height || 400));
    return (
      <div className="grid h-full place-items-center overflow-hidden">
        <KnowledgeTreeSVG data={report.data} zoom={scale} />
      </div>
    );
  }
  const questions = (report.chatHistory || []).filter((turn) => turn.role === 'user').slice(0, 2);
  if (questions.length === 0) return <ChatArt className="h-full w-full" />;
  return (
    <div className="flex h-full flex-col justify-center gap-2 px-2">
      {questions.map((turn, i) => (
        <div key={i} className="ml-auto max-w-[90%] truncate rounded-2xl bg-gradient-to-r from-aura-violet to-aura-cyan px-3 py-1.5 text-xs font-semibold text-white">
          {turn.content}
        </div>
      ))}
      <div className="max-w-[80%] rounded-2xl border border-border bg-bg-surface px-3 py-1.5 text-xs text-text-secondary">
        {(report.chatHistory || []).filter((t) => t.role === 'user').length} question(s) answered from the audio
      </div>
    </div>
  );
}

function EmptyState({ filtered }) {
  return (
    <div className="glass-card rounded-[2rem] p-10 text-center shadow-aura">
      <EmptyReportsArt className="mx-auto h-auto w-full max-w-xs" />
      <h3 className="mt-6 font-display text-3xl font-bold text-text-primary">
        {filtered ? 'Nothing here yet' : 'No reports yet'}
      </h3>
      <p className="mx-auto mt-3 max-w-xl leading-7 text-text-secondary">
        Open an analysis in Audio Lab and press <span className="font-semibold text-text-primary">Save to Reports</span> — flowcharts and chats you save appear here with their transcript and evaluation.
      </p>
      <Link to="/lab" className="gradient-button mt-6 inline-flex">Go to Audio Lab</Link>
    </div>
  );
}

export default function ReportsPage() {
  const { reports, deleteReport, toggleStar, loadMoreReports, loading, loadError, pagination, refreshReports } = useApp();
  const { addToast } = useToast();
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    refreshReports();
  }, [refreshReports]);

  const openReport = async (report) => {
    setSelected(report);
    // The list omits bulky fields (timestamped segments); fetch the full report for the detail view.
    try {
      const response = await reportsAPI.getOne(report.id);
      setSelected((current) => (current?.id === report.id ? normalizeReport(response.data.data) : current));
    } catch {
      addToast('Could not load the full report.', 'error');
    }
  };

  const counts = {
    all: reports.length,
    starred: reports.filter((r) => r.isStarred).length,
    flowchart: reports.filter((r) => typeOf(r) === 'flowchart').length,
    chatbot: reports.filter((r) => typeOf(r) === 'chatbot').length
  };

  const visibleReports = reports.filter((report) => {
    if (filter === 'all') return true;
    if (filter === 'starred') return report.isStarred;
    return typeOf(report) === filter;
  });

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteReport(deleteTarget.id);
    addToast('Report deleted.', 'info');
    setDeleteTarget(null);
    setSelected(null);
  };

  return (
    <main className="relative isolate min-h-screen overflow-x-clip bg-bg-primary pb-20">
      <Backdrop blobs={['one', 'three']} />

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHero
          eyebrow="Reports"
          title="Your saved"
          highlight="flowcharts & chats"
          description="Every saved report keeps its transcript, speakers, summary, flowchart evaluation and conversation."
          art={<EmptyReportsArt className="mx-auto h-auto w-full max-w-sm" />}
        >
          <div className="mt-6 grid max-w-xl grid-cols-3 gap-3">
            {[
              { icon: 'output', tone: 'brand', value: counts.all, label: 'Reports' },
              { icon: 'flowchart', tone: 'cyan', value: counts.flowchart, label: 'Flowcharts' },
              { icon: 'chatbot', tone: 'pink', value: counts.chatbot, label: 'Chats' }
            ].map((stat) => (
              <div key={stat.label} className="glass-subtle flex items-center gap-3 rounded-2xl p-3">
                <FeatureIcon name={stat.icon} tone={stat.tone} className="h-10 w-10 rounded-xl" iconClassName="h-5 w-5" />
                <div>
                  <p className="font-display text-2xl font-bold text-text-primary">{stat.value}</p>
                  <p className="text-xs font-semibold text-text-secondary">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
        </PageHero>

        <div className="mb-6 flex flex-wrap gap-2" role="tablist">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition ${
                filter === item.id ? 'border-transparent bg-gradient-to-r from-aura-violet to-aura-cyan text-white' : 'border-border bg-bg-surface text-text-secondary hover:text-text-primary'
              }`}
            >
              {item.label}
              <span className={`rounded-full px-2 text-xs ${filter === item.id ? 'bg-white/20' : 'bg-bg-elevated'}`}>{counts[item.id]}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-80 animate-pulse rounded-3xl border border-border bg-bg-surface" />
            ))}
          </div>
        ) : loadError && reports.length === 0 ? (
          <div className="glass-card rounded-3xl p-10 text-center text-error shadow-aura">{loadError}</div>
        ) : visibleReports.length === 0 ? (
          <EmptyState filtered={reports.length > 0} />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visibleReports.map((report, index) => {
              const type = typeOf(report);
              return (
                <motion.div
                  key={report.id}
                  layout
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index, 8) * 0.04 }}
                  className="glass-card card-lift flex flex-col overflow-hidden rounded-3xl shadow-aura"
                >
                  <button onClick={() => openReport(report)} className="h-44 border-b border-border bg-bg-elevated p-3 text-left" aria-label={`Open ${report.title}`}>
                    <ReportPreview report={report} />
                  </button>
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-start justify-between gap-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${type === 'chatbot' ? 'bg-pink-500/15 text-pink-400' : 'bg-aura-cyan/15 text-aura-cyan-light'}`}>
                        {type === 'chatbot' ? 'Chatbot' : 'Flowchart'}
                      </span>
                      <button
                        onClick={() => toggleStar(report.id)}
                        className="text-text-secondary transition hover:scale-110 hover:text-warning"
                        aria-label={report.isStarred ? 'Unstar report' : 'Star report'}
                        aria-pressed={Boolean(report.isStarred)}
                      >
                        <StarIcon filled={report.isStarred} />
                      </button>
                    </div>
                    <button onClick={() => openReport(report)} className="mt-3 text-left">
                      <h3 className="line-clamp-2 font-display text-xl font-bold text-text-primary">{report.title}</h3>
                      {report.executiveSummary && <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">{report.executiveSummary}</p>}
                    </button>
                    <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-xs font-semibold text-text-muted">
                      <span>{formatDate(report.createdAt)} · {report.speakerCount} speaker{report.speakerCount === 1 ? '' : 's'}</span>
                      <div className="flex items-center gap-3">
                        {type === 'flowchart' && typeof report.evaluation?.overall === 'number' && (
                          <span style={{ color: report.evaluation.valid ? '#10B981' : '#F59E0B' }}>{Math.round(report.evaluation.overall * 100)}%</span>
                        )}
                        <button onClick={() => setDeleteTarget(report)} className="transition hover:text-error">Delete</button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {pagination.page < pagination.totalPages && !loading && (
          <div className="mt-8 text-center">
            <button onClick={loadMoreReports} className="gradient-button">Load more</button>
          </div>
        )}
      </section>

      {selected && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto my-8 max-w-6xl rounded-3xl border border-border bg-bg-primary p-6 shadow-aura sm:p-8"
          >
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
              <div className="flex items-start gap-4">
                <FeatureIcon name={typeOf(selected) === 'chatbot' ? 'chatbot' : 'flowchart'} tone={typeOf(selected) === 'chatbot' ? 'pink' : 'brand'} />
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.28em] text-aura-cyan-light">{typeOf(selected) === 'chatbot' ? 'Chatbot' : 'Flowchart'}</p>
                  <h2 className="mt-1 font-display text-3xl font-bold text-text-primary">{selected.title}</h2>
                  <p className="mt-1 text-text-secondary">{formatDate(selected.createdAt)} · {selected.speakerCount} speakers</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-2xl border border-border px-5 py-3 font-bold text-text-primary transition hover:scale-102">
                Close
              </button>
            </div>

            <div className="mt-6 space-y-6">
              {selected.summary?.executiveSummary && <p className="leading-7 text-text-secondary">{selected.summary.executiveSummary}</p>}

              {isConceptTree(selected.data) && (
                <>
                  <TreeLegend data={selected.data} />
                  <div className="max-h-[560px] overflow-auto rounded-3xl bg-bg-elevated p-3">
                    <KnowledgeTreeSVG data={selected.data} zoom={0.9} />
                  </div>
                  <EvaluationPanel evaluation={selected.evaluation} />
                </>
              )}

              {(typeOf(selected) === 'chatbot' || selected.chatHistory?.length > 0) && (
                <ChatPanel
                  key={selected.id}
                  jobId={selected.jobId}
                  summary={selected.summary}
                  speakers={selected.speakers}
                  initialHistory={selected.chatHistory || []}
                />
              )}

              <details className="glass-card rounded-3xl p-6">
                <summary className="cursor-pointer font-display text-2xl font-bold text-text-primary">Transcript</summary>
                <div className="mt-5">
                  <TranscriptView segments={selected.segments || []} speakers={selected.speakers || []} transcript={selected.transcript} fileName={selected.title} />
                </div>
              </details>
            </div>
          </motion.div>
        </div>
      )}

      {deleteTarget && (
        <Modal
          title="Delete this report?"
          onClose={() => setDeleteTarget(null)}
          actions={
            <button onClick={confirmDelete} className="rounded-2xl bg-error px-5 py-3 font-bold text-white transition hover:scale-102">
              Delete report
            </button>
          }
        >
          <p className="leading-7">
            This permanently removes <span className="font-bold text-text-primary">{deleteTarget.title}</span> from your reports. The original analysis stays in your Audio Lab history.
          </p>
        </Modal>
      )}
    </main>
  );
}

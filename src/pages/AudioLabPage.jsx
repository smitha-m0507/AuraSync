import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { useLab } from '../context/LabContext';
import Modal from '../components/Modal';
import KnowledgeTreeSVG, { TreeLegend } from '../components/KnowledgeTreeSVG';
import EvaluationPanel from '../components/EvaluationPanel';
import ChatPanel from '../components/ChatPanel';
import TranscriptView, { formatTime } from '../components/TranscriptView';
import { AUDIO_TYPES, audioTypeLabel } from '../constants/audioTypes';
import { Backdrop, PageHero } from '../components/art/Layout';
import {
  AudioTypeArt, ChatArt, EmptyHistoryArt, FlowchartArt, HeroScene, ProcessingArt, UploadArt
} from '../components/art/Illustrations';
import { jobsAPI } from '../services/api.js';
import { formatBytes, formatDate } from '../utils/validation';

const SUPPORTED = ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.webm', '.mp4', '.opus', '.aac'];
const SPEAKER_OPTIONS = ['auto', '1', '2', '3', '4', '5', '6'];

const WIZARD = [
  { id: 'type', label: 'Audio type' },
  { id: 'upload', label: 'Upload' },
  { id: 'output', label: 'Output' },
  { id: 'workspace', label: 'Results' }
];

const OUTPUTS = [
  {
    id: 'flowchart',
    title: 'Flowchart',
    copy: 'A keyword concept tree of the core idea, themes, metrics and speakers — automatically evaluated for accuracy and coverage.'
  },
  {
    id: 'chatbot',
    title: 'Chatbot',
    copy: 'Ask anything about the recording — summaries, who said what, numbers, decisions — answered from the audio with timestamps.'
  }
];

const STAGES = {
  flowchart: [
    { status: 'transcribing', label: 'Transcribing audio' },
    { status: 'analyzing', label: 'Identifying speakers & key points' },
    { status: 'summarizing', label: 'Summarizing' },
    { status: 'visualizing', label: 'Building concept tree' },
    { status: 'evaluating', label: 'Evaluating flowchart' }
  ],
  chatbot: [
    { status: 'transcribing', label: 'Transcribing audio' },
    { status: 'analyzing', label: 'Identifying speakers & key points' },
    { status: 'summarizing', label: 'Summarizing & preparing chatbot' }
  ]
};

const TABS = [
  { id: 'flowchart', label: 'Flowchart' },
  { id: 'chatbot', label: 'Chatbot' },
  { id: 'transcript', label: 'Transcript' }
];

function readAudioDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(audio.duration) ? audio.duration : null);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    audio.src = url;
  });
}

function StatusBadge({ job }) {
  if (job.status === 'completed') {
    if (job.outputType === 'flowchart' || job.hasFlowchart) {
      const score = job.evaluationScore;
      return (
        <span className="whitespace-nowrap text-xs font-bold" style={{ color: job.evaluationValid ? '#10B981' : '#F59E0B' }}>
          {score !== null ? `${Math.round(score * 100)}%` : 'Done'}
        </span>
      );
    }
    return <span className="whitespace-nowrap text-xs font-bold text-success">{job.chatMessages} {job.chatMessages === 1 ? 'question' : 'questions'}</span>;
  }
  if (job.status === 'failed') return <span className="whitespace-nowrap text-xs font-bold text-error">Failed</span>;
  return <span className="animate-pulse whitespace-nowrap text-xs font-bold text-aura-cyan-light">Processing</span>;
}

function HistoryPanel() {
  const { history, historyLoading, historyError, activeJobId, openJob, newAnalysis, deleteJob } = useLab();
  const { addToast } = useToast();
  const [confirm, setConfirm] = useState(null);

  return (
    <aside className="glass-card h-fit rounded-3xl p-4 shadow-aura lg:sticky lg:top-24">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="font-display text-lg font-bold text-text-primary">History</h2>
        <button onClick={newAnalysis} className="gradient-button !px-3 !py-2 text-sm">+ New</button>
      </div>
      <div className="mt-4 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
        {historyError && <p className="rounded-2xl border border-error p-3 text-sm leading-6 text-error">{historyError}</p>}
        {historyLoading && history.length === 0 && <p className="px-1 text-sm text-text-secondary">Loading…</p>}
        {!historyLoading && !historyError && history.length === 0 && (
          <div className="px-1 py-2 text-center">
            <EmptyHistoryArt className="mx-auto h-auto w-40" />
            <p className="mt-3 text-sm leading-6 text-text-secondary">Your flowcharts and chats will appear here.</p>
          </div>
        )}
        {history.map((job) => {
          const active = job.jobId === activeJobId;
          return (
            <div
              key={job.jobId}
              className={`group rounded-2xl border p-3 transition ${active ? 'border-aura-cyan bg-aura-cyan/10' : 'border-border bg-bg-elevated hover:border-aura-cyan'}`}
            >
              <button onClick={() => openJob(job.jobId)} className="w-full text-left">
                <div className="flex items-start justify-between gap-2">
                  <span className="line-clamp-2 text-sm font-semibold text-text-primary">{job.title}</span>
                  <StatusBadge job={job} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px] font-semibold text-text-secondary">
                  <span>{audioTypeLabel(job.audioType, true)}</span>
                  <span>·</span>
                  <span>{job.outputType === 'flowchart' ? 'Flowchart' : 'Chatbot'}</span>
                  {job.speakerCount > 0 && <><span>·</span><span>{job.speakerCount} spk</span></>}
                </div>
                <p className="mt-1 text-[11px] text-text-muted">{formatDate(job.createdAt)}</p>
              </button>
              {['completed', 'failed'].includes(job.status) && (
                <button
                  onClick={() => setConfirm(job)}
                  className="mt-1 text-[11px] font-bold text-text-muted opacity-0 transition hover:text-error group-hover:opacity-100 focus:opacity-100"
                >
                  Delete
                </button>
              )}
            </div>
          );
        })}
      </div>

      {confirm && (
        <Modal
          title="Delete this analysis?"
          onClose={() => setConfirm(null)}
          actions={
            <button
              onClick={async () => {
                try {
                  await deleteJob(confirm.jobId);
                  addToast('Analysis deleted.', 'info');
                } catch (error) {
                  addToast(error.response?.data?.error?.message || error.message, 'error');
                }
                setConfirm(null);
              }}
              className="rounded-2xl bg-error px-5 py-3 font-bold text-white"
            >
              Delete
            </button>
          }
        >
          <p className="leading-7">
            This removes <span className="font-bold text-text-primary">{confirm.title}</span>, its transcript, flowchart and chat history. Saved reports are kept.
          </p>
        </Modal>
      )}
    </aside>
  );
}

function Stepper() {
  const { step, setStep, audioType, file, activeJobId } = useLab();
  const current = WIZARD.findIndex((s) => s.id === step);
  const reachable = (index) => [true, Boolean(audioType), Boolean(audioType && file), Boolean(activeJobId)][index];
  return (
    <ol className="mb-6 grid grid-cols-4 gap-2">
      {WIZARD.map((item, index) => (
        <li key={item.id}>
          <button
            onClick={() => reachable(index) && setStep(item.id)}
            disabled={!reachable(index)}
            className={`w-full rounded-2xl px-3 py-3 text-left transition disabled:cursor-default ${
              index === current ? 'bg-gradient-to-br from-aura-violet/25 to-aura-cyan/20' : 'bg-bg-elevated'
            }`}
          >
            <span className={`text-xs font-bold ${index <= current ? 'text-aura-cyan-light' : 'text-text-muted'}`}>Step {index + 1}</span>
            <span className="block truncate text-sm font-bold text-text-primary">{item.label}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function AudioTypeStep() {
  const { audioType, chooseAudioType } = useLab();
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
      <h2 className="font-display text-2xl font-bold text-text-primary">What type of audio are you adding?</h2>
      <p className="mt-2 text-text-secondary">Choose one — AuraSync tailors transcription analysis, the flowchart and the chatbot to it.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {AUDIO_TYPES.map((type) => (
          <button
            key={type.id}
            onClick={() => chooseAudioType(type.id)}
            aria-pressed={audioType === type.id}
            className={`glass-card card-lift rounded-3xl p-4 text-left shadow-aura ${audioType === type.id ? 'ring-2 ring-aura-cyan' : ''}`}
          >
            <AudioTypeArt type={type.id} className="mb-4 h-auto w-full" />
            <h3 className="font-display text-xl font-bold text-text-primary">{type.label}</h3>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{type.description}</p>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

function UploadStep() {
  const { addToast } = useToast();
  const { audioType, setStep, file, setFile, fileDuration, setFileDuration, speakerHint, setSpeakerHint } = useLab();
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState('');
  // Any length is accepted; long recordings are split into parts on the server and just take longer.
  const longRecording = fileDuration !== null && fileDuration > 30 * 60;

  const selectFile = async (selected) => {
    if (!selected) return;
    const extension = `.${selected.name.split('.').pop().toLowerCase()}`;
    if (!SUPPORTED.includes(extension)) {
      setFileError(`Unsupported format. Accepted: ${SUPPORTED.join(', ').toUpperCase()}.`);
      addToast('Unsupported audio format.', 'error');
      return;
    }
    setFileError('');
    setFile(selected);
    setFileDuration(await readAudioDuration(selected));
  };

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold text-text-primary">Upload your audio</h2>
        <button onClick={() => setStep('type')} className="rounded-full border border-border px-3 py-1 text-xs font-bold text-aura-cyan-light">
          {audioTypeLabel(audioType)} · change
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div
          onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => { event.preventDefault(); setDragActive(false); selectFile(event.dataTransfer.files?.[0]); }}
          className={`glass-card rounded-3xl p-8 text-center shadow-aura transition ${dragActive ? 'ring-2 ring-aura-cyan' : ''}`}
        >
          <UploadArt className="mx-auto h-auto w-full max-w-[260px]" />
          <h3 className="mt-4 font-display text-xl font-bold text-text-primary">Drag and drop your recording</h3>
          <p className="mt-2 text-sm text-text-secondary">{SUPPORTED.join(', ').toUpperCase()}</p>
          <label className="gradient-button mt-5 inline-flex cursor-pointer">
            Choose file
            <input type="file" accept={SUPPORTED.join(',')} onChange={(event) => selectFile(event.target.files?.[0])} className="hidden" />
          </label>
          {fileError && <p className="mt-4 text-sm text-error">{fileError}</p>}
          {file && (
            <div className="mt-6 rounded-2xl bg-bg-elevated p-4 text-left">
              <p className="font-semibold text-text-primary">{file.name}</p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-text-secondary">
                <span>Size: {formatBytes(file.size)}</span>
                <span>Duration: {fileDuration !== null ? formatTime(fileDuration) : 'unknown'}</span>
              </div>
            </div>
          )}
          {longRecording && (
            <div className="mt-5 rounded-2xl border border-aura-cyan p-4 text-left text-sm leading-6 text-text-secondary">
              <span className="font-semibold text-text-primary">Long recording.</span> It will be processed in parts — expect it to take a few minutes. You can leave the page meanwhile.
            </div>
          )}
        </div>

        <div className="glass-card rounded-3xl p-6 shadow-aura">
          <h3 className="font-display text-xl font-bold text-text-primary">Speakers</h3>
          <p className="mt-2 text-sm leading-6 text-text-secondary">Detected automatically. If you know the number, give it as a hint.</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {SPEAKER_OPTIONS.map((option) => (
              <button
                key={option}
                onClick={() => setSpeakerHint(option)}
                aria-pressed={speakerHint === option}
                className={`rounded-2xl border px-3 py-2 text-sm font-bold transition ${option === 'auto' ? 'col-span-3' : ''} ${
                  speakerHint === option ? 'border-aura-cyan bg-aura-cyan/15 text-aura-cyan-light' : 'border-border bg-bg-elevated text-text-secondary'
                }`}
              >
                {option === 'auto' ? 'Auto-detect (recommended)' : option === '6' ? '6+' : option}
              </button>
            ))}
          </div>
          <button
            onClick={() => setStep('output')}
            disabled={!file}
            className="gradient-button mt-6 w-full disabled:cursor-not-allowed disabled:opacity-60"
          >
            Continue
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function OutputStep() {
  const { audioType, file, setStep, startJob, uploading, uploadError } = useLab();
  const [choice, setChoice] = useState(null);
  if (!file) {
    return (
      <div className="rounded-3xl border border-dashed border-border p-10 text-center text-text-secondary">
        Select a recording first.
        <button onClick={() => setStep('upload')} className="gradient-button ml-3">Upload audio</button>
      </div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
      <h2 className="font-display text-2xl font-bold text-text-primary">What would you like to get?</h2>
      <p className="mt-2 text-text-secondary">
        {file.name} · {audioTypeLabel(audioType)}. The transcript is always included, and you can open the other view later.
      </p>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {OUTPUTS.map((output) => (
          <button
            key={output.id}
            disabled={uploading}
            onClick={() => { setChoice(output.id); startJob(output.id); }}
            className={`glass-card card-lift overflow-hidden rounded-3xl text-left shadow-aura disabled:cursor-wait ${choice === output.id ? 'ring-2 ring-aura-cyan' : ''}`}
          >
            <div className="border-b border-border bg-bg-elevated p-6">
              {output.id === 'flowchart' ? <FlowchartArt className="h-auto w-full" /> : <ChatArt className="h-auto w-full" />}
            </div>
            <div className="p-7">
            <h3 className="font-display text-2xl font-bold text-text-primary">{output.title}</h3>
            <p className="mt-3 leading-7 text-text-secondary">{output.copy}</p>
            {uploading && choice === output.id && <p className="mt-4 animate-pulse text-sm font-bold text-aura-cyan-light">Uploading…</p>}
            </div>
          </button>
        ))}
      </div>
      {uploadError && <p className="mt-5 rounded-2xl border border-error p-4 text-sm font-semibold text-error">{uploadError}</p>}
    </motion.div>
  );
}

function ProcessingView({ job }) {
  const stages = STAGES[job.outputType] || STAGES.flowchart;
  const active = Math.max(0, stages.findIndex((stage) => stage.status === job.status));
  return (
    <div className="glass-card rounded-3xl p-6 shadow-aura">
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <ProcessingArt className="h-36 w-36 shrink-0" />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-aura-cyan-light">Processing</p>
          <h2 className="mt-1 font-display text-2xl font-bold text-text-primary">{job.fileName}</h2>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            {audioTypeLabel(job.audioType)} → {job.outputType === 'flowchart' ? 'Flowchart' : 'Chatbot'}. You can leave this page — processing continues and you'll be notified.
          </p>
        </div>
      </div>
      <div className={`mt-6 grid gap-3 ${stages.length === 5 ? 'md:grid-cols-5' : 'md:grid-cols-3'}`}>
        {stages.map((stage, index) => (
          <div key={stage.status} className={`rounded-2xl border p-4 ${index <= active ? 'border-aura-cyan bg-aura-cyan/10' : 'border-border bg-bg-elevated'}`}>
            <div className="flex items-center gap-3">
              <span className={`h-3 w-3 shrink-0 rounded-full ${index < active ? 'bg-success' : index === active ? 'animate-pulse bg-aura-cyan' : 'bg-border'}`} />
              <span className="text-sm font-bold text-text-primary">{stage.label}</span>
            </div>
          </div>
        ))}
      </div>
      {job.progress && <p className="mt-4 text-sm text-text-secondary">{job.progress}…</p>}
    </div>
  );
}

function Workspace() {
  const { saveReport } = useApp();
  const { addToast } = useToast();
  const { activeJob, result, reloadResult, updateResult, refreshHistory, historyError, newAnalysis } = useLab();
  const visualRef = useRef(null);
  const [activeTab, setActiveTab] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Coming back to the page: pick up chat turns and flowcharts generated since the result was loaded.
  useEffect(() => {
    reloadResult().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJob?.jobId]);

  // Reset the tab when switching analyses, then default it to the output the user chose (order matters).
  useEffect(() => setActiveTab(null), [activeJob?.jobId]);
  useEffect(() => {
    if (result) setActiveTab((tab) => tab || (result.outputType === 'chatbot' ? 'chatbot' : 'flowchart'));
  }, [result]);

  if (!activeJob) {
    return (
      <div className="rounded-3xl border border-dashed border-border p-10 text-center text-text-secondary">
        {historyError ? <p className="text-error">{historyError}</p> : <p>Loading analysis…</p>}
        <button onClick={newAnalysis} className="gradient-button mt-5">Start a new analysis</button>
      </div>
    );
  }
  if (activeJob.status === 'failed') {
    return (
      <div className="glass-card rounded-3xl p-6 shadow-aura">
        <h2 className="font-display text-2xl font-bold text-text-primary">{activeJob.fileName}</h2>
        <p className="mt-4 rounded-2xl border border-error p-4 text-sm font-semibold text-error">{activeJob.error || 'Processing failed.'}</p>
      </div>
    );
  }
  if (activeJob.status !== 'completed') return <ProcessingView job={activeJob} />;
  if (!result) {
    return <div className="rounded-3xl border border-dashed border-border p-10 text-center text-text-secondary">Loading results…</div>;
  }

  const generateFlowchart = async (force) => {
    setGenerating(true);
    try {
      const response = await jobsAPI.generateFlowchart(result.jobId, force);
      updateResult(response.data.data);
      refreshHistory();
      addToast(force ? 'Flowchart regenerated.' : 'Flowchart generated.', 'success');
    } catch (error) {
      addToast(error.response?.data?.error?.message || error.message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const latest = (await jobsAPI.getResult(result.jobId)).data.data;
      await saveReport({
        jobId: latest.jobId,
        title: latest.summary?.title || latest.fileName,
        outputType: activeTab === 'chatbot' || !latest.flowchart ? 'chatbot' : 'flowchart',
        speakerCount: latest.speakerCount,
        executiveSummary: latest.summary?.executiveSummary,
        tags: latest.summary?.tags,
        data: latest.flowchart || {},
        transcript: latest.transcript,
        segments: latest.segments,
        summary: latest.summary,
        speakers: latest.speakers,
        evaluation: latest.evaluation,
        chatHistory: latest.chatHistory
      });
      addToast('Saved to Reports.', 'success');
    } catch (error) {
      addToast(error.response?.data?.error?.message || error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const downloadPng = () => {
    const node = visualRef.current;
    const tree = result.flowchart;
    if (!node || !tree) return;
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(node)], { type: 'image/svg+xml;charset=utf-8' }));
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = tree.width * 2;
      canvas.height = tree.height * 2;
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const link = document.createElement('a');
      link.download = `aurasync-flowchart-${(result.fileName || 'audio').replace(/\.[^/.]+$/, '')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    image.src = url;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-3xl p-6 shadow-aura">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-aura-cyan-light">
            {audioTypeLabel(result.audioType)} · {formatTime(result.durationSeconds)} · {result.speakerCount} speaker{result.speakerCount === 1 ? '' : 's'}
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold text-text-primary">{result.title}</h2>
        </div>
        <button onClick={save} disabled={saving} className="gradient-button shrink-0 disabled:cursor-wait disabled:opacity-70">
          {saving ? 'Saving…' : 'Save to Reports'}
        </button>
      </div>
      {result.summary?.executiveSummary && <p className="mt-4 leading-7 text-text-secondary">{result.summary.executiveSummary}</p>}
      {result.summary?.tags?.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {result.summary.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-text-secondary">#{tag}</span>
          ))}
        </div>
      )}

      <div className="mt-6 flex gap-2 border-b border-border" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`-mb-px border-b-2 px-4 py-3 text-sm font-bold transition ${
              activeTab === tab.id ? 'border-aura-cyan text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {activeTab === 'flowchart' && (result.flowchart?.nodes?.length ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <TreeLegend data={result.flowchart} />
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))} className="rounded-xl border border-border px-3 py-2 text-sm font-bold text-text-primary" aria-label="Zoom out">−</button>
                <button onClick={() => setZoom(1)} className="rounded-xl border border-border px-3 py-2 text-sm font-bold text-text-primary">100%</button>
                <button onClick={() => setZoom((z) => Math.min(2, z + 0.15))} className="rounded-xl border border-border px-3 py-2 text-sm font-bold text-text-primary" aria-label="Zoom in">+</button>
                <button onClick={downloadPng} className="rounded-xl border border-border px-3 py-2 text-sm font-bold text-text-primary">Download PNG</button>
                <button onClick={() => generateFlowchart(true)} disabled={generating} className="rounded-xl border border-border px-3 py-2 text-sm font-bold text-text-primary disabled:opacity-60">
                  {generating ? 'Regenerating…' : 'Regenerate'}
                </button>
              </div>
            </div>
            <div className="max-h-[640px] overflow-auto rounded-3xl bg-bg-elevated p-3">
              <KnowledgeTreeSVG ref={visualRef} data={result.flowchart} zoom={zoom} />
            </div>
            <div className="mt-6">
              <EvaluationPanel evaluation={result.evaluation} />
            </div>
          </>
        ) : (
          <div className="rounded-3xl border border-dashed border-border p-10 text-center">
            <p className="text-text-secondary">This recording was processed for the chatbot. Generate its concept flowchart now?</p>
            <button onClick={() => generateFlowchart(false)} disabled={generating} className="gradient-button mt-5 disabled:cursor-wait disabled:opacity-70">
              {generating ? 'Generating & evaluating…' : 'Generate flowchart'}
            </button>
          </div>
        ))}

        {activeTab === 'chatbot' && (
          <ChatPanel
            key={`${result.jobId}-${result.loadedAt}`}
            jobId={result.jobId}
            summary={result.summary}
            speakers={result.speakers}
            initialHistory={result.chatHistory || []}
          />
        )}

        {activeTab === 'transcript' && (
          <>
            {result.summary?.keyPoints?.length > 0 && (
              <div className="mb-5 rounded-2xl border border-border p-4">
                <p className="font-semibold text-text-primary">Key points</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-text-secondary">
                  {result.summary.keyPoints.map((point, i) => <li key={i}>{point}</li>)}
                </ul>
              </div>
            )}
            <TranscriptView
              segments={result.segments}
              speakers={result.speakers}
              transcript={result.transcript}
              fileName={result.fileName}
              diarizationMethod={result.diarization?.method}
            />
          </>
        )}
      </div>
    </motion.div>
  );
}

export default function AudioLabPage() {
  const { step } = useLab();

  return (
    <main className="relative isolate min-h-screen overflow-x-clip bg-bg-primary pb-20">
      <Backdrop blobs={['two', 'three']} />

      <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 lg:px-8">
        <PageHero
          eyebrow="Audio Lab"
          title="Understand any"
          highlight="recording"
          description="Pick the type of audio, upload it, and explore it as an evaluated concept flowchart or by chatting with it. Everything you create stays in your history."
          art={<HeroScene className="mx-auto h-auto w-full max-w-sm" />}
        />

        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <HistoryPanel />
          <div className="min-w-0">
            <Stepper />
            {step === 'type' && <AudioTypeStep />}
            {step === 'upload' && <UploadStep />}
            {step === 'output' && <OutputStep />}
            {step === 'workspace' && <Workspace />}
          </div>
        </div>
      </section>
    </main>
  );
}

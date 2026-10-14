import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { jobsAPI } from '../services/api.js';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

// Audio Lab state lives above the router so leaving the page (Home, Reports) and coming back keeps the
// wizard position, the open analysis, and keeps polling any jobs still processing.

const LabContext = createContext(null);
const TERMINAL = new Set(['completed', 'failed']);
const POLL_MS = 3000;
const storageKey = (userId) => `aurasync.lab.${userId}`;

function readSaved(userId) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(userId)) || 'null');
  } catch {
    return null;
  }
}

function writeSaved(userId, value) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode) — state still survives in-app navigation.
  }
}

export function LabProvider({ children }) {
  const { user } = useAuth();
  const { addToast } = useToast();

  // Wizard: 'type' → 'upload' → 'output' → 'workspace'
  const [step, setStep] = useState('type');
  const [audioType, setAudioType] = useState(null);
  const [file, setFile] = useState(null);
  const [fileDuration, setFileDuration] = useState(null);
  const [speakerHint, setSpeakerHint] = useState('auto');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const [activeJobId, setActiveJobId] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const previousStatuses = useRef(new Map());
  const activeJobRef = useRef(null);
  activeJobRef.current = activeJobId;

  const loadResult = useCallback(async (jobId) => {
    const response = await jobsAPI.getResult(jobId);
    const data = response.data.data;
    if (activeJobRef.current !== jobId) return;
    setResult({ ...data, title: data.summary?.title || data.fileName, loadedAt: Date.now() });
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const response = await jobsAPI.list();
      const jobs = response.data.data.jobs;
      // Announce jobs that finished since the last refresh, wherever the user currently is in the app.
      for (const job of jobs) {
        const before = previousStatuses.current.get(job.jobId);
        if (before && !TERMINAL.has(before) && TERMINAL.has(job.status)) {
          if (job.status === 'completed') {
            addToast(`“${job.title}” is ready.`, 'success');
            if (activeJobRef.current === job.jobId) loadResult(job.jobId).catch(() => {});
          } else {
            addToast(`Processing failed: ${job.error || job.fileName}`, 'error');
          }
        }
        previousStatuses.current.set(job.jobId, job.status);
      }
      setHistory(jobs);
      setHistoryError('');
      setHistoryLoaded(true);
    } catch (error) {
      // Keep the last known history; the next poll retries. Surface the reason so the page never spins silently.
      const status = error.response?.status;
      setHistoryError(status === 404
        ? 'The backend does not support history yet — restart the backend server (Ctrl+C, then npm start in /backend).'
        : error.response?.data?.error?.message || 'Could not reach the backend server.');
    }
  }, [addToast, loadResult]);

  // Restore per-user state on login; clear everything on logout.
  useEffect(() => {
    previousStatuses.current = new Map();
    if (!user) {
      setStep('type');
      setAudioType(null);
      setFile(null);
      setActiveJobId(null);
      setResult(null);
      setHistory([]);
      setHistoryLoaded(false);
      setHistoryError('');
      return;
    }
    const saved = readSaved(user.id);
    if (saved) {
      setAudioType(saved.audioType || null);
      setSpeakerHint(saved.speakerHint || 'auto');
      if (saved.activeJobId) {
        setActiveJobId(saved.activeJobId);
        setStep('workspace');
      } else {
        // A selected file cannot survive a page reload, so resume at the upload step at most.
        setStep(saved.step === 'type' || !saved.audioType ? 'type' : 'upload');
      }
    }
    setHistoryLoading(true);
    refreshHistory().finally(() => setHistoryLoading(false));
  }, [user, refreshHistory]);

  useEffect(() => {
    if (user) writeSaved(user.id, { step, audioType, speakerHint, activeJobId });
  }, [user, step, audioType, speakerHint, activeJobId]);

  // Poll while any job is still processing.
  const hasRunning = history.some((job) => !TERMINAL.has(job.status));
  useEffect(() => {
    if (!user || !hasRunning) return undefined;
    const timer = setInterval(refreshHistory, POLL_MS);
    return () => clearInterval(timer);
  }, [user, hasRunning, refreshHistory]);

  // An open job that is missing from a loaded history (deleted, or saved in this browser by another account)
  // is checked directly; if the server doesn't know it, start fresh instead of waiting forever.
  useEffect(() => {
    if (!historyLoaded || !activeJobId || history.some((job) => job.jobId === activeJobId)) return;
    let cancelled = false;
    jobsAPI.getStatus(activeJobId)
      .then(() => { if (!cancelled) refreshHistory(); })
      .catch(() => {
        if (cancelled) return;
        setActiveJobId(null);
        setResult(null);
        setStep('type');
      });
    return () => { cancelled = true; };
  }, [historyLoaded, activeJobId, history, refreshHistory]);

  // Load the open job's result whenever the open job changes (or finishes).
  const activeJob = history.find((job) => job.jobId === activeJobId) || null;
  const activeStatus = activeJob?.status;
  useEffect(() => {
    if (!activeJobId) {
      setResult(null);
      return;
    }
    if (activeStatus === 'completed' && result?.jobId !== activeJobId) {
      loadResult(activeJobId).catch(() => addToast('Could not load this analysis.', 'error'));
    }
  }, [activeJobId, activeStatus, result?.jobId, loadResult, addToast]);

  const chooseAudioType = useCallback((type) => {
    setAudioType(type);
    setStep('upload');
  }, []);

  const startJob = useCallback(async (outputType) => {
    if (!file || !audioType) return;
    setUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('audio', file);
      formData.append('audioType', audioType);
      formData.append('outputType', outputType);
      formData.append('speakerCount', speakerHint);
      const response = await jobsAPI.upload(formData);
      const { jobId } = response.data.data;
      previousStatuses.current.set(jobId, 'pending');
      setResult(null);
      setActiveJobId(jobId);
      setStep('workspace');
      setFile(null);
      setFileDuration(null);
      await refreshHistory();
    } catch (error) {
      const message = error.response?.data?.error?.message || error.message;
      setUploadError(message);
      addToast(message, 'error');
    } finally {
      setUploading(false);
    }
  }, [file, audioType, speakerHint, refreshHistory, addToast]);

  const openJob = useCallback((jobId) => {
    setResult((current) => (current?.jobId === jobId ? current : null));
    setActiveJobId(jobId);
    setStep('workspace');
  }, []);

  const newAnalysis = useCallback(() => {
    setActiveJobId(null);
    setResult(null);
    setFile(null);
    setFileDuration(null);
    setUploadError('');
    setAudioType(null);
    setStep('type');
  }, []);

  const deleteJob = useCallback(async (jobId) => {
    await jobsAPI.remove(jobId);
    if (activeJobRef.current === jobId) newAnalysis();
    await refreshHistory();
  }, [newAnalysis, refreshHistory]);

  /** Re-fetch the open result (e.g. to pick up chat turns made before leaving the page). */
  const reloadResult = useCallback(async () => {
    if (activeJobRef.current && activeStatus === 'completed') await loadResult(activeJobRef.current);
  }, [activeStatus, loadResult]);

  const updateResult = useCallback((partial) => {
    setResult((current) => (current ? { ...current, ...partial } : current));
  }, []);

  const value = useMemo(() => ({
    step, setStep,
    audioType, chooseAudioType,
    file, setFile, fileDuration, setFileDuration,
    speakerHint, setSpeakerHint,
    uploading, uploadError, startJob,
    activeJobId, activeJob, result, openJob, newAnalysis, reloadResult, updateResult,
    history, historyLoading, historyError, historyLoaded, refreshHistory, deleteJob
  }), [
    step, audioType, chooseAudioType, file, fileDuration, speakerHint, uploading, uploadError, startJob,
    activeJobId, activeJob, result, openJob, newAnalysis, reloadResult, updateResult,
    history, historyLoading, historyError, historyLoaded, refreshHistory, deleteJob
  ]);

  return <LabContext.Provider value={value}>{children}</LabContext.Provider>;
}

export function useLab() {
  const context = useContext(LabContext);
  if (!context) throw new Error('useLab must be used inside LabProvider');
  return context;
}
